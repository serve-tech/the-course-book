/**
 * Pure layout of the tall ranking image: every course in a view, however long,
 * instead of what fits on a screen. It works out what goes where and leaves the
 * drawing to `render-ranking-image.ts`, so the rules are testable without a
 * canvas (decision 2026-11-03, ranking-first product).
 */

/**
 * iOS Safari's reported canvas area limit. A canvas above it fails without an
 * error, so images are scaled to fit. Reported by
 * https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/ (2022); no
 * current Apple specification was found, so the renderer also checks its work.
 */
export const MAX_CANVAS_AREA = 16_777_216;

/** Layout width in CSS pixels. At the preferred scale the image is 1080 wide. */
export const IMAGE_WIDTH = 540;
const PREFERRED_SCALE = 2;
const MARGIN = 32;
const RANK_GAP = 14;

/**
 * Tokens from `:root` in legacy.css; a canvas cannot read `var()` without
 * going through the page's styles, and the image should not vary with them.
 */
const Color = {
  background: "#08160f",
  cream: "#f4f0e6",
  muted: "#8b998f",
  gold: "#c7aa6b",
  line: "rgba(255, 255, 255, 0.09)",
} as const;

const SERIF = '"Playfair Display", Georgia, serif';
const SANS = '"DM Sans", Arial, sans-serif';

// Anything with a number in it is in the sans font: a canvas cannot ask for
// Playfair's lining figures, and its old-style "10" reads as "IO".
const BRAND_FONT = "700 12px " + SANS;
const MEMBER_FONT = "700 30px " + SERIF;
const TITLE_FONT = "600 20px " + SANS;
const RANK_FONT = "700 19px " + SANS;
const NAME_FONT = "600 17px " + SANS;
const PLACE_FONT = "400 13px " + SANS;
const LINK_FONT = "500 13px " + SANS;

/** Every font the image uses, for loading before it is drawn. */
export const IMAGE_FONTS: readonly string[] = [BRAND_FONT, MEMBER_FONT, TITLE_FONT, RANK_FONT, NAME_FONT, PLACE_FONT, LINK_FONT];

const BRAND = "THE COURSE BOOK";
const ELLIPSIS = "…";

/** The width of `text` in `font`; the canvas in the browser, a stand-in in tests. */
export type MeasureText = (text: string, font: string) => number;

/** One course in the image. */
export interface ImageRow {
  /** Its number in the view. */
  rank: number;
  name: string;
  place: string;
}

/** What the image says. */
export interface RankingImageContent {
  memberName: string;
  /** The view's heading, e.g. "Top 5 in Michigan". */
  title: string;
  /** The link back to the ranking, without its scheme. */
  link: string;
  rows: readonly ImageRow[];
}

/** A piece of text, positioned by its left or right edge and its baseline. */
export interface TextOp {
  kind: "text";
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
  align: "left" | "right";
}

/** A one-pixel horizontal line. */
export interface RuleOp {
  kind: "rule";
  x: number;
  y: number;
  width: number;
  color: string;
}

export type DrawOp = TextOp | RuleOp;

/** Everything needed to draw the image, in CSS pixels. */
export interface RankingImageLayout {
  width: number;
  height: number;
  background: string;
  ops: DrawOp[];
}

/** `text` cut to fit `maxWidth`, ending in an ellipsis when anything was removed. */
export function ellipsize(text: string, maxWidth: number, font: string, measure: MeasureText): string {
  if (measure(text, font) <= maxWidth) return text;
  let kept = text;
  while (kept && measure(kept.trimEnd() + ELLIPSIS, font) > maxWidth) kept = kept.slice(0, -1);
  return kept.trimEnd() + ELLIPSIS;
}

/**
 * Break `text` into lines at spaces.
 *
 * Args:
 *     text: The text.
 *     maxWidth: The widest a line may be.
 *     maxLines: The most lines to use; what does not fit is cut with an ellipsis.
 *     font: The font to measure in.
 *     measure: Measures text.
 *
 * Returns:
 *     One to `maxLines` lines, each no wider than `maxWidth`.
 */
