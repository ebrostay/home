"use client";

// Property detail. URL: /{locale}/property?id={slug} (v1's URL model — plays
// nicely with static export; pretty paths can come later via SWA rewrites).

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ApiError,
  biText,
  fetchProperty,
  type PropertyDetail,
} from "@/lib/api";
import { computeEstimate, formatEuro, MAX_STAY_MONTHS } from "@/lib/pricing";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";
import { ListingsMap } from "@/components/ListingsMap";

export default function PropertyPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <PropertyContent />
    </Suspense>
  );
}

function PropertyContent() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const t = useTranslations();
  const locale = useLocale();

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">(
    "loading",
  );
  const [photoIndex, setPhotoIndex] = useState(0);
  const [range, setRange] = useState<DateRange | undefined>();

  useEffect(() => {
    if (!id) {
      setState("missing");
      return;
    }
    let cancelled = false;
    fetchProperty(id)
      .then((p) => {
        if (cancelled) return;
        setProperty(p);
        setState("ok");
      })
      .catch((e) => {
        if (cancelled) return;
        setState(e instanceof ApiError && e.status === 404 ? "missing" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === "loading") return <DetailSkeleton />;
  if (state !== "ok" || !property) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-3xl font-bold text-ink">
          {t(state === "missing" ? "detail.notFoundTitle" : "home.error")}
        </h1>
        <p className="mt-3 text-muted">{t("detail.notFoundBody")}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-(--radius-control) bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          {t("detail.back")}
        </Link>
      </main>
    );
  }

  return <DetailBody property={property} locale={locale} photoIndex={photoIndex} setPhotoIndex={setPhotoIndex} range={range} setRange={setRange} />;
}

function DetailBody({
  property: p,
  locale,
  photoIndex,
  setPhotoIndex,
  range,
  setRange,
}: {
  property: PropertyDetail;
  locale: string;
  photoIndex: number;
  setPhotoIndex: (i: number) => void;
  range: DateRange | undefined;
  setRange: (r: DateRange | undefined) => void;
}) {
  const t = useTranslations();
  const gallery = p.photos.filter((ph) => !ph.isFloorplan);
  const photo = gallery[photoIndex] ?? gallery[0];

  const booked = useMemo(
    () =>
      p.availability.map((r) => {
        const [ys, ms, ds] = r.start.split("-").map(Number);
        const [ye, me, de] = r.end.split("-").map(Number);
        // public ranges are end-exclusive; DayPicker matchers are inclusive
        const endInclusive = new Date(ye, me - 1, de - 1);
        return { from: new Date(ys, ms - 1, ds), to: endInclusive };
      }),
    [p.availability],
  );

  const estimate = useMemo(() => {
    if (!range?.from || !range?.to) return null;
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return computeEstimate(iso(range.from), iso(range.to), p.priceNumber, p.depositAmount);
  }, [range, p.priceNumber, p.depositAmount]);

  const eur = (v: number) => `${formatEuro(v, locale)} €`;

  const conditions: [string, string][] = [
    [
      t("detail.bills"),
      p.billsPolicy === "included"
        ? t("detail.billsIncluded")
        : p.billsPolicy === "capped"
          ? t("detail.billsCapped", { cap: p.utilitiesCapEur ?? 0 })
          : t("detail.billsExcluded"),
    ],
    [t("detail.deposit"), p.depositAmount ? eur(p.depositAmount) : "—"],
    [t("detail.stay"), t("detail.stayRange", { min: p.minStayMonths, max: p.maxStayMonths })],
    ...(p.floorNumber !== null
      ? ([[t("detail.floor", { floor: p.floorNumber }), ""]] as [string, string][])
      : []),
    ...(p.energyRating ? ([[t("detail.energy"), p.energyRating]] as [string, string][]) : []),
    [t("detail.pets"), t(p.petsAllowed ? "detail.yes" : "detail.no")],
    [t("detail.smoking"), t(p.smokingAllowed ? "detail.yes" : "detail.no")],
    [t("detail.couples"), t(p.couplesAllowed ? "detail.yes" : "detail.no")],
    [t("detail.selfCheckin"), t(p.selfCheckin ? "detail.yes" : "detail.no")],
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← {t("detail.back")}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
            {p.name}
          </h1>
          <p className="mt-1 text-muted">
            {biText(p.area, locale)}, Zaragoza
            {p.address ? ` · ${p.address}` : ""}
          </p>
        </div>
        <p className="data text-2xl text-ink">
          {eur(p.priceNumber)}
          <span className="text-base text-muted">/{t("listing.month")}</span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.checked && <Badge tone="brand">{t("listing.verified")}</Badge>}
        {p.billsPolicy === "included" && <Badge tone="river">{t("listing.bills")}</Badge>}
        {p.isNew && <Badge tone="warn">{t("listing.new")}</Badge>}
      </div>

      {/* Gallery */}
      {photo && (
        <div className="mt-6">
          <div className="overflow-hidden rounded-(--radius-card) border border-line bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={t("detail.photoOf", { n: photoIndex + 1, total: gallery.length })}
              className="max-h-[520px] w-full object-cover"
            />
          </div>
          {gallery.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {gallery.map((g, i) => (
                <button
                  key={g.url}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  aria-label={t("detail.photoOf", { n: i + 1, total: gallery.length })}
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-(--radius-control) border-2 ${
                    i === photoIndex ? "border-brand" : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_minmax(0,380px)]">
        <div>
          {/* Copy */}
          <p className="text-lg text-ink">{biText(p.copy, locale)}</p>
          <p className="mt-3">{biText(p.details, locale)}</p>

          {/* Facts */}
          <div className="ledger-rule mt-10"><span>{t("detail.specs")}</span></div>
          <p className="data mt-4 text-sm text-ink">
            {t("listing.specs", {
              bedrooms: p.bedrooms,
              bathrooms: p.bathrooms,
              size: p.sizeM2,
            })}{" "}
            · {t("detail.guests", { count: p.guests })}
          </p>
          {p.beds && <p className="mt-1 text-sm text-muted">{t("detail.beds")}: {biText(p.beds, locale)}</p>}

          {/* Amenities */}
          <div className="ledger-rule mt-10"><span>{t("detail.amenities")}</span></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {p.amenities.map((a) => (
              <span
                key={a}
                className="data rounded-full border border-line px-3 py-1.5 text-xs uppercase tracking-wide text-body"
              >
                {t.has(`amenity.${a}`) ? t(`amenity.${a}`) : a}
              </span>
            ))}
          </div>

          {/* Conditions */}
          <div className="ledger-rule mt-10"><span>{t("detail.conditions")}</span></div>
          <dl className="mt-4 divide-y divide-line border-y border-line">
            {conditions.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 py-2.5 text-sm">
                <dt className="text-muted">{k}</dt>
                <dd className="data text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          {/* Location */}
          <div className="ledger-rule mt-10"><span>{t("detail.location")}</span></div>
          <ListingsMap
            pins={[{ id: p.id, lat: p.lat, lng: p.lng, label: eur(p.priceNumber) }]}
            className="mt-4 h-72"
          />
        </div>

        {/* Estimate panel */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-(--radius-card) border border-line bg-surface p-5 shadow-(--shadow-card)">
            <h2 className="font-display text-lg font-semibold text-ink">
              {t("estimate.title")}
            </h2>
            <p className="mt-1 text-xs text-muted">{t("estimate.hint")}</p>
            <div className="mt-4 overflow-x-auto">
              <DateRangePicker
                value={range}
                onChange={setRange}
                booked={booked}
                numberOfMonths={1}
              />
            </div>

            {estimate && (
              <div className="mt-4 border-t border-line pt-4">
                {estimate.tooLong ? (
                  <p className="rounded-(--radius-control) bg-warn-soft p-3 text-sm text-warn">
                    {t("estimate.tooLong")}
                  </p>
                ) : (
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted">
                        {t("estimate.rent")} ·{" "}
                        {t("estimate.months", {
                          count: estimate.months,
                          price: formatEuro(p.priceNumber, locale),
                        })}
                      </dt>
                      <dd className="data text-ink">{eur(estimate.rent)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">{t("estimate.commission")}</dt>
                      <dd className="data text-ink">{eur(estimate.commission)}</dd>
                    </div>
                    {estimate.commissionDiscount > 0 && (
                      <div className="flex justify-between text-brand-strong">
                        <dt>{t("estimate.commissionCap")}</dt>
                        <dd className="data">−{eur(estimate.commissionDiscount)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-muted">{t("estimate.deposit")}</dt>
                      <dd className="data text-ink">{eur(estimate.deposit)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-line pt-2 text-base">
                      <dt className="font-semibold text-ink">{t("estimate.total")}</dt>
                      <dd className="data font-semibold text-ink">{eur(estimate.total)}</dd>
                    </div>
                  </dl>
                )}
                <p className="mt-3 text-[0.6875rem] leading-snug text-muted">
                  {t("estimate.disclaimer")}
                </p>
              </div>
            )}

            <Button className="mt-4 w-full" disabled>
              {t("estimate.cta")}
            </Button>
            <p className="mt-1.5 text-center text-[0.6875rem] text-muted">
              {t("estimate.ctaHint")}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function DetailSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="skeleton h-4 w-40" />
      <div className="skeleton mt-5 h-9 w-2/3" />
      <div className="skeleton mt-6 aspect-[16/8] w-full rounded-(--radius-card)" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_minmax(0,380px)]">
        <div className="space-y-3">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-4/6" />
        </div>
        <div className="skeleton h-96 rounded-(--radius-card)" />
      </div>
    </main>
  );
}
