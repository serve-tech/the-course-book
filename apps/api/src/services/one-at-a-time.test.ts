import { describe, expect, it } from "vitest";
import { oneAtATime } from "./one-at-a-time";

describe("oneAtATime", () => {
  it("starts each task after the one before it ends, in order", async () => {
    const queue = oneAtATime();
    const events: string[] = [];
    const task = (name: string, ms: number) => () =>
      new Promise<string>((resolve) => {
        events.push(name + " start");
        setTimeout(() => {
          events.push(name + " end");
          resolve(name);
        }, ms);
      });
    expect(await Promise.all([queue(task("a", 20)), queue(task("b", 1)), queue(task("c", 5))])).toEqual(["a", "b", "c"]);
    expect(events).toEqual(["a start", "a end", "b start", "b end", "c start", "c end"]);
  });

  it("gives a failure to its caller and carries on", async () => {
    const queue = oneAtATime();
    const failed = queue(() => Promise.reject(new Error("boom")));
    const next = queue(() => Promise.resolve("next"));
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("next");
  });
});
