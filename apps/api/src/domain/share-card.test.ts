import { courseSchema, RegionFilter } from "@coursebook/domain/catalog/course";
import type { PublicRanking } from "@coursebook/domain/friends/types";
import { WHOLE_RANKING } from "@coursebook/domain/sharing/view";
import { describe, expect, it } from "vitest";
import { escapeHtml, genericCard, pageWithCard, pageWithoutApp, shareCard } from "./share-card";

const WEB = "https://coursebook.golf";

const course = (id: string, name: string, location: string, state = "") =>
  courseSchema.parse({ id, name, location, state, country: location.endsWith("USA") ? "USA" : "Scotland" });

const ranking: PublicRanking = {
  member: { username: "josh", displayName: "Josh Linneburg" },
  rows: [
    { course: course("pine", "Pine Valley", "Clementon, NJ, USA", "NJ"), rank: 1 },
    { course: course("old", "The Old Course", "St Andrews, Scotland"), rank: 2 },
    { course: course("crystal", "Crystal Downs", "Frankfort, MI, USA", "MI"), rank: 3 },
    { course: course("arcadia", "Arcadia Bluffs", "Arcadia, MI, USA", "MI"), rank: 4 },
  ],
};

const long: PublicRanking = {
  member: ranking.member,
  rows: Array.from({ length: 8 }, (_, index) => ({
    course: course("c" + String(index), "Course " + String(index + 1), "Detroit, MI, USA", "MI"),
    rank: index + 1,
  })),
};

const SHELL = '<!doctype html><html><head><title>The Course Book</title></head><body><div id="app"></div></body></html>';

describe("shareCard", () => {
  it("describes the whole ranking", () => {
    expect(shareCard(ranking, WHOLE_RANKING, WEB)).toEqual({
      title: "Josh Linneburg's course ranking",
      description: "1. Pine Valley · 2. The Old Course · 3. Crystal Downs · 4. Arcadia Bluffs",
      url: "https://coursebook.golf/r/josh",
      image: "https://coursebook.golf/icon-180.png",
    });
  });

  it("names the view, numbers within it and links to it", () => {
    const card = shareCard(ranking, { region: RegionFilter.State, state: "MI", top: 5 }, WEB);
    expect(card.title).toBe("Josh Linneburg's Top 5 in Michigan");
    expect(card.description).toBe("1. Crystal Downs · 2. Arcadia Bluffs");
    expect(card.url).toBe("https://coursebook.golf/r/josh?view=state-mi&top=5");
  });

  it("names five courses and counts the rest", () => {
    expect(shareCard(long, WHOLE_RANKING, WEB).description).toBe(
      "1. Course 1 · 2. Course 2 · 3. Course 3 · 4. Course 4 · 5. Course 5 and 3 more",
    );
  });

  it("describes the whole ranking for a state view that names no state", () => {
    const card = shareCard(ranking, { region: RegionFilter.State, state: "", top: null }, WEB);
    expect(card.title).toBe("Josh Linneburg's course ranking");
    expect(card.url).toBe("https://coursebook.golf/r/josh");
  });

  it("still says something when the view holds no courses", () => {
    const card = shareCard(ranking, { region: RegionFilter.State, state: "OR", top: null }, WEB);
    expect(card.title).toBe("Josh Linneburg's Best in Oregon");
    expect(card.description).toBe("See this ranking on The Course Book.");
  });
});

describe("pageWithCard", () => {
  it("adds the card and keeps the app's page, title included", () => {
    const page = pageWithCard(SHELL, shareCard(ranking, WHOLE_RANKING, WEB));
    expect(page).toContain("<title>The Course Book</title>");
    expect(page).toContain('<div id="app"></div>');
    expect(page).toContain('<meta property="og:title" content="Josh Linneburg&#39;s course ranking">');
    expect(page).toContain('<meta name="robots" content="noindex">');
    expect(page).toContain('<meta name="twitter:card" content="summary">');
  });

  it("escapes a member's name, so a name cannot add markup to the page", () => {
    const hostile: PublicRanking = {
      member: { username: "x", displayName: '"><script>alert(1)</script>' },
      rows: [{ course: course("c", "<img src=x onerror=alert(1)>", "Detroit, MI, USA", "MI"), rank: 1 }],
    };
    const page = pageWithCard(SHELL, shareCard(hostile, WHOLE_RANKING, WEB));
    expect(page).not.toContain("<script>");
    expect(page).not.toContain("<img");
    expect(page).toContain("&lt;script&gt;");
  });

  it("does not treat a name as a replacement pattern", () => {
    const named: PublicRanking = { ...ranking, member: { username: "x", displayName: "$&$`" } };
    const page = pageWithCard(SHELL, shareCard(named, WHOLE_RANKING, WEB));
    expect(page).toContain('content="$&amp;$`&#39;s course ranking"');
  });

  it("gives up on a page with no head to add to", () => {
    expect(pageWithCard("<html><body></body></html>", genericCard(WEB))).toBeNull();
  });
});

describe("pageWithoutApp", () => {
  it("still carries the card and says what happened", () => {
    const page = pageWithoutApp(shareCard(ranking, WHOLE_RANKING, WEB));
    expect(page).toContain('property="og:title"');
    expect(page).toContain("<title>Josh Linneburg&#39;s course ranking</title>");
    expect(page).toContain("couldn't load right now");
  });
});

describe("escapeHtml", () => {
  it("escapes everything that could end an attribute or start a tag", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
