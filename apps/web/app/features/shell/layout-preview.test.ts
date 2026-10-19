import { describe, expect, it } from "vitest";
import {
  isLayoutPreviewEnabled,
  LayoutMode,
  resolveLayout,
} from "./layout-preview";

describe("layout rollout", () => {
  it.each([null, "", "true", "old", "future-layout", LayoutMode.Classic])(
    "defaults %s to Classic",
    (value) => {
      expect(resolveLayout(value, true)).toBe(LayoutMode.Classic);
    },
  );
  it("requires an explicit opt-in", () => {
    expect(resolveLayout(LayoutMode.CourseFirst, true)).toBe(
      LayoutMode.CourseFirst,
    );
  });
  it("uses the configured availability by default", () => {
    expect(resolveLayout(LayoutMode.CourseFirst)).toBe(
      isLayoutPreviewEnabled() ? LayoutMode.CourseFirst : LayoutMode.Classic,
    );
  });
  it("can disable the preview even for opted-in browsers", () => {
    expect(resolveLayout(LayoutMode.CourseFirst, false)).toBe(
      LayoutMode.Classic,
    );
  });
});
