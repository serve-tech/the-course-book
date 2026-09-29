/**
 * Write the API contract to contract/openapi.json.
 *
 * The document comes from the same route definitions that validate requests,
 * so it cannot drift from the handlers. Nothing here connects to a database
 * or reads the environment. CI regenerates the file and fails on any diff
 * (`pnpm contract:check`).
 *
 * Run with `pnpm contract:emit` from the repository root.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contractDocument } from "../src/contract/emit";

const target = fileURLToPath(new URL("../../../contract/openapi.json", import.meta.url));
writeFileSync(target, JSON.stringify(contractDocument(), null, 2) + "\n");
console.log("Wrote " + target);
