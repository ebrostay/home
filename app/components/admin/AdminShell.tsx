"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RequireAdmin } from "./RequireAdmin";

// The frame every admin route shares.
//
// This is the back office of "the calm ledger of a stay", and it is written
// in the same hand as the rest of the site — same tokens, same two type
// families, both themes first-class — but tighter: hairline rules instead of
// cards, the mono data voice for every figure, and rows sized so twenty of
// them fit on a laptop. A reviewer works through a queue; the public pages
// are read one home at a time. Nothing here is marketing.

type Section = "queue" | "properties" | "users";

const SECTIONS: { key: Section; href: string }[] = [
  { key: "queue", href: "/admin" },
  { key: "properties", href: "/admin/properties" },
  { key: "users", href: "/admin/users" },
];

export function AdminShell({
  section,
  count,
  children,
}: {
  section: Section;
  /** The number beside the current tab — rows on screen. Absent while the
   *  page is still loading, so the tab shows no number rather than a zero
   *  that is about to be wrong. */
  count?: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin");

  return (
    <RequireAdmin>
      <main className="mx-auto max-w-[86rem] px-4 pb-24 pt-6 sm:px-6">
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {t("title")}
          </h1>
          <p className="data text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            {t("subtitle")}
          </p>
        </header>

        <nav
          aria-label={t("sectionsNav")}
          className="mt-5 flex gap-1 border-b border-line"
        >
          {SECTIONS.map(({ key, href }) => {
            const on = key === section;
            return (
              <Link
                key={key}
                href={href}
                aria-current={on ? "page" : undefined}
                // The active tab sits ON the rule rather than above it: the
                // strip reads as one ruled line with a piece lifted out,
                // which is the ledger's own device.
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[0.8125rem] transition-colors duration-(--dur-standard) ${
                  on
                    ? "border-brand font-semibold text-ink"
                    : "border-transparent font-medium text-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                {t(`sections.${key}` as "sections.queue")}
                {on && count !== undefined && (
                  <span className="data text-[0.6875rem] text-muted">{count}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {children}
      </main>
    </RequireAdmin>
  );
}

/** The ruled table every admin list is built from. Horizontal scroll lives
 *  here rather than on the page, so a narrow window scrolls the rows and not
 *  the whole layout. */
export function Ledger({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left">
        {children}
      </table>
    </div>
  );
}

/** A column heading in the section voice — the same small-caps mono label the
 *  public pages use over a hairline (`.ledger-rule`). */
export function Th({
  children,
  className = "",
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`data sticky top-(--header-h) z-10 border-b border-line bg-page px-3 py-2 text-[0.625rem] font-normal uppercase tracking-[0.14em] text-muted ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`border-b border-line px-3 py-2.5 align-middle text-[0.8125rem] text-body ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}

/** Nothing to show. An empty queue is good news and says so; an empty search
 *  is a dead end and says what to do about it. Both are sentences, never a
 *  shrug. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-10 border-t border-line pt-10 text-center text-sm text-muted">
      {children}
    </p>
  );
}

export function Rows({ n = 6 }: { n?: number }) {
  return (
    <div aria-busy="true" className="mt-4 space-y-px">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton h-11 rounded-(--radius-control)" />
      ))}
    </div>
  );
}
