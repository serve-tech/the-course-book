import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api/client";
import { apiFailureMessage } from "./errors";

describe("apiFailureMessage", () => {
  it.each<[string, unknown, string | null]>([
    ["the API's message", new ApiError(404, "member_not_found", "No member with that username.", "req_1"), "No member with that username."],
    ["a timeout", new DOMException("signal timed out", "TimeoutError"), "The server took too long to answer. Please try again."],
    ["a network failure", new TypeError("Failed to fetch"), "Could not reach the server. Check your connection and try again."],
    ["a bug", new RangeError("oops"), null],
    ["a non-error", "oops", null],
  ])("reports %s", (_label, error, message) => {
    expect(apiFailureMessage(error)).toBe(message);
  });
});
