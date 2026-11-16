import { UPLOAD_LIMITS, type UploadLimits } from "../domain/stored-photo";
import type { PhotoStorage } from "./curation";
import { PhotoStorageStatus, type PhotoStorageEnv } from "./env";
import { loadImageProcessor, type ImageProcessor } from "./photo-images";
import { createS3PhotoStore, type Fetcher } from "./photo-store";

/** Where `startPhotoStorage` reports what it found; `error` receives the failure itself. */
export interface StartupLog {
  info(message: string, detail: Record<string, unknown>): void;
  warn(message: string, detail: Record<string, unknown>): void;
  error(message: string, error: unknown): void;
}

/** What `startPhotoStorage` needs besides the settings; tests replace the image loader. */
export interface PhotoStorageDependencies {
  loadImages?: (limits: UploadLimits) => Promise<ImageProcessor>;
  fetcher?: Fetcher;
}

/**
 * Turn photo storage on when it is fully configured (issue #67).
 *
 * Never throws, so storage can't stop the API from starting: with nothing
 * set it is quietly off; with some variables missing or malformed, or the
 * image library failing to load, it is off and the log says why, naming
 * variables but never their values.
 *
 * Args:
 *     env: The parsed photo storage variables.
 *     log: Startup log lines.
 *     deps: The image library loader and the fetch used for storage.
 *
 * Returns:
 *     The storage the API uses, or null when uploads are off.
 */
export async function startPhotoStorage(env: PhotoStorageEnv, log: StartupLog, deps: PhotoStorageDependencies = {}): Promise<PhotoStorage | null> {
  switch (env.status) {
    case PhotoStorageStatus.Off:
      log.info("Photo storage is off: uploads are off and Commons photos are served from Commons", { photoStorage: env.status });
      return null;
    case PhotoStorageStatus.Incomplete:
      log.warn("Photo storage is only partly configured, so uploads are off", { photoStorage: env.status, problems: env.problems });
      return null;
    case PhotoStorageStatus.Ready:
      try {
        const images = await (deps.loadImages ?? loadImageProcessor)(UPLOAD_LIMITS);
        log.info("Photo storage is on", { photoStorage: env.status, bucket: env.config.bucket, publicUrl: env.config.publicUrl });
        return { store: createS3PhotoStore(env.config, deps.fetcher), images, limits: UPLOAD_LIMITS };
      } catch (error) {
        log.error("Photo storage is configured but the image library failed to load, so uploads are off", error);
        return null;
      }
  }
}
