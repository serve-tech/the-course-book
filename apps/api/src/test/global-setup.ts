import { runMigrations } from "../db/migrate";
import { TEST_DATABASE_URL } from "./db";

/** Vitest global setup for the `db` project: migrate the test database once. */
export default async function setup(): Promise<void> {
  await runMigrations(TEST_DATABASE_URL);
}
