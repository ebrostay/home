"use client";

// Internal style book — the living reference for the v2 identity.
// Not linked from navigation; ships harmlessly (noindex via robots later).

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import {
  MonthBandDemo,
  AvailabilityBand,
  type MonthState,
} from "@/components/MonthBand";
import { PropertyCard, type PropertyCardData } from "@/components/PropertyCard";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";

const swatches = [
  { name: "brand / bridge", varName: "--brand" },
  { name: "river", varName: "--river" },
  { name: "river-soft", varName: "--river-soft" },
  { name: "ink", varName: "--ink" },
  { name: "surface", varName: "--surface" },
  { name: "page / limestone", varName: "--page" },
];

function sampleMonths(
  locale: string,
  occupied: number[],
  partial: number[] = [],
): PropertyCardData["months"] {
  const fmt = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    month: "narrow",
  });
  const now = new Date(2026, 6, 1);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const state: MonthState = occupied.includes(i)
      ? "occupied"
      : partial.includes(i)
        ? "partial"
        : "open";
    return { label: fmt.format(d), state };
  });
}

export default function DesignPage() {
  const t = useTranslations("design");
  const ts = useTranslations("status");
  const ta = useTranslations("actions");
  const tf = useTranslations("filters");
  const tt = useTranslations("type");
  const locale = useLocale();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [propertyType, setPropertyType] = useState("all");
  const [stayRange, setStayRange] = useState<DateRange | undefined>({
    from: new Date(2026, 7, 10),
    to: new Date(2026, 8, 18),
  });
  // Two booked spans the picker must refuse (styled occupied + struck).
  const bookedSpans = [
    { from: new Date(2026, 7, 1), to: new Date(2026, 7, 6) },
    { from: new Date(2026, 8, 21), to: new Date(2026, 8, 27) },
  ];

  const sampleProperties: PropertyCardData[] = [
    {
      id: "sample-1",
      name: "Piso Movera I",
      area: "Movera",
      photoUrl: "/brand/sample-home-1.jpg",
      pricePerMonth: 1350,
      bedrooms: 2,
      bathrooms: 1,
      sizeSqm: 78,
      verified: true,
      billsIncluded: true,
      months: sampleMonths(locale, [0, 1], [2]),
    },
    {
      id: "sample-2",
      name: "Piso Movera II",
      area: "Movera",
      photoUrl: "/brand/sample-home-2.jpg",
      pricePerMonth: 1550,
      bedrooms: 3,
      bathrooms: 2,
      sizeSqm: 96,
      verified: true,
      months: sampleMonths(locale, [4], [5]),
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="data text-xs uppercase tracking-[0.16em] text-muted">
        Ebrostay v2
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold text-ink">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-xl">{t("intro")}</p>

      {/* Palette */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("palette")}</span></div>
        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {swatches.map((s) => (
            <div key={s.varName}>
              <div
                className="h-16 rounded-(--radius-control) border border-line"
                style={{ background: `var(${s.varName})` }}
              />
              <p className="data mt-1.5 text-[0.6875rem] text-muted">{s.name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("type")}</span></div>
        <div className="mt-6 space-y-4">
          <p className="font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
            {t("displaySample")}
          </p>
          <p className="max-w-2xl text-base">{t("bodySample")}</p>
          <p className="data text-sm text-ink">{t("dataSample")}</p>
        </div>
      </section>

      {/* Buttons */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("buttons")}</span></div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button>{ta("book")}</Button>
          <Button variant="secondary">{ta("save")}</Button>
          <Button variant="ghost">{ta("cancel")}</Button>
          <Button variant="danger">{ts("rejected")}</Button>
          <Button disabled>{ta("book")}</Button>
          <Button size="lg">{ta("search")}</Button>
          <Button size="sm" variant="secondary">{ta("close")}</Button>
        </div>
      </section>

      {/* Forms */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("forms")}</span></div>
        <div className="mt-6 grid max-w-2xl gap-5 sm:grid-cols-2">
          <Field label="Email" hint="info@ebrostay.com">
            {(id, describedBy) => (
              <Input id={id} aria-describedby={describedBy} placeholder="nombre@empresa.com" />
            )}
          </Field>
          <Field label={tf("city")}>
            {(id) => (
              <Select
                id={id}
                value="zaragoza"
                options={[{ value: "zaragoza", label: "Zaragoza" }]}
              />
            )}
          </Field>
          <Field label={tf("type")}>
            {(id) => (
              <Select
                id={id}
                value={propertyType}
                onChange={setPropertyType}
                options={["all", "apartment", "room", "home"].map((v) => ({
                  value: v,
                  label: tt(v),
                }))}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Mensaje" error="Este campo es obligatorio">
              {(id, describedBy) => (
                <Textarea id={id} aria-describedby={describedBy} aria-invalid />
              )}
            </Field>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("badges")}</span></div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge tone="brand">{ts("published")}</Badge>
          <Badge tone="warn">{ts("pendingReview")}</Badge>
          <Badge tone="neutral">{ts("draft")}</Badge>
          <Badge tone="danger">{ts("rejected")}</Badge>
          <Badge tone="river">{ts("occupied")}</Badge>
        </div>
      </section>

      {/* Month band */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("monthBand")}</span></div>
        <div className="mt-6 max-w-xl space-y-8">
          <MonthBandDemo />
          <AvailabilityBand months={sampleMonths(locale, [0, 1], [2, 7])} />
        </div>
      </section>

      {/* Calendar */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("calendar")}</span></div>
        <p className="mt-4 max-w-xl text-sm text-muted">{t("calendarHint")}</p>
        <div className="mt-4 inline-block rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)">
          <DateRangePicker
            value={stayRange}
            onChange={setStayRange}
            booked={bookedSpans}
            numberOfMonths={2}
            startMonth={new Date(2026, 7, 1)}
          />
        </div>
      </section>

      {/* Loading states */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("loading")}</span></div>
        <div className="mt-6 max-w-sm overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)">
          <div className="skeleton aspect-[4/3] rounded-none" />
          <div className="space-y-2.5 p-4">
            <div className="flex justify-between gap-3">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-4 w-16" />
            </div>
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-3 w-40" />
          </div>
        </div>
      </section>

      {/* Cards */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("cards")}</span></div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:max-w-3xl">
          {sampleProperties.map((p) => (
            <PropertyCard key={p.id} property={p} locale={locale} />
          ))}
        </div>
      </section>

      {/* Dialog */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("dialog")}</span></div>
        <div className="mt-6">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            {t("openDialog")}
          </Button>
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title={t("dialogTitle")}
          >
            <p className="text-sm">{t("dialogBody")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                {ta("cancel")}
              </Button>
              <Button onClick={() => setDialogOpen(false)}>{ta("book")}</Button>
            </div>
          </Dialog>
        </div>
      </section>
    </main>
  );
}
