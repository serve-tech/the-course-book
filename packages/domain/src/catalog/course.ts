import { z } from "zod";

/**
 * A course's hero photo and the credit its license requires.
 *
 * Every photo is free-licensed or used with permission, and its credit is
 * shown wherever it appears (decision 2026-11-13, course photos in R2).
 */
export const coursePhotoSchema = z.object({
  /** Where the image is served from, at display width. */
  url: z.string().min(1),
  /** The same image at thumbnail width, for rows and small tiles. */
  thumbUrl: z.string().min(1),
  /** The photographer, as the source names them. */
  credit: z.string().min(1),
  /** The license's short name, e.g. "CC BY-SA 4.0" or "Public domain". */
  license: z.string().min(1),
  /** The license's text, when it has one (public domain has none). */
  licenseUrl: z.string().nullable().default(null),
  /** The page the photo came from, e.g. its Wikimedia Commons file page. */
  sourceUrl: z.string().min(1),
});
export type CoursePhoto = z.infer<typeof coursePhotoSchema>;

export const courseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: z.string(),
  region: z.string().default(""),
  country: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  /** Rank on Golf Digest's World 100, which leaves out US courses (shown as "International"). */
  world: z.number().nullable().default(null),
  /** Rank on GOLF Magazine's Top 100 Courses in the World, every country together (shown as "World"). */
  global: z.number().nullable().default(null),
  usa: z.number().nullable().default(null),
  michigan: z.number().nullable().default(null),
  /** Rank on the course's own Best-in-State list, whatever the state. */
  stateRank: z.number().nullable().default(null),
  public: z.number().nullable().default(null),
  logo: z.string().default(""),
  website: z.string().default(""),
  /** The course's hero photo; null until a curator sets one. */
  photo: coursePhotoSchema.nullable().default(null),
});
export type Course = z.infer<typeof courseSchema>;
export interface RankedCourse {
  course: Course;
  rank: number;
  type: string;
  scope: string;
}
export enum RankingFilter {
  World = "world",
  USA = "usa",
  Public = "public",
  State = "state",
}
export enum RegionFilter {
  All = "all",
  World = "world",
  USA = "us",
  State = "state",
}
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/\b(number|no\.?|#)\s*(\d+)\b/g, " $2 ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(golf club|golf course|country club|golf links|golf resort|golf|club|course|the)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}
export function cloudLocation(row: {
  city: string | null;
  state: string | null;
  country: string | null;
}): string {
  return [row.city, row.state, row.country].filter(Boolean).join(", ");
}
