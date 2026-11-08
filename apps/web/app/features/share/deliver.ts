/**
 * Getting a link or an image out of the page: the share sheet on phones, a
 * download on computers, and the clipboard for links. `chooseDelivery` is the
 * pure rule; the rest is the browser boundary, called from event handlers.
 */

/** How an image reaches the member. */
export enum ImageDelivery {
  /** The phone's share sheet, which offers Save Image and every messaging app. */
  ShareSheet = "share-sheet",
  /** A file download. */
  Download = "download",
}

/**
 * Choose how to deliver an image. Desktop browsers can also open a share
 * dialog, but people there expect "save" to give them a file, so the sheet is
 * for touch devices that can share files.
 *
 * Args:
 *     canShareFile: Whether the browser says it can share this file.
 *     coarsePointer: Whether the main input is a finger.
 *
 * Returns:
 *     The delivery to use.
 */
export function chooseDelivery(canShareFile: boolean, coarsePointer: boolean): ImageDelivery {
  return canShareFile && coarsePointer ? ImageDelivery.ShareSheet : ImageDelivery.Download;
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

/**
 * Hand an image to the member.
 *
 * Args:
 *     blob: The PNG.
 *     fileName: The name to save it under.
 *
 * Raises:
 *     Error: When the share sheet fails. A member closing the sheet is not a
 *         failure, so it returns quietly.
 */
export async function deliverImage(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: "image/png" });
  const data = { files: [file] };
  const canShareFile = typeof navigator.canShare === "function" && navigator.canShare(data);
  if (chooseDelivery(canShareFile, window.matchMedia("(pointer: coarse)").matches) === ImageDelivery.Download) {
    download(file);
    return;
  }
  try {
    await navigator.share(data);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  }
}

/**
 * Copy a link.
 *
 * Raises:
 *     Error: When the clipboard is unavailable or refuses, so the caller can
 *         show the link instead.
 */
export async function copyLink(url: string): Promise<void> {
  await navigator.clipboard.writeText(url);
}
