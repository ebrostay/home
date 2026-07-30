import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The e2e suite's build output (playwright.config.ts sets NEXT_DIST_DIR).
    // Generated code, and 7k lint problems if it is not ignored here — the
    // default list above only knows about ".next".
    ".next-e2e/**",
    // Playwright's own artefacts.
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
