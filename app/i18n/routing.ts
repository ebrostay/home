import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  // Static export has no middleware, so every page lives under an explicit
  // locale prefix; the host (staticwebapp.config.json) redirects "/" to /es/.
  localePrefix: "always",
});
