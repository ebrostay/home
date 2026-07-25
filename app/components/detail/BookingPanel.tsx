"use client";

import { useMemo, useState } from "react";
import { Info, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PropertyDetail } from "@/lib/api";
import { stayFits } from "@/lib/availability";
import { addMonths, computeEstimate, formatEuro } from "@/lib/pricing";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";

// Contact channels are v1's, carried over verbatim from docs/spec/06a
// (`wa.me/34678715418`, `mailto:info@ebrostay.com`). Booking is still the
// MVP request flow: no payment, no DB row — the message IS the request.
const WHATSAPP_NUMBER = "34678715418";
const CONTACT_EMAIL = "info@ebrostay.com";

const MIN_MONTHS = 1;
// ADR-022 caps a stay at < 365 days. Twelve calendar months is 365 days on the
// nose (366 over a leap day), so 12 can never validate here — the real ceiling
// on a whole-month stepper is 11. The search page still offers a coarse "up to
// 12 months" because that filter never has to resolve to a legal date range.
const MAX_MONTHS = 11;

export function BookingPanel({
  property: p,
  locale,
  booked,
}: {
  property: PropertyDetail;
  locale: string;
  booked: DateRange[];
}) {
  const t = useTranslations("detail.booking");
  const tc = useTranslations("estimate");

  // The listing may cap the stay tighter than the law does.
  const maxMonths = clamp(p.maxStayMonths || MAX_MONTHS, MIN_MONTHS, MAX_MONTHS);
  const [moveIn, setMoveIn] = useState(() => firstSelectableDay(p));
  const [months, setMonths] = useState(
    clamp(p.minStayMonths || MIN_MONTHS, MIN_MONTHS, maxMonths),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // Length is still what the panel bills on (whole months, docs/spec/05 §5.1),
  // but the calendar is now the only thing that sets it: picking a range
  // back-fills `months`, and the departure date is that many months on. The
  // move-out cell therefore shows the billed date, which is the range the
  // request message carries.
  const moveOut = addMonths(moveIn, months);

  const estimate = useMemo(
    () => computeEstimate(moveIn, moveOut, p.priceNumber, p.depositAmount),
    [moveIn, moveOut, p.priceNumber, p.depositAmount],
  );

  const available = useMemo(
    () => stayFits(moveIn, moveOut, p.availability, p.availableFrom),
    [moveIn, moveOut, p.availability, p.availableFrom],
  );

  const eur = (v: number) => `${formatEuro(v, locale)} €`;
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${iso}T00:00:00`));

  const blocked = !available || estimate.tooShort || estimate.tooLong;

  const summary = t("requestSummary", {
    name: p.name,
    from: fmtDate(moveIn),
    to: fmtDate(moveOut),
    months: estimate.months,
    total: eur(estimate.total),
  });
  const emailBody = [
    t("emailGreeting"),
    "",
    `${t("home")}: ${p.name}`,
    `${t("moveIn")}: ${fmtDate(moveIn)}`,
    `${t("moveOut")}: ${fmtDate(moveOut)}`,
    `${tc("rent")}: ${eur(estimate.rent)}`,
    `${t("commission")}: ${eur(estimate.commission)}`,
    `${tc("deposit")}: ${eur(estimate.deposit)}`,
    `${tc("total")}: ${eur(estimate.total)}`,
    "",
    `${t("tenantNames")}: `,
    "",
    t("emailSignoff"),
  ].join("\n");

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`;
  const mailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    t("emailSubject", { name: p.name }),
  )}&body=${encodeURIComponent(emailBody)}`;

  return (
    <aside className="lg:sticky lg:top-[calc(var(--header-h)+20px)] lg:self-start">
      <div className="rounded-(--radius-card) border border-line bg-surface p-5 shadow-(--shadow-pop) sm:p-6">
        <p className="flex items-baseline gap-1.5">
          <span className="data text-[1.625rem] font-semibold text-ink">
            {eur(p.priceNumber)}
          </span>
          <span className="text-sm text-muted">/ {t("month")}</span>
        </p>

        {/* Dates */}
        <div className="relative mt-5">
          <div className="grid grid-cols-2 overflow-hidden rounded-(--radius-control) border border-line">
            <DateCell
              label={t("moveIn")}
              value={fmtDate(moveIn)}
              onClick={() => setPickerOpen((o) => !o)}
              className="border-r border-line"
            />
            <DateCell
              label={t("moveOut")}
              value={fmtDate(moveOut)}
              onClick={() => setPickerOpen((o) => !o)}
            />
          </div>

          {pickerOpen && (
            <>
              <button
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setPickerOpen(false)}
              />
              {/* The calendar is where day-level truth lives: booked days come
                  back struck out, which a pair of plain date inputs cannot show. */}
              <div className="absolute left-0 right-0 z-50 mt-2 overflow-x-auto rounded-(--radius-card) border border-line bg-surface p-3 shadow-(--shadow-pop)">
                <DateRangePicker
                  value={{
                    from: new Date(`${moveIn}T00:00:00`),
                    to: new Date(`${moveOut}T00:00:00`),
                  }}
                  onChange={(range) => {
                    if (!range?.from) return;
                    const from = toIso(range.from);
                    setMoveIn(from);
                    if (range.to) {
                      const picked = monthsBetween(from, toIso(range.to));
                      setMonths(clamp(picked, MIN_MONTHS, maxMonths));
                      setPickerOpen(false);
                    }
                  }}
                  booked={booked}
                  numberOfMonths={1}
                />
              </div>
            </>
          )}
        </div>

        {/* Cost breakdown */}
        <dl className="mt-5 border-t border-line text-sm">
          <Row label={t("stay")}>
            <span className="data">
              {fmtDate(moveIn)} → {fmtDate(moveOut)}
            </span>
          </Row>
          <Row
            label={tc("months", {
              count: estimate.months,
              price: formatEuro(p.priceNumber, locale),
            })}
          >
            {eur(estimate.rent)}
          </Row>
          <Row label={t("commission")}>{eur(estimate.commission)}</Row>
          {estimate.commissionDiscount > 0 && (
            <Row label={tc("commissionCap")} tone="brand">
              −{eur(estimate.commissionDiscount)}
            </Row>
          )}
          <Row label={t("depositRefundable")}>{eur(estimate.deposit)}</Row>
          <div className="flex items-baseline justify-between gap-4 border-t border-line py-3">
            <dt className="text-[1.0625rem] font-semibold text-ink">
              {tc("total")}
            </dt>
            <dd className="data text-[1.0625rem] font-semibold text-ink">
              {eur(estimate.total)}
            </dd>
          </div>
        </dl>

        {blocked && (
          <p className="mt-3 rounded-(--radius-control) bg-warn-soft p-3 text-sm text-warn">
            {estimate.tooShort
              ? tc("tooShort")
              : estimate.tooLong
                ? tc("tooLong")
                : t("unavailable")}
          </p>
        )}

        {/* VAT hint */}
        <div className="mt-4 flex gap-2.5 rounded-(--radius-control) bg-surface-2 p-3">
          <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-body">{t("vatHint")}</p>
        </div>

        {/* CTAs */}
        <div className="mt-4 flex flex-col gap-2">
          <a
            href={blocked ? undefined : waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={blocked}
            className={`flex items-center justify-center gap-2 rounded-(--radius-control) px-4 py-3 text-sm font-semibold transition-colors duration-(--dur-standard) ${
              blocked
                ? "pointer-events-none bg-brand/45 text-white"
                : "bg-brand text-white hover:bg-brand-strong"
            }`}
          >
            <WhatsAppGlyph />
            {t("requestWhatsApp")}
          </a>
          <a
            href={blocked ? undefined : mailHref}
            aria-disabled={blocked}
            className={`flex items-center justify-center gap-2 rounded-(--radius-control) border border-line px-4 py-3 text-sm font-semibold transition-colors duration-(--dur-standard) ${
              blocked
                ? "pointer-events-none text-muted"
                : "text-ink hover:bg-surface-2"
            }`}
          >
            <Mail size={16} strokeWidth={2} aria-hidden />
            {t("requestEmail")}
          </a>
        </div>

        <p className="mt-3 text-center text-[0.6875rem] leading-relaxed text-muted">
          {t("reassurance")}
        </p>
      </div>
    </aside>
  );
}

function DateCell({
  label,
  value,
  onClick,
  className = "",
}: {
  label: string;
  value: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-0.5 px-3 py-2.5 text-left transition-colors duration-(--dur-standard) hover:bg-surface-2 ${className}`}
    >
      <span className="data text-[0.625rem] uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span className="data text-sm font-semibold text-ink">{value}</span>
    </button>
  );
}

