-- Course Book schema baseline for the Serve Electric Incubator project.
-- Verified against the original schema and the Serve Electric staging copy on 2026-09-18.

-- Preserves source application behavior and permissions; contains no user data or secrets.

SET search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE public."course_merge_backup_20260915" (
  "id" uuid,
  "name" text,
  "city" text,
  "state" text,
  "country" text,
  "logo_url" text,
  "website_url" text,
  "is_custom" boolean,
  "created_at" timestamp with time zone
);

CREATE TABLE public."course_ranking_import" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."course_ranking_import_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "ranking_type" text NOT NULL,
  "scope_code" text NOT NULL,
  "rank" integer NOT NULL,
  "source" text NOT NULL,
  "source_year" integer NOT NULL,
  "source_url" text NOT NULL,
  "course_name" text NOT NULL,
  "city" text,
  "state" text,
  "country" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."course_rankings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "ranking_type" text NOT NULL,
  "rank" integer NOT NULL,
  "source" text NOT NULL,
  "source_year" integer NOT NULL,
  "scope_code" text NOT NULL,
  "source_url" text
);

CREATE TABLE public."courses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "city" text,
  "state" text,
  "country" text DEFAULT 'USA'::text,
  "logo_url" text,
  "website_url" text,
  "is_custom" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "display_name" text,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "email" text,
  "username" text
);

CREATE TABLE public."rounds" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "course_id" uuid,
  "played_at" date DEFAULT CURRENT_DATE,
  "score" integer,
  "tees" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."user_courses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "course_id" uuid,
  "times_played" integer DEFAULT 0,
  "personal_rank" integer,
  "first_played" date,
  "last_played" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE public."course_ranking_import" ADD CONSTRAINT "course_ranking_import_pkey" PRIMARY KEY (id);

ALTER TABLE public."course_ranking_import" ADD CONSTRAINT "course_ranking_import_rank_check" CHECK (rank > 0);

ALTER TABLE public."course_ranking_import" ADD CONSTRAINT "course_ranking_import_type_check" CHECK (ranking_type = ANY (ARRAY['world'::text, 'usa'::text, 'usa_public'::text, 'state'::text]));

ALTER TABLE public."course_rankings" ADD CONSTRAINT "course_rankings_pkey" PRIMARY KEY (id);

ALTER TABLE public."course_rankings" ADD CONSTRAINT "course_rankings_rank_positive" CHECK (rank > 0);

ALTER TABLE public."course_rankings" ADD CONSTRAINT "course_rankings_scope_code_required" CHECK (scope_code IS NOT NULL AND length(TRIM(BOTH FROM scope_code)) > 0);

ALTER TABLE public."course_rankings" ADD CONSTRAINT "course_rankings_type_check" CHECK (ranking_type = ANY (ARRAY['world'::text, 'usa'::text, 'usa_public'::text, 'state'::text]));

ALTER TABLE public."courses" ADD CONSTRAINT "courses_pkey" PRIMARY KEY (id);

ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);

ALTER TABLE public."rounds" ADD CONSTRAINT "rounds_pkey" PRIMARY KEY (id);

ALTER TABLE public."user_courses" ADD CONSTRAINT "user_courses_pkey" PRIMARY KEY (id);

ALTER TABLE public."course_rankings" ADD CONSTRAINT "course_rankings_course_id_fkey" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."rounds" ADD CONSTRAINT "rounds_course_id_fkey" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

ALTER TABLE public."rounds" ADD CONSTRAINT "rounds_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."user_courses" ADD CONSTRAINT "user_courses_course_id_fkey" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

ALTER TABLE public."user_courses" ADD CONSTRAINT "user_courses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX user_courses_index ON public.user_courses USING btree (user_id, personal_rank);

CREATE UNIQUE INDEX user_courses_unique ON public.user_courses USING btree (user_id, course_id);

CREATE INDEX rounds_index ON public.rounds USING btree (user_id, played_at);

CREATE UNIQUE INDEX course_rankings_unique_rank_scope ON public.course_rankings USING btree (ranking_type, scope_code, rank);

CREATE INDEX courses_name_index ON public.courses USING btree (name);

