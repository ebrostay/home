export const LANGUAGE_STORAGE_KEY = "ebrostay-language";

export type Locale = "es" | "en";

/** Which language a visitor who asked for no language in particular — i.e.
 *  landed on the bare domain — should be sent to (ADR-038).
 *
 *  The order is: a language they once chose here, then a language their
 *  browser says they read, then Spanish. The middle step is why this exists;
 *  the outer two are what keeps it from surprising anyone.
 *
 *  Keep in step with the inline script in `app/public/index.html`, which is
 *  the only caller that matters and cannot import this — it has to run in the
 *  <head> of a static file with no bundler behind it. `locale.test.ts` pins
 *  the rule; the script mirrors it branch for branch.
 *
 *  @param stored     what `localStorage["ebrostay-language"]` holds, if anything
 *  @param languages  `navigator.languages`, most-preferred first
 */
export function resolveLocale(
  stored: string | null | undefined,
  languages: readonly string[] | null | undefined,
): Locale {
  if (stored === "es" || stored === "en") return stored;

  const tags = (languages ?? []).filter((tag) => typeof tag === "string" && tag !== "");

  // No signal at all — a browser that reports no languages, or a caller with
  // nothing to pass. Spanish is the site's default (i18n/routing.ts) and the
  // sitemap's x-default, so an absent answer resolves the same way an absent
  // visitor does.
  if (tags.length === 0) return "es";

  // Most-preferred first, and only the primary subtag: es-419 and es-AR are
  // Spanish, en-GB is English, and a region we do not serve is not a reason
  // to ignore the language attached to it.
  for (const tag of tags) {
    const primary = tag.toLowerCase().split("-")[0];
    if (primary === "es") return "es";
    if (primary === "en") return "en";
  }

  // They read neither. English, not Spanish: this is a browser that has
  // listed its languages and Spanish was not among them, and the audience —
  // companies relocating people to Zaragoza — reaches for English as the
  // second language far more often than for Spanish. v1 resolved the same
  // way (`startsWith("es") ? "es" : "en"`).
  return "en";
}
