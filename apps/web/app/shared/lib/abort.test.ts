import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { anySignal } from "./abort";

const nativeAny: unknown = Reflect.get(AbortSignal, "any");

afterEach(() => {
  Reflect.set(AbortSignal, "any", nativeAny);
});

describe.each([
  { browser: "with AbortSignal.any", hasAny: true },
  { browser: "without AbortSignal.any, as Safari before 17.4", hasAny: false },
])("anySignal $browser", ({ hasAny }) => {
  beforeEach(() => {
    if (!hasAny) Reflect.deleteProperty(AbortSignal, "any");
  });

  it("runs on the browser it claims to", () => {
    expect("any" in AbortSignal).toBe(hasAny);
  });

  it("stays open while no signal has aborted", () => {
    const signal = anySignal([new AbortController().signal, new AbortController().signal]);
    expect(signal.aborted).toBe(false);
  });

  it.each([{ position: 0 }, { position: 1 }])("follows the signal at position $position, with its reason", ({ position }) => {
    const controllers = [new AbortController(), new AbortController()];
    const signal = anySignal(controllers.map((controller) => controller.signal));
    controllers[position]?.abort("stop");
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("stop");
  });

  it("keeps its reason when another signal aborts later", () => {
    const earlier = new AbortController();
    const later = new AbortController();
    const signal = anySignal([later.signal, earlier.signal]);
    earlier.abort("earlier");
    // Read before the next abort: Node 24's native method works out an unread,
    // unobserved signal lazily, from the first aborted signal in the list.
    expect(signal.reason).toBe("earlier");
    later.abort("later");
    expect(signal.reason).toBe("earlier");
  });

  it("is already aborted when a signal it was given is, with the first such reason", () => {
    const open = new AbortController();
    const signal = anySignal([open.signal, AbortSignal.abort("first"), AbortSignal.abort("second")]);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("first");
  });

  it("aborts with a timeout's own error", async () => {
    const signal = anySignal([new AbortController().signal, AbortSignal.timeout(1)]);
    await new Promise((resolve) => {
      signal.addEventListener("abort", resolve);
    });
    expect(signal.reason).toMatchObject({ name: "TimeoutError" });
  });
});
