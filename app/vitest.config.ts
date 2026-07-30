import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests cover the PURE logic only — vocabulary invariants, polyline
// decoding, the section diff. Anything touching Leaflet, the DOM or the API is
// covered by the Playwright suite in e2e/ (`npm run test:e2e`), which opens
// every page in both languages against recorded API fixtures. The `include`
// below is what keeps the two apart: without it vitest would collect
// e2e/*.spec.ts and fail on the Playwright imports.
export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
