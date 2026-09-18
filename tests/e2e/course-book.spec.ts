import { test, expect } from "@playwright/test";
import { mockBackend } from "./backend";
test("anonymous navigation, dialogs and mobile layout remain usable", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto("./");
  await expect(page.locator("#mine")).toBeVisible();
  await expect(page.locator("#myCourseCount")).toHaveText("0");
  await page.getByRole("button", { name: "Top 100", exact: true }).click();
  await expect(page.locator("#toplist .row")).toHaveCount(3);
  await expect(page.locator("#topStateRankSelect")).toHaveValue("MI");
  await page.getByRole("button", { name: "My List", exact: true }).click();
  await page.locator("#log").click();
  await expect(page.locator("#modalsearch")).toBeDisabled();
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("#authmodal")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("email sign-in restores counts without rewriting ranks, and logging preserves order", async ({
  page,
}) => {
  const backend = await mockBackend(page);
  await page.goto("./");
  await page.locator("#authOpen").click();
  await page.locator("#authIdentity").fill("golfer@example.com");
  await page.locator("#authPassword").fill("test-password");
  await page.locator("#authSubmit").click();
  await expect(page.locator("#myCourseCount")).toHaveText("2");
  expect(backend.signIns).toEqual([
    expect.objectContaining({
      email: "golfer@example.com",
      password: "test-password",
    }),
  ]);
  expect(backend.writes).toEqual([]);
  await expect(page.locator("#mylist .course")).toHaveText([
    "Test Alpha Links",
    "Test Beta Links",
  ]);
  await page.locator("#log").click();
  await page.locator("#modalsearch").fill("Test Alpha");
  await page.locator(".result").filter({ hasText: "Test Alpha Links" }).click();
  await page.locator("#timesPlayed").fill("2");
  await page.locator("#confirmLog").click();
  await expect(page.locator("#modal")).toHaveCount(0);
  await expect(page.locator("#mylist .count").first()).toContainText("3×");
  expect(
    backend.writes.filter((write) => write.table === "user_courses"),
  ).toEqual([]);
  await page.reload();
  await expect(page.locator("#mylist .course")).toHaveText([
    "Test Alpha Links",
    "Test Beta Links",
  ]);
  await page.locator("#authOpen").click();
  await expect(page.locator("#myCourseCount")).toHaveText("0");
});
test("course details moves, count editing and confirmed final-round removal work", async ({
  page,
}) => {
  const backend = await mockBackend(page);
  await page.goto("./");
  await page.locator("#authOpen").click();
  await page.locator("#authIdentity").fill("golfer@example.com");
  await page.locator("#authPassword").fill("test-password");
  await page.locator("#authSubmit").click();
  await expect(page.locator("#myCourseCount")).toHaveText("2");
  await page
    .locator("#mylist .course")
    .filter({ hasText: "Test Beta Links" })
    .click();
  await page.locator("#moveTop").click();
  await expect(page.locator("#mylist .course").first()).toHaveText(
    "Test Beta Links",
  );
  await expect
    .poll(
      () =>
        backend.memberships.find((row) => row.course_id === "b")?.personal_rank,
    )
    .toBe(1);
  await page.locator("#mylist .course").first().click();
  await page.locator("#editTimesPlayed").click();
  await expect(page.locator(".counteditinput")).toBeVisible();
  await page.locator(".cancelcount").click();
  await page.locator("#mylist .roundslink").first().click();
  await expect(page.locator(".roundhistory-row")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".delete-round").click();
  await expect(page.locator("#roundmodal")).toHaveCount(0);
  await expect(page.locator("#myCourseCount")).toHaveText("1");
});
test("manual US course stores its state and logs one round", async ({
  page,
}) => {
  const backend = await mockBackend(page);
  await page.goto("./");
  await page.locator("#authOpen").click();
  await page.locator("#authIdentity").fill("golfer@example.com");
  await page.locator("#authPassword").fill("test-password");
  await page.locator("#authSubmit").click();
  await expect(page.locator("#myCourseCount")).toHaveText("2");
  await page.locator("#log").click();
  await page.locator("#add").click();
  await page.locator("#newname").fill("New Test Club");
  await page.locator("#newstate").selectOption("MI");
  await page.locator("#save").click();
  await expect(page.locator("#addmodal")).toHaveCount(0);
  await expect(page.locator("#myCourseCount")).toHaveText("3");
  expect(
    backend.courses.find((course) => course.name === "New Test Club"),
  ).toMatchObject({ state: "MI", country: "USA" });
});
test("Friends recognizes own cloud memberships before deferred journal hydration", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto("./");
  await page.locator("#authOpen").click();
  await page.locator("#authIdentity").fill("golfer@example.com");
  await page.locator("#authPassword").fill("test-password");
  await page.locator("#authSubmit").click();
  await page.getByRole("button", { name: "Friends", exact: true }).click();
  await expect(page.locator("#friendSelect option")).toHaveCount(2);
  await page
    .locator("#friendSelect")
    .selectOption("22222222-2222-4222-8222-222222222222");
  await expect(page.locator("#friendsList .friend-row")).toHaveCount(2);
  await page.locator("#friendsFilter").selectOption("mine");
  await expect(page.locator("#friendsList .course")).toHaveText([
    "Test Alpha Links",
  ]);
  await expect(page.locator(".friend-list-action")).toBeDisabled();
});

test("touch-handle drag reorders the full list and geographic filters remain read-only", async ({
  page,
}) => {
  const backend = await mockBackend(page);
  backend.courses[2].name = "Hidden Course";
  backend.memberships.push({
    id: "mc",
    user_id: "11111111-1111-4111-8111-111111111111",
    course_id: "c",
    personal_rank: 3,
    times_played: 0,
  });
  await page.goto("./");
  await page.locator("#authOpen").click();
  await page.locator("#authIdentity").fill("golfer@example.com");
  await page.locator("#authPassword").fill("test-password");
  await page.locator("#authSubmit").click();
  await expect(page.locator("#myCourseCount")).toHaveText("3");
  await page.locator("#mysearch").fill("Test");
  await page.locator("#mysearch").blur();
  const source = page.locator("#mylist .rankrow").last().locator(".handle"),
    target = page.locator("#mylist .rankrow").first();
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox(),
    to = await target.boundingBox();
  if (!from || !to) throw new Error("Missing drag geometry");
  const pointer = { pointerId: 1, pointerType: "touch", button: 0, buttons: 1 };
  await source.dispatchEvent("pointerdown", {
    ...pointer,
    clientX: from.x + 5,
    clientY: from.y + 5,
  });
  await page
    .locator("body")
    .dispatchEvent("pointermove", {
      ...pointer,
      clientX: to.x + 20,
      clientY: to.y + 10,
    });
  await expect(page.locator(".drag-ghost")).toBeVisible();
  await page
    .locator("body")
    .dispatchEvent("pointerup", {
      ...pointer,
      buttons: 0,
      clientX: to.x + 20,
      clientY: to.y + 10,
    });
  await page.locator("#mysearch").fill("");
  await page.locator("#mysearch").blur();
  await expect(page.locator("#mylist .course")).toHaveText([
    "Test Beta Links",
    "Test Alpha Links",
    "Hidden Course",
  ]);
  await page
    .locator("#mylistFilter")
    .getByRole("button", { name: "US", exact: true })
    .click();
  await expect(page.locator("#mylist .roundslink").first()).toBeDisabled();
});
