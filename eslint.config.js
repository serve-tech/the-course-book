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
      "tests/",
      "scripts/**/*.mjs",
      "playwright.config.ts",
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
    files: [
      "app/server/**/*.ts",
      "app/db/**/*.ts",
      "app/middleware.ts",
      "scripts/**/*.ts",
      "*.config.ts",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
);
