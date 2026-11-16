import { publicPhotoUrl } from "../domain/stored-photo";
import { AppError, ErrorCode } from "../services/errors";
import { PHOTO_STORAGE_UNAVAILABLE, type PhotoStore } from "../services/photo-store";

/** Where the in-memory store says its objects are served from. */
export const MEMORY_PHOTO_URL = "https://photos.test";

/** One stored object. */
export interface StoredObject {
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
}

/**
 * A photo store in memory, for tests (issue #67). It behaves like S3:
 * deleting a missing key succeeds. `failPuts` and `failDeletes` make the
 * next calls fail the way an unreachable bucket does, to test what is left
 * behind.
 */
export function createMemoryPhotoStore() {
  const objects = new Map<string, StoredObject>();
  const failures = { puts: 0, deletes: 0 };
  const unavailable = () => new AppError(503, ErrorCode.PhotoStorageUnavailable, PHOTO_STORAGE_UNAVAILABLE, { cause: new Error("memory store told to fail") });
  const store: PhotoStore = {
    put(key, body, contentType, cacheControl) {
      if (failures.puts > 0) {
        failures.puts -= 1;
        return Promise.reject(unavailable());
      }
      objects.set(key, { body, contentType, cacheControl });
      return Promise.resolve();
    },
    delete(key) {
      if (failures.deletes > 0) {
        failures.deletes -= 1;
        return Promise.reject(unavailable());
      }
      objects.delete(key);
      return Promise.resolve();
    },
    publicUrl: (key) => publicPhotoUrl(MEMORY_PHOTO_URL, key),
  };
  return {
    store,
    objects,
    /** Make the next `count` puts fail. */
    failPuts: (count = 1) => {
      failures.puts = count;
    },
    /** Make the next `count` deletes fail. */
    failDeletes: (count = 1) => {
      failures.deletes = count;
    },
  };
}
