import type { CourseBookClient } from "../../infrastructure/supabase/client";
import type { Tables } from "../../infrastructure/supabase/database.types";
export type Membership = Tables<"user_courses">;
export interface JournalRepository {
  memberships(owner: string): Promise<Membership[]>;
  membership(owner: string, courseId: string): Promise<Membership | null>;
  add(
    owner: string,
    courseId: string,
    count: number,
    rank: number,
  ): Promise<void>;
  update(
    owner: string,
    courseId: string,
    count: number,
    rank: number,
  ): Promise<void>;
  remove(owner: string, courseId: string): Promise<void>;
}
export function createJournalRepository(
  client: CourseBookClient,
): JournalRepository {
  return {
    async memberships(owner) {
      const { data, error } = await client
        .from("user_courses")
        .select("*")
        .eq("user_id", owner)
        .order("personal_rank");
      if (error) throw error;
      return data;
    },
    async membership(owner, courseId) {
      const { data, error } = await client
        .from("user_courses")
        .select("*")
        .eq("user_id", owner)
        .eq("course_id", courseId)
        .limit(1);
      if (error) throw error;
      return data[0] ?? null;
    },
    async add(owner, courseId, count, rank) {
      const { error } = await client.from("user_courses").insert({
        user_id: owner,
        course_id: courseId,
        times_played: count,
        personal_rank: rank,
      });
      if (error) throw error;
    },
    async update(owner, courseId, count, rank) {
      const { error } = await client
        .from("user_courses")
        .update({
          times_played: count,
          personal_rank: rank,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", owner)
        .eq("course_id", courseId);
      if (error) throw error;
    },
    async remove(owner, courseId) {
      const { error } = await client
        .from("user_courses")
        .delete()
        .eq("user_id", owner)
        .eq("course_id", courseId);
      if (error) throw error;
    },
  };
}
