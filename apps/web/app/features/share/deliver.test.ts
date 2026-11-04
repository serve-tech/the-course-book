import { describe, expect, it } from "vitest";
import { chooseDelivery, ImageDelivery } from "./deliver";

describe("chooseDelivery", () => {
  it.each([
    [true, true, ImageDelivery.ShareSheet],
    [true, false, ImageDelivery.Download],
    [false, true, ImageDelivery.Download],
    [false, false, ImageDelivery.Download],
  ])("canShareFile %s, coarsePointer %s uses %s", (canShareFile, coarsePointer, expected) => {
    expect(chooseDelivery(canShareFile, coarsePointer)).toBe(expected);
  });
});