CREATE INDEX course_ranking_import_lookup_idx ON public.course_ranking_import USING btree (ranking_type, scope_code, rank);

CREATE INDEX rankings_index ON public.course_rankings USING btree (ranking_type, rank);

CREATE UNIQUE INDEX course_rankings_unique_course_scope ON public.course_rankings USING btree (course_id, ranking_type, scope_code);

CREATE INDEX course_rankings_scope_rank_idx ON public.course_rankings USING btree (ranking_type, scope_code, rank);

CREATE UNIQUE INDEX course_rankings_unique ON public.course_rankings USING btree (course_id, ranking_type);

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, username, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(excluded.username, profiles.username),
    display_name = coalesce(excluded.display_name, profiles.display_name);
  return new;
end;
$function$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

ALTER TABLE public."courses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."user_courses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."course_rankings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."rounds" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert courses" ON public."courses" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Anyone can view courses" ON public."courses" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Friends can view rankings" ON public."user_courses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Users can delete own courses" ON public."user_courses" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own courses" ON public."user_courses" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can add own courses" ON public."user_courses" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own courses" ON public."user_courses" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Friends can view profiles" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Users can update own profile" ON public."profiles" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = id));

CREATE POLICY "Users can view own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = id));

CREATE POLICY "Anyone can view rankings" ON public."course_rankings" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Users can delete own rounds" ON public."rounds" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own rounds" ON public."rounds" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can add own rounds" ON public."rounds" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own rounds" ON public."rounds" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

REVOKE ALL ON TABLE public."courses" FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public."user_courses" FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public."profiles" FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public."course_rankings" FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public."rounds" FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public."course_merge_backup_20260915" FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON SEQUENCE public."course_ranking_import_id_seq" FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public."course_ranking_import" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON TABLE public."courses" TO "postgres";

GRANT SELECT ON TABLE public."courses" TO "postgres";

GRANT UPDATE ON TABLE public."courses" TO "postgres";

GRANT DELETE ON TABLE public."courses" TO "postgres";

GRANT TRUNCATE ON TABLE public."courses" TO "postgres";

GRANT REFERENCES ON TABLE public."courses" TO "postgres";

GRANT TRIGGER ON TABLE public."courses" TO "postgres";

GRANT MAINTAIN ON TABLE public."courses" TO "postgres";

GRANT INSERT ON TABLE public."courses" TO "anon";

GRANT SELECT ON TABLE public."courses" TO "anon";

GRANT UPDATE ON TABLE public."courses" TO "anon";

GRANT DELETE ON TABLE public."courses" TO "anon";

GRANT TRUNCATE ON TABLE public."courses" TO "anon";

GRANT REFERENCES ON TABLE public."courses" TO "anon";

GRANT TRIGGER ON TABLE public."courses" TO "anon";

GRANT MAINTAIN ON TABLE public."courses" TO "anon";

GRANT INSERT ON TABLE public."courses" TO "authenticated";

GRANT SELECT ON TABLE public."courses" TO "authenticated";

GRANT UPDATE ON TABLE public."courses" TO "authenticated";

GRANT DELETE ON TABLE public."courses" TO "authenticated";

GRANT TRUNCATE ON TABLE public."courses" TO "authenticated";

GRANT REFERENCES ON TABLE public."courses" TO "authenticated";

GRANT TRIGGER ON TABLE public."courses" TO "authenticated";

GRANT MAINTAIN ON TABLE public."courses" TO "authenticated";

GRANT INSERT ON TABLE public."courses" TO "service_role";

GRANT SELECT ON TABLE public."courses" TO "service_role";

GRANT UPDATE ON TABLE public."courses" TO "service_role";

GRANT DELETE ON TABLE public."courses" TO "service_role";

GRANT TRUNCATE ON TABLE public."courses" TO "service_role";

GRANT REFERENCES ON TABLE public."courses" TO "service_role";

GRANT TRIGGER ON TABLE public."courses" TO "service_role";

GRANT MAINTAIN ON TABLE public."courses" TO "service_role";

GRANT INSERT ON TABLE public."user_courses" TO "postgres";

