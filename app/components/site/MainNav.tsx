"use client";

import { Search, Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { NAV_ITEMS, navMatch } from "@/lib/nav";

// The primary decision — am I looking for a home, or do I have one to let? —
// reads as a segmented control in the header rather than a row of links, so
// the two audiences are visibly a choice between siblings. "How it works"
// rides along as the third, quieter segment.
//
// The model, including which segment is active for a path, is lib/nav.ts.
// This file is rendering only. The owner segment points at /host in every
// auth state: signed out that route is the pitch, signed in it is the
// portfolio.
//
// THE CONTROL NEVER LEAVES THE BAR. It gets smaller instead, in three steps,
// and what it gives up is ordered by how much each thing is worth: the third
// segment before the words, the words before the choice itself. At 320px it
// is two icons, but it is still there, and the decision it carries is still
// one tap away. What moves into CompactNav's popover is whatever the bar has
// just dropped — the two never show the same thing twice.
//
//   ≥54rem  find · manage · how it works, and ES|EN and the theme in the bar
//   ≥46rem  the same three, ES|EN and theme now in the popover
//   ≥28rem  "Buscar" · "Gestionar", how it works now in the popover
//    <28rem the same two as icons          (ES is the wide case: 168px / 95px)
const ICONS = { search: Search, building: Building2 } as const;

export function MainNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const activeKey = navMatch(pathname);

  return (
    <nav
      aria-label={t("mainNav")}
      className="flex shrink-0 items-center gap-[3px] rounded-full border border-line bg-surface-2 p-1"
    >
      {NAV_ITEMS.map(({ key, href, icon }) => {
        const active = key === activeKey;
        const Icon = icon ? ICONS[icon] : null;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            // The full label is the accessible name at every step, so the
            // icons are named and the short labels ("Buscar") stay contained
            // in the name they shrank from ("Buscar vivienda").
            aria-label={t(`pill.${key}`)}
            title={t(`pill.${key}`)}
            className={`flex items-center rounded-full px-[13px] py-[7px] text-[0.84375rem] transition-colors duration-(--dur-standard) ${
              Icon ? "" : "hidden min-[46rem]:flex"
            } ${
              active
                ? "bg-brand-soft font-semibold text-brand-strong shadow-[inset_0_0_0_1px_var(--brand)]"
                : "font-medium text-muted hover:text-ink"
            }`}
          >
            {/* "How it works" has no short form and no icon: it is already
                gone by the time either would be needed, so asking for a
                pillShort.how message would only be asking for one that has no
                reason to exist. */}
            {Icon && (
              <>
                <Icon size={16} strokeWidth={2} aria-hidden className="min-[28rem]:hidden" />
                <span className="hidden min-[28rem]:inline min-[46rem]:hidden">
                  {t(`pillShort.${key}` as "pillShort.find")}
                </span>
              </>
            )}
            <span className={Icon ? "hidden min-[46rem]:inline" : ""}>{t(`pill.${key}`)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
