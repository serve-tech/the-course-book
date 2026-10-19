import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { telemetryConfig } from "./app/lib/telemetry/config.ts";

// VITE_* settings live in the repository's .env next to the API's, and in
// Render's static-site environment. They are inlined at build time.
const envDir = fileURLToPath(new URL("../..", import.meta.url));

/** Fail a bundle build, not merely config loading (typegen), without the required settings. */
function requireSettings(mode: string): Plugin {
  return {
    name: "coursebook:require-settings",
    apply: "build",
    buildStart() {
      const env = { ...loadEnv(mode, envDir, "VITE_"), ...process.env };
      if (!env["VITE_API_URL"]) this.error("Set VITE_API_URL (e.g. https://api.coursebook.golf) before building the web app.");
      if (!env["VITE_CLERK_PUBLISHABLE_KEY"]?.startsWith("pk_"))
        this.error("Set VITE_CLERK_PUBLISHABLE_KEY (the Clerk publishable key) before building the web app.");
      try {
        telemetryConfig(env["VITE_POSTHOG_KEY"], env["VITE_POSTHOG_HOST"]);
      } catch {
        this.error("Set both VITE_POSTHOG_KEY (public project key) and VITE_POSTHOG_HOST (US/EU ingest origin), or leave both unset.");
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  envDir,
  define: { "import.meta.env.VITE_APP_RELEASE": JSON.stringify(process.env["RENDER_GIT_COMMIT"] ?? process.env["GITHUB_SHA"] ?? "local") },
  plugins: [reactRouter(), requireSettings(mode)],
  // Workspace packages export TypeScript source; bundle them into the server
  // build instead of leaving Node to import .ts files at runtime.
  ssr: { noExternal: [/^@coursebook\//] },
}));
