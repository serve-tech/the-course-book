import { z } from "zod";
export const courseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: z.string(),
  region: z.string().default(""),
  country: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  world: z.number().nullable().default(null),
  usa: z.number().nullable().default(null),
  michigan: z.number().nullable().default(null),
  /** Rank on the course's own Best-in-State list, whatever the state. */
  stateRank: z.number().nullable().default(null),
  public: z.number().nullable().default(null),
  logo: z.string().default(""),
  website: z.string().default(""),
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
