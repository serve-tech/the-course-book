import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  // Workspace packages export TypeScript source; bundle them into the server
  // build instead of leaving Node to import .ts files at runtime.
  ssr: { noExternal: [/^@coursebook\//] },
});
