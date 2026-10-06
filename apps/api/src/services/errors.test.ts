import { describe, expect, it } from "vitest";
import { AppError, causeChain, ErrorCode } from "./errors";

describe("causeChain", () => {
  it("lists an error and its causes, outermost first, ending at a non-Error cause", () => {
    const reason = "Client connection prematurely closed.";
    const wrapped = new AppError(503, ErrorCode.SearchUnavailable, "Course search is unavailable.", { cause: reason });
    const outer = new Error("outer", { cause: wrapped });
    expect(causeChain(outer)).toEqual([outer, wrapped, reason]);
  });

  it.each([
    ["an error without a cause", new Error("alone")],
    ["a thrown string", "reason"],
    ["undefined", undefined],
  ])("is just the value for %s", (_label, value) => {
    expect(causeChain(value)).toEqual([value]);
  });

  it("stops after a bounded number of causes, which also ends a cyclic chain", () => {
    const error = new Error("loop");
    error.cause = error;
    expect(causeChain(error)).toHaveLength(9);
  });
});
