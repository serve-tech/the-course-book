/**
 * Clerk availability for browser tests. Every scenario needs a real Clerk
 * development instance: Clerk's middleware sends browsers through its
 * handshake on a dev instance, so placeholder keys break even anonymous
 * pages. Authenticated scenarios additionally need two test users, found by
 * email. There is deliberately no stubbed-auth mode.
 */
import type { Page } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import type { TestMember } from "./db";

const placeholder = (value: string | undefined) => !value || value.includes("replace_me");

export const clerkAvailable =
  !placeholder(process.env["CLERK_SECRET_KEY"]) &&
  !placeholder(process.env["CLERK_PUBLISHABLE_KEY"]);

export const authAvailable =
  clerkAvailable && !!process.env["E2E_OWNER_EMAIL"] && !!process.env["E2E_FRIEND_EMAIL"];

export const ownerEmail = process.env["E2E_OWNER_EMAIL"] ?? "";
export const friendEmail = process.env["E2E_FRIEND_EMAIL"] ?? "";

/**
 * Sign a member in, then land on My List.
 *
 * Uses Clerk's ticket sign-in: the helper mints a sign-in token with
 * `CLERK_SECRET_KEY` and the browser redeems it. Password sign-in cannot work
 * here because Clerk's Client Trust answers a password from an unrecognized
 * device with `needs_second_factor`, and every Playwright browser is a new
 * device. The helper's password path also ignores that status and reports
 * success with no session; the ticket path throws unless the sign-in is
 * complete.
 */
export async function signInAs(page: Page, member: TestMember): Promise<void> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: member.email });
  await page.goto("/");
}
