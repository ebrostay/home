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
import { DateRangeField } from "@/components/ui/DateRangeField";
import {
  SplitDateRangeField,
  type SplitRange,
} from "@/components/ui/SplitDateRangeField";
import { BudgetBand } from "@/components/search/BudgetBand";
import { BudgetCurve } from "@/components/search/BudgetCurve";
import { BudgetTiers } from "@/components/search/BudgetTiers";
import { RichTextEditor } from "@/components/host/fields/RichTextEditor";
import { PhotoPicker } from "@/components/host/fields/PhotoPicker";
import { PlacePicker } from "@/components/host/fields/PlacePicker";
import { RichText } from "@/components/ui/RichText";
import { FancyboxMosaic } from "@/components/detail/FancyboxMosaic";
import { paragraphDoc, type RichNode } from "@/lib/rich-text";
import type { HostPhoto, HostNearbyEntry, PropertyPhoto } from "@/lib/api";

// A plausible Zaragoza mid-term market (26 homes): the four real listings are
// too few to show what these controls do at a normal catalogue size.
const SAMPLE_PRICES = [
  520, 560, 620, 680, 700, 740, 780, 800, 850, 850, 890, 900, 950, 950, 990,
  1050, 1100, 1150, 1200, 1250, 1350, 1450, 1600, 1750, 1950, 2200,
];

// Columns-vs-marks exhibit: the same prices drawn both ways at the same
// ceiling, so the threshold is an argument you can look at rather than take on
// trust. Each case is picked to show a different part of the trade.
// Label keys are spelled out rather than built from the case id: a template
// literal needs a cast to satisfy next-intl's key type, and that cast is what
// let a missing translation reach the browser instead of the compiler.
const BUDGET_CASES = [
  { key: "case1", label: "budget_case1", prices: [950, 980, 1350, 1350] },
  { key: "case2", label: "budget_case2", prices: [1200, 1210, 1220, 1230] },
  {
    key: "case3",
    label: "budget_case3",
    prices: [700, 750, 800, 820, 850, 900, 950, 1000, 1100, 1200, 1400, 1600],
  },
] as const;

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
    month: "short",
  });
  const now = new Date(2026, 6, 1);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const state: MonthState = occupied.includes(i)
      ? "occupied"
      : partial.includes(i)
        ? "partial"
        : "open";
    return {
      // "sept." -> "sep": strip periods, cap at 3 chars (CSS uppercases)
      label: fmt.format(d).replace(/\./g, "").slice(0, 3),
      state,
      newYear: d.getMonth() === 0 ? d.getFullYear() % 100 : undefined,
    };
  });
}

// --- Description editor (design 2026-07-29, checkpoint 1) -------------------
// Fixtures, not real data: the point of this section is to judge the NODE SET
// before the C# validator is written against it. English throughout — this
// page is the internal style book and never shown to a guest; Task 10 is
// where translated copy replaces these literals.

// Eight photos, because the "All N photos" chip only renders once the mosaic
// is actually hiding something — the four real listings carry one photo each,
// so on live data the control never appears at all. The three sample files
// repeat behind a fragment, which the browser drops when fetching but which
// keeps each entry's key unique.
//
// Each entry carries the derivative shape production photos have, so the
// thumbnail-to-slide resolution jump is real here too: `cardUrl` is an 800 px
// long-edge file (sips, mirroring `PhotoPipeline.Encode`'s card cap) and
// `detailUrl` is the original — all three sources sit under the 1600 px
// detail cap, and the pipeline never upscales, so "detail" IS the original.
const GALLERY_SOURCES: Record<string, string> = {
  "/brand/zaragoza-hero.webp": "/brand/zaragoza-hero.card.jpg",
  "/brand/sample-home-1.jpg": "/brand/sample-home-1.card.jpg",
  "/brand/sample-home-2.jpg": "/brand/sample-home-2.card.jpg",
};

const GALLERY_PHOTOS: PropertyPhoto[] = [
  "/brand/zaragoza-hero.webp",
  "/brand/sample-home-1.jpg",
  "/brand/sample-home-2.jpg",
  "/brand/zaragoza-hero.webp#2",
  "/brand/sample-home-1.jpg#2",
  "/brand/sample-home-2.jpg#2",
  "/brand/zaragoza-hero.webp#3",
  "/brand/sample-home-1.jpg#3",
].map((url, i) => {
  const [file, fragment] = url.split("#");
  const suffix = fragment ? `#${fragment}` : "";
  return {
    url,
    cardUrl: `${GALLERY_SOURCES[file]}${suffix}`,
    detailUrl: `${file}${suffix}`,
    isFloorplan: false,
    sortOrder: i,
    hiddenFromGallery: false,
  };
});

