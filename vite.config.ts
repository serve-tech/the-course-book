import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "/the-course-book/",
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules\/(react|react-dom|scheduler)\//,
              priority: 20,
            },
            {
              name: "supabase",
              test: /node_modules\/@supabase\//,
              priority: 15,
            },
            { name: "validation", test: /node_modules\/zod\//, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