GRANT SELECT ON TABLE public."user_courses" TO "postgres";

GRANT UPDATE ON TABLE public."user_courses" TO "postgres";

GRANT DELETE ON TABLE public."user_courses" TO "postgres";

GRANT TRUNCATE ON TABLE public."user_courses" TO "postgres";

GRANT REFERENCES ON TABLE public."user_courses" TO "postgres";

GRANT TRIGGER ON TABLE public."user_courses" TO "postgres";

GRANT MAINTAIN ON TABLE public."user_courses" TO "postgres";

GRANT INSERT ON TABLE public."user_courses" TO "anon";

GRANT SELECT ON TABLE public."user_courses" TO "anon";

GRANT UPDATE ON TABLE public."user_courses" TO "anon";

GRANT DELETE ON TABLE public."user_courses" TO "anon";

GRANT TRUNCATE ON TABLE public."user_courses" TO "anon";

GRANT REFERENCES ON TABLE public."user_courses" TO "anon";

GRANT TRIGGER ON TABLE public."user_courses" TO "anon";

GRANT MAINTAIN ON TABLE public."user_courses" TO "anon";

GRANT INSERT ON TABLE public."user_courses" TO "authenticated";

GRANT SELECT ON TABLE public."user_courses" TO "authenticated";

GRANT UPDATE ON TABLE public."user_courses" TO "authenticated";

GRANT DELETE ON TABLE public."user_courses" TO "authenticated";

GRANT TRUNCATE ON TABLE public."user_courses" TO "authenticated";

GRANT REFERENCES ON TABLE public."user_courses" TO "authenticated";

GRANT TRIGGER ON TABLE public."user_courses" TO "authenticated";

GRANT MAINTAIN ON TABLE public."user_courses" TO "authenticated";

GRANT INSERT ON TABLE public."user_courses" TO "service_role";

GRANT SELECT ON TABLE public."user_courses" TO "service_role";

GRANT UPDATE ON TABLE public."user_courses" TO "service_role";

GRANT DELETE ON TABLE public."user_courses" TO "service_role";

GRANT TRUNCATE ON TABLE public."user_courses" TO "service_role";

GRANT REFERENCES ON TABLE public."user_courses" TO "service_role";

GRANT TRIGGER ON TABLE public."user_courses" TO "service_role";

GRANT MAINTAIN ON TABLE public."user_courses" TO "service_role";

GRANT INSERT ON TABLE public."profiles" TO "postgres";

GRANT SELECT ON TABLE public."profiles" TO "postgres";

GRANT UPDATE ON TABLE public."profiles" TO "postgres";

GRANT DELETE ON TABLE public."profiles" TO "postgres";

GRANT TRUNCATE ON TABLE public."profiles" TO "postgres";

GRANT REFERENCES ON TABLE public."profiles" TO "postgres";

GRANT TRIGGER ON TABLE public."profiles" TO "postgres";

GRANT MAINTAIN ON TABLE public."profiles" TO "postgres";

GRANT INSERT ON TABLE public."profiles" TO "anon";

GRANT SELECT ON TABLE public."profiles" TO "anon";

GRANT UPDATE ON TABLE public."profiles" TO "anon";

GRANT DELETE ON TABLE public."profiles" TO "anon";

GRANT TRUNCATE ON TABLE public."profiles" TO "anon";

GRANT REFERENCES ON TABLE public."profiles" TO "anon";

GRANT TRIGGER ON TABLE public."profiles" TO "anon";

GRANT MAINTAIN ON TABLE public."profiles" TO "anon";

GRANT INSERT ON TABLE public."profiles" TO "authenticated";

GRANT SELECT ON TABLE public."profiles" TO "authenticated";

GRANT UPDATE ON TABLE public."profiles" TO "authenticated";

GRANT DELETE ON TABLE public."profiles" TO "authenticated";

GRANT TRUNCATE ON TABLE public."profiles" TO "authenticated";

GRANT REFERENCES ON TABLE public."profiles" TO "authenticated";

GRANT TRIGGER ON TABLE public."profiles" TO "authenticated";

GRANT MAINTAIN ON TABLE public."profiles" TO "authenticated";

