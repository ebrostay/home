"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LanguageSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  // usePathname() gives the locale-stripped PATH only. Static export has no
  // dynamic routes, so the property page carries its id in the query
  // (/es/property?id=slug) — switching language on the path alone dropped it
  // and landed on "Home not found". Read at click time from window rather
  // than useSearchParams(): this component sits in the root layout's header,
  // and that hook would force a Suspense boundary around it on every page.
  const switchTo = (l: string) => {
    const { search, hash } = window.location;
    router.replace(`${pathname}${search}${hash}`, { locale: l });
  };

  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      /* shrink-0 because overflow-hidden makes this element's automatic
         minimum size 0: as a flex item it would rather clip ES and EN away
         entirely than refuse to shrink, and it did — down to 2px of border on
         every viewport under 1110px. The rounding needs the clip; the layout
         needs the floor. */
      className="flex h-9 shrink-0 items-stretch overflow-hidden rounded-(--radius-control) border border-line"
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          onClick={() => switchTo(l)}
          className={`data grid place-items-center px-3 text-xs font-semibold uppercase transition-colors duration-(--dur-standard) ${
            l === locale
              ? "bg-brand-soft text-brand-strong"
              : "text-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
