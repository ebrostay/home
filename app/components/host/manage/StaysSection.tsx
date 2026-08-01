"use client";

import { useTranslations } from "next-intl";
import { CalendarPlus } from "lucide-react";
import { useShortMonths } from "@/i18n/dates";
import { shortDate, type ShortMonths } from "@/lib/dates";
import type { Occupancy, Stay } from "@/lib/manage";
import { formatEuro } from "@/lib/pricing";
import { SectionCard } from "./SectionCard";

// What is booked. There is no tenant name, no reply time, and no accept or
// decline control anywhere on this page — Ebrostay handles every tenant
// conversation, so the owner's version of a stay is dates, length and money.
//
// A stay is currently stored as a confirmed availability block (spec §4.5),
// which is why the first column carries the owner's own note rather than a
// stay reference: there is no stay record to take a reference from yet. The
// rent is likewise derived at today's price. Both are stated in the footnote
// rather than dressed up — a table that looks authoritative about a number it
// guessed is worse than one that says so.

const PILL: Record<Stay["status"], string> = {
  inStay: "bg-brand-soft text-brand-strong",
  confirmed: "bg-river-soft text-river-deep",
  completed: "bg-surface-2 text-muted",
};

// Three shapes, not two. The columns are what the table wants; below 38rem it
// cannot have them, and squeezing was the wrong answer.
//
// The arithmetic: status 110 + length 90 + three 14px gaps = 242 fixed, and
// the two flexible tracks split 1.6/1 — so "20 Jun – 23 Jun 2026" (~135px)
// and "950 €" (~46px) together need about 220 of free space, i.e. ~462px of
// card content. On a 375px phone there are 351, and what that bought was a
// date truncated to "20 Jun…" — the end of the stay, silently dropped — over
// a rent wrapping under its own euro sign.
//
// So below 38rem a stay stops being a row and becomes a block: the dates on
// their own line at full length, then length, rent and status beneath. Every
// value survives, none is truncated, and the header disappears with the
// columns it was labelling.
//
// 38rem and not less because the card's content width is NOT monotonic in the
// viewport: at 29rem the card is full-bleed and holds 455px, at 30rem it goes
// back to being inset and holds 384. The stacked rung has to cover that dip.
const ROW =
  "flex flex-col gap-1.5 min-[38rem]:grid min-[38rem]:grid-cols-[minmax(0,1.6fr)_90px_minmax(0,1fr)_110px] min-[38rem]:gap-3.5 min-[52rem]:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_90px_minmax(0,1fr)_130px]";

// Its own string rather than `${ROW} max-[38rem]:hidden`: both would be
// setting `display`, and which won would come down to stylesheet order.
const HEAD_ROW =
  "hidden min-[38rem]:grid min-[38rem]:grid-cols-[minmax(0,1.6fr)_90px_minmax(0,1fr)_110px] min-[38rem]:gap-3.5 min-[52rem]:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_90px_minmax(0,1fr)_130px]";

