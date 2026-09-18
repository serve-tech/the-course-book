import type { CourseBookClient } from "../../infrastructure/supabase/client";
import type { Tables } from "../../infrastructure/supabase/database.types";
export type Member = Tables<"profiles">;
export interface FriendsRepository {
  members(owner: string): Promise<Member[]>;
}
export function createFriendsRepository(
  client: CourseBookClient,
): FriendsRepository {
  return {
    async members(owner) {
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .order("username");
      if (error) throw error;
      return data.filter((member) => member.id !== owner);
    },
  };
}
