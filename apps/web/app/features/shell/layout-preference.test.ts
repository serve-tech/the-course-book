import { afterEach, describe, expect, it, vi } from "vitest";
import { SafeStorage } from "../../shared/lib/storage";
import {
  readLayoutPreference,
  saveLayoutPreference,
} from "./layout-preference";
import {
  isLayoutPreviewEnabled,
  LAYOUT_PREFERENCE_KEY,
  LayoutMode,
} from "./layout-preview";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("layout preference storage", () => {
  it("remembers either choice without storing any account data", () => {
    const values = new Map<string, string>();
    const storage = () =>
      new SafeStorage({
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
        removeItem: (key) => {
          values.delete(key);
        },
      });
    expect(readLayoutPreference(storage)).toBe(LayoutMode.Classic);
    expect(saveLayoutPreference(LayoutMode.CourseFirst, storage)).toBe(true);
    expect(readLayoutPreference(storage)).toBe(
      isLayoutPreviewEnabled() ? LayoutMode.CourseFirst : LayoutMode.Classic,
    );
    expect([...values]).toEqual([
      [LAYOUT_PREFERENCE_KEY, LayoutMode.CourseFirst],
    ]);
    expect(saveLayoutPreference(LayoutMode.Classic, storage)).toBe(true);
    expect(readLayoutPreference(storage)).toBe(LayoutMode.Classic);
  });

  it("defaults safely and reports a browser blocking access to storage itself", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const blocked = () => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
    expect(readLayoutPreference(blocked)).toBe(LayoutMode.Classic);
    expect(saveLayoutPreference(LayoutMode.CourseFirst, blocked)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("reports a full or blocked store instead of claiming the layout was saved", () => {
    const report = vi.fn();
    const storage = () =>
      new SafeStorage(
        {
          getItem: () => null,
          setItem: () => {
            throw new DOMException("Full", "QuotaExceededError");
          },
          removeItem: () => undefined,
        },
        report,
      );
    expect(saveLayoutPreference(LayoutMode.CourseFirst, storage)).toBe(false);
    expect(report).toHaveBeenCalledOnce();
    expect(readLayoutPreference(storage)).toBe(LayoutMode.Classic);
  });
});
