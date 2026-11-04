import type { PublicRanking } from "@coursebook/domain/friends/types";
import { RegionFilter } from "@coursebook/domain/catalog/course";
import { sharePath, shareViewTitle, viewRows, WHOLE_RANKING, type ShareView } from "@coursebook/domain/sharing/view";

/**
 * Pure rules for the card a messaging app draws for a shared ranking link
 * (decision 2026-11-03, ranking-first product). Member names reach the page
 * here, so everything written into HTML goes through `escapeHtml`.
 */

/** What a shared link's card says. */
export interface ShareCard {
  title: string;
  description: string;
  /** The link the card stands for. */
  url: string;
  /** A small picture for the card. */
  image: string;
}

/** How many courses a card names. Messaging apps cut long descriptions anyway. */
const NAMED_COURSES = 5;

const SITE_NAME = "The Course Book";
const IMAGE_PATH = "/icon-180.png";

/** Escape text for an HTML attribute or element. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** "1. Pine Valley · 2. Crystal Downs and 3 more". */
function namedCourses(rows: readonly { course: { name: string }; rank: number }[]): string {
  const named = rows
    .slice(0, NAMED_COURSES)
    .map((row) => String(row.rank) + ". " + row.course.name)
    .join(" · ");
  const rest = rows.length - NAMED_COURSES;
  return rest > 0 ? named + " and " + String(rest) + " more" : named;
}

/**
 * The card for one view of a member's ranking. It holds only public fields:
 * the member's name and the courses in the view.
 *
 * Args:
 *     ranking: The member and their whole ranking in order.
 *     view: The view in the link. A state view that names no state means the
 *         member's most-played state on the page, which takes more than a
 *         link to work out, so its card describes the whole ranking.
 *     webUrl: The web app's origin.
 *
 * Returns:
 *     The card, with the title in the form "Josh's Top 5 in Michigan".
 */
export function shareCard(ranking: PublicRanking, view: ShareView, webUrl: string): ShareCard {
  const { displayName, username } = ranking.member;
  const named = view.region === RegionFilter.State && !view.state ? { ...WHOLE_RANKING, top: view.top } : view;
  const rows = viewRows(ranking.rows, named);
  const whole = named.region === RegionFilter.All && named.top === null;
  return {
    title: displayName + "'s " + (whole ? "course ranking" : shareViewTitle(named)),
    description: rows.length ? namedCourses(rows) : "See this ranking on " + SITE_NAME + ".",
    url: webUrl + sharePath(username, named),
    image: webUrl + IMAGE_PATH,
  };
}

/** The card for a link that names no member anyone can see. */
export function genericCard(webUrl: string): ShareCard {
  return {
    title: SITE_NAME,
    description: "Rank the golf courses you've played and share your list.",
    url: webUrl,
    image: webUrl + IMAGE_PATH,
  };
}

/** The head tags for a card, including the request to stay out of search results. */
function cardTags(card: ShareCard): string {
  const named = [["robots", "noindex"], ["twitter:card", "summary"]];
  const properties = [
    ["og:site_name", SITE_NAME],
    ["og:type", "website"],
    ["og:title", card.title],
    ["og:description", card.description],
    ["og:url", card.url],
    ["og:image", card.image],
  ];
  return [
    ...named.map(([name = "", content = ""]) => `<meta name="${name}" content="${escapeHtml(content)}">`),
    ...properties.map(([property = "", content = ""]) => `<meta property="${property}" content="${escapeHtml(content)}">`),
  ].join("");
}

/**
 * The web app's page with a card added, so a person gets the normal app and a
 * messaging app finds the card.
 *
 * The page's `<title>` is left alone: the app renders it again as it starts,
 * and a different title would be a hydration mismatch. Extra head tags are not,
 * because React 19 skips unexpected tags in the head while hydrating.
 *
 * Args:
 *     shell: The web app's `index.html`.
 *     card: The card to add.
 *
 * Returns:
 *     The page, or null when `shell` has no `</head>` to add the card before.
 */
export function pageWithCard(shell: string, card: ShareCard): string | null {
  if (!shell.includes("</head>")) return null;
  // A replacer function, because a replacement string would treat "$&" in a member's name as a pattern.
  return shell.replace("</head>", () => cardTags(card) + "</head>");
}

/** A page that still carries the card when the web app's page could not be read. */
export function pageWithoutApp(card: ShareCard): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(card.title)}</title>${cardTags(card)}</head>` +
    `<body><p>${SITE_NAME} couldn't load right now. Please try this link again in a moment.</p></body></html>`
  );
}
