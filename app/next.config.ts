import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Azure Static Web Apps serves the pre-rendered files from `out/`.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Overridable so the e2e suite can build into its own directories while a
  // `npm run dev` is running: Next refuses a second dev server on a `.next`
  // it already owns, and a build sharing it would fight the running one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default withNextIntl(nextConfig);
