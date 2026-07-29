"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "./AuthProvider";

// The primary decision — am I looking for a home, or do I have one to let? —
// reads as a segmented control in the header rather than a row of links, so
// the two audiences are visibly a choice between siblings. "How it works"
// rides along as the third, quieter segment.
//
// The owner segment points at two different places on purpose. Signed in, it
// is the portfolio. Signed out it is the pitch, because /host is role-gated
// (staticwebapp.config.json) and bouncing a curious owner straight into a
// sign-in screen answers a question they have not asked yet.
// Exported because the compact menu below 60rem offers the same three
// destinations. One list, so the two shapes of the nav cannot drift apart.
export const NAV_ITEMS = [
  { key: "find", href: () => "/", match: (p: string) => p === "/" },
  {
    key: "list",
    href: (authed: boolean) => (authed ? "/host" : "/about#hosts"),
    match: (p: string) => p.startsWith("/host"),
  },
  { key: "how", href: () => "/about#how", match: () => false },
] as const;

export function MainNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { me } = useAuth();

  return (
    // 60rem, not md. The pill is 420px wide and the header also has to hold a
    // 113px wordmark and a ~305px control cluster: 918px of content plus the
    // container's own padding. At md (768px) it did not fit, and what "not
    // fitting" looked like was the language switcher clipped to a 2px sliver
    // by its own overflow-hidden. Below 60rem the same three destinations are
    // in CompactNav.
    <nav
      aria-label={t("mainNav")}
      className="hidden shrink-0 items-center gap-[3px] rounded-full border border-line bg-surface-2 p-1 min-[60rem]:flex"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.key}
            href={item.href(me.authenticated)}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-[13px] py-[7px] text-[0.84375rem] transition-colors duration-(--dur-standard) ${
              active
                ? "bg-brand-soft font-semibold text-brand-strong shadow-[inset_0_0_0_1px_var(--brand)]"
                : "font-medium text-muted hover:text-ink"
            }`}
          >
            {t(`pill.${item.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