GRANT INSERT ON TABLE public."profiles" TO "service_role";

GRANT SELECT ON TABLE public."profiles" TO "service_role";

GRANT UPDATE ON TABLE public."profiles" TO "service_role";

GRANT DELETE ON TABLE public."profiles" TO "service_role";

GRANT TRUNCATE ON TABLE public."profiles" TO "service_role";

GRANT REFERENCES ON TABLE public."profiles" TO "service_role";

GRANT TRIGGER ON TABLE public."profiles" TO "service_role";

GRANT MAINTAIN ON TABLE public."profiles" TO "service_role";

GRANT INSERT ON TABLE public."course_rankings" TO "postgres";

GRANT SELECT ON TABLE public."course_rankings" TO "postgres";

GRANT UPDATE ON TABLE public."course_rankings" TO "postgres";

GRANT DELETE ON TABLE public."course_rankings" TO "postgres";

GRANT TRUNCATE ON TABLE public."course_rankings" TO "postgres";

GRANT REFERENCES ON TABLE public."course_rankings" TO "postgres";

GRANT TRIGGER ON TABLE public."course_rankings" TO "postgres";

GRANT MAINTAIN ON TABLE public."course_rankings" TO "postgres";

GRANT INSERT ON TABLE public."course_rankings" TO "anon";

GRANT SELECT ON TABLE public."course_rankings" TO "anon";

GRANT UPDATE ON TABLE public."course_rankings" TO "anon";

GRANT DELETE ON TABLE public."course_rankings" TO "anon";

GRANT TRUNCATE ON TABLE public."course_rankings" TO "anon";

GRANT REFERENCES ON TABLE public."course_rankings" TO "anon";

GRANT TRIGGER ON TABLE public."course_rankings" TO "anon";

GRANT MAINTAIN ON TABLE public."course_rankings" TO "anon";

GRANT INSERT ON TABLE public."course_rankings" TO "authenticated";

GRANT SELECT ON TABLE public."course_rankings" TO "authenticated";

GRANT UPDATE ON TABLE public."course_rankings" TO "authenticated";

GRANT DELETE ON TABLE public."course_rankings" TO "authenticated";

GRANT TRUNCATE ON TABLE public."course_rankings" TO "authenticated";

GRANT REFERENCES ON TABLE public."course_rankings" TO "authenticated";

GRANT TRIGGER ON TABLE public."course_rankings" TO "authenticated";

GRANT MAINTAIN ON TABLE public."course_rankings" TO "authenticated";

GRANT INSERT ON TABLE public."course_rankings" TO "service_role";

GRANT SELECT ON TABLE public."course_rankings" TO "service_role";

GRANT UPDATE ON TABLE public."course_rankings" TO "service_role";

GRANT DELETE ON TABLE public."course_rankings" TO "service_role";

GRANT TRUNCATE ON TABLE public."course_rankings" TO "service_role";

GRANT REFERENCES ON TABLE public."course_rankings" TO "service_role";

GRANT TRIGGER ON TABLE public."course_rankings" TO "service_role";

GRANT MAINTAIN ON TABLE public."course_rankings" TO "service_role";

GRANT INSERT ON TABLE public."rounds" TO "postgres";

GRANT SELECT ON TABLE public."rounds" TO "postgres";

GRANT UPDATE ON TABLE public."rounds" TO "postgres";

GRANT DELETE ON TABLE public."rounds" TO "postgres";

GRANT TRUNCATE ON TABLE public."rounds" TO "postgres";

GRANT REFERENCES ON TABLE public."rounds" TO "postgres";

GRANT TRIGGER ON TABLE public."rounds" TO "postgres";

GRANT MAINTAIN ON TABLE public."rounds" TO "postgres";

GRANT INSERT ON TABLE public."rounds" TO "anon";

GRANT SELECT ON TABLE public."rounds" TO "anon";

GRANT UPDATE ON TABLE public."rounds" TO "anon";

GRANT DELETE ON TABLE public."rounds" TO "anon";

GRANT TRUNCATE ON TABLE public."rounds" TO "anon";

GRANT REFERENCES ON TABLE public."rounds" TO "anon";

