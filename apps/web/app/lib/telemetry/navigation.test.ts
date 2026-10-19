import { expect, it, vi } from "vitest";
import { createNavigationTimer } from "./navigation";
import { NavigationKind } from "./metrics";

it("measures initial load and subsequent transitions separately, only once", () => {
  let now = 500;
  const emit = vi.fn();
  const timer = createNavigationTimer(() => now, emit);
  timer.finish(0, "/");
  timer.finish(0, "/");
  expect(emit).toHaveBeenCalledTimes(1);
  expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ duration_ms: 500, navigation_kind: "initial" }));
  timer.begin(NavigationKind.Navigation);
  now = 650;
  timer.finish(1, "/courses");
  expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ duration_ms: 150, route: "/courses", navigation_kind: "navigation" }));
});

it("drops superseded and background transitions, and measures sign-in revalidation", () => {
  let now = 100;
  const emit = vi.fn();
  const timer = createNavigationTimer(() => now, emit);
  timer.begin(NavigationKind.Navigation);
  timer.finish(0, "/");
  expect(emit).not.toHaveBeenCalled();
  timer.discard();
  timer.finish(1, "/courses");
  expect(emit).not.toHaveBeenCalled();
  timer.beginRevalidation();
  now = 300;
  timer.beginRevalidation();
  timer.finish(2, "/");
  expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ duration_ms: 200, navigation_kind: "revalidation" }));
});
