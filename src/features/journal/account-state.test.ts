import { describe, it, expect, vi } from "vitest";
import {
  AccountCache,
  emptyAccount,
  reconcileAccount,
  moveCourse,
  canApplyHydration,
} from "./account-state";
import { courseSchema } from "../catalog/course";
import { SafeStorage } from "../../shared/lib/storage";
const a = courseSchema.parse({
  id: "a",
  name: "Alpha",
  location: "A, MI, USA",
});
const b = courseSchema.parse({ id: "b", name: "Beta", location: "B, MI, USA" });
const catalog = new Map([
  [a.id, a],
  [b.id, b],
]);
describe("account cache compatibility", () => {
  it("claims legacy state once and never displays it for another account or anonymous user", () => {
    const data = new Map<string, string>([
      ["theCourseBook", JSON.stringify({ played: { a: 3 }, myList: ["a"] })],
    ]);
    const storage = new SafeStorage({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    });
    const cache = new AccountCache(storage);
    expect(cache.load(null)).toEqual(emptyAccount());
    expect(cache.load("A").myList).toEqual(["a"]);
    expect(cache.load("B")).toEqual(emptyAccount());
    expect(cache.load("A").played).toEqual({ a: 3 });
    expect(data.has("theCourseBook")).toBe(false);
  });
  it("logs corrupt cache data and recovers", () => {
    const report = vi.fn();
    const storage = new SafeStorage(
      { getItem: () => "{", setItem: vi.fn(), removeItem: vi.fn() },
      report,
    );
    expect(new AccountCache(storage).load("A")).toEqual(emptyAccount());
    expect(report).toHaveBeenCalled();
  });
});
describe("rounds, membership and personal order", () => {
  it("preserves local order, counts rounds only and retains zero-round memberships", () => {
    const state = { ...emptyAccount(), myList: ["b", "a"], played: { a: 99 } };
    expect(
      reconcileAccount(
        state,
        [
          { id: "a", rank: 1 },
          { id: "b", rank: 2 },
        ],
        ["a", "a"],
        catalog,
      ),
    ).toMatchObject({ myList: ["b", "a"], played: { a: 2 } });
  });
  it("characterizes fresh-device round-first order", () => {
    expect(
      reconcileAccount(
        emptyAccount(),
        [
          { id: "a", rank: 1 },
          { id: "b", rank: 2 },
        ],
        ["b", "a"],
        catalog,
      ).myList,
    ).toEqual(["b", "a"]);
  });
  it("does not drop hidden courses during a move", () => {
    const state = { ...emptyAccount(), myList: ["a", "hidden", "b"] };
    expect(moveCourse(state, "b", 1).myList).toEqual(["b", "a", "hidden"]);
    expect(state.myList).toEqual(["a", "hidden", "b"]);
  });
  it("rejects stale hydration after reorder or account change", () => {
    const state = { ...emptyAccount(), myList: ["a", "b"] };
    expect(canApplyHydration("A", 0, ["a", "b"], "A", state)).toBe(true);
    expect(canApplyHydration("A", 0, ["a", "b"], "B", state)).toBe(false);
    expect(
      canApplyHydration("A", 0, ["a", "b"], "A", moveCourse(state, "b", 1)),
    ).toBe(false);
  });
});
