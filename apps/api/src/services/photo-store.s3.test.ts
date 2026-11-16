import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareLocalBucket } from "../../scripts/photos/local-bucket";
import { PhotoSize, STORED_PHOTO_CACHE_CONTROL, STORED_PHOTO_TYPE, UPLOAD_LIMITS } from "../domain/stored-photo";
import { webpChunks } from "../test/image-inspect";
import type { PhotoStorageConfig } from "./env";
import { ErrorCode } from "./errors";
import { createImageProcessor } from "./photo-images";
import { createS3PhotoStore } from "./photo-store";

/**
 * The S3 store against a real S3-compatible server that checks request
 * signatures: VersityGW, the emulator in docker-compose's `photos` service
 * (issue #67). It proves the signed requests are accepted, a wrong secret is
 * refused, and objects are served publicly with their type and cache
 * lifetime. Cloudflare R2 itself is not reached by any test.
 *
 * Runs when PHOTO_STORAGE_TEST_ENDPOINT, PHOTO_STORAGE_TEST_ACCESS_KEY_ID and
 * PHOTO_STORAGE_TEST_SECRET_ACCESS_KEY are set, else skips; CI sets
 * PHOTO_STORAGE_TEST_REQUIRED=1, which turns a skip into a failure.
 */

const endpoint = process.env["PHOTO_STORAGE_TEST_ENDPOINT"];
const accessKeyId = process.env["PHOTO_STORAGE_TEST_ACCESS_KEY_ID"];
const secretAccessKey = process.env["PHOTO_STORAGE_TEST_SECRET_ACCESS_KEY"];
const configured = Boolean(endpoint && accessKeyId && secretAccessKey);
if (!configured && process.env["PHOTO_STORAGE_TEST_REQUIRED"] === "1")
  throw new Error("Set PHOTO_STORAGE_TEST_ENDPOINT, PHOTO_STORAGE_TEST_ACCESS_KEY_ID and PHOTO_STORAGE_TEST_SECRET_ACCESS_KEY for the storage tests.");

describe.skipIf(!configured)("S3 photo store against an emulator", () => {
  // A bucket per run, so runs never see each other's objects.
  const bucket = "photos-test-" + randomUUID().slice(0, 8);
  const config: PhotoStorageConfig = {
    endpoint: endpoint ?? "",
    bucket,
    accessKeyId: accessKeyId ?? "",
    secretAccessKey: secretAccessKey ?? "",
    region: "auto",
    publicUrl: (endpoint ?? "") + "/" + bucket,
  };
  const store = createS3PhotoStore(config);

  beforeAll(async () => {
    await prepareLocalBucket(config);
  });

  it("stores an object that anyone can then read, with its type and cache lifetime", async () => {
    const body = new Uint8Array([82, 73, 70, 70, 9, 8, 7]);
    await store.put("courses/c/p/hero.webp", body, STORED_PHOTO_TYPE, STORED_PHOTO_CACHE_CONTROL);
    const served = await fetch(store.publicUrl("courses/c/p/hero.webp"));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe(STORED_PHOTO_TYPE);
    expect(served.headers.get("cache-control")).toBe(STORED_PHOTO_CACHE_CONTROL);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(body);
  });

  it("deletes an object, and deleting it again succeeds", async () => {
    await store.put("courses/c/p/card.webp", new Uint8Array([1]), STORED_PHOTO_TYPE, STORED_PHOTO_CACHE_CONTROL);
    await store.delete("courses/c/p/card.webp");
    expect((await fetch(store.publicUrl("courses/c/p/card.webp"))).status).toBe(404);
    await expect(store.delete("courses/c/p/card.webp")).resolves.toBeUndefined();
  });

  it("is refused with a wrong secret", async () => {
    const wrong = createS3PhotoStore({ ...config, secretAccessKey: "not-the-secret" });
    const failure = wrong.put("courses/c/p/hero.webp", new Uint8Array([1]), STORED_PHOTO_TYPE, STORED_PHOTO_CACHE_CONTROL);
    await expect(failure).rejects.toMatchObject({ status: 503, code: ErrorCode.PhotoStorageUnavailable });
    await expect(failure).rejects.toHaveProperty("cause.message", expect.stringContaining("SignatureDoesNotMatch"));
  });

  it("serves a processed phone photo with no metadata", async () => {
    const fixture = new Uint8Array(readFileSync(new URL("../test/fixtures/phone-photo-with-gps.jpg", import.meta.url)));
    const photo = await createImageProcessor(sharp, UPLOAD_LIMITS).process(fixture);
    await store.put("courses/c/q/hero.webp", photo[PhotoSize.Hero].bytes, STORED_PHOTO_TYPE, STORED_PHOTO_CACHE_CONTROL);
    const served = new Uint8Array(await (await fetch(store.publicUrl("courses/c/q/hero.webp"))).arrayBuffer());
    expect(webpChunks(served)).toEqual(["VP8 "]);
  });
});
