import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Intentional idiom in dialogs/forms: reset local draft state when a dialog opens.
      "react-hooks/set-state-in-effect": "off",
      // TanStack Table / React Hook Form return unstable function identities by design.
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "e2e/_*.cjs",
    "e2e/_*.mjs",
    "shots/**",
  ]),
]);

export default eslintConfig;
