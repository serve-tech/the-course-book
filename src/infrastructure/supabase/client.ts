import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
export type CourseBookClient = SupabaseClient<Database>;
import configuration from "./public-config.json";
export const publicConfiguration = configuration;
export function createCourseBookClient(): CourseBookClient {
  return createClient<Database>(
    publicConfiguration.url,
    publicConfiguration.publishableKey,
  );
}
