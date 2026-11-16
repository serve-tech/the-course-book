import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PhotoStorageConfig } from "./env";
import { ErrorCode } from "./errors";
import { createS3PhotoStore, objectUrl } from "./photo-store";

/**
 * The S3 store at the signed-request level: what it sends, with fetch
 * replaced. `photo-store.s3.test.ts` sends the same requests to an
 * S3-compatible server that checks the signatures.
 */

const config: PhotoStorageConfig = {
  endpoint: "https://0123abcd.r2.cloudflarestorage.com",
  bucket: "coursebook-photos",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "auto",
  publicUrl: "https://photos.coursebook.golf",
};

function recording(respond: (request: Request) => Response | Promise<Response> = () => new Response(null, { status: 200 })) {
  const sent: { request: Request; body: Uint8Array }[] = [];
  const fetcher = async (request: Request) => {
    sent.push({ request, body: new Uint8Array(await request.clone().arrayBuffer()) });
    return respond(request);
  };
  return { sent, fetcher };
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("objectUrl", () => {
  it("puts the bucket and the encoded key in the path", () => {
    expect(objectUrl(config, "courses/c 1/p/hero.webp")).toBe("https://0123abcd.r2.cloudflarestorage.com/coursebook-photos/courses/c%201/p/hero.webp");
  });
});

describe("createS3PhotoStore", () => {
  it("puts an object with its type, cache lifetime and a signed body hash", async () => {
    const { sent, fetcher } = recording();
    const body = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
    await createS3PhotoStore(config, fetcher).put("courses/c/p/hero.webp", body, "image/webp", "public, max-age=31536000, immutable");

    expect(sent).toHaveLength(1);
    const [{ request, body: sentBody }] = sent as [(typeof sent)[number]];
    expect(request.method).toBe("PUT");
    expect(request.url).toBe("https://0123abcd.r2.cloudflarestorage.com/coursebook-photos/courses/c/p/hero.webp");
    expect(sentBody).toEqual(body);
    expect(request.headers.get("content-type")).toBe("image/webp");
    expect(request.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(request.headers.get("x-amz-content-sha256")).toBe(sha256(body));
    expect(request.headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/);
    const authorization = request.headers.get("authorization") ?? "";
    expect(authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=[0-9a-f]{64}$/);
    // aws4fetch leaves Content-Type unsigned, as S3 allows; the body hash is signed, so the body can't change.
    const signed = /SignedHeaders=([^,]+)/.exec(authorization)?.[1]?.split(";");
    expect(signed).toEqual(["cache-control", "host", "x-amz-content-sha256", "x-amz-date"]);
    expect(authorization).not.toContain(config.secretAccessKey);
  });

  it("deletes an object with an empty signed body", async () => {
    const { sent, fetcher } = recording(() => new Response(null, { status: 204 }));
    await createS3PhotoStore(config, fetcher).delete("courses/c/p/card.webp");
    const [{ request }] = sent as [(typeof sent)[number]];
    expect(request.method).toBe("DELETE");
    expect(request.url).toBe("https://0123abcd.r2.cloudflarestorage.com/coursebook-photos/courses/c/p/card.webp");
    expect(request.headers.get("x-amz-content-sha256")).toBe(sha256(new Uint8Array()));
  });

  it("treats deleting a missing object as done", async () => {
    const { fetcher } = recording(() => new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 }));
    await expect(createS3PhotoStore(config, fetcher).delete("courses/c/p/card.webp")).resolves.toBeUndefined();
  });

  it.each([
    { name: "a refused signature", response: () => new Response("<Error><Code>SignatureDoesNotMatch</Code></Error>", { status: 403 }), cause: /403 \(SignatureDoesNotMatch\)/ },
    { name: "a server error", response: () => new Response("", { status: 500 }), cause: /500 \(no code\)/ },
  ])("reports $name as photo_storage_unavailable, with the S3 code in the cause", async ({ response, cause }) => {
    const { fetcher } = recording(response);
    const failure = createS3PhotoStore(config, fetcher).put("k", new Uint8Array([1]), "image/webp", "no-store");
    await expect(failure).rejects.toMatchObject({ status: 503, code: ErrorCode.PhotoStorageUnavailable });
    await expect(failure).rejects.toHaveProperty("cause.message", expect.stringMatching(cause));
  });

  it("reports a network failure as photo_storage_unavailable", async () => {
    const store = createS3PhotoStore(config, () => Promise.reject(new TypeError("fetch failed")));
    await expect(store.delete("k")).rejects.toMatchObject({ status: 503, code: ErrorCode.PhotoStorageUnavailable });
  });

  it("serves objects from the public address", () => {
    expect(createS3PhotoStore(config).publicUrl("courses/c/p/hero.webp")).toBe("https://photos.coursebook.golf/courses/c/p/hero.webp");
  });
});