export function StaysSection({
  stays,
  occupancy,
  price,
  locale,
}: {
  stays: Stay[];
  occupancy: Occupancy;
  price: number;
  locale: string;
}) {
  const t = useTranslations("host.manage.stays");
  const months = useShortMonths();
  const booked = stays.filter((s) => s.status !== "completed").length;

  return (
    <SectionCard
      id="stays"
      label={t("label")}
      figure={t("figure", { count: booked })}
      figureTone={booked > 0 ? "text-brand-strong" : "text-muted"}
    >
      {stays.length === 0 ? (
        <p className="rounded-(--radius-control) border border-dashed border-line-strong px-4 py-8 text-center text-[0.84375rem] text-muted">
          {t("empty")}
        </p>
      ) : (
        <div>
          <div
            className={`${HEAD_ROW} border-b border-line px-1 pb-2.5`}
            role="row"
          >
            <Head className="max-[52rem]:hidden">{t("colStay")}</Head>
            <Head>{t("colDates")}</Head>
            <Head align="right">{t("colLength")}</Head>
            <Head align="right">{t("colRent")}</Head>
            <Head align="right">{t("colStatus")}</Head>
          </div>

          {stays.map((s) => (
            <div
              key={`${s.start}-${s.end}`}
              className={`${ROW} border-b border-line px-1 py-[13px] min-[38rem]:items-center`}
            >
              <div className="min-w-0 max-[52rem]:hidden">
                <p className="truncate text-[0.84375rem] font-semibold text-ink">
                  {s.note ?? t("unlabelled")}
                </p>
                <p className="data mt-0.5 text-[0.71875rem] text-muted">
                  {t("stayTotal", { amount: formatEuro(s.rent, locale) })}
                </p>
              </div>
              {/* Not truncated below 38rem — it has the line to itself there,
                  and the end of a stay is not a detail worth an ellipsis. */}
              <span className="data text-[0.8125rem] text-ink min-[38rem]:min-w-0 min-[38rem]:truncate">
                {dates(s, locale, months)}
              </span>
              {/* `contents` puts these three back in the grid as its own items
                  at 38rem — same DOM order as the columns, which is why the
                  status pill sits at the end of the second line rather than
                  opposite the dates. Grouping it with the dates would have
                  meant reordering the grid to match. */}
              <div className="flex items-center gap-3 min-[38rem]:contents">
                <span className="data text-[0.8125rem] text-body min-[38rem]:text-right">
                  {t("days", { count: s.days })}
                </span>
                <span className="data text-[0.8125rem] text-ink min-[38rem]:text-right">
                  {formatEuro(price, locale)} €
                </span>
                <span
                  className={`data ml-auto whitespace-nowrap rounded-full px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.08em] min-[38rem]:justify-self-end ${PILL[s.status]}`}
                >
                  {t(`status.${s.status}` as "status.inStay")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[16rem] flex-1 text-[0.78125rem] leading-[1.5] text-muted">
          {vacancySentence(occupancy, price, locale, t)}
        </p>
        {/* A real link, not a disabled promise: the calendar it points at is
            on this page and works. */}
        <a
          href="#sec-availability"
          className="flex h-9 items-center gap-2 rounded-(--radius-control) border border-line bg-surface px-3.5 text-[0.8125rem] font-semibold text-ink transition-colors duration-(--dur-standard) hover:bg-surface-2"
        >
          <CalendarPlus size={15} strokeWidth={2} aria-hidden />
          {t("blockCta")}
        </a>
      </div>

      <p className="text-xs leading-[1.45] text-muted">{t("footnote")}</p>
    </SectionCard>
  );
}

function Head({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <span
      className={`data text-[0.625rem] tracking-[0.1em] text-muted ${
        align === "right" ? "text-right" : ""
      } ${className}`}
    >
      {children}
    </span>
  );
}

function dates(s: Stay, locale: string, months: ShortMonths): string {
  const fmt = (d: Date) => shortDate(d, months, { locale, day: true });
  const at = (iso: string) => new Date(`${iso}T12:00:00`);
  const endInclusive = new Date(at(s.end).getTime() - 86_400_000);
  return `${fmt(at(s.start))} – ${fmt(endInclusive)} ${endInclusive.getFullYear()}`;
}

// The number the table is really about: what the open months are worth. Priced
// at the headline rate, which is a 30-day month (ADR-023).
function vacancySentence(
  occupancy: Occupancy,
  price: number,
  locale: string,
  t: ReturnType<typeof useTranslations<"host.manage.stays">>,
): string {
  if (occupancy.open === 0) return t("vacancyFull");
  if (!occupancy.next) return t("vacancyFull");
  return t("vacancyGap", {
    count: occupancy.next.months,
    from: new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      month: "long",
      year: "numeric",
    }).format(occupancy.next.from),
    amount: formatEuro(occupancy.next.months * price, locale),
  });
}
