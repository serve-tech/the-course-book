/**
 * Signed-in smoke test against the deployed staging site (docs/cutover.md
 * step 1.4): a throwaway Clerk development-instance user signs in, logs a
 * catalog course and a course outside the catalog, reloads, opens Top 100,
 * Friends and a Friends deep link, then deletes the account from the Account
 * page.
 *
 * Run with `pnpm smoke:staging`. It needs the development instance's keys in
 * the root `.env` and refuses any other secret key, so it never signs into
 * production. `STAGING_WEB_URL` and `STAGING_API_URL` override the staging
 * addresses.
 *
 * Cleanup: when a run stops before the Account page deletes the user, the
 * script deletes the account through the API as that user (tombstoning its
 * database row), then deletes the Clerk user. Deleting only the Clerk user
 * would leave a member row that no one can sign in to or remove.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { chromium, expect, type Page } from "@playwright/test";

const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const WEB = process.env["STAGING_WEB_URL"] ?? "https://coursebook-golf-web.onrender.com";
const API = process.env["STAGING_API_URL"] ?? "https://coursebook-golf-api.onrender.com";
const secretKey = process.env["CLERK_SECRET_KEY"] ?? "";
if (!secretKey.startsWith("sk_test_")) {
  throw new Error("staging-smoke runs only with a Clerk development instance key (sk_test_)");
}

const started = Date.now();
const log = (message: string) => {
  console.log(`${((Date.now() - started) / 1000).toFixed(1)}s ${message}`);
};

/** Delete the signed-in member through the API; false when there is no session. */
async function deleteThroughApi(page: Page): Promise<boolean> {
  const token = await page
    .evaluate(async () => {
      const w = window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } | null } };
      return (await w.Clerk?.session?.getToken()) ?? null;
    })
    .catch(() => null);
  if (!token) return false;
  const response = await fetch(`${API}/v1/me`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  log(`cleanup: DELETE /v1/me -> ${String(response.status)}`);
  return response.ok;
}

await clerkSetup();
const clerkClient = createClerkClient({ secretKey });
const suffix = randomBytes(4).toString("hex");
const username = "smoke_" + suffix;
const email = `coursebook-smoke-${suffix}+clerk_test@example.com`;
const user = await clerkClient.users.createUser({
  emailAddress: [email],
  username,
  firstName: "Smoke",
  skipPasswordRequirement: true,
});
log(`created throwaway user ${username}`);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (error) => {
  log(`page error: ${error.message}`);
});
page.on("response", (response) => {
  if (response.url().startsWith(API) && response.status() >= 400) {
    log(`API ${String(response.status())} ${response.request().method()} ${new URL(response.url()).pathname}`);
  }
});
await page.addInitScript(() => {
  localStorage.setItem("theCourseBookLocationPromptVersion", "v2");
  localStorage.setItem("theCourseBookSelectedState", "MI");
});

let deleted = false;
try {
  log("sign in (the API may take a minute to wake)");
  await page.goto(WEB + "/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto(WEB + "/");
  await expect(page.locator("#authLabel")).toHaveText(username, { timeout: 120_000 });

  // Pebble Beach is in the seeded catalog; Pinehurst's first hit is not.
  for (const query of ["Pebble Beach", "Pinehurst"]) {
    log(`log a round: ${query}`);
    await page.locator("#log").click();
    await page.locator("#modalsearch").fill(query);
    await page.locator(".result").first().click({ timeout: 30_000 });
    await page.locator("#confirmLog").click();
    await expect(page.locator("#modal")).toHaveCount(0, { timeout: 30_000 });
  }
  const logged = await page.locator("#mylist .course").allInnerTexts();
  expect(logged).toHaveLength(2);

  log(`reload keeps the list: ${logged.join(", ")}`);
  await page.reload();
  await expect(page.locator("#mylist .course")).toHaveText(logged, { timeout: 30_000 });

  log("Top 100");
  await page.getByRole("link", { name: "Top 100", exact: true }).click();
  await expect(page.locator("#toplist .row")).toHaveCount(100, { timeout: 30_000 });

  log("Friends and a deep link");
  await page.getByRole("link", { name: "Friends", exact: true }).click();
  await expect(page.locator("#friendSelect option").first()).toBeAttached({ timeout: 30_000 });
  await page.goto(`${WEB}/friends/${username}`);
  await expect(page.locator("#friendsList .course")).toHaveCount(2, { timeout: 30_000 });

  log("delete the account from the Account page");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.locator("#deleteAccount").click();
  await page.locator("#confirmDeleteAccount").click();
  await expect(page.locator("#authLabel")).toHaveText("Not signed in", { timeout: 30_000 });
  await expect
    .poll(async () => (await clerkClient.users.getUserList({ userId: [user.id] })).data.length, { timeout: 30_000 })
    .toBe(0);
  deleted = true;
  log("PASS");
} catch (error) {
  log(`FAIL: ${error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error)}`);
  process.exitCode = 1;
} finally {
  if (!deleted) {
    if (!(await deleteThroughApi(page))) log(`cleanup: no session; if ${username} reached the API, its member row remains`);
    await clerkClient.users.deleteUser(user.id).catch(() => undefined);
  }
  await browser.close();
}
