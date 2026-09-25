import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import refresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "build/",
      "dist/",
      ".react-router/",
      "node_modules/",
      "docs/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    // Plain JavaScript config files have no TypeScript project to type-check.
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      // React Router's convention is to throw Response and data() results.
      "@typescript-eslint/only-throw-error": [
        "error",
        {
          allow: [
            { from: "lib", name: "Response" },
            { from: "package", package: "react-router", name: "DataWithResponseInit" },
          ],
        },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": hooks, "react-refresh": refresh },
    rules: {
      ...hooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Route modules export loaders/actions/meta beside components by design.
    files: ["app/root.tsx", "app/routes/**/*.{ts,tsx}", "app/entry.*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // The domain package holds pure rules shared by the API and the web app.
    files: ["packages/domain/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-*", "react/*", "@react-router/*", "hono", "hono/*", "drizzle-orm", "drizzle-orm/*", "pg", "@clerk/*", "node:*"],
              message: "@coursebook/domain must stay framework-, database- and runtime-free.",
            },
          ],
        },
      ],
    },
  },
  {
    // The API package runs on Node and never renders UI.
    files: ["apps/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-*", "react/*", "@react-router/*"], message: "@coursebook/api has no UI." },
          ],
        },
      ],
    },
  },
  {
    files: [
      "app/server/**/*.ts",
      "app/middleware.ts",
      "apps/api/**/*.ts",
      "packages/*/vitest.config.ts",
      "tests/e2e/**/*.ts",
      "*.config.ts",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
);
