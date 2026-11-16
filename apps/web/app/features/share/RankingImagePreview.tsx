import { useEffect, useRef } from "react";
import socialStyles from "../social/social.module.css";
import { Modal } from "../../shared/ui/Modal";
import { chooseImageSave, ImageStatus, saveImage, ShareOutcome, shareSupport } from "./deliver";
import styles from "./share.module.css";

/**
 * The ranking image by itself, in a dialog: the whole tall image to look at,
 * and Save image. Share sends the image with the link; this is for seeing
 * what will be sent, and for keeping the picture.
 *
 * On a phone Save image opens the share sheet with the image and nothing
 * else, where the phone's own Save Image puts it in the member's photos; a
 * computer downloads it (`chooseImageSave`).
 *
 * @param title - The view's heading, e.g. "Top 5 in Michigan".
 * @param memberName - Whose ranking, for the image's description.
 * @param status - Where the image stands.
 * @param blob - The image, once drawn.
 * @param error - Why it could not be drawn, for `ImageStatus.Failed`.
 * @param fileName - The name to save it under.
 * @param notify - Shows a toast.
 * @param onClose - Closes the dialog.
 */
export function RankingImagePreview({
  title,
  memberName,
  status,
  blob,
  error,
  fileName,
  notify,
  onClose,
}: {
  title: string;
  memberName: string;
  status: ImageStatus;
  blob: Blob | null;
  error: string | null;
  fileName: string;
  notify: (message: string) => void;
  onClose: () => void;
}) {
  const picture = useRef<HTMLImageElement>(null);
  const ready = status === ImageStatus.Ready && blob !== null;

  // The image's address is made from the blob and must be freed with it, so it is set here, not in the markup.
  useEffect(() => {
    const element = picture.current;
    if (!ready || !element) return;
    const url = URL.createObjectURL(blob);
    element.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [ready, blob]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const onSave = () => {
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    saveImage(chooseImageSave(shareSupport(file, window.location.href)), file).then(
      (outcome) => {
        if (outcome === ShareOutcome.Saved) notify("Image saved");
      },
      (reason: unknown) => {
        console.warn("Could not save the ranking image", reason);
        notify("Couldn't save the image. Please try again.");
      },
    );
  };

  return (
    <Modal id="rankingImage" eyebrow="Ranking image" title={title} onClose={onClose} dismissBackdrop>
      <div className={styles.preview}>
        {ready ? (
          <img ref={picture} className={styles.previewImage} alt={memberName + "'s " + title + " as an image"} />
        ) : (
          <p className={styles.previewNote} role="status">
            {status === ImageStatus.Failed ? (error ?? "The image couldn't be drawn.") : "Drawing the image…"}
          </p>
        )}
      </div>
      <div className={styles.previewActions}>
        <button type="button" className={[socialStyles.button, socialStyles.buttonSolid].join(" ")} disabled={!ready} onClick={onSave}>
          Save image
        </button>
      </div>
    </Modal>
  );
}
