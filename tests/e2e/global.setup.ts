import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { createClerkClient } from "@clerk/backend";
import { runMigrations } from "../../app/db/migrate";
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
