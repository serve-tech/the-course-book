import { describe, expect, it } from "vitest";
import {
  ellipsize,
  IMAGE_WIDTH,
  imageScale,
  layoutRankingImage,
  MAX_CANVAS_AREA,
  wrapText,
  type DrawOp,
  type ImageRow,
  type RankingImageContent,
  type TextOp,
} from "./ranking-image";

/** Every character is 10 wide, which makes the expected breaks easy to read. */
const measure = (text: string) => text.length * 10;

const rows = (count: number, name = "Course"): ImageRow[] =>
  Array.from({ length: count }, (_, index) => ({ rank: index + 1, name: name + " " + String(index + 1), place: "Somewhere, MI, USA" }));

const content = (overrides: Partial<RankingImageContent> = {}): RankingImageContent => ({
  memberName: "Josh Linneburg",
  title: "Top 5 in Michigan",
  link: "coursebook.golf/r/josh",
  rows: rows(5),
  ...overrides,
});

const texts = (ops: readonly DrawOp[]): TextOp[] => ops.filter((op): op is TextOp => op.kind === "text");

describe("ellipsize", () => {
  it.each([
    ["short", 100, "short"],
    ["exactly ten", 110, "exactly ten"],
    ["a much longer name", 80, "a much…"],
    ["trailing space here", 90, "trailing…"],
    ["anything", 5, "…"],
  ])("fits %j into %i", (text, width, expected) => {
    expect(ellipsize(text, width, "font", measure)).toBe(expected);
  });
});

describe("wrapText", () => {
  it.each<[string, number, number, string[]]>([
    ["Short", 100, 2, ["Short"]],
    ["Pine Valley", 110, 2, ["Pine Valley"]],
    ["Pine Valley", 100, 2, ["Pine", "Valley"]],
    ["  extra   spaces  ", 200, 2, ["extra spaces"]],
    ["Oakland University Katke Cousins Course", 200, 2, ["Oakland University", "Katke Cousins Course"]],
    ["Oakland University Katke Cousins Golf Course", 200, 2, ["Oakland University", "Katke Cousins Golf…"]],
    ["Supercalifragilistic", 100, 2, ["Supercali…"]],
    ["One two three", 40, 1, ["One…"]],
  ])("breaks %j at %i into at most %i lines", (text, width, maxLines, expected) => {
    expect(wrapText(text, width, maxLines, "font", measure)).toEqual(expected);
  });

  it("never returns a line wider than asked", () => {
    for (const line of wrapText("A very long course name with many many many words in it", 120, 3, "font", measure))
      expect(measure(line)).toBeLessThanOrEqual(120);
  });
});

describe("imageScale", () => {
  it("draws short images at double size", () => {
    expect(imageScale(IMAGE_WIDTH, 800)).toBe(2);
  });

  it("shrinks only as far as the limit requires", () => {
    const tall = 40_000;
    const scale = imageScale(IMAGE_WIDTH, tall);
    expect(scale).toBeLessThan(2);
    expect(Math.ceil(IMAGE_WIDTH * scale) * Math.ceil(tall * scale)).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    expect(imageScale(IMAGE_WIDTH, tall, MAX_CANVAS_AREA * 4)).toBeGreaterThan(scale);
  });
});

describe("layoutRankingImage", () => {
  it("shows the brand, member, heading, every course and the link", () => {
    const shown = texts(layoutRankingImage(content(), measure).ops).map((op) => op.text);
    expect(shown).toEqual(
      expect.arrayContaining(["THE COURSE BOOK", "Josh Linneburg", "Top 5 in Michigan", "Course 1", "Course 5", "coursebook.golf/r/josh"]),
    );
  });

  it("grows with the list instead of stopping at a screen", () => {
    const short = layoutRankingImage(content({ rows: rows(5) }), measure);
    const long = layoutRankingImage(content({ rows: rows(100) }), measure);
    expect(long.height).toBeGreaterThan(short.height);
    expect(texts(long.ops).filter((op) => op.text === "Course 100")).toHaveLength(1);
  });

  it("keeps everything inside the image, in order from top to bottom", () => {
    const layout = layoutRankingImage(content({ rows: rows(100) }), measure);
    let lastY = 0;
    for (const op of layout.ops) {
      expect(op.y).toBeGreaterThanOrEqual(lastY);
      expect(op.y).toBeLessThan(layout.height);
      lastY = op.y;
    }
    for (const op of texts(layout.ops)) {
      const left = op.align === "right" ? op.x - measure(op.text) : op.x;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + measure(op.text)).toBeLessThanOrEqual(layout.width);
    }
  });

  it("widens the rank column for three-digit ranks and lines the names up", () => {
    const layout = layoutRankingImage(content({ rows: rows(120) }), measure);
    const nameXs = new Set(texts(layout.ops).filter((op) => op.text.startsWith("Course")).map((op) => op.x));
    expect(nameXs.size).toBe(1);
    const [nameX] = nameXs;
    expect(nameX).toBeGreaterThan(texts(layoutRankingImage(content({ rows: rows(5) }), measure).ops).find((op) => op.text === "Course 1")?.x ?? Infinity);
  });

  it("gives a long name two lines and a taller row", () => {
    const short = layoutRankingImage(content({ rows: rows(1) }), measure);
    const long = layoutRankingImage(content({ rows: rows(1, "Oakland University Katke Cousins Golf Course With A Very Long Name Indeed") }), measure);
    expect(long.height).toBe(short.height + 22);
  });

  it("leaves out an empty place rather than a blank line", () => {
    const withPlace = layoutRankingImage(content({ rows: rows(1) }), measure);
    const without = layoutRankingImage(content({ rows: [{ rank: 1, name: "Course 1", place: "" }] }), measure);
    expect(without.height).toBe(withPlace.height - 18);
  });

  it("fits a 300-course list under the canvas limit at full layout size or better", () => {
    const layout = layoutRankingImage(content({ rows: rows(300) }), measure);
    const scale = imageScale(layout.width, layout.height);
    expect(scale).toBeGreaterThanOrEqual(1);
    expect(Math.ceil(layout.width * scale) * Math.ceil(layout.height * scale)).toBeLessThanOrEqual(MAX_CANVAS_AREA);
  });
});
