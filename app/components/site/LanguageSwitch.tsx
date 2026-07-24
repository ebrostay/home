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
      className="flex h-9 items-stretch overflow-hidden rounded-(--radius-control) border border-line"
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          onClick={() => router.replace(pathname, { locale: l })}
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