function Row({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "brand";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
      <dt className={tone === "brand" ? "text-brand-strong" : "text-body"}>
        {label}
      </dt>
      <dd
        className={`data shrink-0 ${tone === "brand" ? "text-brand-strong" : "text-ink"}`}
      >
        {children}
      </dd>
    </div>
  );
}

function WhatsAppGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Zm4.4-5.8c-.2-.1-1.4-.7-1.7-.8s-.4-.1-.5.1-.6.8-.7 1-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.6-1.2.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3A3 3 0 0 0 7 9.6c0 1.2.9 2.4 1 2.6a10 10 0 0 0 3.9 3.4c1.4.6 2 .700 2.7.6a2.3 2.3 0 0 0 1.6-1.1 1.9 1.9 0 0 0 .1-1.1c0-.1-.2-.2-.4-.3Z" />
    </svg>
  );
}

// --- date helpers -------------------------------------------------------
function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// Whole months from a picked range, rounded to the nearest month boundary —
// the panel only ever bills whole months (docs/spec/05 §5.1).
function monthsBetween(start: string, end: string): number {
  let n = 1;
  while (n < MAX_MONTHS && addMonths(start, n) < end) n++;
  return n;
}

// Open on the first day the home can actually be taken, not on today, so the
// default selection is one a visitor could really book.
function firstSelectableDay(p: PropertyDetail): string {
  const today = toIso(new Date());
  return p.availableFrom && p.availableFrom > today ? p.availableFrom : today;
}
