CREATE TYPE "public"."member_role" AS ENUM('member', 'curator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."photo_source" AS ENUM('commons');--> statement-breakpoint
CREATE TABLE "course_photos" (
	"course_id" uuid PRIMARY KEY NOT NULL,
	"source" "photo_source" NOT NULL,
	"url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"credit" text NOT NULL,
	"license" text NOT NULL,
	"license_url" text,
	"source_url" text NOT NULL,
	"commons_file" text,
	"set_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "member_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_photos" ADD CONSTRAINT "course_photos_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_photos" ADD CONSTRAINT "course_photos_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;