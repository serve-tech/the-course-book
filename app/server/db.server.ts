import { createDatabase, type Database } from "../db/client";
import { databaseEnv } from "./env.server";

/**
 * Process-wide database handle for routes. Server modules take a `Database`
 * argument rather than importing this, so tests can supply the test database.
 */
export const db: Database = createDatabase(databaseEnv().DATABASE_URL).db;
