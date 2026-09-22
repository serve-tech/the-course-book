import { describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { clerkMiddleware, getAuth } from "@clerk/react-router/server";

/**
 * Compatibility check between React Router 8 middleware and the Clerk SDK.
 * A request without any session material must resolve to a signed-out auth
 * object without contacting Clerk. If this test breaks after a dependency
 * update, the middleware wiring in app/middleware.ts needs attention first.
 */
const keys = {
  publishableKey:
    "pk_test_" + Buffer.from("example.clerk.accounts.dev$").toString("base64"),
  secretKey: "sk_test_" + "0".repeat(48),
};

describe("Clerk middleware under React Router 8", () => {
  it("resolves an anonymous request to a signed-out auth object", async () => {
    const context = new RouterContextProvider();
    const request = new Request("http://localhost/healthz");
    const args = {
      request,
      url: new URL(request.url),
      pattern: "/healthz",
      params: {},
      context,
    };
    let userId: string | null | undefined = "unset";

    const response = await clerkMiddleware(keys)(args, async () => {
      userId = (await getAuth(args)).userId;
      return Response.json({ ok: true });
    });

    expect(userId).toBeNull();
    expect(response?.status).toBe(200);
  });
});
