CREATE TYPE "public"."ranking_type" AS ENUM('world', 'usa', 'usa_public', 'state');--> statement-breakpoint
CREATE TABLE "course_rankings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"ranking_type" "ranking_type" NOT NULL,
	"rank" integer NOT NULL,
	"scope_code" text NOT NULL,
	"source" text NOT NULL,
	"source_year" integer NOT NULL,
	"source_url" text,
	CONSTRAINT "course_rankings_rank_positive" CHECK ("course_rankings"."rank" > 0),
	CONSTRAINT "course_rankings_scope_code_required" CHECK (length(trim("course_rankings"."scope_code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_id" text,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"city" text,
	"state" text,
	"country" text DEFAULT 'USA' NOT NULL,
	"logo_url" text,
	"website_url" text,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"played_at" date DEFAULT CURRENT_DATE NOT NULL,
	"score" integer,
	"tees" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"personal_rank" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_courses_user_course_unique" UNIQUE("user_id","course_id"),
	CONSTRAINT "user_courses_rank_positive" CHECK ("user_courses"."personal_rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"avatar_url" text,
	"legacy_supabase_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "course_rankings" ADD CONSTRAINT "course_rankings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_membership_fk" FOREIGN KEY ("user_id","course_id") REFERENCES "public"."user_courses"("user_id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_rankings_scope_rank_idx" ON "course_rankings" USING btree ("ranking_type","scope_code","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "course_rankings_course_type_idx" ON "course_rankings" USING btree ("course_id","ranking_type");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_stable_id_idx" ON "courses" USING btree ("stable_id");--> statement-breakpoint
CREATE INDEX "courses_name_key_country_idx" ON "courses" USING btree ("name_key","country");--> statement-breakpoint
CREATE INDEX "rounds_user_course_idx" ON "rounds" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "rounds_user_played_idx" ON "rounds" USING btree ("user_id","played_at");--> statement-breakpoint
CREATE INDEX "user_courses_user_rank_idx" ON "user_courses" USING btree ("user_id","personal_rank");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_legacy_supabase_id_idx" ON "users" USING btree ("legacy_supabase_id");