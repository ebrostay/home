"use client";

// Manage one property — the owner's weekly working view.
// URL: /{locale}/host/manage?id={slug}, matching the query-param model the
// public detail page uses (static export has no dynamic segments).
//
// The split from the listing editor is deliberate and load-bearing: this page
// holds what an owner touches weekly — money, occupancy, price, the calendar —
// and the editor holds what changes once a year. ADR-025 is the same split in
// the API: everything editable here applies live and keeps the home in search.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useShortMonths } from "@/i18n/dates";
import { shortDate, type ShortMonths } from "@/lib/dates";
import {
  ApiError,
  biText,
  fetchHostProperty,
  fetchProperties,
  saveHostAvailability,
  saveHostPricing,
  type HostPropertyDetail,
  type HostRange,
  type PropertySummary,
} from "@/lib/api";
import {
  SECTIONS,
  bandOf,
  blocksDirty,
  isOwnerBlock,
  occupancyOf,
  payoutRows,
  payoutThisMonth,
  priceBandFor,
  pricingDirty,
  staysOf,
  type SectionKey,
} from "@/lib/manage";
import { formatEuro } from "@/lib/pricing";
import { LedgerStrip, type LedgerCell } from "@/components/host/LedgerStrip";
import { RequireOwner } from "@/components/host/RequireOwner";
import { ContextBar } from "@/components/host/manage/ContextBar";
import { SectionNav } from "@/components/host/SectionNav";
import { StaysSection } from "@/components/host/manage/StaysSection";
import {
  PricingSection,
  type SaveState,
} from "@/components/host/manage/PricingSection";
import { AvailabilitySection } from "@/components/host/manage/AvailabilitySection";
import { BillingSection } from "@/components/host/manage/BillingSection";
import { PerformanceSection } from "@/components/host/manage/PerformanceSection";
import type { PricingValue } from "@/components/host/fields/PricingFields";
import { Button } from "@/components/ui/Button";

type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "missing" }
  | { kind: "error" }
  // `now` travels with the data rather than being read during render: this
  // page is prerendered at build time, and a clock in the render path would
  // disagree with that HTML on hydration.
  | {
      kind: "ready";
      detail: HostPropertyDetail;
      published: PropertySummary[];
      now: Date;
    };

export default function ManagePage() {
  return (
    <RequireOwner>
      <Suspense fallback={<Skeleton />}>
        <ManageContent />
      </Suspense>
    </RequireOwner>
  );
}

