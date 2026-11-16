import { AwsClient } from "aws4fetch";
import { createHash } from "node:crypto";
import { publicPhotoUrl } from "../domain/stored-photo";
import type { PhotoStorageConfig } from "./env";
import { AppError, ErrorCode } from "./errors";

/**
 * The app's own photo storage (issue #67): an S3-compatible bucket,
 * Cloudflare R2 in production, behind the smallest interface the photo
 * services need. Tests use the in-memory store in `test/photo-store.ts`.
 *
 * Requests are signed with AWS Signature Version 4 by `aws4fetch`, which
 * Cloudflare documents for R2
 * (https://developers.cloudflare.com/r2/examples/aws/aws4fetch/); the full
 * AWS SDK would add megabytes to the bundle for three operations. Keys go
 * in the path (`<endpoint>/<bucket>/<key>`), and R2 signs with the region
 * `auto` (https://developers.cloudflare.com/r2/api/s3/api/). The body's
 * SHA-256 is signed too, so storage rejects a body changed on the way.
 */

/** A bucket of course photos. */
export interface PhotoStore {
  /**
   * Store an object, replacing any with that key.
   *
   * Raises:
   *     AppError: 503 `photo_storage_unavailable` when storage refuses or
   *         doesn't answer.
   */
  put(key: string, body: Uint8Array, contentType: string, cacheControl: string): Promise<void>;
  /**
   * Delete an object. Deleting a missing object succeeds, as in S3.
   *
   * Raises:
   *     AppError: 503 `photo_storage_unavailable`.
   */
  delete(key: string): Promise<void>;
  /** The public address the object is served from. */
  publicUrl(key: string): string;
}

export const PHOTO_STORAGE_UNAVAILABLE = "Photo storage isn't answering right now. Try again in a minute.";

/** Each storage request gives up after this long; a 25 MB upload is stored as files of at most a few hundred KB. */
const TIMEOUT_MS = 15_000;

/** Sends a signed request; injected by tests. */
export type Fetcher = (request: Request) => Promise<Response>;

/**
 * The object's URL on the S3 API: path-style, every key segment
 * percent-encoded.
 */
export function objectUrl(config: Pick<PhotoStorageConfig, "endpoint" | "bucket">, key: string): string {
  return config.endpoint + "/" + encodeURIComponent(config.bucket) + "/" + key.split("/").map(encodeURIComponent).join("/");
}

/**
 * A photo store over an S3-compatible API.
 *
 * Args:
 *     config: The bucket, its endpoint and keys, and its public address.
 *     fetcher: Sends each signed request. Defaults to the global `fetch`.
 */
export function createS3PhotoStore(config: PhotoStorageConfig, fetcher: Fetcher = (request) => fetch(request)): PhotoStore {
  // aws4fetch's own fetch() retries up to ten times and cannot be given a
  // fetch function, so only its signer is used.
  const signer = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
  });

  async function send(method: "PUT" | "DELETE", key: string, init: { body?: Uint8Array; headers?: Record<string, string> } = {}): Promise<Response> {
    const body = init.body ?? new Uint8Array();
    const request = await signer.sign(objectUrl(config, key), {
      method,
      headers: { ...init.headers, "X-Amz-Content-Sha256": createHash("sha256").update(body).digest("hex") },
      ...(init.body ? { body: init.body } : {}),
    });
    let response: Response;
    try {
      response = await fetcher(new Request(request, { signal: AbortSignal.timeout(TIMEOUT_MS) }));
    } catch (cause) {
      throw new AppError(503, ErrorCode.PhotoStorageUnavailable, PHOTO_STORAGE_UNAVAILABLE, { cause });
    }
    return response;
  }

  async function failure(response: Response, method: string): Promise<AppError> {
    // S3 errors are XML with a <Code>; it names the problem (e.g. SignatureDoesNotMatch) and carries no secret.
    const text = await response.text().catch(() => "");
    const code = /<Code>([^<]{1,64})<\/Code>/.exec(text)?.[1] ?? "no code";
    return new AppError(503, ErrorCode.PhotoStorageUnavailable, PHOTO_STORAGE_UNAVAILABLE, {
      cause: new Error("Storage answered " + method + " with " + String(response.status) + " (" + code + ")"),
    });
  }

  return {
    async put(key, body, contentType, cacheControl) {
      const response = await send("PUT", key, { body, headers: { "Content-Type": contentType, "Cache-Control": cacheControl } });
      if (!response.ok) throw await failure(response, "PUT");
      await response.body?.cancel();
    },
    async delete(key) {
      const response = await send("DELETE", key);
      if (!response.ok && response.status !== 404) throw await failure(response, "DELETE");
      await response.body?.cancel();
    },
    publicUrl: (key) => publicPhotoUrl(config.publicUrl, key),
  };
}
