import { describe, it, expect } from "vitest";
import { AuthMode, loginCredentials, validateAuth } from "./auth-form";
describe("email authentication regression", () => {
  it.each(["", "stale@example.com"])(
    "uses the visible sign-in email when signup email is %s",
    (email) => {
      const form = {
        mode: AuthMode.SignIn,
        identity: " golfer@example.com ",
        email,
        password: "secret123",
      };
      expect(validateAuth(form)).toBeNull();
      expect(loginCredentials(form)).toEqual({
        email: "golfer@example.com",
        password: "secret123",
      });
    },
  );
  it.each([
    ["ab", "Username must be 3–24 characters using letters, numbers, or _."],
    ["valid_user", null],
  ])("validates signup username %s", (identity, error) => {
    expect(
      validateAuth({
        mode: AuthMode.SignUp,
        identity,
        email: "g@example.com",
        password: "secret123",
      }),
    ).toBe(error);
  });
});
