import { beforeEach, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ token: vi.fn<() => Promise<string | null>>(), init: vi.fn(), capture: vi.fn() }));
vi.mock("@clerk/react-router", () => ({ getToken: boundary.token }));
vi.mock("posthog-js/dist/module.slim.js", () => ({ default: { init: boundary.init, capture: boundary.capture } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
});

it.each(["private-token", null])("preserves Clerk's token result and records readiness without credentials", async (token) => {
  boundary.token.mockResolvedValue(token);
  const { getToken } = await import("./auth-token");
  expect(await getToken()).toBe(token);
  await vi.waitFor(() => { expect(boundary.capture).toHaveBeenCalled(); });
  expect(boundary.capture).toHaveBeenCalledWith("coursebook_performance", expect.objectContaining({ metric: "auth_token", source: "loader", outcome: "success" }));
  expect(JSON.stringify(boundary.capture.mock.calls)).not.toContain("private-token");
});

it("preserves authentication failures and records only the failure category", async () => {
  const failure = new Error("private-token expired");
  boundary.token.mockRejectedValue(failure);
  const { getToken } = await import("./auth-token");
  await expect(getToken()).rejects.toBe(failure);
  await vi.waitFor(() => { expect(boundary.capture).toHaveBeenCalled(); });
  expect(boundary.capture).toHaveBeenCalledWith("coursebook_performance", expect.objectContaining({ metric: "auth_token", source: "loader", outcome: "error" }));
  expect(JSON.stringify(boundary.capture.mock.calls)).not.toContain("private-token");
});
