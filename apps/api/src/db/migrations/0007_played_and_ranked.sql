ALTER TABLE "user_courses" ALTER COLUMN "personal_rank" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_courses" ADD COLUMN "ranked_at" timestamp with time zone;