import { createDatabase, type Database } from "@coursebook/api/db/client";
import { databaseEnv } from "@coursebook/api/services/env";

/**
 * Process-wide database handle for routes. Server modules take a `Database`
 * argument rather than importing this, so tests can supply the test database.
 */
export const db: Database = createDatabase(databaseEnv().DATABASE_URL).db;