const RICH_TEXT_PHOTOS: HostPhoto[] = [
  { url: "/brand/sample-home-1.jpg", cardUrl: null, detailUrl: null, isFloorplan: false, sortOrder: 0, hiddenFromGallery: false },
  { url: "/brand/sample-home-2.jpg", cardUrl: null, detailUrl: null, isFloorplan: true, sortOrder: 1, hiddenFromGallery: false },
];

const RICH_TEXT_PLACES: HostNearbyEntry[] = [
  {
    id: "e1",
    group: "transport",
    type: "tram",
    customType: null,
    name: "Tranvía L1 · Plaza España",
    lat: 41.6528,
    lng: -0.8829,
    reach: { foot: { metres: 340, minutes: 4 } },
    osmId: null,
    measuredAt: null,
    needsCheck: false,
  },
  {
    id: "e2",
    group: "outdoors",
    type: "park",
    customType: null,
    name: "Parque del Agua",
    lat: 41.6702,
    lng: -0.9011,
    reach: { foot: { metres: 480, minutes: 6 } },
    osmId: null,
    measuredAt: null,
    needsCheck: false,
  },
];

function RichTextDemo() {
  const [doc, setDoc] = useState<RichNode | null>(
    paragraphDoc("A quiet third-floor flat in El Arrabal, five minutes from the river."),
  );
  const [photoPick, setPhotoPick] = useState<((url: string, asFigure: boolean) => void) | null>(null);
  const [placePick, setPlacePick] = useState<((id: string, asCard: boolean) => void) | null>(null);

  return (
    <div className="grid gap-6 min-[64rem]:grid-cols-2">
      <RichTextEditor
        value={doc}
        onChange={setDoc}
        label="Description"
        tag="EN"
        placeholder="What makes this home worth living in?"
        onInsertPhoto={(insert) => setPhotoPick(() => insert)}
        onInsertPlace={(insert) => setPlacePick(() => insert)}
        strings={{
          bold: "Bold",
          italic: "Italic",
          heading: "Heading",
          bullet: "Bulleted list",
          ordered: "Numbered list",
          note: "Good to know",
          photo: "Insert photo",
          place: "Insert place",
          undo: "Undo",
          redo: "Redo",
          photoChip: "photo",
          placeChip: "place",
        }}
      />

      <div className="rounded-(--radius-control) border border-line p-4">
        <p className="data mb-3 text-[0.65625rem] tracking-[0.1em] text-muted">AS A GUEST SEES IT</p>
        <RichText
          doc={doc}
          photos={RICH_TEXT_PHOTOS}
          nearby={RICH_TEXT_PLACES}
          profile="foot"
          onPhoto={(url) => console.log("open gallery at", url)}
          onPlace={(id) => console.log("select place", id)}
        />
      </div>

      <PhotoPicker
        open={photoPick !== null}
        photos={RICH_TEXT_PHOTOS}
        onClose={() => setPhotoPick(null)}
        onPick={(url, asFigure) => photoPick?.(url, asFigure)}
        onUpload={async () => {
          throw new Error("no upload in the style book");
        }}
        strings={{
          title: "Insert a photo",
          asChip: "As a chip",
          asFigure: "As a figure",
          upload: "Upload",
          alsoInGallery: "Also show in the gallery",
          uploading: "Uploading…",
          failed: "Upload failed",
          empty: "No photos on this listing yet.",
        }}
      />
      <PlacePicker
        open={placePick !== null}
        entries={RICH_TEXT_PLACES}
        onClose={() => setPlacePick(null)}
        onPick={(id, asCard) => placePick?.(id, asCard)}
        strings={{
          title: "Insert a place",
          asChip: "As a chip",
          asCard: "As a card",
          empty: "No nearby places on this listing yet.",
        }}
      />
    </div>
  );
}

