import type { Course } from "@coursebook/domain/catalog/course";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import type { PhotoUploader, PhotoUploadFields } from "../../lib/api/upload";
import { cx } from "../../shared/lib/cx";
import { apiFailureMessage } from "../../shared/lib/errors";
import { fileProblem, fileSize, LICENSE_SUGGESTIONS, progressText, stageFor, UploadStage, type UploadSettings } from "./photo-upload";
import styles from "./curation.module.css";

const EMPTY_FIELDS: PhotoUploadFields = { credit: "", license: "", licenseUrl: "", sourceUrl: "" };

/**
 * Upload a photo for a course (issue #67): pick a file, see it, say who
 * took it and under what license or permission, and send it with visible
 * progress. Phone first: one column, the photo picker as a large target.
 * The API resizes the photo and removes its metadata, location included.
 *
 * @param course - The course the photo is for.
 * @param settings - The API's upload limits and accepted types; only shown when enabled.
 * @param upload - Sends the photo (`uploadCoursePhoto` from `lib/api`).
 * @param onUploaded - Called once the photo is saved, to reload or leave the page.
 * @param notify - Shows the outcome as a toast.
 */
export function PhotoUpload({
  course,
  settings,
  upload,
  onUploaded,
  notify,
}: {
  course: Course;
  settings: UploadSettings;
  upload: PhotoUploader;
  onUploaded: () => void;
  notify: (message: string) => void;
}) {
  const ids = useId();
  const [chosen, setChosen] = useState<{ file: File; preview: string } | null>(null);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [stage, setStage] = useState(UploadStage.Idle);
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const busy = stage !== UploadStage.Idle;
  const file = chosen?.file ?? null;
  const preview = chosen?.preview ?? null;

  /** Show a newly chosen file, releasing the previous preview's memory. */
  const replaceChosen = (next: File | null) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = next ? URL.createObjectURL(next) : null;
    setChosen(next && previewUrl.current ? { file: next, preview: previewUrl.current } : null);
  };

  // Leaving the page cancels an upload still on its way and releases the preview.
  useEffect(
    () => () => {
      inFlight.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const field = (name: keyof PhotoUploadFields) => ({
    value: fields[name],
    onChange: (event: { target: { value: string } }) => {
      setFields((current) => ({ ...current, [name]: event.target.value }));
    },
    disabled: busy,
  });

  const choose = (picked: File | null) => {
    const problem = picked ? fileProblem(picked, settings) : null;
    setError(problem);
    replaceChosen(problem ? null : picked);
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || busy) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setError(null);
    setProgress({ sent: 0, total: file.size });
    setStage(UploadStage.Sending);
    try {
      await upload({
        courseId: course.id,
        photo: file,
        fields,
        signal: controller.signal,
        onProgress: (next) => {
          setProgress(next);
          setStage(stageFor(next.sent, next.total));
        },
      });
      notify("Photo uploaded for " + course.name);
      replaceChosen(null);
      setFields(EMPTY_FIELDS);
      onUploaded();
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError") notify("Upload cancelled");
      else setError(apiFailureMessage(failure) ?? "The photo couldn't be uploaded. Please try again.");
    } finally {
      inFlight.current = null;
      setStage(UploadStage.Idle);
    }
  };

  return (
    <section className={styles.upload} aria-labelledby={ids + "heading"}>
      <h3 id={ids + "heading"} className={styles.subheading}>
        Upload a photo
      </h3>
      <p className={styles.quiet}>
        Your own photo, or one you have permission to use. JPEG, PNG or WebP up to {fileSize(settings.maxBytes)}. Location and camera details are removed.
      </p>
      <form className={styles.uploadForm} onSubmit={(event) => void submit(event)}>
        <label className={cx(styles.filePick, preview && styles.filePicked)}>
          {preview ? <img src={preview} alt={"Chosen photo for " + course.name} /> : <span className={styles.filePrompt}>Choose a photo</span>}
          <input
            type="file"
            accept={settings.contentTypes.join(",")}
            disabled={busy}
            aria-label="Photo file"
            onChange={(event) => {
              choose(event.target.files?.[0] ?? null);
            }}
          />
        </label>
        {file && (
          <p className={styles.fileMeta}>
            {file.name} · {fileSize(file.size)}
          </p>
        )}
        <label className={styles.field}>
          <span>Credit</span>
          <input {...field("credit")} required maxLength={200} autoComplete="off" placeholder="Who took it, e.g. Jane Smith" />
        </label>
        <label className={styles.field}>
          <span>License or permission</span>
          <input {...field("license")} required maxLength={100} autoComplete="off" list={ids + "licenses"} placeholder="e.g. Used with permission" />
          <datalist id={ids + "licenses"}>
            {LICENSE_SUGGESTIONS.map((license) => (
              <option key={license} value={license} />
            ))}
          </datalist>
        </label>
        <label className={styles.field}>
          <span>
            License link <em>optional</em>
          </span>
          <input {...field("licenseUrl")} type="url" maxLength={500} placeholder="https://creativecommons.org/licenses/by/4.0/" />
        </label>
        <label className={styles.field}>
          <span>
            Where it came from <em>optional</em>
          </span>
          <input {...field("sourceUrl")} type="url" maxLength={500} placeholder="A link to the photo or the photographer" />
        </label>
        {busy && (
          <div className={styles.uploadProgress} role="status">
            <progress max={progress.total || 1} value={stage === UploadStage.Saving ? undefined : progress.sent} aria-label="Upload progress" />
            <span>{progressText(stage, progress.sent, progress.total)}</span>
          </div>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.currentActions}>
          <button type="submit" className={styles.button} disabled={!file || busy}>
            {busy ? "Uploading…" : "Upload photo"}
          </button>
          {busy && (
            <button
              type="button"
              className={cx(styles.button, styles.buttonGhost)}
              onClick={() => {
                inFlight.current?.abort();
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