GRANT TRIGGER ON TABLE public."rounds" TO "anon";

GRANT MAINTAIN ON TABLE public."rounds" TO "anon";

GRANT INSERT ON TABLE public."rounds" TO "authenticated";

GRANT SELECT ON TABLE public."rounds" TO "authenticated";

GRANT UPDATE ON TABLE public."rounds" TO "authenticated";

GRANT DELETE ON TABLE public."rounds" TO "authenticated";

GRANT TRUNCATE ON TABLE public."rounds" TO "authenticated";

GRANT REFERENCES ON TABLE public."rounds" TO "authenticated";

GRANT TRIGGER ON TABLE public."rounds" TO "authenticated";

GRANT MAINTAIN ON TABLE public."rounds" TO "authenticated";

GRANT INSERT ON TABLE public."rounds" TO "service_role";

GRANT SELECT ON TABLE public."rounds" TO "service_role";

GRANT UPDATE ON TABLE public."rounds" TO "service_role";

GRANT DELETE ON TABLE public."rounds" TO "service_role";

GRANT TRUNCATE ON TABLE public."rounds" TO "service_role";

GRANT REFERENCES ON TABLE public."rounds" TO "service_role";

GRANT TRIGGER ON TABLE public."rounds" TO "service_role";

GRANT MAINTAIN ON TABLE public."rounds" TO "service_role";

GRANT INSERT ON TABLE public."course_merge_backup_20260915" TO "postgres";

GRANT SELECT ON TABLE public."course_merge_backup_20260915" TO "postgres";

GRANT UPDATE ON TABLE public."course_merge_backup_20260915" TO "postgres";

GRANT DELETE ON TABLE public."course_merge_backup_20260915" TO "postgres";

GRANT TRUNCATE ON TABLE public."course_merge_backup_20260915" TO "postgres";

GRANT REFERENCES ON TABLE public."course_merge_backup_20260915" TO "postgres";

GRANT TRIGGER ON TABLE public."course_merge_backup_20260915" TO "postgres";

GRANT MAINTAIN ON TABLE public."course_merge_backup_20260915" TO "postgres";

GRANT INSERT ON TABLE public."course_merge_backup_20260915" TO "anon";

GRANT SELECT ON TABLE public."course_merge_backup_20260915" TO "anon";

GRANT UPDATE ON TABLE public."course_merge_backup_20260915" TO "anon";

GRANT DELETE ON TABLE public."course_merge_backup_20260915" TO "anon";

GRANT TRUNCATE ON TABLE public."course_merge_backup_20260915" TO "anon";

GRANT REFERENCES ON TABLE public."course_merge_backup_20260915" TO "anon";

GRANT TRIGGER ON TABLE public."course_merge_backup_20260915" TO "anon";

GRANT MAINTAIN ON TABLE public."course_merge_backup_20260915" TO "anon";

GRANT INSERT ON TABLE public."course_merge_backup_20260915" TO "authenticated";

GRANT SELECT ON TABLE public."course_merge_backup_20260915" TO "authenticated";

GRANT UPDATE ON TABLE public."course_merge_backup_20260915" TO "authenticated";

GRANT DELETE ON TABLE public."course_merge_backup_20260915" TO "authenticated";

GRANT TRUNCATE ON TABLE public."course_merge_backup_20260915" TO "authenticated";

GRANT REFERENCES ON TABLE public."course_merge_backup_20260915" TO "authenticated";

GRANT TRIGGER ON TABLE public."course_merge_backup_20260915" TO "authenticated";

GRANT MAINTAIN ON TABLE public."course_merge_backup_20260915" TO "authenticated";

GRANT INSERT ON TABLE public."course_merge_backup_20260915" TO "service_role";

GRANT SELECT ON TABLE public."course_merge_backup_20260915" TO "service_role";

GRANT UPDATE ON TABLE public."course_merge_backup_20260915" TO "service_role";

GRANT DELETE ON TABLE public."course_merge_backup_20260915" TO "service_role";

GRANT TRUNCATE ON TABLE public."course_merge_backup_20260915" TO "service_role";

