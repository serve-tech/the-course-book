/**
 * Clerk availability for browser tests. Every scenario needs a real Clerk
 * development instance: Clerk's middleware sends browsers through its
 * handshake on a dev instance, so placeholder keys break even anonymous
 * pages. Authenticated scenarios additionally need two password test users.
 * There is deliberately no stubbed-auth mode.
 */
import type { Page } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import type { TestMember } from "./db";

const placeholder = (value: string | undefined) => !value || value.includes("replace_me");

export const clerkAvailable =
  !placeholder(process.env["CLERK_SECRET_KEY"]) &&
  !placeholder(process.env["CLERK_PUBLISHABLE_KEY"]);

export const authAvailable =
  clerkAvailable &&
  !!process.env["E2E_OWNER_EMAIL"] &&
  !!process.env["E2E_FRIEND_EMAIL"] &&
  !!process.env["E2E_PASSWORD"];

export const ownerEmail = process.env["E2E_OWNER_EMAIL"] ?? "";
export const friendEmail = process.env["E2E_FRIEND_EMAIL"] ?? "";

/** Sign the owner in through Clerk's testing helper, then land on My List. */
export async function signInAs(page: Page, member: TestMember): Promise<void> {
  await page.goto("/");
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: member.email,
      password: process.env["E2E_PASSWORD"] ?? "",
    },
  });
  await page.goto("/");
}
