"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { NAV_ITEMS, navMatch } from "@/lib/nav";
import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeToggle } from "./ThemeToggle";

// The overflow of the header bar, and only the overflow: every row here is
// hidden at exactly the width where the bar takes that thing back, so the two
// never offer the same control at the same time. Below 54rem that is the
// language switch and the theme; below 46rem "How it works" joins them.
//
// Shaped like AuthMenu's popover — the header's one existing overlay — so
// this adds a second instance of a pattern rather than a second pattern.
export function CompactNav() {
  const t = useTranslations("nav");
  const tt = useTranslations("theme");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const how = NAV_ITEMS.find((i) => i.key === "how")!;
  const howActive = navMatch(pathname) === "how";

  return (
    <div className="relative shrink-0 min-[54rem]:hidden">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("menu")}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-(--radius-control) border border-line text-body transition-colors duration-(--dur-standard) hover:border-line-strong hover:text-ink"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
        </svg>
      </button>

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-(--radius-card) border border-line bg-surface p-1 shadow-(--shadow-pop)"
          >
            <Link
              role="menuitem"
              href={how.href}
              aria-current={howActive ? "page" : undefined}
              onClick={() => setOpen(false)}
              className="block rounded-(--radius-control) px-2.5 py-2 text-sm text-body transition-colors duration-(--dur-standard) hover:bg-surface-2 hover:text-ink min-[46rem]:hidden"
            >
              {t("pill.how")}
            </Link>

            {/* The divider belongs to the rows below it, so it goes when they
                do — otherwise a popover holding one link opens with a rule
                under it and nothing after. */}
            <div className="mt-1 border-t border-line pt-1 min-[46rem]:mt-0 min-[46rem]:border-t-0 min-[46rem]:pt-0">
              <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                <span className="text-sm text-body">{t("language")}</span>
                <LanguageSwitch />
              </div>
              <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                <span className="text-sm text-body">{tt("label")}</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
