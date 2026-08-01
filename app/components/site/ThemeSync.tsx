"use client";

import { resolveTheme, useBeforePaint } from "./theme";

/**
 * Re-stamps <html data-theme> on every mount of the locale layout. Renders
 * nothing.
 *
 * The inline bootstrap script in [locale]/layout.tsx covers full document
 * loads. A language switch is not one: LanguageSwitch calls router.replace
 * with the other locale, which is a client navigation across the [locale]
 * segment, so the root layout REMOUNTS. React owns <html> as a "singleton"
 * instance, and remounting one goes through releaseSingletonInstance, which
 * strips EVERY attribute off the element (verified in the browser: lang,
 * data-theme and the inline style carrying --filter-h all come off) before
 * setInitialProperties puts back the ones React actually knows about — i.e.
 * lang, and nothing else. data-theme is set imperatively, so it is simply
 * gone.
 *
 * globals.css defines the LIGHT palette on bare :root, so for as long as the
 * attribute is missing the entire page is light. Restoring it from a passive
 * useEffect — which is where ThemeToggle used to do it — lands a frame or more
 * after the browser has already painted that light frame. Hence the flash on
 * every ES/EN switch. A layout effect runs before the paint, so the attribute
 * is never missing on screen.
 */
export function ThemeSync() {
  // Mount is the event that matters: that is when React has just wiped the
  // attribute. Re-renders leave it alone.
  useBeforePaint(() => {
    document.documentElement.dataset.theme = resolveTheme();
  }, []);

  return null;
}
