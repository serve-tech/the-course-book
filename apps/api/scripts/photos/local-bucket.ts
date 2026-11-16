import { AwsClient } from "aws4fetch";
import { createHash } from "node:crypto";
import type { PhotoStorageConfig } from "../../src/services/env";
import { isLocalUrl } from "../seed/local";

/**
 * Prepare a bucket on a local S3-compatible emulator for photo storage
 * (issue #67): create it, and let anyone read its objects, as the R2
 * bucket's public custom domain does. Used by `pnpm photos:local-bucket`
 * and the storage integration test; never for R2, whose buckets the
 * maintainer creates in Cloudflare's dashboard.
 *
 * The emulator is VersityGW (docker-compose `photos` service), which checks
 * request signatures as S3 and R2 do.
 */

/** The S3 error codes that mean the bucket already exists and is ours. */
const ALREADY_OURS = new Set(["BucketAlreadyOwnedByYou", "BucketAlreadyExists"]);

async function send(client: AwsClient, url: string, method: string, body: string): Promise<Response> {
  const request = await client.sign(url, {
    method,
    body,
    headers: { "X-Amz-Content-Sha256": createHash("sha256").update(body).digest("hex") },
  });
  return fetch(request);
}

/**
 * Create the bucket if it is missing and make its objects publicly readable.
 *
 * Raises:
 *     Error: When the endpoint isn't on this machine, or the emulator refuses.
 */
export async function prepareLocalBucket(config: Omit<PhotoStorageConfig, "publicUrl">): Promise<void> {
  if (!isLocalUrl(config.endpoint)) throw new Error("PHOTO_STORAGE_ENDPOINT points at " + new URL(config.endpoint).host + ", not this machine.");
  const client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: config.region });
  const bucketUrl = config.endpoint + "/" + config.bucket;

  const created = await send(
    client,
    bucketUrl,
    "PUT",
    `<CreateBucketConfiguration><LocationConstraint>${config.region}</LocationConstraint></CreateBucketConfiguration>`,
  );
  if (!created.ok) {
    const code = /<Code>([^<]+)<\/Code>/.exec(await created.text())?.[1] ?? String(created.status);
    if (!ALREADY_OURS.has(code)) throw new Error("Could not create the bucket: " + code);
  }

  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: ["arn:aws:s3:::" + config.bucket + "/*"] }],
  });
  const opened = await send(client, bucketUrl + "?policy", "PUT", policy);
  if (!opened.ok) throw new Error("Could not make the bucket's objects public: " + String(opened.status));
}
