import { randomBytes } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { users } from "@coursebook/api/db/schema";
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { authAvailable, clerkAvailable, signInAs } from "./auth";
import {
  addHiddenCourse,
  connect,
  courseByName,
  fixtureCourses,
  listOrder,
  resetScenario,
  type TestMember,
} from "./db";

/**
 * User journeys against the built server, the migrated test database, the
 * OpenGolfAPI stub and (when secrets exist) a Clerk development instance.
 */

const members = (): { owner: TestMember; friend: TestMember } => {
  const parsed = JSON.parse(process.env["E2E_MEMBERS"] ?? "[]") as TestMember[];
  const [owner, friend] = parsed;
  if (!owner || !friend) throw new Error("E2E_MEMBERS was not prepared by global setup");
  return { owner, friend };
};

const { db, pool } = connect();

test.afterAll(async () => {
  await pool.end();
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("theCourseBookLocationPromptVersion", "v2");
    localStorage.setItem("theCourseBookSelectedState", "MI");
  });
});

const row = (page: Page, name: string) =>
  page.locator("#mylist .rankrow").filter({ has: page.getByText(name, { exact: true }) });

test("anonymous navigation, dialogs and mobile layout remain usable", async ({ page }) => {
  test.skip(!clerkAvailable, "Clerk development instance keys are not configured");
  await page.goto("/");
  await expect(page.locator("#mine")).toBeVisible();
  await expect(page.locator("#myCourseCount")).toHaveText("0");
  await page.getByRole("link", { name: "Top 100", exact: true }).click();
  await expect(page.locator("#toplist .row")).toHaveCount(100);
  await expect(page.locator("#topStateRankSelect")).toHaveValue("MI");
  await page.getByRole("link", { name: "My List", exact: true }).click();
  await page.locator("#log").click();
  await expect(page.locator("#modalsearch")).toBeDisabled();
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("#authmodal")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test.describe("signed in", () => {
  test.skip(!authAvailable, "Clerk development instance keys or test users are not configured");

  test.beforeEach(async () => {
    const { owner, friend } = members();
    await resetScenario(db, owner, friend);
  });

  test("sign-in shows the stored order and logging preserves it", async ({ page }) => {
    const { owner } = members();
    await signInAs(page, owner);
    await expect(page.locator("#authLabel")).toHaveText(owner.username);
    await expect(page.locator("#myCourseCount")).toHaveText("2");
    await expect(page.locator("#mylist .course")).toHaveText(["Test Beta Links", "Test Alpha Links"]);

    await page.locator("#log").click();
    await page.locator("#modalsearch").fill("Test Alpha");
    await page.locator(".result").filter({ hasText: "Test Alpha Links" }).click();
    await page.locator("#timesPlayed").fill("2");
    await page.locator("#confirmLog").click();
    await expect(page.locator("#modal")).toHaveCount(0);
    await expect(row(page, "Test Alpha Links").locator(".count")).toContainText("3×");
    await expect(page.locator("#mylist .course")).toHaveText(["Test Beta Links", "Test Alpha Links"]);
    expect(await listOrder(db, owner.id)).toEqual([fixtureCourses.beta.id, fixtureCourses.alpha.id]);

    await page.reload();
    await expect(page.locator("#mylist .course")).toHaveText(["Test Beta Links", "Test Alpha Links"]);
    await page.locator("#authOpen").click();
    await expect(page.locator("#myCourseCount")).toHaveText("0");
  });

  test("course details moves, count editing and confirmed final-round removal work", async ({ page }) => {
    const { owner } = members();
    await signInAs(page, owner);
    await expect(page.locator("#myCourseCount")).toHaveText("2");
    await page.locator("#mylist .course").filter({ hasText: "Test Alpha Links" }).click();
    await page.locator("#moveTop").click();
    await expect(page.locator("#mylist .course").first()).toHaveText("Test Alpha Links");
    await expect.poll(() => listOrder(db, owner.id)).toEqual([fixtureCourses.alpha.id, fixtureCourses.beta.id]);

    await page.locator("#mylist .course").first().click();
    await page.locator("#editTimesPlayed").click();
    await expect(page.locator(".counteditinput")).toBeVisible();
    await page.locator(".cancelcount").click();

    await page.locator("#mylist .roundslink").first().click();
    await expect(page.locator(".roundhistory-row")).toHaveCount(1);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator(".delete-round").click();
    await expect(page.locator("#roundmodal")).toHaveCount(0);
    await expect(page.locator("#myCourseCount")).toHaveText("1");
  });

  test("manual US course stores its state and logs one round", async ({ page }) => {
    const { owner } = members();
    await signInAs(page, owner);
    await page.locator("#log").click();
    await page.locator("#add").click();
    await page.locator("#newname").fill("New Test Club");
    await page.locator("#newstate").selectOption("MI");
    await page.locator("#save").click();
    await expect(page.locator("#addmodal")).toHaveCount(0);
    await expect(page.locator("#myCourseCount")).toHaveText("3");
    expect(await courseByName(db, "New Test Club")).toMatchObject({ state: "MI", country: "USA", isCustom: true, createdBy: owner.id });
  });

  test("Friends shows a member's list with on-my-list evidence", async ({ page }) => {
    const { owner, friend } = members();
    await signInAs(page, owner);
    await page.getByRole("link", { name: "Friends", exact: true }).click();
    await expect(page.locator("#friendSelect option")).toHaveCount(2);
    await page.locator("#friendSelect").selectOption(friend.username);
    await expect(page.locator("#friendsList .friend-row")).toHaveCount(2);
    await page.locator("#friendsFilter").selectOption("mine");
    await expect(page.locator("#friendsList .course")).toHaveText(["Test Alpha Links"]);
    await expect(page.locator(".friend-list-action")).toBeDisabled();
    await page.locator("#friendsFilter").selectOption("notmine");
    await page.locator(".friend-list-action").click();
    await expect.poll(() => listOrder(db, owner.id)).toContain(fixtureCourses.gamma.id);
  });

  test("touch-handle drag reorders the full list and geographic filters remain read-only", async ({ page }) => {
    const { owner } = members();
    await addHiddenCourse(db, owner);
    await signInAs(page, owner);
    await expect(page.locator("#myCourseCount")).toHaveText("3");
    await expect(page.locator("#mylist .course")).toHaveText(["Test Beta Links", "Test Alpha Links", "Hidden Course"]);
    await page.locator("#mysearch").fill("Test");
    await page.locator("#mysearch").blur();
    const source = row(page, "Test Alpha Links").locator(".handle");
    const target = row(page, "Test Beta Links");
    await source.scrollIntoViewIfNeeded();
    const from = await source.boundingBox(),
      to = await target.boundingBox();
    if (!from || !to) throw new Error("Missing drag geometry");
    const pointer = { pointerId: 1, pointerType: "touch", button: 0, buttons: 1 };
    await source.dispatchEvent("pointerdown", { ...pointer, clientX: from.x + 5, clientY: from.y + 5 });
    await page.locator("body").dispatchEvent("pointermove", { ...pointer, clientX: to.x + 20, clientY: to.y + 10 });
    await expect(page.locator(".drag-ghost")).toBeVisible();
    await page.locator("body").dispatchEvent("pointerup", { ...pointer, buttons: 0, clientX: to.x + 20, clientY: to.y + 10 });
    await page.locator("#mysearch").fill("");
    await page.locator("#mysearch").blur();
    const reordered = ["Test Alpha Links", "Test Beta Links", "Hidden Course"];
    await expect(page.locator("#mylist .course")).toHaveText(reordered);
    await expect.poll(() => listOrder(db, owner.id)).toEqual([
      fixtureCourses.alpha.id,
      fixtureCourses.beta.id,
      "aaaaaaaa-0000-4000-8000-000000000004",
    ]);
    await page.reload();
    await expect(page.locator("#mylist .course")).toHaveText(reordered);
    await page.locator("#mylistFilter").getByRole("button", { name: "US", exact: true }).click();
    await expect(page.locator("#mylist .roundslink").first()).toBeDisabled();
  });

  test("course search uses the dataset fallback when the REST API is unavailable", async ({ page }) => {
    const { owner } = members();
    await signInAs(page, owner);
    await page.locator("#log").click();
    await page.locator("#modalsearch").fill("Fallback Test");
    await page.locator(".result").filter({ hasText: "Fallback Test Links" }).click();
    await page.locator("#timesPlayed").fill("2");
    await page.locator("#confirmLog").click();
    await expect(page.locator("#modal")).toHaveCount(0);
    await expect(row(page, "Fallback Test Links").locator(".count")).toContainText("2×");
  });
});

test.describe("account deletion", () => {
  test.skip(!clerkAvailable, "Clerk development instance keys are not configured");

  test("a member deletes their account from the Account page", async ({ page }) => {
    // A throwaway development-instance user, so the shared test users survive.
    const clerkClient = createClerkClient({ secretKey: process.env["CLERK_SECRET_KEY"] ?? "" });
    const suffix = randomBytes(4).toString("hex");
    const email = `coursebook-e2e-${suffix}+clerk_test@example.com`;
    const created = await clerkClient.users.createUser({
      emailAddress: [email],
      username: "e2e_del_" + suffix,
      firstName: "Leaving",
      skipPasswordRequirement: true,
    });
    try {
      await signInAs(page, { id: created.id, username: "e2e_del_" + suffix, displayName: "Leaving", email });
      await expect(page.locator("#authLabel")).toHaveText("e2e_del_" + suffix);
      await page.getByRole("link", { name: "Account", exact: true }).click();
      await page.locator("#deleteAccount").click();
      await page.locator("#confirmDeleteAccount").click();
      await expect(page.locator("#authLabel")).toHaveText("Not signed in");
      await expect
        .poll(async () => (await clerkClient.users.getUserList({ userId: [created.id] })).data.length)
        .toBe(0);
      const [row] = await db.select().from(users).where(eq(users.id, created.id));
      expect(row?.deletedAt).not.toBeNull();
      expect(row?.email).toBeNull();
    } finally {
      await clerkClient.users.deleteUser(created.id).catch(() => undefined);
    }
  });
});
