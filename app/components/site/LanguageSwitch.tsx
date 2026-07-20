"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LanguageSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      className="flex overflow-hidden rounded-(--radius-control) border border-line"
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          onClick={() => router.replace(pathname, { locale: l })}
          className={`data px-2.5 py-1.5 text-xs uppercase transition-colors ${
            l === locale
              ? "bg-ink text-inverse"
              : "text-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
