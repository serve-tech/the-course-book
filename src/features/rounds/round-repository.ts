import type { CourseBookClient } from "../../infrastructure/supabase/client";
import type { Tables } from "../../infrastructure/supabase/database.types";
export type Round = Tables<"rounds">;
export interface RoundRepository {
  all(owner: string): Promise<Round[]>;
  forCourse(owner: string, courseId: string): Promise<Round[]>;
  add(owner: string, courseId: string, quantity: number): Promise<Round[]>;
  remove(owner: string, ids: readonly string[]): Promise<void>;
}
export function createRoundRepository(
  client: CourseBookClient,
): RoundRepository {
  return {
    async all(owner) {
      const { data, error } = await client
        .from("rounds")
        .select("*")
        .eq("user_id", owner)
        .order("played_at");
      if (error) throw error;
      return data;
    },
    async forCourse(owner, courseId) {
      const { data, error } = await client
        .from("rounds")
        .select("*")
        .eq("user_id", owner)
        .eq("course_id", courseId)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async add(owner, courseId, quantity) {
      const played_at = new Date().toISOString();
      const { data, error } = await client
        .from("rounds")
        .insert(
          Array.from({ length: quantity }, () => ({
            user_id: owner,
            course_id: courseId,
            played_at,
          })),
        )
        .select("*");
      if (error) throw error;
      return data;
    },
    async remove(owner, ids) {
      if (!ids.length) return;
      const { error } = await client
        .from("rounds")
        .delete()
        .eq("user_id", owner)
        .in("id", [...ids]);
      if (error) throw error;
    },
  };
}