export default function DesignPage() {
  const t = useTranslations("design");
  const th = useTranslations("search.hero");
  const ts = useTranslations("status");
  const ta = useTranslations("actions");
  const tf = useTranslations("filters");
  const tt = useTranslations("type");
  const locale = useLocale();

  // Bare toLocaleDateString() picks the runtime's default locale — en-US on the
  // SSR host, the visitor's locale in the browser — so the pre-filled demos
  // render "9/1/2026" on the server and "01/09/2026" on the client, tripping a
  // hydration mismatch (the red error overlay). Pin the locale so both agree.
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [propertyType, setPropertyType] = useState("all");
  const [stayRange, setStayRange] = useState<DateRange | undefined>({
    from: new Date(2026, 7, 10),
    to: new Date(2026, 8, 18),
  });
  // Popover-field test bed: one starts empty, one pre-filled.
  const [fieldRange, setFieldRange] = useState<DateRange | undefined>();
  const [fieldRange2, setFieldRange2] = useState<DateRange | undefined>({
    from: new Date(2026, 8, 1),
    to: new Date(2027, 0, 5),
  });
  // Experiment: split move-in / move-out popover.
  const [split, setSplit] = useState<SplitRange>({});
  // Budget test bed — each variant keeps its own ceiling so they can be
  // compared side by side (null = no limit).
  const [budgetA, setBudgetA] = useState<number | null>(1200);
  const [budgetB, setBudgetB] = useState<number | null>(1200);
  const [budgetC, setBudgetC] = useState<number | null>(null);
  // One ceiling per case, shared by that case's two drawings — comparing them
  // only means anything if both are set to the same number.
  const [caseCaps, setCaseCaps] = useState<Record<string, number | null>>({});
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
      amenities: ["wifi", "ac", "heating", "desk", "kitchen", "lift"],
      verified: true,
      billsIncluded: true,
      depositProtected: true,
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
      amenities: ["wifi", "terrace", "washer"],
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

      {/* Date pickers — test bed */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("datePickers")}</span></div>
        <p className="mt-4 max-w-xl text-sm text-muted">{t("datePickersHint")}</p>

        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:max-w-3xl">
          {/* Popover field — empty to start */}
          <div>
            <p className="data mb-2 text-xs uppercase tracking-wide text-muted">
              {t("dpPopover")}
            </p>
            <DateRangeField
              value={fieldRange}
              onChange={setFieldRange}
              moveInLabel={th("moveIn")}
              moveOutLabel={th("moveOut")}
              startMonth={new Date(2026, 7, 1)}
            />
            <p className="mt-2 text-xs text-muted">
              {t("dpSelected")}:{" "}
              <span className="data text-body">
                {fieldRange?.from
                  ? `${fmtDate(fieldRange.from)} → ${
                      fieldRange.to ? fmtDate(fieldRange.to) : "…"
                    }`
                  : t("dpNone")}
              </span>
            </p>
          </div>

          {/* Popover field — pre-filled, with booked days it must refuse */}
          <div>
            <p className="data mb-2 text-xs uppercase tracking-wide text-muted">
              {t("dpPopoverBooked")}
            </p>
            <DateRangeField
              value={fieldRange2}
              onChange={setFieldRange2}
              moveInLabel={th("moveIn")}
              moveOutLabel={th("moveOut")}
              booked={bookedSpans}
              startMonth={new Date(2026, 7, 1)}
            />
            <p className="mt-2 text-xs text-muted">
              {t("dpSelected")}:{" "}
              <span className="data text-body">
                {fieldRange2?.from
                  ? `${fmtDate(fieldRange2.from)} → ${
                      fieldRange2.to ? fmtDate(fieldRange2.to) : "…"
                    }`
                  : t("dpNone")}
              </span>
            </p>
          </div>

          {/* Native pair — the current hero control, for contrast */}
          <div>
            <p className="data mb-2 text-xs uppercase tracking-wide text-muted">
              {t("dpNative")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label={th("moveIn")}>
                {(id) => <Input id={id} type="date" defaultValue="2026-09-01" />}
              </Field>
              <Field label={th("moveOut")}>
                {(id) => <Input id={id} type="date" defaultValue="2027-01-05" />}
              </Field>
            </div>
          </div>
        </div>

        {/* Experiment — split move-in / move-out popover */}
        <div className="mt-8 max-w-md">
          <p className="data mb-2 text-xs uppercase tracking-wide text-muted">
            {t("dpSplit")}
          </p>
          <p className="mb-3 text-sm text-muted">{t("dpSplitHint")}</p>
          <SplitDateRangeField
            value={split}
            onChange={setSplit}
            moveInLabel={th("moveIn")}
            moveOutLabel={th("moveOut")}
          />
          <p className="mt-2 text-xs text-muted">
            {t("dpSelected")}:{" "}
            <span className="data text-body">
              {split.moveIn
                ? `${fmtDate(split.moveIn)} → ${
                    split.moveOut ? fmtDate(split.moveOut) : "…"
                  }`
                : t("dpNone")}
            </span>
          </p>
        </div>
      </section>

      {/* Budget filter — variants */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("budget")}</span></div>
        <p className="mt-4 max-w-2xl text-sm text-muted">{t("budgetHint")}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="data mb-1.5 text-xs uppercase tracking-wide text-muted">
              {t("budgetA")}
            </p>
            <p className="mb-3 max-w-md text-xs text-muted">{t("budgetAWhy")}</p>
            <div className="rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)">
              <BudgetBand
                prices={SAMPLE_PRICES}
                value={budgetA}
                onChange={setBudgetA}
              />
            </div>
          </div>

          <div>
            <p className="data mb-1.5 text-xs uppercase tracking-wide text-muted">
              {t("budgetB")}
            </p>
            <p className="mb-3 max-w-md text-xs text-muted">{t("budgetBWhy")}</p>
            <div className="rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)">
              <BudgetCurve
                prices={SAMPLE_PRICES}
                value={budgetB}
                onChange={setBudgetB}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 lg:max-w-3xl">
          <p className="data mb-1.5 text-xs uppercase tracking-wide text-muted">
            {t("budgetC")}
          </p>
          <p className="mb-3 max-w-md text-xs text-muted">{t("budgetCWhy")}</p>
          <div className="rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)">
            <BudgetTiers
              prices={SAMPLE_PRICES}
              value={budgetC}
              onChange={setBudgetC}
            />
          </div>
        </div>

      </section>

      {/* Columns vs marks — why the band changes rendering below 8 homes */}
      <section className="mt-14">
        <div className="ledger-rule"><span>{t("budgetCompare")}</span></div>
        <p className="mt-4 max-w-2xl text-sm text-muted">
          {t("budgetCompareHint")}
        </p>

        <div className="mt-6 grid gap-8 lg:grid-cols-3">
          {BUDGET_CASES.map(({ key, label, prices }) => (
            <div key={key}>
              <p className="data mb-3 text-xs uppercase tracking-wide text-muted">
                {t(label)}
              </p>
              <div className="space-y-3">
                {/* Same component, same prices, same cap — only the threshold
                    differs, so any difference you see is the rendering. */}
                <div className="rounded-(--radius-card) border border-line bg-surface p-4">
                  <p className="data mb-2 text-[0.625rem] uppercase tracking-wide text-muted">
                    {t("budgetCols")}
                  </p>
                  <BudgetBand
                    prices={prices}
                    denseFrom={1}
                    value={caseCaps[key] ?? null}
                    onChange={(v) => setCaseCaps((c) => ({ ...c, [key]: v }))}
                  />
                </div>
                <div className="rounded-(--radius-card) border border-line bg-surface p-4">
                  <p className="data mb-2 text-[0.625rem] uppercase tracking-wide text-muted">
                    {t("budgetMarks")}
                  </p>
                  <BudgetBand
                    prices={prices}
                    denseFrom={99}
                    value={caseCaps[key] ?? null}
                    onChange={(v) => setCaseCaps((c) => ({ ...c, [key]: v }))}
                  />
                </div>
              </div>
            </div>
          ))}
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

      {/* Gallery — the mosaic the detail page ships */}
      <section className="mt-14">
        <div className="ledger-rule"><span>gallery (as shipped)</span></div>
        <p className="mt-4 max-w-2xl text-sm text-muted">
          The detail page&rsquo;s mosaic at eight photos, opened through{" "}
          <code>@fancyapps/ui</code> (licensed 2026-08-03). Every tile zooms —
          the open starts clipped to exactly the tile&rsquo;s crop and the
          window animates open with the flight, closing the same way in
          reverse. The caption bar is reserved for a photo description field
          that does not exist yet; the counter carries the numbering. The
          decision trail is §6 of the gallery lightbox spec. This is the only
          lightbox in the codebase — the YARL pair it was judged against was
          removed once the referenced-photo flow moved over too.
        </p>
        <div className="mt-6 max-w-4xl">
          <FancyboxMosaic photos={GALLERY_PHOTOS} hasFloorplan={false} />
        </div>
        <p className="mt-10 max-w-2xl text-sm text-muted">
          The same mosaic at every count it lays out differently — the live
          listings carry one photo each, so without this bench only the
          one-photo band would ever be seen. Each count packs the full band:
          one companion at full height, two stacked, three with a double-width
          tile under two squares, four as the 2×2 above.
        </p>
        {[1, 2, 3, 4].map((count) => (
          <div key={count} className="mt-6 max-w-4xl">
            <p className="mb-2 text-xs text-muted">
              {count} {count === 1 ? "photo" : "photos"}
            </p>
            <FancyboxMosaic
              photos={GALLERY_PHOTOS.slice(0, count)}
              hasFloorplan={false}
            />
          </div>
        ))}
      </section>

      {/* Description editor */}
      <section className="mt-14">
        <div className="ledger-rule"><span>description editor</span></div>
        <p className="mt-4 max-w-2xl text-sm text-muted">
          Checkpoint 1: the node set the C# validator will be written against.
          Try every toolbar button, the <code>- </code>/<code>1. </code>/
          <code>**bold**</code>/<code>### </code> input rules, both pickers,
          undo/redo, and paste from a page with a script tag, an iframe, an
          external image and coloured text — only representable content should
          survive.
        </p>
        <div className="mt-6">
          <RichTextDemo />
        </div>
      </section>

    </main>
  );
}
