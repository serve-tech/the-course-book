/**
 * Bundle the API into dist/main.mjs with its migrations beside it.
 *
 * Everything is bundled, workspace packages included, except `pg-native`
 * (pg's optional native binding, never installed), so the Docker image needs
 * no node_modules. CommonJS dependencies still call `require` for Node
 * built-ins, hence the createRequire banner. Measured in the P0 spike: about
 * 1.6 MB, healthy in 5 to 7 s at Render free's 0.1 CPU
 * (.planning/research/2026-09-25-api-split-spikes.md).
 *
 * Runs with Node's type stripping: `node build.ts`.
 */
import { cpSync, rmSync } from "node:fs";
import { build } from "esbuild";

const root = new URL(".", import.meta.url);
const dist = new URL("dist/", root);

rmSync(dist, { recursive: true, force: true });
await build({
  entryPoints: [new URL("src/main.ts", root).pathname],
  outfile: new URL("main.mjs", dist).pathname,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  external: ["pg-native"],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
// runMigrations resolves ./migrations next to the bundle.
cpSync(new URL("src/db/migrations/", root), new URL("migrations/", dist), { recursive: true });
