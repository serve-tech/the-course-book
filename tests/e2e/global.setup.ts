import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { createClerkClient } from "@clerk/backend";
import { runMigrations } from "@coursebook/api/db/migrate";
import { authAvailable, friendEmail, ownerEmail } from "./auth";
import {
  connect,
  ensureFixtureCourses,
  ensureMembers,
  removeOtherMembers,
  TEST_DATABASE_URL,
  type TestMember,
} from "./db";

/**
 * Runs once before the browser projects: migrate the test database, insert
 * fixture courses, and when Clerk secrets exist obtain a testing token and
 * make the two Clerk test users the only members in the users table.
 */
setup("prepare database and Clerk", async () => {
  if (process.env["E2E_REQUIRE_AUTH"] === "1" && !authAvailable) {
    const missing = ["CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "E2E_OWNER_EMAIL", "E2E_FRIEND_EMAIL"].filter(
      (name) => !process.env[name] || process.env[name].includes("replace_me"),
    );
    throw new Error(`E2E_REQUIRE_AUTH=1 but these are missing, so scenarios would skip: ${missing.join(", ")}`);
  }
  await runMigrations(TEST_DATABASE_URL);
  const { db, pool } = connect();
  try {
    await ensureFixtureCourses(db);
    if (authAvailable) {
      await clerkSetup();
      const client = createClerkClient({ secretKey: process.env["CLERK_SECRET_KEY"] ?? "" });
      const members: TestMember[] = [];
      for (const email of [ownerEmail, friendEmail]) {
        const { data } = await client.users.getUserList({ emailAddress: [email] });
        const user = data[0];
        if (!user?.username) throw new Error(`Clerk test user ${email} is missing or has no username`);
        members.push({
          id: user.id,
          username: user.username,
          displayName: user.fullName ?? user.username,
          email,
        });
      }
      await removeOtherMembers(db, members);
      await ensureMembers(db, members);
      process.env["E2E_MEMBERS"] = JSON.stringify(members);
    }
  } finally {
    await pool.end();
  }
});
