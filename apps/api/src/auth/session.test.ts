import { describe, expect, it } from "vitest";
import { createTestTokens, TEST_PUBLISHABLE_KEY, TEST_SECRET_KEY } from "../test/tokens";
import { createClerkSessionVerifier, SessionRejection, type SessionVerification } from "./session";

const tokens = createTestTokens();
const verify = createClerkSessionVerifier({
  secretKey: TEST_SECRET_KEY,
  publishableKey: TEST_PUBLISHABLE_KEY,
  jwtKey: tokens.jwtKey,
  webOrigins: ["https://coursebook.golf"],
});

const request = (token: string) =>
  new Request("https://api.coursebook.golf/v1/me", { headers: { authorization: "Bearer " + token } });

const identity = { username: "golfer_1", name: "Golfer One", email: "golfer@example.com" };

/** The session from a verification that must have succeeded. */
const sessionOf = (result: SessionVerification) => {
  if (!result.ok) throw new Error("expected a verified session, got " + result.reason);
  return result.session;
};

describe("Clerk session verification", () => {
  it("accepts a native token without azp and returns the claims", async () => {
    const session = sessionOf(await verify(request(tokens.issue({ sub: "user_1", ...identity }))));
    expect(session.clerkId).toBe("user_1");
    expect(session.claims).toMatchObject(identity);
  });

  it("accepts a web token from an allowed origin", async () => {
    const session = sessionOf(await verify(request(tokens.issue({ sub: "user_1", azp: "https://coursebook.golf" }))));
    expect(session.clerkId).toBe("user_1");
  });

  it("names the azp of a web token from another origin", async () => {
    expect(await verify(request(tokens.issue({ sub: "user_1", azp: "https://evil.example" })))).toEqual({
      ok: false,
      reason: SessionRejection.UnauthorizedParty,
      azp: "https://evil.example",
    });
  });

  // Clerk's reasons for header tokens, e.g. "session-token-expired-refresh-non-eligible-no-refresh-cookie".
  it.each([
    ["an expired token", () => tokens.issue({ sub: "user_1" }, { expiresIn: -120 }), /^session-token-expired/],
    ["a token not yet valid", () => tokens.issue({ sub: "user_1" }, { notBefore: 600 }), /^session-token-nbf$/],
    ["a token signed with another key", () => tokens.forge({ sub: "user_1" }), /^token-invalid-signature$/],
    ["a pending session", () => tokens.issue({ sub: "user_1", sts: "pending" }), new RegExp("^" + SessionRejection.NoActiveSession + "$")],
    ["garbage", () => "not-a-token", /^token-invalid$/],
  ])("rejects %s with the reason and nothing else", async (_label, token, reason) => {
    const result = await verify(request(token()));
    expect(Object.keys(result).sort()).toEqual(["ok", "reason"]);
    expect(result.ok ? "verified" : result.reason).toMatch(reason);
  });
});
