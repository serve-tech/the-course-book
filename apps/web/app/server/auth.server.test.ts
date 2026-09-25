import { RouterContextProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { requireUser, userContext } from "./auth.server";

describe("requireUser", () => {
  it("throws a 401 data response for anonymous requests", () => {
    const context = new RouterContextProvider();
    expect(() => requireUser(context)).toThrow(expect.objectContaining({ init: { status: 401 } }));
  });

  it("returns the context user when signed in", () => {
    const context = new RouterContextProvider();
    const user = { id: "user_1", username: "golfer_1", displayName: "Golfer One" };
    context.set(userContext, user);
    expect(requireUser(context)).toBe(user);
  });
});
