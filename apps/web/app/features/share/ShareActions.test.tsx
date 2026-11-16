import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageStatus, ShareDelivery, ShareOutcome, type ShareSupport } from "./deliver";
import type { RankingImageContent } from "./ranking-image";
import { ShareActions } from "./ShareActions";

/** The browser boundary: what the browser offers and what it does with a share. The rules stay real. */
const browser = vi.hoisted(() => ({
  support: vi.fn<(file: File | null, url: string) => ShareSupport>(),
  deliver: vi.fn<(delivery: ShareDelivery, file: File | null, url: string) => Promise<ShareOutcome>>(),
}));
vi.mock("./deliver", async (importOriginal) => {
  const original = await importOriginal<typeof import("./deliver")>();
  return { ...original, shareSupport: browser.support, deliverShare: browser.deliver };
});

const PHONE: ShareSupport = { canShareImage: true, canShareLink: true, coarsePointer: true };
const COMPUTER: ShareSupport = { canShareImage: false, canShareLink: false, coarsePointer: false };

const image = (name: string) => ({ memberName: "Josh", title: "Ranking", rows: [{ rank: 1, name, place: "Somewhere" }] });
const empty = { memberName: "Josh", title: "Ranking", rows: [] };
const notify = vi.fn<(message: string) => void>();
const renderImage = vi.fn<(content: RankingImageContent) => Promise<Blob>>();

const actions = (content: Omit<RankingImageContent, "link">) => (
  <ShareActions path="/r/josh?top=5" image={content} fileName="josh-top-5.png" notify={notify} render={renderImage} />
);
const share = () => screen.getByRole("button", { name: "Share" });
const url = () => window.location.origin + "/r/josh?top=5";

beforeEach(() => {
  browser.support.mockReset().mockReturnValue(COMPUTER);
  browser.deliver.mockReset().mockResolvedValue(ShareOutcome.Copied);
  renderImage.mockReset().mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  notify.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShareActions", () => {
  it("offers one Share button, never two", () => {
    render(actions(image("Pine Valley")));
    expect(screen.getAllByRole("button")).toEqual([share()]);
  });

  it("sends the image and the link together from a phone, and the sheet says the rest", async () => {
    browser.support.mockReturnValue(PHONE);
    browser.deliver.mockResolvedValue(ShareOutcome.Shared);
    render(actions(image("Pine Valley")));
    await waitFor(() => {
      expect(share()).toHaveAttribute("data-image", ImageStatus.Ready);
    });
    fireEvent.click(share());
    expect(browser.deliver).toHaveBeenCalledWith(ShareDelivery.ShareSheetWithImage, expect.any(File), url());
    const file = browser.deliver.mock.lastCall?.[1];
    expect([file?.name, file?.type]).toEqual(["josh-top-5.png", "image/png"]);
    await Promise.resolve();
    expect(notify).not.toHaveBeenCalled();
  });

  it("saves the image and copies the link on a computer, and says both happened", async () => {
    render(actions(image("Pine Valley")));
    await waitFor(() => {
      expect(share()).toHaveAttribute("data-image", ImageStatus.Ready);
    });
    fireEvent.click(share());
    expect(browser.deliver).toHaveBeenCalledWith(ShareDelivery.SaveImageAndCopyLink, expect.any(File), url());
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Image saved and link copied");
    });
  });

  it("shows the link when the clipboard refuses it", async () => {
    browser.deliver.mockResolvedValue(ShareOutcome.CopyFailed);
    render(actions(image("Pine Valley")));
    await waitFor(() => {
      expect(share()).toHaveAttribute("data-image", ImageStatus.Ready);
    });
    fireEvent.click(share());
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Image saved. Couldn't copy the link. It's " + url());
    });
  });

  it("copies only the link after a reorder, until the new image is drawn, and says so", async () => {
    renderImage.mockResolvedValueOnce(new Blob(["first"], { type: "image/png" }));
    renderImage.mockReturnValueOnce(new Promise<Blob>(() => undefined));
    const { rerender } = render(actions(image("Pine Valley")));
    await waitFor(() => {
      expect(share()).toHaveAttribute("data-image", ImageStatus.Ready);
    });

    rerender(actions(image("Crystal Downs")));
    expect(share()).toHaveAttribute("data-image", ImageStatus.Drawing);
    fireEvent.click(share());
    expect(browser.deliver).toHaveBeenCalledWith(ShareDelivery.CopyLink, null, url());
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Link copied. The image wasn't ready yet.");
    });
  });

  it("shares the link from a phone when the image could not be drawn, with the reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    browser.support.mockReturnValue(PHONE);
    browser.deliver.mockResolvedValue(ShareOutcome.Shared);
    renderImage.mockRejectedValue(new Error("This ranking is too long for this browser to draw."));
    render(actions(image("Pine Valley")));
    await waitFor(() => {
      expect(share()).toHaveAttribute("data-image", ImageStatus.Failed);
    });
    fireEvent.click(share());
    expect(browser.deliver).toHaveBeenCalledWith(ShareDelivery.ShareSheetWithLink, null, url());
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Shared the link only. This ranking is too long for this browser to draw.");
    });
  });

  it("shares an empty view's link without drawing anything", async () => {
    render(actions(empty));
    expect(share()).toHaveAttribute("data-image", ImageStatus.None);
    fireEvent.click(share());
    expect(browser.deliver).toHaveBeenCalledWith(ShareDelivery.CopyLink, null, url());
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Link copied");
    });
    expect(renderImage).not.toHaveBeenCalled();
  });

  it("says so when the share sheet fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    browser.support.mockReturnValue(PHONE);
    browser.deliver.mockRejectedValue(new DOMException("Not allowed", "NotAllowedError"));
    render(actions(image("Pine Valley")));
    await waitFor(() => {
      expect(share()).toHaveAttribute("data-image", ImageStatus.Ready);
    });
    fireEvent.click(share());
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Couldn't share it. Please try again.");
    });
  });
});
