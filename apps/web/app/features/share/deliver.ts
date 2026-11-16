/**
 * Sharing a view of a ranking with one Share button: the image and the link
 * together where the device can, the link alone when there is no image.
 * `chooseDelivery` and `shareNotice` are the pure rules; `shareSupport` and
 * `deliverShare` are the browser boundary, called from the click handler.
 *
 * Which fields go to the share sheet (checked 2026-11-15):
 *
 * - WebKit hands the text, the URL and the files to iOS's share sheet as
 *   separate items, and adds the title only when nothing else is there
 *   (`WKShareSheet.mm`, `presentWithParameters`). Each app then keeps what it
 *   can: Messages takes everything, while WhatsApp has been reported to keep
 *   the link and drop the file (w3c/web-share#279; WebKit bug 251500).
 * - Chrome on Android sends one image as `EXTRA_STREAM`, with the text and
 *   URL joined in `EXTRA_TEXT` and no subject (`ShareHelper.getShareIntent`).
 *   Until a fix on 2025-10-31 (crbug 451280345) it put only `url` there and
 *   dropped `text`, so older Chrome keeps the link only if it is in `url`.
 *
 * So the sheet gets `{ files, text, url }`. The link stays in `url`, the
 * field both platforms carry with an image. `text` holds the message ("Check
 * out my Top 10 golf courses on The Course Book"): Messages and current
 * Chrome keep it, older Chrome and some apps drop it, and none of them loses
 * the link for it. A title would be dropped on both. No combination reaches
 * every app; the image prints the link too.
 */

/** Where the view's image stands when Share is pressed. */
export enum ImageStatus {
  /** Drawn and current. */
  Ready = "ready",
  /** Not drawn yet for the view on screen. */
  Drawing = "drawing",
  /** Drawing failed; the reason is shown. */
  Failed = "failed",
  /** An empty view has no image. */
  None = "none",
}

/** What one press of Share does. */
export enum ShareDelivery {
  /** The share sheet with the image and the link: phones that can share files. */
  ShareSheetWithImage = "share-sheet-with-image",
  /** The share sheet with the link alone: phones, when there is no image to send. */
  ShareSheetWithLink = "share-sheet-with-link",
  /** Download the image and copy the link: computers, and phones that cannot share files. */
  SaveImageAndCopyLink = "save-image-and-copy-link",
  /** Copy the link alone: computers, when there is no image to save. */
  CopyLink = "copy-link",
}

/** What the browser offers, as `shareSupport` reads it. */
export interface ShareSupport {
  /** Whether it can share the image file. */
  canShareImage: boolean;
  /** Whether it can share a link. */
  canShareLink: boolean;
  /** Whether the main input is a finger. */
  coarsePointer: boolean;
}

/** How a delivery ended. */
export enum ShareOutcome {
  /** The share sheet sent it. */
  Shared = "shared",
  /** The member closed the share sheet. */
  Cancelled = "cancelled",
  /** The link is on the clipboard (and the image saved, for SaveImageAndCopyLink). */
  Copied = "copied",
  /** The clipboard refused the link (the image was still saved, for SaveImageAndCopyLink). */
  CopyFailed = "copy-failed",
}

/**
 * Choose what Share does. Computers can open a share dialog too, but people
 * there expect a file and a link they can paste, so the sheet is for touch
 * devices.
 *
 * Args:
 *     image: Where the image stands.
 *     support: What the browser offers.
 *
 * Returns:
 *     The delivery. With an image: the sheet with both on a touch device
 *     that can share files, else a download and a copied link. Without one:
 *     the sheet with the link on a touch device that can share links, else a
 *     copied link.
 */
export function chooseDelivery(image: ImageStatus, support: ShareSupport): ShareDelivery {
  if (image === ImageStatus.Ready)
    return support.coarsePointer && support.canShareImage ? ShareDelivery.ShareSheetWithImage : ShareDelivery.SaveImageAndCopyLink;
  return support.coarsePointer && support.canShareLink ? ShareDelivery.ShareSheetWithLink : ShareDelivery.CopyLink;
}

/** Why the image was left out, as a sentence; null when nothing was missing. */
function missingImage(image: ImageStatus, imageError: string | null): string | null {
  switch (image) {
    case ImageStatus.Drawing:
      return "The image wasn't ready yet.";
    case ImageStatus.Failed:
      return imageError ?? "The image couldn't be drawn.";
    case ImageStatus.Ready:
    case ImageStatus.None:
      return null;
  }
}

