import { describe, expect, it } from "vitest";
import { UPLOAD_LIMITS } from "../domain/stored-photo";
import { PhotoStorageStatus, type PhotoStorageEnv } from "./env";
import type { ImageProcessor } from "./photo-images";
import { startPhotoStorage, type StartupLog } from "./photo-storage";

function capture() {
  const lines: { level: string; message: string; detail?: Record<string, unknown>; error?: unknown }[] = [];
  const log: StartupLog = {
    info: (message, detail) => lines.push({ level: "info", message, detail }),
    warn: (message, detail) => lines.push({ level: "warn", message, detail }),
    error: (message, error) => lines.push({ level: "error", message, error }),
  };
  return { lines, log };
}

const images: ImageProcessor = { process: () => Promise.reject(new Error("unused")) };
const ready: PhotoStorageEnv = {
  status: PhotoStorageStatus.Ready,
  config: {
    endpoint: "https://0123abcd.r2.cloudflarestorage.com",
    bucket: "coursebook-photos",
    accessKeyId: "key-id",
    secretAccessKey: "secret-value",
    region: "auto",
    publicUrl: "https://photos.coursebook.golf",
  },
};

describe("startPhotoStorage", () => {
  it("leaves uploads off without storage, and says so once", async () => {
    const { lines, log } = capture();
    expect(await startPhotoStorage({ status: PhotoStorageStatus.Off }, log, { loadImages: () => Promise.reject(new Error("must not load")) })).toBeNull();
    expect(lines).toEqual([expect.objectContaining({ level: "info", detail: { photoStorage: "off" } })]);
  });

  it("leaves uploads off when partly configured, warning with what is missing", async () => {
    const { lines, log } = capture();
    const env: PhotoStorageEnv = { status: PhotoStorageStatus.Incomplete, problems: ["PHOTO_PUBLIC_URL is not set"] };
    expect(await startPhotoStorage(env, log)).toBeNull();
    expect(lines).toEqual([expect.objectContaining({ level: "warn", detail: { photoStorage: "incomplete", problems: ["PHOTO_PUBLIC_URL is not set"] } })]);
  });

  it("turns uploads on when configured, logging the bucket but no key", async () => {
    const { lines, log } = capture();
    const storage = await startPhotoStorage(ready, log, { loadImages: () => Promise.resolve(images) });
    expect(storage?.images).toBe(images);
    expect(storage?.limits).toEqual(UPLOAD_LIMITS);
    expect(storage?.store.publicUrl("courses/c/p/hero.webp")).toBe("https://photos.coursebook.golf/courses/c/p/hero.webp");
    expect(lines).toEqual([expect.objectContaining({ level: "info", detail: { photoStorage: "ready", bucket: "coursebook-photos", publicUrl: "https://photos.coursebook.golf" } })]);
    expect(JSON.stringify(lines)).not.toMatch(/secret-value|key-id/);
  });

  it("leaves uploads off when the image library fails to load, logging the failure", async () => {
    const { lines, log } = capture();
    const failure = new Error("Could not load the sharp module using the linuxmusl-x64 runtime");
    expect(await startPhotoStorage(ready, log, { loadImages: () => Promise.reject(failure) })).toBeNull();
    expect(lines).toEqual([expect.objectContaining({ level: "error", error: failure })]);
  });
});
