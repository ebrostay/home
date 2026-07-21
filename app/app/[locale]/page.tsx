"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  fetchProperties,
  biText,
  type PropertySummary,
} from "@/lib/api";
import { addMonths, formatEuro } from "@/lib/pricing";
import { monthStates, stayFits } from "@/lib/availability";
import { MonthBandSelect } from "@/components/MonthBand";
import { PropertyCard, type PropertyCardData } from "@/components/PropertyCard";
import { ListingsMap, type MapPin } from "@/components/ListingsMap";
import { Field, Input } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

const AMENITY_FILTERS = ["wifi", "desk", "lift", "ac", "washer", "parking"] as const;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function HomePage() {
  const t = useTranslations();
  const locale = useLocale();

  const [all, setAll] = useState<PropertySummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [moveIn, setMoveIn] = useState(todayIso());
  const [months, setMonths] = useState(3);
  const [guests, setGuests] = useState(2);
  // v1 parity: the stay search only filters once submitted (R-Home-2); the
  // grid shows everything until then.
  const [applied, setApplied] = useState<
    { moveIn: string; months: number; guests: number } | null
  >(null);
  const [type, setType] = useState("all");
  const [budget, setBudget] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [sort, setSort] = useState("best");
  const [activePin, setActivePin] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setAll(null);
    fetchProperties()
      .then((data) => !cancelled && setAll(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const results = useMemo(() => {
    if (!all) return [];
    const max = budget ? Number(budget) : Infinity;
    const stayEnd = applied ? addMonths(applied.moveIn, applied.months) : null;
    const list = all.filter(
      (p) =>
        (type === "all" || p.type === type) &&
        p.priceNumber <= max &&
        amenities.every((a) => p.amenities.includes(a)) &&
        (!applied ||
          (p.guests >= applied.guests &&
            stayFits(applied.moveIn, stayEnd!, p.availability, p.availableFrom))),
    );
    const bySort = {
      best: (a: PropertySummary, b: PropertySummary) =>
        (b.rating ?? 0) - (a.rating ?? 0) || a.priceNumber - b.priceNumber,
      price: (a: PropertySummary, b: PropertySummary) =>
        a.priceNumber - b.priceNumber,
      new: (a: PropertySummary, b: PropertySummary) =>
        Number(b.isNew) - Number(a.isNew) || a.priceNumber - b.priceNumber,
    }[sort]!;
    return [...list].sort(bySort);
  }, [all, type, budget, amenities, applied, sort]);

  const now = useMemo(() => new Date(), []);
  const cards: PropertyCardData[] = useMemo(
    () =>
      results.map((p) => ({
        id: p.id,
        name: p.name,
        area: biText(p.area, locale),
        photoUrl: p.coverUrl ?? "/brand/zaragoza-hero.webp",
        pricePerMonth: p.priceNumber,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        sizeSqm: p.sizeM2,
        verified: p.checked,
        billsIncluded: p.billsPolicy === "included",
        months: monthStates(p.availability, p.availableFrom, locale, now),
      })),
    [results, locale, now],
  );

  const pins: MapPin[] = useMemo(
    () =>
      results.map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        label: `${formatEuro(p.priceNumber, locale)} €`,
      })),
    [results, locale],
  );

  return (
    <main>
      {/* Hero */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_minmax(0,420px)] lg:items-center">
          <div>
            <p className="data text-xs uppercase tracking-[0.16em] text-muted">
              Zaragoza
            </p>
            <h1 className="mt-3 font-display text-5xl font-bold text-ink">
              {t("home.heroTitle")}
            </h1>
            <p className="mt-4 max-w-md text-lg">{t("home.heroTagline")}</p>

            <div className="mt-8 rounded-(--radius-card) border border-line bg-page p-5 shadow-(--shadow-card)">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("home.moveIn")}>
                  {(id) => (
                    <Input
                      id={id}
                      type="date"
                      min={todayIso()}
                      value={moveIn}
                      onChange={(e) => e.target.value && setMoveIn(e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t("home.guests")}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      max={8}
                      value={guests}
                      onChange={(e) =>
                        setGuests(Math.min(8, Math.max(1, Number(e.target.value) || 1)))
                      }
                    />
                  )}
                </Field>
              </div>
              <div className="mt-4">
                <MonthBandSelect value={months} onChange={setMonths} animateIn />
              </div>
              <Button
                size="lg"
                className="mt-5 w-full"
                onClick={() => {
                  setApplied({ moveIn, months, guests });
                  document.getElementById("listings")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {t("actions.search")}
              </Button>
            </div>
          </div>

          <div className="hidden overflow-hidden rounded-(--radius-card) shadow-(--shadow-card) lg:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/zaragoza-hero.webp"
              alt={t("home.heroImageAlt")}
              className="h-full max-h-[430px] w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Listings */}
      <section id="listings" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="ledger-rule"><span>{t("nav.homes")}</span></div>

        {/* Filter row */}
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div className="w-40">
            <Field label={t("filters.type")}>
              {(id) => (
                <Select
                  id={id}
                  value={type}
                  onChange={setType}
                  options={["all", "apartment", "room", "home"].map((v) => ({
                    value: v,
                    label: t(`type.${v}`),
                  }))}
                />
              )}
            </Field>
          </div>
          <div className="w-36">
            <Field label={t("filters.budget")}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  placeholder={t("filters.anyBudget")}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="w-40">
            <Field label={t("filters.sort")}>
              {(id) => (
                <Select
                  id={id}
                  value={sort}
                  onChange={setSort}
                  options={["best", "price", "new"].map((v) => ({
                    value: v,
                    label: t(`sort.${v}`),
                  }))}
                />
              )}
            </Field>
          </div>
          <fieldset className="flex flex-wrap items-center gap-2 pb-2">
            <legend className="sr-only">{t("filters.amenities")}</legend>
            {AMENITY_FILTERS.map((a) => (
              <label
                key={a}
                className={`data cursor-pointer rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition-colors ${
                  amenities.includes(a)
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-line text-muted hover:border-line-strong"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={amenities.includes(a)}
                  onChange={(e) =>
                    setAmenities((prev) =>
                      e.target.checked ? [...prev, a] : prev.filter((x) => x !== a),
                    )
                  }
                />
                {t(`amenity.${a}`)}
              </label>
            ))}
          </fieldset>
          <p role="status" className="data ml-auto flex items-center gap-2 pb-2 text-sm text-muted">
            {applied && (
              <button
                type="button"
                onClick={() => setApplied(null)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-body transition-colors hover:border-line-strong hover:text-ink"
              >
                {t("home.clearStay", {
                  date: new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(applied.moveIn)),
                  months: applied.months,
                })}{" "}
                ✕
              </button>
            )}
            {all === null && !failed
              ? t("home.loading")
              : t("home.results", { count: results.length })}
          </p>
        </div>

        {/* Grid + map */}
        <div className="mt-6 grid gap-8 lg:grid-cols-[2fr_1fr]">
          <div>
            {failed ? (
              <div className="rounded-(--radius-card) border border-line bg-surface p-8 text-center">
                <p className="text-ink">{t("home.error")}</p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  {t("home.retry")}
                </Button>
              </div>
            ) : all === null ? (
              <div className="grid gap-6 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="overflow-hidden rounded-(--radius-card) border border-line bg-surface">
                    <div className="skeleton aspect-[4/3] rounded-none" />
                    <div className="space-y-2.5 p-4">
                      <div className="skeleton h-4 w-32" />
                      <div className="skeleton h-3 w-24" />
                      <div className="skeleton h-3 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-(--radius-card) border border-line bg-surface p-8 text-center">
                <p className="font-display text-lg font-semibold text-ink">
                  {t("home.noResultsTitle")}
                </p>
                <p className="mt-2 text-sm text-muted">{t("home.noResultsBody")}</p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    onMouseEnter={() => setActivePin(c.id)}
                    onMouseLeave={() => setActivePin(null)}
                  >
                    <PropertyCard property={c} locale={locale} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <ListingsMap
            pins={pins}
            activeId={activePin}
            className="h-[420px] lg:sticky lg:top-24 lg:h-[560px]"
          />
        </div>
      </section>
    </main>
  );
}
