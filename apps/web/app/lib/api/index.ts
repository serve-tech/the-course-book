import { getToken } from "@clerk/react-router";
import { createApiClient } from "./client";
import { serverStatus } from "./server-status";
import { createPhotoUploader } from "./upload";

/**
 * The web app's API client. Calls carry the Clerk session token (waiting for
 * Clerk to load when necessary); only call it from the browser, i.e. in
 * clientLoader, clientAction, effects and event handlers.
 */
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL,
  getToken: () => getToken(),
  onSlow: (slow) => {
    serverStatus.set(slow);
  },
});

/**
 * Uploads a course photo with progress (#67). Call it from an event handler;
 * it carries the same Clerk session token as `api`.
 */
export const uploadCoursePhoto = createPhotoUploader({
  baseUrl: import.meta.env.VITE_API_URL,
  getToken: () => getToken(),
});

export { ApiError, expectOk, unwrap } from "./client";
export type { ApiSchemas } from "./client";
export type { PhotoUploader, PhotoUploadFields, UploadProgress } from "./upload";
