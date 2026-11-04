import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClerkClient } from "@clerk/backend";
import { userCourses, users } from "@coursebook/api/db/schema";
import { FriendshipStatus } from "@coursebook/api/domain/friendship";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { clerk } from "@clerk/testing/playwright";
import { authAvailable, clerkAvailable, signInAs } from "./auth";
import {
  addHiddenCourse,
  addPlayed,
  addRounds,
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

/** A course's row on the Ranking tab, the member's own or a friend's. */
const row = (page: Page, name: string) => page.locator(`#ranking > li[data-course="${name}"]`);

/** Course names on the Ranking tab, top to bottom. */
const rankingOrder = (page: Page) =>
  page.locator("#ranking > li[data-course]").evaluateAll((rows) => rows.map((item) => item.getAttribute("data-course")));

/** Click a course's name on the member's own Ranking, which opens its details (the mini tile's copy of the name is hidden). */
const openDetails = (page: Page, name: string) => row(page, name).getByText(name, { exact: true }).filter({ visible: true }).click();

/**
 * The vertical center of an element's own text, measured on the text rather
 * than the element's box: a stretched box can be centered while its text sits
 * at the top.
 */
const textCenter = (locator: Locator) =>
  locator.evaluate((element) => {
    const text = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (!text) throw new Error("The element has no text of its own");
    const range = document.createRange();
    range.selectNodeContents(text);
    const box = range.getBoundingClientRect();
    return box.top + box.height / 2;
  });

/** The member's own Ranking tab on their profile. */
async function openRanking(page: Page, member: TestMember): Promise<void> {
  await page.goto(`/u/${member.username}/ranking`);
  await expect(page.getByRole("tablist", { name: "Ranking regions" })).toBeVisible();
}

/** Open the Log dialog from the page's own Log a round button (Home or the profile header). */
const openLog = (page: Page) => page.getByRole("main").getByRole("button", { name: "+ Log a round" }).click();

/** The Friends destination; its name gains the request count when there are requests. */
const friendsLink = (page: Page) => page.getByRole("link", { name: /^Friends\b/ });

/** The signed-out Home page. */
const welcome = (page: Page) => page.getByRole("heading", { name: /Every course you.ve played/ });

/** The signed-in Home: the member's ranking. */
const homeRanking = (page: Page) => page.getByRole("heading", { level: 1, name: "Your ranking" });

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

/**
 * How far the center of Clerk's card on a full-page sign-in or sign-up sits
 * from the center of its page section (the content column), in whole pixels;
 * 0 when centered.
 */
const pageCardOffset = (page: Page, sectionId: string) =>
  page.evaluate((id) => {
    const section = document.getElementById(id);
    const card = section?.querySelector(".cl-cardBox");
    if (!section || !card) return null;
    const outer = section.getBoundingClientRect();
    const inner = card.getBoundingClientRect();
    return Math.round((inner.left + inner.right) / 2 - (outer.left + outer.right) / 2);
  }, sectionId);

/** The signed-in member's avatar in the top bar, which opens the account menu. */
const accountMenuButton = (page: Page) => page.locator("#authbar").getByRole("button", { name: /^Account menu for / });

/** Checks who is signed in through the account menu's Profile link, then closes the menu. */
async function expectSignedInAs(page: Page, username: string) {
  await accountMenuButton(page).click();
  await expect(page.getByRole("menuitem", { name: "Profile" })).toHaveAttribute("href", "/u/" + username);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
}

test("anonymous navigation, dialogs and mobile layout remain usable", async ({ page }) => {
  test.skip(!clerkAvailable, "Clerk development instance keys are not configured");
  await page.goto("/");
  await expect(welcome(page)).toBeVisible();
  await page.getByRole("link", { name: "Courses", exact: true }).click();
  // The Courses page opens on GOLF's World Top 100 rather than an empty state list,
  // and every row carries each rank the course holds.
  await expect(page.getByRole("tab", { name: "World" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#toplist > li")).toHaveCount(100);
  await expect(page.locator('#toplist > li[data-course="Augusta National Golf Club"] [aria-label="Published ranks"] li')).toHaveText([
    /^World #\d+$/,
    /^USA #\d+$/,
    /^Georgia #\d+$/,
  ]);
  await page.getByRole("tab", { name: "International" }).click();
  await expect(page.locator("#toplist > li")).toHaveCount(100);
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
  await page.locator("#authmodal").getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#authmodal")).toHaveCount(0);
  // The full-page sign-up once left Clerk's card against the column's left edge.
  await page.goto("/sign-up");
  await expect(page.locator("#signup .cl-cardBox.cl-signUp-start")).toBeVisible();
  await expect.poll(() => pageCardOffset(page, "signup")).toBe(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  // Google returns to the page the dialog was opened on, as a full page load
  // with Clerk's next step in the hash (a new account: #/create/sso-callback,
  // then #/create/continue for the username). The dialog once stayed closed,
  // so the account was never created. A step that needs no sign-in in
  // progress stands in for them here; closing the dialog clears it.
  await page.goto("/courses#/factor-one");
  await expect(page.locator("#authmodal")).toBeVisible();
  await page.locator("#authmodal").getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#authmodal")).toHaveCount(0);
  expect(await page.evaluate(() => location.hash)).toBe("");
});

test.describe("signed in", () => {
  test.skip(!authAvailable, "Clerk development instance keys or test users are not configured");

  test.beforeEach(async ({ page }) => {
    const { owner, friend } = members();
    await resetScenario(db, owner, friend);
    await page.goto("/");
  });

  test("sign-in shows the stored order and logging preserves it", async ({ page }) => {
    const { owner } = members();
    await signInAs(page, owner);
    await expectSignedInAs(page, owner.username);
    await expect(homeRanking(page)).toBeVisible();
    await openRanking(page, owner);
    await expect(page.locator("#rankingCount")).toHaveText("2 courses");
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Beta Links", "Test Alpha Links"]);

    await openLog(page);
    await page.locator("#modalsearch").fill("Test Alpha");
    await page.locator(".result").filter({ hasText: "Test Alpha Links" }).click();
    await page.locator("#timesPlayed").fill("2");
    await page.locator("#confirmLog").click();
    await expect(page.locator("#modal")).toHaveCount(0);
    await expect(row(page, "Test Alpha Links")).toContainText("3 rounds");
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Beta Links", "Test Alpha Links"]);
    expect(await listOrder(db, owner.id)).toEqual([fixtureCourses.beta.id, fixtureCourses.alpha.id]);

    await page.reload();
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Beta Links", "Test Alpha Links"]);
    await accountMenuButton(page).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(welcome(page)).toBeVisible();
  });

  test("Home is the member's ranking, with its share buttons, and everyone gets it", async ({ page }, testInfo) => {
    const { owner, friend } = members();
    await signInAs(page, owner);
    await expect(homeRanking(page)).toBeVisible();
    await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Beta Links", "Test Alpha Links"]);
    await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save image" })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true, scale: "css" });

    // The old layouts and their control are gone.
    await expect(page.getByRole("region", { name: "Layout preview" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try the new layout" })).toHaveCount(0);

    // A view on Home is a real view: it changes the title and what is shared.
    await page.getByRole("tab", { name: "Best in Michigan" }).click();
    await page.getByRole("button", { name: "Top 5" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Top 5 in Michigan" })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save image" }).click()]);
    expect(download.suggestedFilename()).toMatch(/-top-5-in-michigan\.png$/);

    // Re-ranking on Home persists, and shows wherever the ranking does.
    await page.getByRole("tab", { name: "All", exact: true }).click();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await openDetails(page, "Test Alpha Links");
    await page.locator("#moveTop").click();
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Alpha Links", "Test Beta Links"]);
    expect(await listOrder(db, owner.id)).toEqual([fixtureCourses.alpha.id, fixtureCourses.beta.id]);

    // Log a round opens over Home; nothing navigates.
    await openLog(page);
    await expect(page.locator("#modal")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("button", { name: "Close" }).click();
    if (testInfo.project.name === "mobile") {
      await page.getByRole("link", { name: "Courses", exact: true }).click();
      await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Log a round" }).click();
      await expect(page.locator("#modal")).toBeVisible();
      await expect(page).toHaveURL(/\/courses/);
      await page.getByRole("button", { name: "Close" }).click();
    }
    // A saved ?log=1 link opens the dialog over that page and drops the parameter.
    await page.goto("/?log=1");
    await expect(page.locator("#modal")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(homeRanking(page)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    // Activity and Timeline are out of the main navigation, and still reachable.
    const main = page.getByRole("navigation", { name: "Main" });
    await expect(main.getByRole("link", { name: "Activity", exact: true })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Timeline", exact: true })).toHaveCount(0);
    await accountMenuButton(page).click();
    await page.getByRole("menuitem", { name: "Activity" }).click();
    await expect(page.getByRole("heading", { name: "Where your friends are playing" })).toBeVisible();
    await expect(page.getByRole("main")).toContainText(friend.displayName);

    // A profile opens on the ranking; its other tabs stay.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${owner.username}/ranking$`));
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Alpha Links", "Test Beta Links"]);
    await page.getByRole("navigation", { name: "Profile sections" }).getByRole("link", { name: "Stats" }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${owner.username}/stats$`));
    await page.getByRole("navigation", { name: "Profile sections" }).getByRole("link", { name: "Timeline" }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${owner.username}/timeline$`));
  });

  test("course details moves, count editing and confirmed final-round removal work", async ({ page }) => {
    const { owner } = members();
    await signInAs(page, owner);
    await openRanking(page, owner);
    await expect(page.locator("#rankingCount")).toHaveText("2 courses");
    await openDetails(page, "Test Alpha Links");
    await page.locator("#moveTop").click();
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Alpha Links", "Test Beta Links"]);
    await expect.poll(() => listOrder(db, owner.id)).toEqual([fixtureCourses.alpha.id, fixtureCourses.beta.id]);

    await openDetails(page, "Test Alpha Links");
    await page.locator("#editTimesPlayed").click();
    await expect(page.locator(".counteditinput")).toBeVisible();
    await page.locator(".cancelcount").click();

    await page.getByRole("button", { name: "Your rounds at Test Alpha Links" }).click();
    await expect(page.locator(".roundhistory-row")).toHaveCount(1);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator(".delete-round").click();
    await expect(page.locator("#roundmodal")).toHaveCount(0);
    await expect(page.locator("#rankingCount")).toHaveText("1 course");
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
    await expect(page.locator("#rankingCount")).toHaveText("3 courses");
    expect(await courseByName(db, "New Test Club")).toMatchObject({ state: "MI", country: "USA", isCustom: true, createdBy: owner.id });
  });

  test("a friend's profile shows their ranking next to the viewer's", async ({ page }) => {
    const { owner, friend } = members();
    await addRounds(db, friend, fixtureCourses.alpha.id, ["2026-03-01"]);
    await signInAs(page, owner);
    await friendsLink(page).click();
    await page.locator(`[data-friend="${friend.username}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/u/${friend.username}/ranking$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const rows = page.locator("#ranking > li[data-course]");
    await expect(rows).toHaveCount(2);
    await expect(page.getByRole("button", { name: "All (2)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Only " + friend.displayName + " (1)", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Both played (1)", exact: true }).click();
    await expect(rows).toHaveCount(1);
    const alpha = row(page, "Test Alpha Links");
    await expect(alpha).toContainText("You #2");
    // The rounds note and the You tick sit on one line, centered on each other.
    const [note, tick] = await Promise.all([
      textCenter(alpha.getByText("2 rounds", { exact: true })),
      textCenter(alpha.getByText("You #2", { exact: true })),
    ]);
    expect(Math.abs(note - tick)).toBeLessThanOrEqual(1);
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

    await page.goto(`/u/${owner.username}/timeline`);
    // A personal rank always says whose ranking it is.
    await expect(page.locator('[data-round="Test Beta Links"] [data-personal-rank="1"]')).toHaveText("#1Your ranking");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete your round at Test Beta Links on 2026-02-01" }).click();
    await expect(page.locator('[data-round="Test Beta Links"]')).toHaveCount(0);
    expect(await listOrder(db, owner.id)).toEqual([fixtureCourses.alpha.id]);
  });

  test("the timeline shows a month's full count before all its rounds load", async ({ page }) => {
    const { owner } = members();
    const march = Array.from({ length: 30 }, (_, day) => `2026-03-${String(day + 1).padStart(2, "0")}`);
    await addRounds(db, owner, fixtureCourses.alpha.id, march);
    await signInAs(page, owner);
    await page.goto(`/u/${owner.username}/timeline`);
    const month = page.locator('[data-month="2026-03"]');
    await expect(month.getByRole("heading", { name: /^March 2026/ })).toContainText("30 rounds");
    // The first page cut March off, yet its header already counts every round.
    expect(await month.locator("[data-round]").count()).toBeLessThan(30);
    await page.getByRole("button", { name: "Show more rounds" }).click();
    await expect(month.locator("[data-round]")).toHaveCount(30);
    await expect(month.getByRole("heading", { name: /^March 2026/ })).toContainText("30 rounds");
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
    await page.getByRole("button", { name: "Only " + friend.displayName + " (1)", exact: true }).click();
    await expect(list.locator(":scope > li")).toHaveCount(1);
    await expect(list.locator(":scope > li")).toHaveAttribute("data-course", "Shinnecock Hills Golf Club");

    // The Courses page shows which friends played each course and how far along they are.
    await page.goto("/courses?list=usa");
    await expect(page.locator('#toplist > li[data-course="Shinnecock Hills Golf Club"]')).toContainText(friend.displayName + " played it");
    await expect(page.getByRole("list", { name: "Friends' progress" })).toContainText(friend.displayName);
  });

  test("members befriend by username, accept, and remove a friend from their profile", async ({ page }) => {
    const { owner, friend } = members();
    await unfriend(db, owner, friend);
    await signInAs(page, owner);
    await friendsLink(page).click();
    await expect(page.locator("#friendsList")).toContainText("No friends yet");
    await page.goto(`/friends/${friend.username}`);
    await expect(page).toHaveURL(new RegExp(`/u/${friend.username}/ranking$`));
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
    await expect(page.locator("#rankingCount")).toHaveText("3 courses");
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Beta Links", "Test Alpha Links", "Hidden Course"]);
    const search = page.getByRole("searchbox", { name: "Search this ranking" });
    await search.fill("Test");
    await search.blur();
    const source = row(page, "Test Alpha Links").locator("[data-drag-handle]");
    const target = row(page, "Test Beta Links");
    await source.scrollIntoViewIfNeeded();
    const from = await source.boundingBox(),
      to = await target.boundingBox();
    if (!from || !to) throw new Error("Missing drag geometry");
    const pointer = { pointerId: 1, pointerType: "touch", button: 0, buttons: 1 };
    await source.dispatchEvent("pointerdown", { ...pointer, clientX: from.x + 5, clientY: from.y + 5 });
    await page.locator("body").dispatchEvent("pointermove", { ...pointer, clientX: to.x + 20, clientY: to.y + 10 });
    await expect(page.locator("[data-drag-ghost]")).toBeVisible();
    await page.locator("body").dispatchEvent("pointerup", { ...pointer, buttons: 0, clientX: to.x + 20, clientY: to.y + 10 });
    await search.fill("");
    await search.blur();
    const reordered = ["Test Alpha Links", "Test Beta Links", "Hidden Course"];
    await expect.poll(() => rankingOrder(page)).toEqual(reordered);
    await expect.poll(() => listOrder(db, owner.id)).toEqual([
      fixtureCourses.alpha.id,
      fixtureCourses.beta.id,
      "aaaaaaaa-0000-4000-8000-000000000004",
    ]);
    await page.reload();
    await expect.poll(() => rankingOrder(page)).toEqual(reordered);

    // Region tabs are read-only, and only the state tab shows the state picker.
    const statePicker = page.getByRole("combobox", { name: "State for Best in State" });
    await expect(statePicker).toHaveCount(0);
    await page.getByRole("tab", { name: "USA", exact: true }).click();
    await expect(page.locator("#ranking > li[data-course]").first()).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: /^Your rounds at / })).toHaveCount(0);
    await expect(statePicker).toHaveCount(0);
    await page.getByRole("tab", { name: "Best in Michigan" }).click();
    await expect(statePicker).toHaveValue("MI");
  });

  test("catalog search finds Oakland University and pages alphabetically on desktop and mobile", async ({ page }, testInfo) => {
    const { owner } = members();
    await signInAs(page, owner);
    await openRanking(page, owner);
    await openLog(page);
    await page.locator("#modalsearch").fill("Oakland");
    await page.locator(".result").filter({ hasText: "Oakland University: Katke-Cousins" }).click();
    await expect(page.locator("#selectedCourseCard")).toContainText("Oakland University: Katke-Cousins");
    await page.locator("#backToSearch").click();
    await page.locator("#modalsearch").fill("Pagination Catalog");
    await expect(page.locator("#results .result strong")).toHaveText(Array.from({ length: 10 }, (_, index) => `Pagination Catalog ${String(index + 1).padStart(2, "0")}`));
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator("#results .result strong")).toHaveText(["Pagination Catalog 11", "Pagination Catalog 12", "Pagination Catalog 13"]);
    await page.screenshot({ path: testInfo.outputPath("course-search-page-two.png"), fullPage: true });
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.locator("#results .result")).toHaveCount(10);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.locator(".result").filter({ hasText: "Pagination Catalog 13" }).click();
    await page.locator("#playedOn").fill("2026-05-01");
    await page.locator("#confirmLog").click();
    await expect(page.locator("#modal")).toHaveCount(0);
    expect(await roundDates(db, owner.id, "bbbbbbbb-0000-4000-8000-000000000013")).toEqual(["2026-05-01"]);
    expect(await listOrder(db, owner.id)).toEqual([fixtureCourses.beta.id, fixtureCourses.alpha.id, "bbbbbbbb-0000-4000-8000-000000000013"]);
  });

  test("external discovery is explicit and can log a result from its second page", async ({ page }) => {
    const { owner } = members();
    await signInAs(page, owner);
    await openRanking(page, owner);
    await openLog(page);
    await page.locator("#modalsearch").fill("External Pagination");
    await expect(page.getByText("No courses found in our catalog. Try Search more courses.")).toBeVisible();
    await page.getByRole("button", { name: "Search more courses" }).click();
    await expect(page.locator("#results .result strong")).toHaveText(Array.from({ length: 10 }, (_, index) => `External Pagination ${String(index + 1).padStart(2, "0")}`));
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator("#results .result strong")).toHaveText(["External Pagination 11", "External Pagination 12", "External Pagination 13"]);
    await page.locator(".result").filter({ hasText: "External Pagination 13" }).click();
    await page.locator("#confirmLog").click();
    await expect(page.locator("#modal")).toHaveCount(0);
    await expect(row(page, "External Pagination 13")).toContainText("1 round");
    expect(await courseByName(db, "External Pagination 13")).toMatchObject({ state: "MI", country: "USA", isCustom: false, createdBy: owner.id });
  });

  test("course search uses the dataset fallback when the REST API is unavailable", async ({ page }) => {
    const { owner } = members();
    await signInAs(page, owner);
    await openRanking(page, owner);
    await openLog(page);
    await page.locator("#modalsearch").fill("Fallback Test");
    await page.getByRole("button", { name: "Search more courses" }).click();
    await page.locator(".result").filter({ hasText: "Fallback Test Links" }).click();
    await page.locator("#timesPlayed").fill("2");
    await page.locator("#confirmLog").click();
    await expect(page.locator("#modal")).toHaveCount(0);
    await expect(row(page, "Fallback Test Links")).toContainText("2 rounds");
  });
});

test.describe("public ranking", () => {
  test.skip(!authAvailable, "Clerk development instance keys or test users are not configured");

  test.beforeEach(async () => {
    const { owner, friend } = members();
    await resetScenario(db, owner, friend);
  });

  /** A saved PNG's size, read from its header, after checking that it is a PNG. */
  const pngSize = async (path: string) => {
    const bytes = await readFile(path);
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  };

  test("a signed-out visitor opens a shared link, changes the view and saves the image", async ({ page }, testInfo) => {
    const { owner } = members();
    await page.goto(`/r/${owner.username}`);
    await expect(page.getByRole("heading", { level: 1, name: owner.displayName })).toBeVisible();
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Beta Links", "Test Alpha Links"]);
    await expect(page.getByLabel("Stats").getByText("Courses")).toBeVisible();
    // Twice when the page came through the API: its card asks too, for readers that run no script.
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", "noindex");
    // A public ranking says nothing about rounds, though the owner has some.
    await expect(page.locator("#ranking")).not.toContainText("round");
    await expect(page.getByLabel("Stats")).not.toContainText("Rounds");
    await expect(page.getByRole("button", { name: "Make your ranking" })).toBeVisible();

    // The view lives in the link, so a reload or a copy of the URL keeps it.
    await page.getByRole("button", { name: "Top 5" }).click();
    await page.getByRole("tab", { name: "Best in Michigan" }).click();
    await expect(page).toHaveURL(/\?view=state-mi&top=5$/);
    await expect(page.getByRole("heading", { level: 2, name: "Top 5 in Michigan" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "Top 5 in Michigan" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Top 5" })).toHaveAttribute("aria-pressed", "true");

    const save = page.getByRole("button", { name: "Save image" });
    await expect(save).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent("download"), save.click()]);
    expect(download.suggestedFilename()).toBe(`${owner.username.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-top-5-in-michigan.png`);
    const saved = testInfo.outputPath("ranking.png");
    await download.saveAs(saved);
    const size = await pngSize(saved);
    expect(size.width).toBe(1080);
    expect(size.height).toBeGreaterThan(400);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("an unknown member's link says the ranking isn't available", async ({ page }) => {
    await page.goto("/r/no_such_member_here");
    await expect(page.getByRole("alert")).toContainText("This ranking isn't available");
  });

  test("a member copies the link and saves the image from their own ranking", async ({ page, context, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium-only in Playwright");
    const { owner } = members();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await signInAs(page, owner);
    await expectSignedInAs(page, owner.username);
    await openRanking(page, owner);
    await page.getByRole("tab", { name: "USA" }).click();
    await page.getByRole("button", { name: "Top 5" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Top 5 in the USA" })).toBeVisible();

    const save = page.getByRole("button", { name: "Save image" });
    await expect(save).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent("download"), save.click()]);
    expect(download.suggestedFilename()).toMatch(/-top-5-in-the-usa\.png$/);
    const saved = testInfo.outputPath("own-ranking.png");
    await download.saveAs(saved);
    expect((await pngSize(saved)).width).toBe(1080);

    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(new RegExp(`/r/${owner.username}\\?view=usa&top=5$`));

    // What was shared opens as the same view.
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 2, name: "Top 5 in the USA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Make your ranking" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("a shared link carries a card for that member and view, and still opens the normal page", async ({ page, request }) => {
    const { owner } = members();
    const link = `/r/${owner.username}?view=state-mi&top=5`;
    const response = await request.get(link);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<meta property="og:title" content="${owner.displayName}&#39;s Top 5 in Michigan">`);
    expect(html).toContain(`<meta property="og:description" content="1. Test Beta Links · 2. Test Alpha Links">`);
    expect(html).toContain(`<meta property="og:url" content="${new URL(link, response.url()).href.replaceAll("&", "&amp;")}">`);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(response.headers()["x-robots-tag"]).toBe("noindex");

    // The card must not disturb the app: no hydration errors, and the page opens as usual.
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat|did not match/i.test(message.text())) problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 2, name: "Top 5 in Michigan" })).toBeVisible();
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Beta Links", "Test Alpha Links"]);
    expect(problems).toEqual([]);
  });

  test("a re-rank shows on the public page", async ({ page }) => {
    const { owner } = members();
    await db.update(userCourses).set({ personalRank: 9 }).where(and(eq(userCourses.userId, owner.id), eq(userCourses.courseId, fixtureCourses.beta.id)));
    await page.goto(`/r/${owner.username}`);
    await expect.poll(() => rankingOrder(page)).toEqual(["Test Alpha Links", "Test Beta Links"]);
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
      await expectSignedInAs(page, "e2e_del_" + suffix);
      await page.getByRole("link", { name: "Account", exact: true }).click();
      await page.locator("#deleteAccount").click();
      await page.locator("#confirmDeleteAccount").click();
      await expect(page.locator("#authOpen")).toHaveText("Sign in");
      await expect(accountMenuButton(page)).toHaveCount(0);
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
