import { describe, expect, it } from "vitest";
import { createTestTokens, TEST_PUBLISHABLE_KEY, TEST_SECRET_KEY } from "../test/tokens";
import { createClerkSessionVerifier } from "./session";

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

describe("Clerk session verification", () => {
  it("accepts a native token without azp and returns the claims", async () => {
    const session = await verify(request(tokens.issue({ sub: "user_1", ...identity })));
    expect(session?.clerkId).toBe("user_1");
    expect(session?.claims).toMatchObject(identity);
  });

  it("accepts a web token from an allowed origin", async () => {
    const session = await verify(request(tokens.issue({ sub: "user_1", azp: "https://coursebook.golf" })));
    expect(session?.clerkId).toBe("user_1");
  });

  it.each([
    ["a web token from another origin", () => tokens.issue({ sub: "user_1", azp: "https://evil.example" })],
    ["an expired token", () => tokens.issue({ sub: "user_1" }, { expiresIn: -120 })],
    ["a token not yet valid", () => tokens.issue({ sub: "user_1" }, { notBefore: 600 })],
    ["a token signed with another key", () => tokens.forge({ sub: "user_1" })],
    ["a pending session", () => tokens.issue({ sub: "user_1", sts: "pending" })],
    ["garbage", () => "not-a-token"],
  ])("rejects %s", async (_label, token) => {
    expect(await verify(request(token()))).toBeNull();
  });
});
