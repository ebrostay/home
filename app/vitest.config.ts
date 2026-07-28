import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests cover the PURE logic only — vocabulary invariants, polyline
// decoding, the section diff. Anything touching Leaflet, the DOM or the API is
// verified in the browser against :4280, which is how this project has always
// checked its work.
export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
