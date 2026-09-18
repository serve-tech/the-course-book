import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { mockBackend } from "./backend";
async function metrics(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [
        "header",
        "nav",
        "#mine .listhead",
        "#myListStateSelect",
        "#mylistFilter",
        "#mysearch",
        "#mylist",
        ".app-footer",
      ].map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error("Missing " + selector);
        const rect = element.getBoundingClientRect(),
          style = getComputedStyle(element);
        return [
          selector,
          {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            fontSize: style.fontSize,
            color: style.color,
          },
        ];
      }),
    ),
  );
}
test("initial layout matches the executable legacy page", async ({
  page,
  context,
}) => {
  await mockBackend(page);
  await page.goto("./");
  await expect(page.locator("#myCourseCount")).toHaveText("0");
  const actual = await metrics(page);
  const legacy = await context.newPage();
  await mockBackend(legacy);
  await legacy.goto("./");
  const html = await readFile("tests/fixtures/legacy/index.html", "utf8");
  const scripts = [
    ...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((match) => match[1] ?? "");
  await legacy.setContent(
    html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""),
  );
  await legacy.addScriptTag({
    content:
      'const supabaseClient=null; const API_BASE="https://api.opengolfapi.org/v1";',
  });
  for (const script of scripts.filter(
    (script) => script.trim() && !script.includes("const SUPABASE_URL"),
  ))
    await legacy.addScriptTag({ content: script });
  const expected = await metrics(legacy);
  expect(actual).toEqual(expected);
  await page.screenshot({
    path: test.info().outputPath("react.png"),
    fullPage: true,
  });
  await legacy.screenshot({
    path: test.info().outputPath("legacy.png"),
    fullPage: true,
  });
  await legacy.close();
});
