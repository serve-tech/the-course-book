import { describe, expect, it } from "vitest";
import { cx } from "./cx";

describe("cx", () => {
  it("joins present class names and skips missing ones", () => {
    expect(cx("a", undefined, false, null, "", "b")).toBe("a b");
    expect(cx(undefined)).toBe("");
  });
});
