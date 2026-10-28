import { describe, expect, it } from "vitest";
import { AppError, ErrorCode } from "../services/errors";
import { isCancellation } from "./errors";

const CLOSED = "Client connection prematurely closed.";
const streamError = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
const wrap = (cause: unknown) => new AppError(503, ErrorCode.SearchUnavailable, "Course search is unavailable.", { cause });

describe("isCancellation", () => {
  it.each([
    ["the abort reason itself", CLOSED, CLOSED, true],
    ["the abort reason wrapped as a cause", wrap(CLOSED), CLOSED, true],
    ["an AbortError reason wrapped as a cause", wrap(new DOMException("aborted", "AbortError")), "other", false],
    ["the failed stream behind a body read, whose text is the reason", streamError, String(streamError), true],
    ["the failed stream wrapped as a cause", wrap(streamError), String(streamError), true],
    ["an unrelated failure of a cancelled request", wrap(new Error("Clerk unavailable")), CLOSED, false],
    ["an error that only mentions the reason", new Error(CLOSED), CLOSED, false],
  ])("judges %s", (_label, error, reason, expected) => {
    expect(isCancellation(error, reason)).toBe(expected);
  });

  it("matches an Error reason by identity", () => {
    const reason = new DOMException("The operation was aborted.", "AbortError");
    expect(isCancellation(wrap(reason), reason)).toBe(true);
  });
});
