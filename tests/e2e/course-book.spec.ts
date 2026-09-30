import { randomBytes } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { users } from "@coursebook/api/db/schema";
import { FriendshipStatus } from "@coursebook/api/domain/friendship";
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { clerk } from "@clerk/testing/playwright";
import { authAvailable, clerkAvailable, signInAs } from "./auth";
import {
  addHiddenCourse,
  addPlayed,
  catalogCourse,
  connect,
  courseByName,
  fixtureCourses,
  friendshipStatus,
  listOrder,
  resetScenario,
  roundDates,
  type TestMember,
  unfriend,
  wantedIds,
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

/** The member's own Ranking tab (My List) on their profile. */
async function openRanking(page: Page, member: TestMember): Promise<void> {
  await page.goto(`/u/${member.username}/ranking`);
  await expect(page.locator("#mine")).toBeVisible();
}

/** Open the Log dialog with the profile's Log a round button. */
const openLog = (page: Page) => page.getByRole("main").getByRole("link", { name: "+ Log a round" }).click();

/** The Friends destination; its name gains the request count when there are requests. */
const friendsLink = (page: Page) => page.getByRole("link", { name: /^Friends\b/ });

/** The signed-out Home page. */
const welcome = (page: Page) => page.getByRole("heading", { name: /Every course you.ve played/ });

/**
 * How far Clerk's card sits inside the auth dialog's content box on each side,
 * in whole pixels; `{ left: 0, right: 0 }` when it fills it exactly. The right
 * edge uses `clientWidth` so a scrollbar does not count as overflow.
 */
const authCardInset = (page: Page) =>
  page.evaluate(() => {
    const modal = document.querySelector<HTMLElement>("#authmodal .modal");
    const card = document.querySelector("#authClerk .cl-cardBox");
    if (!modal || !card) return null;
    const style = getComputedStyle(modal);
    const box = modal.getBoundingClientRect();
    const inner = card.getBoundingClientRect();
    const contentLeft = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const contentRight = box.left + parseFloat(style.borderLeftWidth) + modal.clientWidth - parseFloat(style.paddingRight);
    return { left: Math.round(inner.left - contentLeft), right: Math.round(contentRight - inner.right) };
  });

test("anonymous navigation, dialogs and mobile layout remain usable", async ({ page }) => {
  test.skip(!clerkAvailable, "Clerk development instance keys are not configured");
  await page.goto("/");
  await expect(welcome(page)).toBeVisible();
  await page.getByRole("link", { name: "Courses", exact: true }).click();
  // The Courses page opens on the USA Top 100 rather than an empty state list.
  await expect(page.getByRole("tab", { name: "USA Top 100" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#toplist > li")).toHaveCount(100);
  await expect(page.locator('#toplist > li[data-course="Augusta National Golf Club"]')).toContainText("Georgia #1");
  await page.getByRole("tab", { name: "Best in Michigan" }).click();
  await expect(page.locator("#topStateRankSelect")).toHaveValue("MI");
  await expect(page.locator("#toplist > li").first()).toContainText("Michigan #1");
  await page.goto("/top-100");
  await expect(page).toHaveURL(/\/courses$/);
  await page.locator("#authOpen").click();
  await expect(page.locator("#authmodal")).toBeVisible();
  // Clerk's fixed-width card once overflowed the dialog on wide screens and
  // fell short of its padding on phones; it fills the content box instead.
  await expect(page.locator("#authClerk .cl-cardBox.cl-signIn-start")).toBeVisible();
  await expect.poll(() => authCardInset(page)).toEqual({ left: 0, right: 0 });
  // Clerk's "Sign up" link goes to the full-page sign-up, which the dialog
  // once kept covering.
  await page.locator("#authClerk .cl-footerActionLink").click();
  await expect(page).toHaveURL(/\/sign-up/);
  await expect(page.locator("#authmodal")).toHaveCount(0);
  await expect(page.locator("#signup .cl-cardBox.cl-signUp-start")).toBeVisible();
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
    await openRanking(page, owner);
    await expect(page.locator("#myCourseCount")).toHaveText("2");
    await expect(page.locator("#mylist .course")).toHaveText(["Test Beta Links", "Test Alpha Links"]);

    await openLog(page);
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
    await expect(welcome(page)).toBeVisible();
  });

  test("course details moves, count editing and confirmed final-round removal work", async ({ page }) => {
    const { owner } = members();
    await signInAs(page, owner);
    await openRanking(page, owner);
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
    await openRanking(page, owner);
    await openLog(page);
    await page.locator("#add").click();
    await page.locator("#newname").fill("New Test Club");
    await page.locator("#newstate").selectOption("MI");
    await page.locator("#save").click();
    await expect(page.locator("#addmodal")).toHaveCount(0);
    await expect(page.locator("#myCourseCount")).toHaveText("3");
    expect(await courseByName(db, "New Test Club")).toMatchObject({ state: "MI", country: "USA", isCustom: true, createdBy: owner.id });
  });

  test("a friend's profile shows their ranking next to the viewer's", async ({ page }) => {
    const { owner, friend } = members();
    await signInAs(page, owner);
    await friendsLink(page).click();
    await page.locator(`[data-friend="${friend.username}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/u/${friend.username}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Ranking", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${friend.username}/ranking$`));
    const ranking = page.locator("#friendRanking");
    await expect(ranking.locator("[data-course]")).toHaveCount(2);
    await page.getByRole("button", { name: "Both played" }).click();
    await expect(ranking.locator("[data-course]")).toHaveCount(1);
    await expect(ranking.locator('[data-course="Test Alpha Links"]')).toContainText("You #2");
  });

  test("course rows save Want to play and log a dated round", async ({ page }) => {
    const { owner } = members();
    const [pineValley, augusta] = [await catalogCourse(db, "usa1"), await catalogCourse(db, "usa2")];
    await signInAs(page, owner);
    await page.goto("/courses");
    const want = page.getByRole("button", { name: "Want to play Pine Valley Golf Club" });
    await want.click();
    await expect(want).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => wantedIds(db, owner.id)).toEqual([pineValley]);

    await page.getByRole("button", { name: "Log a round at Augusta National Golf Club" }).click();
    await expect(page.locator("#selectedCourseCard")).toContainText("Augusta National Golf Club");
    await page.locator("#playedOn").fill("2026-05-01");
    await page.locator("#confirmLog").click();
    await expect(page.locator("#modal")).toHaveCount(0);
    await expect(page.locator('#toplist > li[data-course="Augusta National Golf Club"]')).toHaveAttribute("data-played", "true");
    expect(await roundDates(db, owner.id, augusta)).toEqual(["2026-05-01"]);

    await page.goto(`/u/${owner.username}/lists`);
    await expect(page.locator("#wantToPlay")).toContainText("Pine Valley Golf Club");
    await page.getByRole("button", { name: "Want to play Pine Valley Golf Club" }).click();
    await expect.poll(() => wantedIds(db, owner.id)).toEqual([]);
  });

  test("a mistaken round can be undone, or deleted from a list row or the timeline", async ({ page }) => {
    const { owner } = members();
    const augusta = await catalogCourse(db, "usa2");
    const augustaRow = page.locator('#toplist > li[data-course="Augusta National Golf Club"]');
    const logAugusta = async () => {
      await page.getByRole("button", { name: "Log a round at Augusta National Golf Club" }).click();
      await page.locator("#confirmLog").click();
      await expect(augustaRow).toHaveAttribute("data-played", "true");
    };
    await signInAs(page, owner);
    await page.goto("/courses");

    await logAugusta();
    await page.locator("#toast").getByRole("button", { name: "Undo" }).click();
    await expect(augustaRow).toHaveAttribute("data-played", "false");
    expect(await roundDates(db, owner.id, augusta)).toEqual([]);

    await logAugusta();
    await augustaRow.getByRole("button", { name: "Your rounds at Augusta National Golf Club" }).click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator("#roundmodal .delete-round").click();
    await expect(page.locator("#roundmodal")).toHaveCount(0);
    await expect(augustaRow).toHaveAttribute("data-played", "false");

    await page.goto(`/u/${owner.username}`);
    // Personal ranks name whose ranking they are, like the published pills.
    await expect(page.locator('[data-round="Test Beta Links"]')).toContainText("Your ranking #1");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete your round at Test Beta Links on 2026-02-01" }).click();
    await expect(page.locator('[data-round="Test Beta Links"]')).toHaveCount(0);
    expect(await listOrder(db, owner.id)).toEqual([fixtureCourses.alpha.id]);
  });

  test("a friend's Top list shows which courses they played and you haven't", async ({ page }) => {
    const { owner, friend } = members();
    await addPlayed(db, friend, await catalogCourse(db, "usa4"));
    await addPlayed(db, owner, await catalogCourse(db, "usa1"));
    await signInAs(page, owner);
    await page.goto(`/u/${friend.username}/lists`);
    await page.getByRole("link", { name: /USA Top 100/ }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${friend.username}/lists/usa$`));
    const list = page.locator("#memberTopList");
    await expect(list.locator('[data-course="Shinnecock Hills Golf Club"]')).toHaveAttribute("data-played", "true");
    await expect(list.locator('[data-course="Pine Valley Golf Club"]')).toContainText("You");
    await page.getByRole("button", { name: /^Only / }).click();
    await expect(list.locator(":scope > li")).toHaveCount(1);
    await expect(list.locator(":scope > li")).toHaveAttribute("data-course", "Shinnecock Hills Golf Club");
  });

  test("members befriend by username, accept, and remove a friend from their profile", async ({ page }) => {
    const { owner, friend } = members();
    await unfriend(db, owner, friend);
    await signInAs(page, owner);
    await friendsLink(page).click();
    await expect(page.locator("#friendsList")).toContainText("No friends yet");
    await page.goto(`/friends/${friend.username}`);
    await expect(page).toHaveURL(new RegExp(`/u/${friend.username}$`));
    await expect(page.getByRole("alert")).toContainText("This profile isn't available");

    await friendsLink(page).click();
    await page.locator("#friendSearch").fill(friend.username);
    const result = page.locator("#friendSearchResults .friend-person").filter({ hasText: friend.username });
    await result.getByRole("button", { name: "Add friend" }).click();
    await expect(result.getByRole("button", { name: "Requested" })).toBeDisabled();
    await expect(page.locator('#friendRequests [data-request="outgoing"]')).toContainText(friend.username);
    expect(await friendshipStatus(db, owner, friend)).toBe(FriendshipStatus.Pending);

    await clerk.signOut({ page });
    await signInAs(page, friend);
    await expect(friendsLink(page)).toContainText("1");
    await friendsLink(page).click();
    const request = page.locator('#friendRequests [data-request="incoming"]').filter({ hasText: owner.username });
    await request.getByRole("button", { name: "Accept" }).click();
    await expect(page.locator("#friendRequests")).toHaveCount(0);
    expect(await friendshipStatus(db, owner, friend)).toBe(FriendshipStatus.Accepted);

    await page.locator(`[data-friend="${owner.username}"]`).click();
    await page.getByRole("button", { name: /^More actions/ }).click();
    await page.getByRole("menuitem", { name: "Remove friend…" }).click();
    await page.getByRole("button", { name: "Remove friend", exact: true }).click();
    await expect(page).toHaveURL(/\/friends$/);
    await expect(page.locator("#friendsList")).toContainText("No friends yet");
    await expect.poll(() => friendshipStatus(db, owner, friend)).toBeNull();
  });

  test("touch-handle drag reorders the full list and geographic filters remain read-only", async ({ page }) => {
    const { owner } = members();
    await addHiddenCourse(db, owner);
    await signInAs(page, owner);
    await openRanking(page, owner);
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
    await openRanking(page, owner);
    await openLog(page);
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
