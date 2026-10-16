// Minimal flat config for the platform-agnostic shared package (ESM — the
// package sets "type": "module").
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: {
      "no-console": "error",
      // TS files: type checking is handled by `tsc --noEmit` (typecheck task)
      "no-unused-vars": "off",
      "no-undef": "off",
      // zod pattern: `const X = z…` + `type X = z.infer<…>` share one name
      "no-redeclare": "off",
    },
  },
]);
