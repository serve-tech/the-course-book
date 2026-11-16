import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageSave, ImageStatus, ShareOutcome, type ShareSupport } from "./deliver";
import { RankingImagePreview } from "./RankingImagePreview";

/** The browser boundary: what the browser offers and what it does with the image. The rules stay real. */
const browser = vi.hoisted(() => ({
  support: vi.fn<(file: File | null, url: string) => ShareSupport>(),
  save: vi.fn<(save: ImageSave, file: File) => Promise<ShareOutcome>>(),
}));
vi.mock("./deliver", async (importOriginal) => {
  const original = await importOriginal<typeof import("./deliver")>();
  return { ...original, shareSupport: browser.support, saveImage: browser.save };
});

const PHONE: ShareSupport = { canShareImage: true, canShareLink: true, coarsePointer: true };
const COMPUTER: ShareSupport = { canShareImage: false, canShareLink: false, coarsePointer: false };

const notify = vi.fn<(message: string) => void>();
const onClose = vi.fn<() => void>();
const blob = new Blob(["png"], { type: "image/png" });
const revoke = vi.fn<(url: string) => void>();

const show = (status: ImageStatus, error: string | null = null) =>
  render(
    <RankingImagePreview
      title="Top 5"
      memberName="Josh"
      status={status}
      blob={status === ImageStatus.Ready ? blob : null}
      error={error}
      fileName="josh-top-5.png"
      notify={notify}
      onClose={onClose}
    />,
  );

const save = () => screen.getByRole("button", { name: "Save image" });

beforeEach(() => {
  browser.support.mockReset().mockReturnValue(COMPUTER);
  browser.save.mockReset().mockResolvedValue(ShareOutcome.Saved);
  notify.mockReset();
  onClose.mockReset();
  revoke.mockReset();
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:ranking-image");
  URL.revokeObjectURL = revoke;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RankingImagePreview", () => {
  it("shows the image in a dialog named for the view, and frees it when the dialog closes", () => {
    const { unmount } = show(ImageStatus.Ready);
    expect(screen.getByRole("dialog", { name: "Top 5" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Josh's Top 5 as an image" })).toHaveAttribute("src", "blob:ranking-image");
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:ranking-image");
  });

  it.each([
    [ImageStatus.Drawing, null, "Drawing the image…"],
    [ImageStatus.Failed, "This ranking is too long for this browser to draw.", "This ranking is too long for this browser to draw."],
    [ImageStatus.Failed, null, "The image couldn't be drawn."],
  ])("says where the image stands while there is none to show (%s)", (status, error, note) => {
    show(status, error);
    expect(screen.getByRole("status")).toHaveTextContent(note);
    expect(screen.queryByRole("img")).toBeNull();
    expect(save()).toBeDisabled();
  });

  it("downloads the image on a computer and says so", async () => {
    show(ImageStatus.Ready);
    fireEvent.click(save());
    expect(browser.save).toHaveBeenCalledWith(ImageSave.Download, expect.any(File));
    expect(browser.save.mock.calls[0]?.[1].name).toBe("josh-top-5.png");
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Image saved");
    });
  });

  it("hands the image alone to a phone's share sheet, which says the rest", async () => {
    browser.support.mockReturnValue(PHONE);
    browser.save.mockResolvedValue(ShareOutcome.Shared);
    show(ImageStatus.Ready);
    fireEvent.click(save());
    expect(browser.save).toHaveBeenCalledWith(ImageSave.ShareSheet, expect.any(File));
    await waitFor(() => {
      expect(browser.save).toHaveReturned();
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it("says when the image could not be saved", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    browser.save.mockRejectedValue(new Error("share failed"));
    show(ImageStatus.Ready);
    fireEvent.click(save());
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Couldn't save the image. Please try again.");
    });
  });

  it("closes on Escape and on its close button", () => {
    show(ImageStatus.Ready);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
