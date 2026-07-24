"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// The primary decision — am I looking for a home, or do I have one to let? —
// reads as a segmented control in the header rather than a row of links, so
// the two audiences are visibly a choice between siblings. "How it works"
// rides along as the third, quieter segment.
const ITEMS = [
  { key: "find", href: "/", match: (p: string) => p === "/" },
  { key: "list", href: "/about#hosts", match: (p: string) => p === "/list" },
  { key: "how", href: "/about#how", match: () => false },
] as const;

export function MainNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("mainNav")}
      className="hidden items-center gap-[3px] rounded-full border border-line bg-surface-2 p-1 md:flex"
    >
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
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