GRANT REFERENCES ON TABLE public."course_merge_backup_20260915" TO "service_role";

GRANT TRIGGER ON TABLE public."course_merge_backup_20260915" TO "service_role";

GRANT MAINTAIN ON TABLE public."course_merge_backup_20260915" TO "service_role";

GRANT SELECT ON SEQUENCE public."course_ranking_import_id_seq" TO "postgres";

GRANT UPDATE ON SEQUENCE public."course_ranking_import_id_seq" TO "postgres";

GRANT USAGE ON SEQUENCE public."course_ranking_import_id_seq" TO "postgres";

GRANT SELECT ON SEQUENCE public."course_ranking_import_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE public."course_ranking_import_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE public."course_ranking_import_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE public."course_ranking_import_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE public."course_ranking_import_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE public."course_ranking_import_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE public."course_ranking_import_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE public."course_ranking_import_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE public."course_ranking_import_id_seq" TO "service_role";

GRANT INSERT ON TABLE public."course_ranking_import" TO "postgres";

GRANT SELECT ON TABLE public."course_ranking_import" TO "postgres";

GRANT UPDATE ON TABLE public."course_ranking_import" TO "postgres";

GRANT DELETE ON TABLE public."course_ranking_import" TO "postgres";

GRANT TRUNCATE ON TABLE public."course_ranking_import" TO "postgres";

GRANT REFERENCES ON TABLE public."course_ranking_import" TO "postgres";

GRANT TRIGGER ON TABLE public."course_ranking_import" TO "postgres";

GRANT MAINTAIN ON TABLE public."course_ranking_import" TO "postgres";

GRANT INSERT ON TABLE public."course_ranking_import" TO "anon";

GRANT SELECT ON TABLE public."course_ranking_import" TO "anon";

GRANT UPDATE ON TABLE public."course_ranking_import" TO "anon";

GRANT DELETE ON TABLE public."course_ranking_import" TO "anon";

GRANT TRUNCATE ON TABLE public."course_ranking_import" TO "anon";

GRANT REFERENCES ON TABLE public."course_ranking_import" TO "anon";

GRANT TRIGGER ON TABLE public."course_ranking_import" TO "anon";

GRANT MAINTAIN ON TABLE public."course_ranking_import" TO "anon";

GRANT INSERT ON TABLE public."course_ranking_import" TO "authenticated";

GRANT SELECT ON TABLE public."course_ranking_import" TO "authenticated";

GRANT UPDATE ON TABLE public."course_ranking_import" TO "authenticated";

GRANT DELETE ON TABLE public."course_ranking_import" TO "authenticated";

GRANT TRUNCATE ON TABLE public."course_ranking_import" TO "authenticated";

GRANT REFERENCES ON TABLE public."course_ranking_import" TO "authenticated";

GRANT TRIGGER ON TABLE public."course_ranking_import" TO "authenticated";

GRANT MAINTAIN ON TABLE public."course_ranking_import" TO "authenticated";

GRANT INSERT ON TABLE public."course_ranking_import" TO "service_role";

GRANT SELECT ON TABLE public."course_ranking_import" TO "service_role";

GRANT UPDATE ON TABLE public."course_ranking_import" TO "service_role";

GRANT DELETE ON TABLE public."course_ranking_import" TO "service_role";

GRANT TRUNCATE ON TABLE public."course_ranking_import" TO "service_role";

GRANT REFERENCES ON TABLE public."course_ranking_import" TO "service_role";

GRANT TRIGGER ON TABLE public."course_ranking_import" TO "service_role";

GRANT MAINTAIN ON TABLE public."course_ranking_import" TO "service_role";

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "postgres";

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "anon";

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "authenticated";

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "service_role";

GRANT USAGE ON SCHEMA public TO "pg_database_owner";

GRANT CREATE ON SCHEMA public TO "pg_database_owner";

GRANT USAGE ON SCHEMA public TO PUBLIC;

GRANT USAGE ON SCHEMA public TO "postgres";

GRANT USAGE ON SCHEMA public TO "anon";

GRANT USAGE ON SCHEMA public TO "authenticated";

GRANT USAGE ON SCHEMA public TO "service_role";
