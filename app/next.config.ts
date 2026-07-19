import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Azure Static Web Apps serves the pre-rendered files from `out/`.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default withNextIntl(nextConfig);
