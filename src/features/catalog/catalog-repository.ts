import type { CourseBookClient } from "../../infrastructure/supabase/client";
import type {
  Tables,
  TablesInsert,
} from "../../infrastructure/supabase/database.types";
export type CourseRow = Tables<"courses">;
export type RankingRow = Tables<"course_rankings">;
export interface CatalogRepository {
  courses(ids: readonly string[]): Promise<CourseRow[]>;
  byName(name: string): Promise<CourseRow[]>;
  insert(course: TablesInsert<"courses">): Promise<string>;
  usaCatalog(): Promise<CourseRow[]>;
  rankings(): Promise<RankingRow[]>;
}
export function createCatalogRepository(
  client: CourseBookClient,
): CatalogRepository {
  return {
    async courses(ids) {
      const result: CourseRow[] = [];
      for (let offset = 0; offset < ids.length; offset += 50) {
        const { data, error } = await client
          .from("courses")
          .select("*")
          .in("id", ids.slice(offset, offset + 50));
        if (error) throw error;
        result.push(...data);
      }
      return result;
    },
    async byName(name) {
      const { data, error } = await client
        .from("courses")
        .select("*")
        .eq("name", name)
        .limit(25);
      if (error) throw error;
      return data;
    },
    async insert(course) {
      const { data, error } = await client
        .from("courses")
        .insert(course)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    async usaCatalog() {
      const { data, error } = await client
        .from("courses")
        .select("*")
        .eq("country", "USA")
        .order("state")
        .order("name")
        .limit(1000);
      if (error) throw error;
      return data;
    },
    async rankings() {
      const result: RankingRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await client
          .from("course_rankings")
          .select("*")
          .in("ranking_type", ["world", "usa", "usa_public", "state"])
          .order("ranking_type")
          .order("scope_code")
          .order("rank")
          .range(offset, offset + 999);
        if (error) throw error;
        result.push(...data);
        if (data.length < 1000) return result;
      }
    },
  };
}
