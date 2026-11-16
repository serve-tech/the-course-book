/**
 * Bundle the API into dist/main.mjs with its migrations beside it.
 *
 * Everything is bundled, workspace packages included, except `pg-native`
 * (pg's optional native binding, never installed) and `sharp`, so the Docker
 * image needs no node_modules beyond sharp's. CommonJS dependencies still
 * call `require` for Node built-ins, hence the createRequire banner.
 * Measured in the P0 spike: about 1.6 MB, healthy in 5 to 7 s at Render
 * free's 0.1 CPU (.planning/research/2026-09-25-api-split-spikes.md).
 *
 * sharp, the image library behind photo uploads (#67), is a native module
 * and cannot be bundled; sharp's own docs say to mark it external
 * (https://sharp.pixelplumbing.com/install#bundlers). Its installed files,
 * with the prebuilt libvips binary for the platform the build runs on, are
 * copied into dist/node_modules, where the bundle's `import("sharp")` finds
 * them. The Docker build runs on Alpine, so the image gets the musl build.
 * Decision: .planning/decisions/2026-11-15-process-course-photos-with-sharp-in-the-api-image.md
 *
 * Runs with Node's type stripping: `node build.ts`.
 */
import { cpSync, existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL(".", import.meta.url);
const dist = new URL("dist/", root);

/** Packages left out of the bundle and shipped as files in dist/node_modules. */
const RUNTIME_PACKAGES = ["sharp"];

/** Where Node would find package `name` from `fromDir`, as a real path; null when it isn't installed. */
function packageDir(name: string, fromDir: string): string | null {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(dir) === dir) return null;
  }
}

/**
 * Copy a package and its dependencies, optional ones included when they are
 * installed (sharp's binaries for this platform), flat into `into`.
 */
function copyPackage(name: string, fromDir: string, into: string, copied: Set<string>): void {
  if (copied.has(name)) return;
  const dir = packageDir(name, fromDir);
  // An optional dependency for another platform is not installed.
  if (!dir) return;
  copied.add(name);
  cpSync(dir, join(into, name), { recursive: true, dereference: true, filter: (path) => !path.slice(dir.length).split(sep).includes("node_modules") });
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) copyPackage(dependency, dir, into, copied);
}

rmSync(dist, { recursive: true, force: true });
await build({
  entryPoints: [new URL("src/main.ts", root).pathname],
  outfile: new URL("main.mjs", dist).pathname,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  external: ["pg-native", ...RUNTIME_PACKAGES],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
// runMigrations resolves ./migrations next to the bundle.
cpSync(new URL("src/db/migrations/", root), new URL("migrations/", dist), { recursive: true });

const copied = new Set<string>();
for (const name of RUNTIME_PACKAGES) copyPackage(name, fileURLToPath(root), fileURLToPath(new URL("node_modules/", dist)), copied);
console.log("Copied into dist/node_modules: " + [...copied].sort().join(", "));