export function wrapText(text: string, maxWidth: number, maxLines: number, font: string, measure: MeasureText): string[] {
  const lines: string[] = [];
  let current = "";
  const words = text.split(/\s+/).filter(Boolean);
  for (const [index, word] of words.entries()) {
    const candidate = current ? current + " " + word : word;
    if (measure(candidate, font) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    if (lines.length === maxLines - 1) {
      const rest = [current, ...words.slice(index)].join(" ");
      return [...lines, ellipsize(rest, maxWidth, font, measure)];
    }
    lines.push(ellipsize(current, maxWidth, font, measure));
    current = word;
  }
  return [...lines, ellipsize(current, maxWidth, font, measure)];
}

/**
 * The scale to draw at: sharp when the image is short, and only as small as it
 * must be to stay under the canvas limit when it is long.
 *
 * Args:
 *     width: Layout width in CSS pixels.
 *     height: Layout height in CSS pixels.
 *     maxArea: The largest allowed canvas area in pixels.
 *
 * Returns:
 *     The scale, aiming 1% under the limit because a canvas's size rounds up
 *     to whole pixels.
 */
export function imageScale(width: number, height: number, maxArea: number = MAX_CANVAS_AREA): number {
  return Math.min(PREFERRED_SCALE, Math.sqrt((maxArea * 0.99) / (width * height)));
}

/**
 * Lay out the image from top to bottom: brand, member, heading, one block per
 * course, then the link. Its height is whatever the courses need.
 *
 * Args:
 *     content: What the image says.
 *     measure: Measures text in the fonts it will be drawn with.
 *
 * Returns:
 *     The size and drawing operations, in CSS pixels.
 */
export function layoutRankingImage(content: RankingImageContent, measure: MeasureText): RankingImageLayout {
  const width = IMAGE_WIDTH;
  const inner = width - MARGIN * 2;
  const ops: DrawOp[] = [];
  const text = (value: string, x: number, y: number, font: string, color: string, align: TextOp["align"] = "left") => {
    ops.push({ kind: "text", text: value, x, y, font, color, align });
  };
  const rule = (y: number) => {
    ops.push({ kind: "rule", x: MARGIN, y, width: inner, color: Color.line });
  };

  let y = MARGIN + 12;
  text(BRAND, MARGIN, y, BRAND_FONT, Color.gold);
  y += 14;
  for (const line of wrapText(content.memberName, inner, 2, MEMBER_FONT, measure)) {
    y += 36;
    text(line, MARGIN, y, MEMBER_FONT, Color.cream);
  }
  for (const line of wrapText(content.title, inner, 2, TITLE_FONT, measure)) {
    y += 28;
    text(line, MARGIN, y, TITLE_FONT, Color.gold);
  }
  y += 20;
  rule(y);

  // The rank column fits the widest number, so names line up down the image.
  const rankWidth = Math.max(0, ...content.rows.map((row) => measure(String(row.rank), RANK_FONT)));
  const nameX = MARGIN + rankWidth + RANK_GAP;
  const nameWidth = width - nameX - MARGIN;
  for (const row of content.rows) {
    const lines = wrapText(row.name, nameWidth, 2, NAME_FONT, measure);
    let lineY = y + 13;
    text(String(row.rank), MARGIN + rankWidth, lineY + 22, RANK_FONT, Color.gold, "right");
    for (const line of lines) {
      lineY += 22;
      text(line, nameX, lineY, NAME_FONT, Color.cream);
    }
    if (row.place) {
      lineY += 18;
      text(ellipsize(row.place, nameWidth, PLACE_FONT, measure), nameX, lineY, PLACE_FONT, Color.muted);
    }
    y = lineY + 13;
    rule(y);
  }

  y += 28;
  text(ellipsize(content.link, inner, LINK_FONT, measure), MARGIN, y, LINK_FONT, Color.muted);
  return { width, height: y + MARGIN, background: Color.background, ops };
}
