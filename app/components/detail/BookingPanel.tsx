"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, LogIn, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useShortMonths } from "@/i18n/dates";
import { useAuth } from "@/components/site/AuthProvider";
import { signInPath } from "@/lib/auth";
import { shortDate } from "@/lib/dates";
import type { PropertyDetail } from "@/lib/api";
import { stayFits } from "@/lib/availability";
import {
  addMonths,
  computeEstimate,
  dailyRate,
  formatEuro,
  paymentSchedule,
} from "@/lib/pricing";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { SplitDateRangeField } from "@/components/ui/SplitDateRangeField";

// Contact channels are v1's, carried over verbatim (docs/spec/08-carried-v1-rules.md §8.3)
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
  searched,
}: {
  property: PropertyDetail;
  locale: string;
  booked: DateRange[];
  // The stay the visitor searched for, carried from the results page. Taken as
  // given, not fitted to this home: if it clashes with a booking or breaks a
  // limit, the panel already says so and blocks the request — more use than
  // quietly opening on dates they didn't ask for.
  searched?: { moveIn: string; moveOut: string };
}) {
  const t = useTranslations("detail.booking");
  const months = useShortMonths();
  const tc = useTranslations("estimate");
  const { me, loading } = useAuth();

  // Where the login sends them back to: this exact URL, dates and all. The
  // sign-in page takes `redirect` verbatim (see sign-in/Choices.tsx), so it
  // has to carry the locale prefix. Built from the router's own view of the
  // URL rather than `currentPath()` — this runs during render, and a
  // `window` read there would differ between the prerendered HTML and the
  // first client frame.
  const query = useSearchParams().toString();
  const signInHref = signInPath(
    `/${locale}${usePathname()}${query ? `?${query}` : ""}`,
  );

  // The listing may cap the stay tighter than the law does.
  const maxMonths = clamp(p.maxStayMonths || MAX_MONTHS, MIN_MONTHS, MAX_MONTHS);
  const [moveIn, setMoveIn] = useState(
    () => searched?.moveIn ?? firstSelectableDay(p),
  );
  // The two dates are the state; everything billed is derived from the day
  // count between them (ADR-023). Absent a searched stay, open on the listing's
  // own minimum so the first estimate shown is one it accepts.
  const [moveOut, setMoveOut] = useState(
    () =>
      searched?.moveOut ??
      addMonths(
        firstSelectableDay(p),
        clamp(p.minStayMonths || MIN_MONTHS, MIN_MONTHS, maxMonths),
      ),
  );

  const estimate = useMemo(
    () =>
      computeEstimate(
        moveIn,
        moveOut,
        p.priceNumber,
        p.depositAmount,
        p.cleaningFeeEur,
      ),
    [moveIn, moveOut, p.priceNumber, p.depositAmount, p.cleaningFeeEur],
  );

  const available = useMemo(
    () => stayFits(moveIn, moveOut, p.availability, p.availableFrom),
    [moveIn, moveOut, p.availability, p.availableFrom],
  );

  const eur = (v: number) => `${formatEuro(v, locale)} €`;
  const fmtDate = (iso: string) =>
    shortDate(new Date(`${iso}T00:00:00`), months, {
      locale,
      day: true,
      year: true,
    });

  const blocked = !available || estimate.tooShort || estimate.tooLong;

  const schedule = useMemo(
    () =>
      paymentSchedule(
        moveIn,
        moveOut,
        p.priceNumber,
        p.depositAmount,
        estimate.commission,
        p.cleaningFeeEur,
      ),
    [
      moveIn,
      moveOut,
      p.priceNumber,
      p.depositAmount,
      estimate.commission,
      p.cleaningFeeEur,
    ],
  );

  // Instalment dates: day + month is enough inside a schedule whose year the
  // stay row above already establishes.
  const fmtDay = (iso: string) =>
    shortDate(new Date(`${iso}T00:00:00`), months, { locale, day: true });

  const summary = t("requestSummary", {
    name: p.name,
    from: fmtDate(moveIn),
    to: fmtDate(moveOut),
    days: estimate.days,
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
    ...(estimate.cleaningFee > 0
      ? [`${t("cleaningFee")}: ${eur(estimate.cleaningFee)}`]
      : []),
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
        {/* The headline is a 30-DAY price, and says so: rent is billed by the
            day (ADR-023), so an unqualified "/ month" would be the one number
            on the page that isn't what you pay. */}
        <p className="flex items-baseline gap-1.5">
          <span className="data text-[1.625rem] font-semibold text-ink">
            {eur(p.priceNumber)}
          </span>
          <span className="text-sm text-muted">/ {t("thirtyDays")}</span>
        </p>
        <p className="data mt-1 text-xs text-muted">
          {t("perDay", { rate: eur(dailyRate(p.priceNumber)) })}
        </p>

        {/* Dates — the same split control the search bar uses, so arriving here
            from a search is the same gesture twice. It carries the booked days,
            which is why this page has a calendar at all rather than two plain
            date fields. Anchored to the right edge: the panel is a narrow
            right-hand column and the popover is two calendars wide. */}
        <div className="mt-5">
          <SplitDateRangeField
            variant="boxed"
            align="end"
            moveInLabel={t("moveIn")}
            moveOutLabel={t("moveOut")}
            value={{ moveIn: fromIso(moveIn), moveOut: fromIso(moveOut) }}
            onChange={(next) => {
              if (next.moveIn) setMoveIn(toIso(next.moveIn));
              if (next.moveOut) setMoveOut(toIso(next.moveOut));
            }}
            booked={booked}
            maxMoveOut={fromIso(addMonths(moveIn, maxMonths))}
          />
        </div>

        {/* Cost breakdown */}
        <dl className="mt-5 border-t border-line text-sm">
          <Row label={t("stay")}>
            <span className="data">
              {fmtDate(moveIn)} → {fmtDate(moveOut)}
            </span>
          </Row>
          <Row
            label={tc("days", {
              count: estimate.days,
              rate: formatEuro(estimate.rate, locale),
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
          {estimate.cleaningFee > 0 && (
            <Row label={t("cleaningFee")}>{eur(estimate.cleaningFee)}</Row>
          )}
          <div className="flex items-baseline justify-between gap-4 border-t border-line py-3">
            <dt className="text-[1.0625rem] font-semibold text-ink">
              {tc("total")}
            </dt>
            <dd className="data text-[1.0625rem] font-semibold text-ink">
              {eur(estimate.total)}
            </dd>
          </div>
        </dl>

        {/* When you pay it. Rent is billed by the day but COLLECTED by the
            calendar month, so the first instalment is short and so is the last;
            showing that up front is the point — it is the part of the model a
            visitor cannot infer from a total. Hidden while the dates are
            invalid, where a schedule would only dress up a number we are
            already telling them not to trust. */}
        {!blocked && schedule.length > 0 && (
          <details className="group mt-4 rounded-(--radius-control) border border-line">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-semibold text-ink">
              {t("schedule.title")}
              <ChevronDown
                size={16}
                strokeWidth={2}
                className="shrink-0 text-muted transition-transform duration-(--dur-standard) group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="border-t border-line px-3.5 pb-3 pt-2.5">
              <ol className="flex flex-col gap-2.5">
                {schedule.map((i, n) => (
                  <li key={i.from} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[0.8125rem] text-body">
                        {n === 0
                          ? t("schedule.atMoveIn")
                          : t("schedule.onDate", { date: fmtDay(i.from) })}
                      </span>
                      <span className="data block text-[0.6875rem] text-muted">
                        {t("schedule.covers", {
                          days: i.days,
                          from: fmtDay(i.from),
                          to: fmtDay(i.to),
                        })}
                        {n === 0 && (i.deposit || i.commission)
                          ? ` · ${t("schedule.plusUpfront")}`
                          : ""}
                      </span>
                    </span>
                    <span className="data shrink-0 text-sm font-semibold text-ink">
                      {eur(i.total)}
                    </span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
                  <span className="min-w-0">
                    <span className="block text-[0.8125rem] text-body">
                      {t("schedule.atMoveOut")}
                    </span>
                    <span className="block text-[0.6875rem] leading-relaxed text-muted">
                      {t("schedule.finalBill")}
                    </span>
                  </span>
                </li>
              </ol>
              <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted">
                {t("schedule.note")}
              </p>
            </div>
          </details>
        )}

        {blocked && (
          <p className="mt-3 rounded-(--radius-control) bg-warn-soft p-3 text-sm text-warn">
            {estimate.tooShort
              ? tc("tooShort")
              : estimate.tooLong
                ? tc("tooLong")
                : t("unavailable")}
          </p>
        )}

        {/* The VAT hint that used to sit here was pulled on 2026-08-01. It
            explained why we ask for every tenant's name — a control this
            panel never built (R-Prop-9's `≥1 tenant name` gate is still
            unimplemented; the draft carries a blank names line and nothing
            collects it). It was design copy from the rebuild, backed by no
            ADR, and its second half described a reverse charge that does not
            obviously apply to a Spanish landlord invoicing a Spanish company.
            It comes back WITH the field, and not before someone who does tax
            for a living has read it. See §4.3 of the spec. */}

        {/* CTAs — login-gated, which is ADR-015: the widget is visible to
            everyone, actionable only signed in. Everything above this point
            is the estimate, and the estimate is the reason to visit; only the
            two channels that put a real message in front of the operator are
            behind the door.

            The gate is a courtesy, not a boundary: both hrefs are a mailto:
            and a wa.me link that anyone could type by hand. What it buys is
            the identity ADR-015 wants on a request, and it is the client half
            of the flow whose server half is POST /api/booking-requests. */}
        <div className="mt-4 flex flex-col gap-2">
          {loading ? (
            // One bar, the signed-out face's exact geometry — not the
            // signed-in one. This is the frame a stranger paints: the page is
            // prerendered at build time, where nobody is signed in yet (same
            // reasoning as ADR-037), and most people who open a listing are
            // signed out. Matching the common outcome means the panel settles
            // without moving for almost everyone; a signed-in visitor gets a
            // grow, which costs nothing at the bottom of the card.
            <div className="skeleton h-[2.875rem] rounded-(--radius-control)" />
          ) : me.authenticated ? (
            <>
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
            </>
          ) : (
            // No explanatory line above it: signing in to send a request is
            // what a visitor already expects, and a sentence defending an
            // ordinary step draws more attention to it than the step deserves.
            //
            // Deliberately NOT disabled by `blocked` either. Bad dates are a
            // reason to fix the dates, not a reason to withhold the login —
            // and they come straight back here to fix them.
            <Link
              href={signInHref}
              className="flex items-center justify-center gap-2 rounded-(--radius-control) bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong"
            >
              <LogIn size={16} strokeWidth={2} aria-hidden />
              {t("signInToRequest")}
            </Link>
          )}
        </div>

        {/* Answers "what happens when I press that?" — so it belongs to the
            request buttons, not to the sign-in door. Signed out there is
            nothing yet to reassure anybody about, and a cancellation policy
            quoted before the request exists is noise in front of the one
            action on offer. It reappears with the buttons it describes. */}
        {me.authenticated && (
          <p className="mt-3 text-center text-[0.6875rem] leading-relaxed text-muted">
            {t("reassurance")}
          </p>
        )}
      </div>
    </aside>
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
// The panel works in "YYYY-MM-DD" (what the API, pricing and availability all
// speak); the calendar works in Date. These two are the only crossing points.
function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Noon, not midnight: a local-midnight Date can land on the previous day once
// react-day-picker compares it across a DST boundary.
function fromIso(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// Open on the first day the home can actually be taken, not on today, so the
// default selection is one a visitor could really book.
function firstSelectableDay(p: PropertyDetail): string {
  const today = toIso(new Date());
  return p.availableFrom && p.availableFrom > today ? p.availableFrom : today;
}
