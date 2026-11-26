import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

export default [
  // Global ignores: build output and tooling, so a whole-repo `eslint .`
  // (editors, hooks, wrappers) behaves like `pnpm lint` (T-028). Tauri's
  // codegen assets under target/ are compressed and fail to parse as JS.
  {
    ignores: [
      "dist/",
      "coverage/",
      "target/",
      "src-tauri/",
      ".claude/",
      ".tokensave/",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  prettierConfig,
];
