// @vitest-environment jsdom
// XMLHttpRequest's ProgressEvent exists in browsers, not in Node.
import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { createPhotoUploader, uploadError, uploadForm, type UploadRequest } from "./upload";

/** A stand-in for XMLHttpRequest that records the request and lets the test answer it. */
class FakeRequest implements UploadRequest {
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: FormData | null = null;
  aborted = false;
  status = 0;
  responseText = "";
  withCredentials = true;
  responseHeaders: Record<string, string> = {};
  upload: UploadRequest["upload"] = { onprogress: null };
  onload: UploadRequest["onload"] = null;
  onerror: UploadRequest["onerror"] = null;
  onabort: UploadRequest["onabort"] = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.(new ProgressEvent("abort"));
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.(new ProgressEvent("progress", { loaded, total, lengthComputable: true }) as ProgressEvent<XMLHttpRequestEventTarget>);
  }
  answer(status: number, body: unknown, requestId = "req-1") {
    this.status = status;
    this.responseText = typeof body === "string" ? body : JSON.stringify(body);
    this.responseHeaders = { "x-request-id": requestId };
    this.onload?.(new ProgressEvent("load"));
  }
}

const fields = { credit: " Cora ", license: "Used with permission", licenseUrl: "", sourceUrl: "https://example.com/p" };
const photo = new File([new Uint8Array([255, 216, 255])], "IMG_0001.jpg", { type: "image/jpeg" });

function setup(token: string | null = "token-1") {
  const requests: FakeRequest[] = [];
  const upload = createPhotoUploader({
    baseUrl: "https://api.example.com",
    getToken: () => Promise.resolve(token),
    createRequest: () => {
      const request = new FakeRequest();
      requests.push(request);
      return request;
    },
  });
  /** The request, once the uploader has opened it (after awaiting the token). */
  const sent = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = requests[0];
    if (!request) throw new Error("no request was made");
    return request;
  };
  return { upload, sent };
}

describe("uploadForm", () => {
  it("sends the photo with trimmed fields and leaves out empty ones", () => {
    const form = uploadForm(photo, fields);
    expect(form.get("photo")).toBeInstanceOf(File);
    expect(form.get("credit")).toBe("Cora");
    expect(form.get("license")).toBe("Used with permission");
    expect(form.has("licenseUrl")).toBe(false);
    expect(form.get("sourceUrl")).toBe("https://example.com/p");
  });
});

describe("createPhotoUploader", () => {
  it("posts the form with the bearer token and no cookies, reporting progress", async () => {
    const { upload, sent } = setup();
    const progress: { sent: number; total: number }[] = [];
    const done = upload({ courseId: "c 1", photo, fields, onProgress: (next) => progress.push(next) });
    const request = await sent();
    expect([request.method, request.url]).toEqual(["POST", "https://api.example.com/v1/courses/c%201/photo/upload"]);
    expect(request.headers).toEqual({ Authorization: "Bearer token-1" });
    expect(request.withCredentials).toBe(false);
    expect(request.body?.get("credit")).toBe("Cora");
    request.progress(500, 1000);
    request.progress(1000, 1000);
    request.answer(200, { id: "c 1" });
    await expect(done).resolves.toBeUndefined();
    expect(progress).toEqual([
      { sent: 500, total: 1000 },
      { sent: 1000, total: 1000 },
    ]);
  });

  it("rejects with the API's error envelope", async () => {
    const { upload, sent } = setup();
    const done = upload({ courseId: "c1", photo, fields });
    (await sent()).answer(400, { error: { code: "photo_unsupported", message: "That file isn't a JPEG, PNG or WebP photo.", requestId: "req-9", fields: null } });
    await expect(done).rejects.toMatchObject({ status: 400, code: "photo_unsupported", message: "That file isn't a JPEG, PNG or WebP photo.", requestId: "req-9" });
  });

  it("rejects a lost connection as a network failure", async () => {
    const { upload, sent } = setup();
    const done = upload({ courseId: "c1", photo, fields });
    (await sent()).onerror?.(new ProgressEvent("error"));
    await expect(done).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("cancels when its signal aborts", async () => {
    const { upload, sent } = setup();
    const controller = new AbortController();
    const done = upload({ courseId: "c1", photo, fields, signal: controller.signal });
    const request = await sent();
    controller.abort();
    await expect(done).rejects.toMatchObject({ name: "AbortError" });
    expect(request.aborted).toBe(true);
  });

  it("sends no Authorization header without a session", async () => {
    const { upload, sent } = setup(null);
    void upload({ courseId: "c1", photo, fields }).catch(() => undefined);
    expect((await sent()).headers).toEqual({});
  });
});

describe("uploadError", () => {
  it("reads a body that isn't an envelope by its status", () => {
    const error = uploadError(502, "<html>Bad gateway</html>", "req-2");
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: "http_502", requestId: "req-2" });
  });
});
