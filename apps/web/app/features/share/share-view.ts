import { RegionFilter, type Course } from "@coursebook/domain/catalog/course";
import { stateCode, stateName } from "@coursebook/domain/catalog/geography";
import { rankingRows } from "../journal/ranking";

/**
 * Pure rules for a shareable view of a ranking: what a link's query means, how
 * a view is written back into a link, what it is called and which rows it
 * holds. A view is a filter on the one master ranking and is never stored
 * (decision 2026-11-03, ranking-first product).
 */

/** Which part of a ranking a link shows. */
export interface ShareView {
  region: RegionFilter;
  /** Two-letter state code for the state view; "" means the state the member has played most. */
  state: string;
  /** How many courses to show; null shows them all. */
  top: number | null;
}

/** The whole ranking, which a link with no query shows. */
export const WHOLE_RANKING: ShareView = { region: RegionFilter.All, state: "", top: null };

/** The Top N choices the page offers. A link may ask for any positive number. */
export const TOP_CHOICES: readonly number[] = [5, 10, 25];

const STATE_VIEW = /^state-([a-z]{2})$/;

/** A positive whole number from a link, or null for anything else. */
function parseTop(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const top = Number(value);
  return Number.isSafeInteger(top) && top > 0 ? top : null;
}

/**
 * Read a view from a link's query. Links are typed and pasted by people, so
 * anything unrecognized falls back rather than failing.
 *
 * Args:
 *     params: `view` is `usa`, `international`, `state` or `state-mi`; `top`
 *         is a positive number.
 *
 * Returns:
 *     The view; the whole ranking when `view` is missing or unknown. An
 *     unknown state code reads as the plain state view.
 */
export function parseShareView(params: URLSearchParams): ShareView {
  const top = parseTop(params.get("top"));
  const view = (params.get("view") ?? "").trim().toLowerCase();
  if (view === "usa") return { region: RegionFilter.USA, state: "", top };
  if (view === "international") return { region: RegionFilter.World, state: "", top };
  if (view === "state") return { region: RegionFilter.State, state: "", top };
  const code = STATE_VIEW.exec(view)?.[1];
  if (code) return { region: RegionFilter.State, state: stateCode(code), top };
  return { ...WHOLE_RANKING, top };
}

/** The query that means `view`, leaving out defaults so links stay short. */
export function shareViewParams(view: ShareView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.region === RegionFilter.USA) params.set("view", "usa");
  if (view.region === RegionFilter.World) params.set("view", "international");
  if (view.region === RegionFilter.State) params.set("view", view.state ? "state-" + view.state.toLowerCase() : "state");
  if (view.top !== null) params.set("top", String(view.top));
  return params;
}

/** The app path of a member's public ranking in `view`. */
export function sharePath(username: string, view: ShareView = WHOLE_RANKING): string {
  const query = shareViewParams(view).toString();
  return "/r/" + encodeURIComponent(username) + (query ? "?" + query : "");
}

/** Where a view's courses are, as words after "Top 5" or "Best"; null for the whole ranking. */
function regionWords(view: ShareView): string | null {
  switch (view.region) {
    case RegionFilter.All:
      return null;
    case RegionFilter.USA:
      return "in the USA";
    case RegionFilter.World:
      return "outside the USA";
    case RegionFilter.State:
      return view.state ? "in " + stateName(view.state) : "in State";
  }
}

/** A view's heading: "Top 5 in Michigan", "Best in the USA", "Top 10", "Ranking". */
export function shareViewTitle(view: ShareView): string {
  const where = regionWords(view);
  if (view.top !== null) return "Top " + String(view.top) + (where ? " " + where : "");
  return where ? "Best " + where : "Ranking";
}

/**
 * The rows of a ranking in a view, numbered within it.
 *
 * Args:
 *     rows: The whole ranking in rank order.
 *     view: The view; a state view with no state holds nothing.
 *
 * Returns:
 *     The matching rows, each with `rank` replaced by its place in the view,
 *     cut at `view.top`.
 */
export function viewRows<T extends { course: Course; rank: number }>(rows: readonly T[], view: ShareView): T[] {
  const kept = rankingRows(rows, { region: view.region, state: view.state, query: "" });
  const cut = view.top === null ? kept : kept.slice(0, view.top);
  return cut.map((row, index) => ({ ...row, rank: index + 1 }));
}

/** A name for the saved image, e.g. `josh-top-5-in-michigan.png`. */
export function imageFileName(username: string, title: string): string {
  const slug = (username + " " + title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug + ".png";
}
