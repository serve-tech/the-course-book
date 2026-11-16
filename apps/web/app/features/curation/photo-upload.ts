/**
 * Pure rules for uploading a course photo from the curator screen (issue
 * #67): whether uploads are on, which files to refuse before sending them,
 * and what to say while one is on its way. The API checks everything again;
 * these checks only save a curator from waiting on a file that will fail.
 */

/** What the API says about uploads (`getPhotoUploadSettings`). */
export interface UploadSettings {
  enabled: boolean;
  maxBytes: number;
  maxPixels: number;
  minWidth: number;
  /** Content types accepted, JPEG first; used in this order for the file picker's `accept`. */
  contentTypes: readonly string[];
}

/** Uploads off: the API has no photo storage, or couldn't say. */
export const UPLOADS_OFF: UploadSettings = { enabled: false, maxBytes: 0, maxPixels: 0, minWidth: 0, contentTypes: [] };

/** Suggestions for the license field; any text is accepted. */
export const LICENSE_SUGGESTIONS: readonly string[] = ["Used with permission", "CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "Public domain"];

/** "12.4 MB": a file size as members read it. */
export function fileSize(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const HEIC = /\.(heic|heif)$/i;

/**
 * Why a chosen file can't be uploaded, or null when it can be sent.
 *
 * iOS Safari converts a HEIC photo to JPEG when the picker asks for JPEG
 * first, so a HEIC file here came from somewhere else (Files, a download).
 */
export function fileProblem(file: { name: string; type: string; size: number }, settings: UploadSettings): string | null {
  if (file.type === "image/heic" || file.type === "image/heif" || HEIC.test(file.name))
    return "HEIC photos can't be used. Choose it from Photos, which hands it over as JPEG, or export it as JPEG first.";
  if (file.type && !settings.contentTypes.includes(file.type)) return "Choose a JPEG, PNG or WebP photo.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > settings.maxBytes) return "That photo is " + fileSize(file.size) + "; the most is " + fileSize(settings.maxBytes) + ". Choose a smaller copy.";
  return null;
}

/** Where an upload is. */
export enum UploadStage {
  Idle = "idle",
  /** The file is on its way; progress counts its bytes. */
  Sending = "sending",
  /** Every byte is sent; the API is resizing and storing it. */
  Saving = "saving",
}

/** The stage an upload is in once `sent` of `total` bytes have gone. */
export function stageFor(sent: number, total: number): UploadStage {
  return total > 0 && sent >= total ? UploadStage.Saving : UploadStage.Sending;
}

/** What the progress line says. */
export function progressText(stage: UploadStage, sent: number, total: number): string {
  if (stage === UploadStage.Saving) return "Resizing and saving…";
  if (total <= 0) return "Uploading…";
  return "Uploading " + String(Math.min(100, Math.floor((sent / total) * 100))) + "% of " + fileSize(total);
}