function ManageContent() {
  const t = useTranslations("host");
  const tm = useTranslations("host.manage");
  const locale = useLocale();
  const months = useShortMonths();
  const id = useSearchParams().get("id") ?? "";

  const [state, setState] = useState<State>({ kind: "loading" });
  const [pricing, setPricing] = useState<PricingValue | null>(null);
  const [blocks, setBlocks] = useState<HostRange[] | null>(null);
  const [pricingSave, setPricingSave] = useState<SaveState>("clean");
  const [blocksSave, setBlocksSave] = useState<SaveState>("clean");
  const [errors, setErrors] = useState<{ pricing?: string; blocks?: string }>({});

  useEffect(() => {
    if (!id) {
      setState({ kind: "missing" });
      return;
    }
    let cancelled = false;

    // The comparables feed the rent hint. A failure there costs a sentence,
    // never the page — so it resolves to an empty list rather than rejecting.
    Promise.all([
      fetchHostProperty(id),
      fetchProperties().catch(() => [] as PropertySummary[]),
    ])
      .then(([detail, published]) => {
        if (cancelled) return;
        setState({ kind: "ready", detail, published, now: new Date() });
        setPricing(toValue(detail));
        setBlocks(detail.property.availability.filter(isOwnerBlock));
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err instanceof ApiError ? err.status : 0;
        setState({
          kind: status === 401 ? "signedOut" : status === 404 ? "missing" : "error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const message = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? (err.code ?? "generic") : "generic";
      // Unknown codes fall back rather than rendering a raw key at the owner.
      return tm.has(`error.${code}`) ? tm(`error.${code}` as "error.generic") : tm("error.generic");
    },
    [tm],
  );

  const detail = state.kind === "ready" ? state.detail : null;
  const property = detail?.property ?? null;
  const now = state.kind === "ready" ? state.now : null;

  // Everything below derives from ONE dataset. The calendar the owner is
  // editing — not the saved copy — feeds the band, the stays table, the payout
  // rows and the ledger, so the moment a block is added every figure on the
  // page moves together. Price is the exception: the payout table follows the
  // SAVED price, because a table of money should not flicker per keystroke,
  // and because a confirmed stay keeps the rent it was agreed at (ADR-025).
  const derived = useMemo(() => {
    if (!property || !detail || !now || !blocks) return null;
    const live = { ...property, availability: [...blocks, ...property.availability.filter((r) => !isOwnerBlock(r))] };
    const band = bandOf(live, locale, now);
    const stays = staysOf(live, detail.pricing.priceNumber, now);
    return {
      live,
      band,
      occupancy: occupancyOf(band, now),
      stays,
      rows: payoutRows(stays, detail.pricing.priceNumber),
    };
  }, [property, detail, now, blocks, locale]);

  const band = useMemo(
    () =>
      state.kind === "ready" && property
        ? priceBandFor(state.published, property)
        : null,
    [state, property],
  );

  if (state.kind === "loading") return <Skeleton />;
  if (state.kind !== "ready" || !detail || !property || !now || !pricing || !blocks || !derived) {
    return (
      <Notice
        title={t(state.kind === "signedOut" ? "signedOut.title" : "manage.notFound")}
        body={state.kind === "signedOut" ? t("signedOut.body") : tm("notFoundBody")}
      />
    );
  }

  const holds = property.availability.filter((r) => !isOwnerBlock(r));

  const savePricing = async () => {
    setPricingSave("saving");
    try {
      const next = await saveHostPricing(property.id, pricing);
      setState({ ...state, detail: { ...detail, pricing: next } });
      setPricingSave("saved");
      setErrors((e) => ({ ...e, pricing: undefined }));
    } catch (err) {
      setErrors((e) => ({ ...e, pricing: message(err) }));
      setPricingSave("error");
    }
  };

  const saveBlocks = async () => {
    setBlocksSave("saving");
    try {
      const next = await saveHostAvailability(
        property.id,
        blocks.map((b) => ({ start: b.start, end: b.end, note: b.note })),
      );
      setState({
        ...state,
        detail: { ...detail, property: { ...property, availability: next } },
      });
      setBlocks(next.filter(isOwnerBlock));
      setBlocksSave("saved");
      setErrors((e) => ({ ...e, blocks: undefined }));
    } catch (err) {
      setErrors((e) => ({ ...e, blocks: message(err) }));
      setBlocksSave("error");
    }
  };

  const thisMonth = payoutThisMonth(derived.rows, now);
  const intl = locale === "es" ? "es-ES" : "en-GB";

  const cells: LedgerCell[] = [
    {
      key: "payout",
      label: tm("ledger.payoutLabel"),
      value: thisMonth ? `${formatEuro(thisMonth.payout, locale)} €` : "—",
      note: thisMonth
        ? tm("ledger.payoutNote", {
            date: new Intl.DateTimeFormat(intl, {
              day: "numeric",
              month: "long",
            }).format(thisMonth.paidOn),
            days: thisMonth.days,
          })
        : tm("ledger.payoutNoteEmpty"),
    },
    {
      key: "occupancy",
      label: tm("ledger.occupancyLabel"),
      value: `${derived.occupancy.percent}%`,
      note: tm("ledger.occupancyNote", { open: derived.occupancy.open }),
    },
    {
      key: "vacancy",
      label: tm("ledger.vacancyLabel"),
      value: vacancyValue(
        derived.occupancy.next,
        locale,
        months,
        tm("ledger.vacancyNone"),
      ),
      tone: "text-river-deep",
      note: derived.occupancy.next
        ? tm("ledger.vacancyNote", { count: derived.occupancy.next.months })
        : tm("ledger.vacancyNoneNote"),
    },
  ];

  const labels = Object.fromEntries(
    SECTIONS.map((key) => [key, tm(`nav.${key}` as "nav.stays")]),
  ) as Record<SectionKey, string>;

  return (
    <main
      className="mx-auto flex max-w-7xl flex-col gap-5 px-6 pb-24"
      style={
        {
          // Header + the context bar's MEASURED height — where the section
          // nav parks. The fallbacks are the figures this used to hardcode, so
          // the first paint and the static export are unchanged; both bars
          // overwrite them on mount and whenever they change shape.
          "--section-nav-top": "calc(var(--header-h) + var(--context-bar-h, 3.4375rem))",
          // …and where an anchor has to land to clear all of it, nav included.
          "--section-anchor-top":
            "calc(var(--header-h) + var(--context-bar-h, 3.4375rem) + var(--section-nav-h, 2.625rem) + 0.75rem)",
        } as React.CSSProperties
      }
    >
      <ContextBar property={property} current="manage" />

      <header className="flex flex-wrap items-start gap-5 pt-1">
        {property.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized
          <img
            src={property.coverUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-(--radius-card) object-cover"
          />
        )}
        <div className="min-w-[16rem] flex-1">
          <p className="data text-[0.6875rem] tracking-[0.12em] text-muted">
            {property.reference
              ? tm("eyebrow", { reference: property.reference })
              : tm("eyebrowNoRef")}
          </p>
          <h1 className="mt-1.5 font-display text-[2.125rem] font-bold leading-[1.05] tracking-[-0.015em] text-ink">
            {property.name}
          </h1>
          <p className="mt-2 text-[0.90625rem] leading-normal text-body">
            {[
              property.address,
              biText(property.area, locale),
              tm("bedrooms", { count: property.bedrooms }),
              tm("size", { m2: property.sizeM2 }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      {/* Full-bleed on a phone, exactly as SectionCard is: same -mx-6 against
          this main's px-6, same loss of the side border and radius, so the
          figures and the sections below them start at the same edge instead
          of one being inset and the other not. */}
      <div className="-mx-6 overflow-hidden rounded-none border border-x-0 border-line bg-surface shadow-(--shadow-card) min-[30rem]:mx-0 min-[30rem]:rounded-(--radius-card) min-[30rem]:border-x">
        <LedgerStrip cells={cells} flush />
      </div>

      {/* Bar while it fits, "Sections" when it does not. No status discs:
          this nav answers where you are in a long page, not what you have
          changed — Manage saves per section as you go. */}
      <SectionNav
        sections={SECTIONS}
        labels={labels}
        ariaLabel={tm("nav.label")}
        sheetLabel={tm("nav.label")}
        stickyTop="var(--section-nav-top)"
        spy
      />

      <StaysSection
        stays={derived.stays}
        occupancy={derived.occupancy}
        price={detail.pricing.priceNumber}
        locale={locale}
      />

      <PricingSection
        value={pricing}
        onChange={(next) => {
          setPricing(next);
          setPricingSave(
            pricingDirty(
              {
                ...next,
                maxStayMonths: detail.pricing.maxStayMonths,
                platformCleaningFeeEur: detail.pricing.platformCleaningFeeEur,
              },
              detail.pricing,
            )
              ? "dirty"
              : "clean",
          );
        }}
        saved={detail.pricing}
        state={pricingSave}
        errorText={errors.pricing}
        onSave={savePricing}
        onDiscard={() => {
          setPricing(toValue(detail));
          setPricingSave("clean");
        }}
        band={band}
        locale={locale}
      />

      <AvailabilitySection
        blocks={blocks}
        holds={holds}
        availableFrom={property.availableFrom}
        // From the FORM, not the saved value: raising the turnaround should
        // shut the extra days on the calendar before you commit to it.
        turnoverDays={pricing.turnoverDays}
        onChange={(next) => {
          setBlocks(next);
          setBlocksSave(blocksDirty(next, property.availability) ? "dirty" : "clean");
        }}
        state={blocksSave}
        errorText={errors.blocks}
        onSave={saveBlocks}
        onDiscard={() => {
          setBlocks(property.availability.filter(isOwnerBlock));
          setBlocksSave("clean");
        }}
        locale={locale}
        now={now}
      />

      <BillingSection rows={derived.rows} locale={locale} now={now} />

      <PerformanceSection
        requests={detail.requests}
        stays={derived.stays}
        occupancy={derived.occupancy}
      />
    </main>
  );
}

const toValue = (d: HostPropertyDetail): PricingValue => ({
  priceNumber: d.pricing.priceNumber,
  depositAmount: d.pricing.depositAmount,
  billsPolicy: d.pricing.billsPolicy,
  utilitiesCapEur: d.pricing.utilitiesCapEur,
  minStayMonths: d.pricing.minStayMonths,
  cleaningBy: d.pricing.cleaningBy,
  cleaningFeeEur: d.pricing.cleaningFeeEur,
  turnoverDays: d.pricing.turnoverDays,
});

/** "OCT 2026" for a single month, "OCT–NOV 2026" for a run. */
function vacancyValue(
  next: { from: Date; months: number } | null,
  locale: string,
  months: ShortMonths,
  none: string,
): string {
  if (!next) return none;
  const last = new Date(next.from.getFullYear(), next.from.getMonth() + next.months - 1, 1, 12);
  const clean = (s: string) => s.replace(/\./g, "").toUpperCase();
  return next.months === 1
    ? clean(shortDate(next.from, months, { locale, year: true }))
    : `${clean(shortDate(next.from, months, { locale }))}–${clean(shortDate(last, months, { locale, year: true }))}`;
}

function Skeleton() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 px-6 pb-24 pt-6">
      <div className="skeleton h-14 rounded-(--radius-card)" />
      <div className="skeleton h-[7.5rem] rounded-(--radius-card)" />
      <div className="skeleton h-64 rounded-(--radius-card)" />
      <div className="skeleton h-64 rounded-(--radius-card)" />
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  const t = useTranslations("host");
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <section className="flex flex-col items-start gap-3 rounded-(--radius-card) border border-line bg-surface px-6 py-10 shadow-(--shadow-card)">
        <h1 className="font-display text-lg font-semibold text-ink">{title}</h1>
        <p className="max-w-[60ch] text-sm text-body">{body}</p>
        <Button variant="secondary" onClick={() => window.history.back()}>
          {t("manage.back")}
        </Button>
      </section>
    </main>
  );
}