/**
 * The toast after Share, which says what happened and what was left out.
 *
 * Args:
 *     delivery: What Share did.
 *     outcome: How it ended.
 *     image: Where the image stood; an empty view's missing image is not news.
 *     imageError: Why drawing failed, for `ImageStatus.Failed`.
 *     url: The link, shown when it could not be copied.
 *
 * Returns:
 *     The message; null when the share sheet said enough or was closed.
 *
 * Example:
 *     >>> shareNotice(ShareDelivery.SaveImageAndCopyLink, ShareOutcome.Copied, ImageStatus.Ready, null, url)
 *     "Image saved and link copied"
 */
export function shareNotice(
  delivery: ShareDelivery,
  outcome: ShareOutcome,
  image: ImageStatus,
  imageError: string | null,
  url: string,
): string | null {
  if (outcome === ShareOutcome.Cancelled) return null;
  const missing = missingImage(image, imageError);
  const notCopied = "Couldn't copy the link. It's " + url;
  switch (delivery) {
    case ShareDelivery.ShareSheetWithImage:
      return null;
    case ShareDelivery.ShareSheetWithLink:
      return missing ? "Shared the link only. " + missing : null;
    case ShareDelivery.SaveImageAndCopyLink:
      return outcome === ShareOutcome.Copied ? "Image saved and link copied" : "Image saved. " + notCopied;
    case ShareDelivery.CopyLink:
      if (outcome === ShareOutcome.Copied) return missing ? "Link copied. " + missing : "Link copied";
      return missing ? missing + " " + notCopied : notCopied;
  }
}

/**
 * Read what this browser can share. Call it from the click handler.
 *
 * Args:
 *     file: The image, or null when there is none.
 *     url: The link.
 */
export function shareSupport(file: File | null, url: string): ShareSupport {
  // Detect file sharing with `files` alone: browsers drop members they don't know before testing the rest (Web Share spec, canShare).
  const canShare = typeof navigator.canShare === "function";
  return {
    canShareImage: canShare && file !== null && navigator.canShare({ files: [file] }),
    canShareLink: canShare && navigator.canShare({ url }),
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
  };
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  // Revoking too soon can cancel the download in some browsers, so wait as
  // FileSaver.js does; a page closing first frees the URL anyway.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 40_000);
}

/** Open the share sheet; a member closing it is not a failure. */
async function openSheet(data: ShareData): Promise<ShareOutcome> {
  try {
    await navigator.share(data);
    return ShareOutcome.Shared;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return ShareOutcome.Cancelled;
    throw error;
  }
}

/** Copy the link; a refusal is reported, not thrown, so the toast can show the link instead. */
async function copy(url: string): Promise<ShareOutcome> {
  try {
    await navigator.clipboard.writeText(url);
    return ShareOutcome.Copied;
  } catch (error) {
    console.warn("Could not copy the link", error);
    return ShareOutcome.CopyFailed;
  }
}

/**
 * Do what `chooseDelivery` chose. Call it directly from the click, with no
 * await before it: the share sheet and the clipboard need the tap's user
 * activation, which iOS Safari drops once the tap has waited on anything.
 *
 * Args:
 *     delivery: What to do.
 *     file: The image; required by the deliveries that send it.
 *     url: The link.
 *     text: The message the share sheet sends with the link. The clipboard
 *         gets the link alone, so it pastes cleanly anywhere.
 *
 * Returns:
 *     How it ended.
 *
 * Raises:
 *     Error: When the share sheet fails for a reason other than the member
 *         closing it, or an image delivery has no image.
 */
export async function deliverShare(delivery: ShareDelivery, file: File | null, url: string, text: string): Promise<ShareOutcome> {
  switch (delivery) {
    case ShareDelivery.ShareSheetWithImage:
      if (!file) throw new Error("There is no image to share.");
      return openSheet({ files: [file], text, url });
    case ShareDelivery.ShareSheetWithLink:
      return openSheet({ text, url });
    case ShareDelivery.SaveImageAndCopyLink:
      if (!file) throw new Error("There is no image to save.");
      download(file);
      return copy(url);
    case ShareDelivery.CopyLink:
      return copy(url);
  }
}
