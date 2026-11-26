import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["src/**/*.ts", "test/**/*.ts", "scripts/test-go.ts", "examples/server.ts"],
  extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
  languageOptions: {
    parserOptions: { project: "./tsconfig.test.json", tsconfigRootDir: import.meta.dirname },
  },
  linterOptions: { reportUnusedDisableDirectives: "error" },
  rules: {
    eqeqeq: ["error", "always", { null: "ignore" }],
    "@typescript-eslint/strict-boolean-expressions": [
      "error",
      { allowString: false, allowNumber: false, allowNullableObject: true },
    ],
    "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false, checkThenables: true }],
    "@typescript-eslint/switch-exhaustiveness-check": "error",
    "@typescript-eslint/no-unsafe-type-assertion": "error",
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
  },
});
