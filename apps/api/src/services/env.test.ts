import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseApiEnv, parsePhotoStorageEnv, PhotoStorageStatus } from "./env";

describe("API environment", () => {
  it("applies defaults", () => {
    expect(parseApiEnv({})).toEqual({
      PORT: 3001,
      WEB_ORIGINS: [],
      PUBLIC_WEB_URL: "https://coursebook.golf",
      MIN_IOS_VERSION: "0.0.0",
      MIN_ANDROID_VERSION: "0.0.0",
    });
  });

  it("splits and trims web origins", () => {
    expect(parseApiEnv({ WEB_ORIGINS: "https://coursebook.golf, https://www.coursebook.golf ,," }).WEB_ORIGINS).toEqual([
      "https://coursebook.golf",
      "https://www.coursebook.golf",
    ]);
  });

  it.each([
    ["missing", {}],
    ["empty", { WEB_ORIGINS: "" }],
    ["only separators", { WEB_ORIGINS: " , ," }],
  ])("requires a web origin in production when WEB_ORIGINS is %s", (_label, source) => {
    expect(() => parseApiEnv({ NODE_ENV: "production", ...source })).toThrow(/WEB_ORIGINS/);
  });

  it("accepts web origins in production", () => {
    expect(parseApiEnv({ NODE_ENV: "production", WEB_ORIGINS: "https://coursebook.golf" }).WEB_ORIGINS).toEqual(["https://coursebook.golf"]);
  });

  it("allows no web origin outside production", () => {
    expect(parseApiEnv({ NODE_ENV: "development" }).WEB_ORIGINS).toEqual([]);
  });

  it.each([
    ["a trailing slash", { WEB_ORIGINS: "https://coursebook.golf/" }],
    ["a path", { WEB_ORIGINS: "https://coursebook.golf/app" }],
    ["a web origin that is not a URL", { WEB_ORIGINS: "coursebook.golf" }],
    ["a public web URL that is not a URL", { PUBLIC_WEB_URL: "coursebook.golf" }],
    ["a malformed version", { MIN_IOS_VERSION: "1.0" }],
    ["a JWT key that is not a PEM public key", { CLERK_JWT_KEY: "abc" }],
    ["a port out of range", { PORT: "70000" }],
  ])("rejects %s with a readable validation error", (_label, source) => {
    expect(() => parseApiEnv(source)).toThrow(ZodError);
  });

  it.each(["https://coursebook.golf/", "https://coursebook.golf/app", "coursebook.golf"])(
    "rejects the malformed web origin %s in production too",
    (value) => {
      expect(() => parseApiEnv({ NODE_ENV: "production", WEB_ORIGINS: value })).toThrow(/WEB_ORIGINS/);
    },
  );
});

describe("photo storage environment", () => {
  const complete = {
    PHOTO_STORAGE_ENDPOINT: "https://0123abcd.r2.cloudflarestorage.com/",
    PHOTO_STORAGE_BUCKET: "coursebook-photos",
    PHOTO_STORAGE_ACCESS_KEY_ID: "key-id",
    PHOTO_STORAGE_SECRET_ACCESS_KEY: "secret-value",
    PHOTO_PUBLIC_URL: "https://photos.coursebook.golf/",
  };

  it.each([
    ["unset", {}],
    ["blank", { PHOTO_STORAGE_BUCKET: " ", PHOTO_PUBLIC_URL: "" }],
  ])("is off when every variable is %s", (_label, source) => {
    expect(parsePhotoStorageEnv(source)).toEqual({ status: PhotoStorageStatus.Off });
  });

  it("is ready when every variable is set, with R2's region and no trailing slashes", () => {
    expect(parsePhotoStorageEnv(complete)).toEqual({
      status: PhotoStorageStatus.Ready,
      config: {
        endpoint: "https://0123abcd.r2.cloudflarestorage.com",
        bucket: "coursebook-photos",
        accessKeyId: "key-id",
        secretAccessKey: "secret-value",
        region: "auto",
        publicUrl: "https://photos.coursebook.golf",
      },
    });
  });

  it("takes another region for another S3-compatible store", () => {
    const parsed = parsePhotoStorageEnv({ ...complete, PHOTO_STORAGE_REGION: "us-east-1" });
    expect(parsed.status === PhotoStorageStatus.Ready && parsed.config.region).toBe("us-east-1");
  });

  it.each([
    ["one variable missing", { ...complete, PHOTO_STORAGE_SECRET_ACCESS_KEY: undefined }, ["PHOTO_STORAGE_SECRET_ACCESS_KEY is not set"]],
    ["only the bucket", { PHOTO_STORAGE_BUCKET: "coursebook-photos" }, [
      "PHOTO_STORAGE_ENDPOINT is not set",
      "PHOTO_STORAGE_ACCESS_KEY_ID is not set",
      "PHOTO_STORAGE_SECRET_ACCESS_KEY is not set",
      "PHOTO_PUBLIC_URL is not set",
    ]],
    ["an endpoint that is not a URL", { ...complete, PHOTO_STORAGE_ENDPOINT: "0123abcd.r2.cloudflarestorage.com" }, ["PHOTO_STORAGE_ENDPOINT is not an http(s) URL"]],
    ["a public URL that is not http", { ...complete, PHOTO_PUBLIC_URL: "ftp://photos.coursebook.golf" }, ["PHOTO_PUBLIC_URL is not an http(s) URL"]],
    ["a bucket name with capitals", { ...complete, PHOTO_STORAGE_BUCKET: "CourseBook" }, [
      "PHOTO_STORAGE_BUCKET is not a bucket name (lowercase letters, digits, dots and hyphens)",
    ]],
  ])("is incomplete with %s, naming the problems", (_label, source, problems) => {
    expect(parsePhotoStorageEnv(source)).toEqual({ status: PhotoStorageStatus.Incomplete, problems });
  });

  it("never repeats a value in its problems", () => {
    const parsed = parsePhotoStorageEnv({ ...complete, PHOTO_STORAGE_ENDPOINT: "not a url with secret-value", PHOTO_PUBLIC_URL: undefined });
    expect(JSON.stringify(parsed)).not.toContain("secret-value");
  });
});
