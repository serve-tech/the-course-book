import { ApiError, toApiError } from "./client";

/**
 * Photo uploads to the API (issue #67). The typed client is built on
 * `fetch`, which can't report how much of a request body has been sent, and
 * a phone photo can take a while on a mobile network; so uploads use
 * XMLHttpRequest for its upload progress events. The request is otherwise
 * what the contract describes: `uploadCoursePhoto`, multipart, with a
 * bearer token and no cookies.
 */

/** The form fields of `uploadCoursePhoto`, besides the file. */
export interface PhotoUploadFields {
  credit: string;
  license: string;
  /** Left out of the request when empty. */
  licenseUrl: string;
  /** Left out of the request when empty. */
  sourceUrl: string;
}

/** What an upload reports while it runs. */
export interface UploadProgress {
  /** Bytes of the request body sent so far. */
  sent: number;
  /** The body's size in bytes. */
  total: number;
}

/** The parts of XMLHttpRequest an upload uses; tests pass a fake. */
export interface UploadRequest {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: FormData): void;
  abort(): void;
  getResponseHeader(name: string): string | null;
  readonly status: number;
  readonly responseText: string;
  withCredentials: boolean;
  readonly upload: { onprogress: ((event: ProgressEvent<XMLHttpRequestEventTarget>) => void) | null };
  onload: ((event: ProgressEvent) => void) | null;
  onerror: ((event: ProgressEvent) => void) | null;
  onabort: ((event: ProgressEvent) => void) | null;
}

export interface PhotoUploaderOptions {
  /** API origin, e.g. https://api.coursebook.golf. */
  baseUrl: string;
  /** The current Clerk session token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Makes the request; defaults to a new XMLHttpRequest. */
  createRequest?: () => UploadRequest;
}

/** One upload: the course, the file, its credit and license, and where to report progress. */
export interface PhotoUploadInput {
  courseId: string;
  photo: File;
  fields: PhotoUploadFields;
  onProgress?: (progress: UploadProgress) => void;
  /** Aborting it cancels the upload; the returned promise then rejects with an `AbortError`. */
  signal?: AbortSignal;
}

/** The multipart body of `uploadCoursePhoto`: empty optional fields are left out, as the contract asks. */
export function uploadForm(photo: File, fields: PhotoUploadFields): FormData {
  const form = new FormData();
  form.set("photo", photo);
  form.set("credit", fields.credit.trim());
  form.set("license", fields.license.trim());
  if (fields.licenseUrl.trim()) form.set("licenseUrl", fields.licenseUrl.trim());
  if (fields.sourceUrl.trim()) form.set("sourceUrl", fields.sourceUrl.trim());
  return form;
}

/**
 * The error of a failed upload, read like the typed client's: the API's
 * envelope when the body is one, else a generic failure by status. Status 0
 * means the request never got an answer.
 */
export function uploadError(status: number, responseText: string, requestId: string | null): ApiError {
  if (status === 0) return new ApiError(0, "network", "The photo couldn't be sent. Check your connection and try again.", requestId);
  let body: unknown = null;
  try {
    body = JSON.parse(responseText);
  } catch {
    // Not JSON: a proxy's page, or an empty body. The status says enough.
  }
  return toApiError(body, new Response(null, { status, headers: requestId ? { "x-request-id": requestId } : {} }));
}

/**
 * An uploader for course photos.
 *
 * Returns:
 *     A function that uploads a photo and resolves once the API has stored
 *     it, or rejects with an `ApiError` (or an `AbortError` when
 *     cancelled). It returns nothing: the page reloads the course through
 *     its loader, like every other change.
 */
export function createPhotoUploader(options: PhotoUploaderOptions) {
  const createRequest: () => UploadRequest = options.createRequest ?? (() => new XMLHttpRequest());
  return async function uploadCoursePhoto({ courseId, photo, fields, onProgress, signal }: PhotoUploadInput): Promise<void> {
    signal?.throwIfAborted();
    const token = await options.getToken();
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const request = createRequest();
      request.open("POST", options.baseUrl + "/v1/courses/" + encodeURIComponent(courseId) + "/photo/upload");
      request.withCredentials = false;
      if (token) request.setRequestHeader("Authorization", "Bearer " + token);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.({ sent: event.loaded, total: event.total });
      };
      request.onload = () => {
        if (request.status === 200) resolve();
        else reject(uploadError(request.status, request.responseText, request.getResponseHeader("x-request-id")));
      };
      request.onerror = () => {
        reject(uploadError(0, "", null));
      };
      request.onabort = () => {
        reject(new DOMException("The upload was cancelled.", "AbortError"));
      };
      signal?.addEventListener("abort", () => {
        request.abort();
      });
      request.send(uploadForm(photo, fields));
    });
  };
}

/** Uploads a course photo; see `createPhotoUploader`. */
export type PhotoUploader = ReturnType<typeof createPhotoUploader>;
