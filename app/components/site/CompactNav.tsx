"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "./AuthProvider";
import { NAV_ITEMS } from "./MainNav";
import { ThemeToggle } from "./ThemeToggle";

// The nav pill needs 420px and the header only has room for it from 60rem up.
// Below that the same three destinations live here, in a popover shaped like
// AuthMenu's — the header's one existing popover, so this adds a second
// instance of a pattern rather than a second pattern.
//
// It also carries the theme toggle below sm. That is not a home for stray
// controls: at 375px the bar holds a logo, ES|EN, an account button and this
// button, and a fifth 36px control is what pushed the row past the edge. The
// language switch stays in the bar at every width because ES/EN is a hard
// requirement of the product, and a hard requirement does not live one tap
// deep.
export function CompactNav() {
  const t = useTranslations("nav");
  const tt = useTranslations("theme");
  const pathname = usePathname();
  const { me } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0 min-[60rem]:hidden">
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
          <nav
            aria-label={t("mainNav")}
            className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-(--radius-card) border border-line bg-surface p-1 shadow-(--shadow-pop)"
          >
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.key}
                  href={item.href(me.authenticated)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`block rounded-(--radius-control) px-2.5 py-2 text-sm transition-colors duration-(--dur-standard) ${
                    active
                      ? "bg-brand-soft font-semibold text-brand-strong"
                      : "text-body hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {t(`pill.${item.key}`)}
                </Link>
              );
            })}

            <div className="mt-1 flex items-center justify-between gap-3 border-t border-line px-2.5 pb-1 pt-2.5 sm:hidden">
              <span className="text-sm text-body">{tt("label")}</span>
              <ThemeToggle />
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
