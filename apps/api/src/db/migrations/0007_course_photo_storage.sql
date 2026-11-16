ALTER TYPE "public"."photo_source" ADD VALUE 'upload';--> statement-breakpoint
ALTER TABLE "course_photos" ADD COLUMN "storage_key" text;