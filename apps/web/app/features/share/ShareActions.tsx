import { useEffect, useState } from "react";
import socialStyles from "../social/social.module.css";
import { errorMessage } from "../../shared/lib/errors";
import { copyLink, deliverImage } from "./deliver";
import type { RankingImageContent } from "./ranking-image";
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
 * take about 6.7 s instead of about 30 ms, which left Save image disabled while
 * a member clicked between views.
 */
const DRAW_AFTER_MS = 150;

/**
 * Copy link and Save image for a view of a ranking.
 *
 * The image is drawn before the button is pressed, not after: a phone's share
 * sheet opens only directly from a tap, and iOS Safari can refuse it once the
 * tap has waited on drawing the image.
 *
 * @param path - The app path of this view, for the link.
 * @param image - What the image says, without the link. Memoize it: a new
 *   object draws the image again.
 * @param fileName - The name to save the image under.
 * @param notify - Shows a toast.
 * @param render - Draws the image; a test double in unit tests, because jsdom has no canvas.
 */
export function ShareActions({
  path,
  image,
  fileName,
  notify,
  render = renderRankingImage,
}: {
  path: string;
  image: Omit<RankingImageContent, "link">;
  fileName: string;
  notify: (message: string) => void;
  render?: (content: RankingImageContent) => Promise<Blob>;
}) {
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
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

  const onCopy = () => {
    const url = window.location.origin + path;
    copyLink(url).then(
      () => {
        notify("Link copied");
      },
      (error: unknown) => {
        console.warn("Could not copy the link", error);
        notify("Couldn't copy it. The link is " + url);
      },
    );
  };

  const onSave = () => {
    if (!current?.blob) {
      if (current?.error) notify(current.error);
      return;
    }
    deliverImage(current.blob, fileName).catch((error: unknown) => {
      console.warn("Could not share the ranking image", error);
      notify("Couldn't share the image. Please try again.");
    });
  };

  return (
    <div className={styles.actions}>
      <button type="button" className={[socialStyles.button, socialStyles.buttonSolid].join(" ")} onClick={onCopy}>
        Copy link
      </button>
      <button
        type="button"
        className={socialStyles.button}
        disabled={!hasRows || !current}
        onClick={onSave}
      >
        Save image
      </button>
    </div>
  );
}
