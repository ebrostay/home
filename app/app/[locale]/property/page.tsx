"use client";

// Property detail. URL: /{locale}/property?id={slug} (v1's URL model — plays
// nicely with static export; pretty paths can come later via SWA rewrites).

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BedDouble,
  CalendarCheck,
  MapPin,
  Receipt,
  Share2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ApiError, biText, fetchProperty, type PropertyDetail } from "@/lib/api";
import { AMENITY_ICONS } from "@/lib/amenity-icons";
import { monthStates } from "@/lib/availability";
import { formatEuro } from "@/lib/pricing";
import {
  PLACEHOLDER_HOST,
  PLACEHOLDER_NEARBY,
} from "@/lib/detail-placeholders";
import { AvailabilityBand } from "@/components/MonthBand";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { ListingsMap } from "@/components/ListingsMap";
import { BookingPanel } from "@/components/detail/BookingPanel";
import { Gallery } from "@/components/detail/Gallery";
import { Nearby } from "@/components/detail/Nearby";
import { YourPlaces } from "@/components/detail/YourPlaces";

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

  return <DetailBody property={property} locale={locale} />;
}

function DetailBody({
  property: p,
  locale,
}: {
  property: PropertyDetail;
  locale: string;
}) {
  const t = useTranslations();
  const td = useTranslations("detail");

  const gallery = p.photos.filter((ph) => !ph.isFloorplan);
  const floorplan = p.photos.find((ph) => ph.isFloorplan);

  const booked: DateRange[] = useMemo(
    () =>
      p.availability.map((r) => {
        const [ys, ms, ds] = r.start.split("-").map(Number);
        const [ye, me, de] = r.end.split("-").map(Number);
        // public ranges are end-exclusive; DayPicker matchers are inclusive
        return {
          from: new Date(ys, ms - 1, ds),
          to: new Date(ye, me - 1, de - 1),
        };
      }),
    [p.availability],
  );

  const now = useMemo(() => new Date(), []);
  const months = useMemo(
    () => monthStates(p.availability, p.availableFrom, locale, now),
    [p.availability, p.availableFrom, locale, now],
  );

  const eur = (v: number) => `${formatEuro(v, locale)} €`;

  const facts: [string, string][] = [
    [String(p.bedrooms), td("bedrooms")],
    [String(p.bathrooms), td("bathrooms")],
    [`${p.sizeM2} m²`, td("floorArea")],
    ...(p.floorNumber !== null
      ? ([[String(p.floorNumber), td("floor")]] as [string, string][])
      : []),
    [String(p.guests), td("sleeps")],
  ];

  const terms: { key: string; Icon: LucideIcon }[] = [
    { key: "wholeMonth", Icon: CalendarCheck },
    { key: "deposit", Icon: ShieldCheck },
    { key: "utilities", Icon: Receipt },
    { key: "cancellation", Icon: BedDouble },
  ];

  const conditions: [string, string][] = [
    [td("minStay"), td("booking.monthCount", { count: p.minStayMonths })],
    [td("maxStay"), td("booking.monthCount", { count: p.maxStayMonths })],
    [t("detail.deposit"), p.depositAmount ? eur(p.depositAmount) : "—"],
    [
      t("detail.bills"),
      p.billsPolicy === "included"
        ? t("detail.billsIncluded")
        : p.billsPolicy === "capped"
          ? t("detail.billsCapped", { cap: p.utilitiesCapEur ?? 0 })
          : t("detail.billsExcluded"),
    ],
    ...(p.energyRating
      ? ([[t("detail.energy"), p.energyRating]] as [string, string][])
      : []),
    [t("detail.pets"), t(p.petsAllowed ? "detail.yes" : "detail.no")],
    [t("detail.smoking"), t(p.smokingAllowed ? "detail.yes" : "detail.no")],
    [t("detail.couples"), t(p.couplesAllowed ? "detail.yes" : "detail.no")],
    [t("detail.selfCheckin"), t(p.selfCheckin ? "detail.yes" : "detail.no")],
  ];

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      // user dismissed the sheet, or the clipboard is blocked — nothing to do
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← {td("allHomes")}
      </Link>

      {/* Title row */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {p.checked && <Badge tone="brand">{t("listing.verified")}</Badge>}
            {biText(p.area, locale) && (
              <Badge tone="river">{biText(p.area, locale)}</Badge>
            )}
          </div>
          <h1 className="mt-2.5 font-display text-3xl font-bold text-ink sm:text-[2.375rem]">
            {p.name}
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-muted">
            <MapPin size={15} strokeWidth={2} aria-hidden />
            {biText(p.area, locale)}, Zaragoza
          </p>
        </div>

        {/* Placeholder host — see lib/detail-placeholders.ts */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PLACEHOLDER_HOST.avatarUrl}
            alt=""
            className="h-12 w-12 rounded-full border border-line bg-surface-2 object-cover p-1.5"
          />
          <div>
            <p className="font-display text-[0.9375rem] font-semibold text-ink">
              {td("hostedBy", { name: PLACEHOLDER_HOST.name })}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {td("hostSince", { year: PLACEHOLDER_HOST.hostingSince })}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <Gallery photos={gallery} hasFloorplan={!!floorplan} name={p.name} />
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_minmax(0,380px)] lg:items-start">
        <div className="flex flex-col gap-10">
          {/* 1 — Key facts */}
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-line pb-6">
            {facts.map(([value, label]) => (
              <div key={label}>
                <p className="data text-[1.375rem] font-semibold text-ink">
                  {value}
                </p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
            <Button variant="ghost" className="ml-auto" onClick={share}>
              <Share2 size={15} strokeWidth={2} aria-hidden />
              {td("share")}
            </Button>
          </div>

          {/* 2 — About */}
          <Section title={td("about")} plain>
            <p className="text-[0.96875rem] leading-relaxed">
              {biText(p.copy, locale)}
            </p>
            {biText(p.details, locale) && (
              <p className="mt-3 text-[0.96875rem] leading-relaxed">
                {biText(p.details, locale)}
              </p>
            )}
          </Section>

          {/* 3 — Amenities */}
          {p.amenities.length > 0 && (
            <Section title={td("offers")}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {p.amenities.map((a) => {
                  const Icon = AMENITY_ICONS[a];
                  return (
                    <li
                      key={a}
                      className="flex items-center gap-2.5 text-sm text-body"
                    >
                      {/* An amenity we have no icon for keeps the brand dot, so
                          the labels stay on one column edge and nothing borrows
                          a glyph that means something else. */}
                      {Icon ? (
                        <Icon
                          size={17}
                          strokeWidth={1.75}
                          className="shrink-0 text-brand"
                          aria-hidden
                        />
                      ) : (
                        <span
                          className="mx-[7.5px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                          aria-hidden
                        />
                      )}
                      {t.has(`amenity.${a}`) ? t(`amenity.${a}`) : a}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {/* 4 — Availability (self-contained card, no extra rule) */}
          <section className="rounded-(--radius-card) border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-display text-[1.375rem] font-semibold text-ink">
              {td("availability")}
            </h2>
            <div className="mt-5">
              <AvailabilityBand months={months} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
              <Legend className="bg-river">{td("legendOpen")}</Legend>
              <Legend
                style={{
                  background:
                    "linear-gradient(90deg, var(--occupied) 50%, var(--river) 50%)",
                }}
              >
                {td("legendPartial")}
              </Legend>
              <Legend className="bg-occupied">{td("legendBooked")}</Legend>
            </div>
            {p.availableFrom && (
              <p className="data mt-4 text-xs text-muted">
                {td("openFrom", {
                  date: new Intl.DateTimeFormat(
                    locale === "es" ? "es-ES" : "en-GB",
                    { month: "short", year: "numeric" },
                  ).format(new Date(`${p.availableFrom}T00:00:00`)),
                })}
              </p>
            )}
          </section>

          {/* 5 — Stay terms */}
          <Section title={td("stayTerms")}>
            <div className="grid gap-5 sm:grid-cols-2">
              {terms.map(({ key, Icon }) => (
                <div key={key} className="flex gap-3">
                  <Icon
                    size={18}
                    strokeWidth={2}
                    className="mt-0.5 shrink-0 text-brand"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {td(`terms.${key}.title`)}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {td(`terms.${key}.body`)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 6 — Conditions */}
          <Section title={td("conditions")}>
            <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {conditions.map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-(--radius-control) border border-line bg-surface px-3.5 py-3"
                >
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="data mt-0.5 text-sm font-semibold text-ink">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          {/* 7 — Where you'll be */}
          <Section title={td("whereYouWillBe")}>
            <ListingsMap
              pins={[{ id: p.id, lat: p.lat, lng: p.lng, label: p.name }]}
              className="h-60"
            />
            {p.address && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-body">
                <MapPin size={15} strokeWidth={2} aria-hidden />
                {p.address}
              </p>
            )}
          </Section>

          {/* 8 — Your places */}
          <YourPlaces />

          {/* 9 — Nearby (placeholder content) */}
          <Section title={td("nearby.title")} subtitle={td("nearby.subtitle")}>
            <Nearby categories={PLACEHOLDER_NEARBY} />
          </Section>

          {/* 10 — Floor plan */}
          {floorplan && (
            <Section id="floor-plan" title={td("floorPlan")}>
              <p className="data text-xs text-muted">
                {t("listing.specs", {
                  bedrooms: p.bedrooms,
                  bathrooms: p.bathrooms,
                  size: p.sizeM2,
                })}
              </p>
              {/* Plans are line art on white; a dark surface would swallow them. */}
              <div className="mt-4 overflow-hidden rounded-(--radius-card) border border-line bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={floorplan.url}
                  alt={td("floorPlan")}
                  className="mx-auto max-h-[32rem] w-auto object-contain"
                />
              </div>
            </Section>
          )}
        </div>

        <BookingPanel property={p} locale={locale} booked={booked} />
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  subtitle,
  plain,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={plain ? "" : "border-t border-line pt-8 scroll-mt-24"}
    >
      <h2 className="font-display text-[1.375rem] font-semibold text-ink">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Legend({
  className = "",
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={`h-2 w-5 rounded-full ${className}`}
        style={style}
      />
      {children}
    </span>
  );
}

function DetailSkeleton() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="skeleton h-4 w-40" />
      <div className="skeleton mt-5 h-10 w-2/3" />
      <div className="skeleton mt-6 h-[380px] w-full rounded-(--radius-card)" />
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_minmax(0,380px)]">
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
