-- Personal ranks are unique per user, but a reorder renumbers a whole list in
-- one statement, so the constraint is checked at commit. drizzle-kit cannot
-- express DEFERRABLE, which is why this lives in a custom migration.
ALTER TABLE "user_courses"
  ADD CONSTRAINT "user_courses_user_rank_unique"
  UNIQUE ("user_id", "personal_rank") DEFERRABLE INITIALLY DEFERRED;
