import { describe, expect, it } from "vitest";
import { chooseDelivery, ImageStatus, ShareDelivery, shareNotice, ShareOutcome, type ShareSupport } from "./deliver";

const support = (canShareImage: boolean, canShareLink: boolean, coarsePointer: boolean): ShareSupport => ({ canShareImage, canShareLink, coarsePointer });

describe("chooseDelivery", () => {
  it.each([
    ["a phone that shares files sends the image and the link", ImageStatus.Ready, support(true, true, true), ShareDelivery.ShareSheetWithImage],
    ["a computer that shares files still saves and copies", ImageStatus.Ready, support(true, true, false), ShareDelivery.SaveImageAndCopyLink],
    ["a phone that cannot share files saves and copies", ImageStatus.Ready, support(false, true, true), ShareDelivery.SaveImageAndCopyLink],
    ["a browser with no share sheet saves and copies", ImageStatus.Ready, support(false, false, false), ShareDelivery.SaveImageAndCopyLink],
    ["a phone shares the link while the image draws", ImageStatus.Drawing, support(true, true, true), ShareDelivery.ShareSheetWithLink],
    ["a phone shares the link when drawing failed", ImageStatus.Failed, support(true, true, true), ShareDelivery.ShareSheetWithLink],
    ["a phone shares the link of an empty view", ImageStatus.None, support(true, true, true), ShareDelivery.ShareSheetWithLink],
    ["a phone with no share sheet copies the link", ImageStatus.Drawing, support(false, false, true), ShareDelivery.CopyLink],
    ["a computer copies the link while the image draws", ImageStatus.Drawing, support(true, true, false), ShareDelivery.CopyLink],
    ["a computer copies the link of an empty view", ImageStatus.None, support(false, false, false), ShareDelivery.CopyLink],
  ])("%s", (_case, image, browser, expected) => {
    expect(chooseDelivery(image, browser)).toBe(expected);
  });
});

describe("shareNotice", () => {
  const url = "https://coursebook.golf/r/josh?top=5";
  const tooLong = "This ranking is too long for this browser to draw.";

  it.each([
    ["the sheet with both says nothing", ShareDelivery.ShareSheetWithImage, ShareOutcome.Shared, ImageStatus.Ready, null],
    ["a closed sheet says nothing", ShareDelivery.ShareSheetWithLink, ShareOutcome.Cancelled, ImageStatus.Drawing, null],
    ["the link alone, while drawing", ShareDelivery.ShareSheetWithLink, ShareOutcome.Shared, ImageStatus.Drawing, "Shared the link only. The image wasn't ready yet."],
    ["the link alone, after a failed drawing", ShareDelivery.ShareSheetWithLink, ShareOutcome.Shared, ImageStatus.Failed, "Shared the link only. " + tooLong],
    ["the link of an empty view needs no explaining", ShareDelivery.ShareSheetWithLink, ShareOutcome.Shared, ImageStatus.None, null],
    ["saved and copied", ShareDelivery.SaveImageAndCopyLink, ShareOutcome.Copied, ImageStatus.Ready, "Image saved and link copied"],
    ["saved, but the clipboard refused", ShareDelivery.SaveImageAndCopyLink, ShareOutcome.CopyFailed, ImageStatus.Ready, "Image saved. Couldn't copy the link. It's " + url],
    ["copied, empty view", ShareDelivery.CopyLink, ShareOutcome.Copied, ImageStatus.None, "Link copied"],
    ["copied while drawing", ShareDelivery.CopyLink, ShareOutcome.Copied, ImageStatus.Drawing, "Link copied. The image wasn't ready yet."],
    ["copied after a failed drawing", ShareDelivery.CopyLink, ShareOutcome.Copied, ImageStatus.Failed, "Link copied. " + tooLong],
    ["not copied, empty view", ShareDelivery.CopyLink, ShareOutcome.CopyFailed, ImageStatus.None, "Couldn't copy the link. It's " + url],
    ["not copied while drawing", ShareDelivery.CopyLink, ShareOutcome.CopyFailed, ImageStatus.Drawing, "The image wasn't ready yet. Couldn't copy the link. It's " + url],
  ])("%s", (_case, delivery, outcome, image, expected) => {
    expect(shareNotice(delivery, outcome, image, image === ImageStatus.Failed ? tooLong : null, url)).toBe(expected);
  });

  it("explains a failed drawing even without its reason", () => {
    expect(shareNotice(ShareDelivery.CopyLink, ShareOutcome.Copied, ImageStatus.Failed, null, url)).toBe("Link copied. The image couldn't be drawn.");
  });
});
