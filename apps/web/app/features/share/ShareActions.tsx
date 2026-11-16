import { useEffect, useState } from "react";
import socialStyles from "../social/social.module.css";
import { errorMessage } from "../../shared/lib/errors";
import { chooseDelivery, deliverShare, ImageStatus, shareNotice, shareSupport } from "./deliver";
import type { RankingImageContent } from "./ranking-image";
import { RankingImagePreview } from "./RankingImagePreview";
import { renderRankingImage } from "./render-ranking-image";
import styles from "./share.module.css";

/** A drawn image and what it was drawn from, which tells a current image from a stale one. */
interface PreparedImage {
  image: Omit<RankingImageContent, "link">;
  path: string;
  blob: Blob | null;
  error: string | null;
}

/**
 * How long a view must stay on screen before its image is drawn. Measured in
 * Chromium (2026-11-04): after several draws in quick succession, `toBlob` can
 * take about 6.7 s instead of about 30 ms, which left the image unready while
 * a member clicked between views.
 */
const DRAW_AFTER_MS = 150;

/** Where the image for the view on screen stands. */
function imageStatus(hasRows: boolean, current: PreparedImage | null): ImageStatus {
  if (!hasRows) return ImageStatus.None;
  if (!current) return ImageStatus.Drawing;
  return current.blob ? ImageStatus.Ready : ImageStatus.Failed;
}

/**
 * One Share button for a view of a ranking, which sends its image and its
 * link together: the share sheet on a phone, a saved image and a copied link
 * on a computer (`chooseDelivery`). Without an image (still drawing, failed,
 * or an empty view) it sends the link alone and says why.
 *
 * Under it, View image opens the image by itself (`RankingImagePreview`), to
 * see what will be sent and to save the picture. It is a link, not a second
 * button, so Share stays the one thing to press; an empty view has no image
 * and no link.
 *
 * The image is drawn before the button is pressed, not after: a phone's share
 * sheet opens only directly from a tap, and iOS Safari can refuse it once the
 * tap has waited on drawing the image. The button's `data-image` says where
 * the image stands.
 *
 * @param path - The app path of this view, for the link.
 * @param message - The words a phone's share sheet sends with the link.
 * @param image - What the image says, without the link. Memoize it: a new
 *   object draws the image again.
 * @param fileName - The name to save the image under.
 * @param notify - Shows a toast.
 * @param render - Draws the image; a test double in unit tests, because jsdom has no canvas.
 */
export function ShareActions({
  path,
  message,
  image,
  fileName,
  notify,
  render = renderRankingImage,
}: {
  path: string;
  message: string;
  image: Omit<RankingImageContent, "link">;
  fileName: string;
  notify: (message: string) => void;
  render?: (content: RankingImageContent) => Promise<Blob>;
}) {
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const hasRows = image.rows.length > 0;

  useEffect(() => {
    if (!hasRows) return;
    let active = true;
    const drawing = setTimeout(() => {
      render({ ...image, link: window.location.host + path }).then(
        (blob) => {
          if (active) setPrepared({ image, path, blob, error: null });
        },
        (error: unknown) => {
          console.warn("Could not draw the ranking image", error);
          if (active) setPrepared({ image, path, blob: null, error: errorMessage(error) });
        },
      );
    }, DRAW_AFTER_MS);
    return () => {
      active = false;
      clearTimeout(drawing);
    };
  }, [hasRows, image, path, render]);

  // A reorder keeps the same link but changes the image, so the link alone cannot say this one is current.
  const current = prepared?.image === image && prepared.path === path ? prepared : null;
  const status = imageStatus(hasRows, current);

  const onShare = () => {
    const url = window.location.origin + path;
    const file = current?.blob ? new File([current.blob], fileName, { type: "image/png" }) : null;
    const delivery = chooseDelivery(status, shareSupport(file, url));
    deliverShare(delivery, file, url, message).then(
      (outcome) => {
        const message = shareNotice(delivery, outcome, status, current?.error ?? null, url);
        if (message) notify(message);
      },
      (error: unknown) => {
        console.warn("Could not share the ranking", error);
        notify("Couldn't share it. Please try again.");
      },
    );
  };

  return (
    <div className={styles.actions}>
      <button type="button" className={[socialStyles.button, socialStyles.buttonSolid].join(" ")} data-image={status} onClick={onShare}>
        Share
      </button>
      {hasRows && (
        <button
          type="button"
          className={styles.viewImage}
          aria-haspopup="dialog"
          onClick={() => {
            setPreviewing(true);
          }}
        >
          View image
        </button>
      )}
      {previewing && (
        <RankingImagePreview
          title={image.title}
          memberName={image.memberName}
          status={status}
          blob={current?.blob ?? null}
          error={current?.error ?? null}
          fileName={fileName}
          notify={notify}
          onClose={() => {
            setPreviewing(false);
          }}
        />
      )}
    </div>
  );
}
