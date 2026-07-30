"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, MapPin, RotateCcw, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AMENITY_ICONS } from "@/lib/amenity-icons";
import { SIZES, srcSet } from "@/lib/photos";
import { AvailabilityBand, type MonthAvailability } from "@/components/MonthBand";

export type CardView = "grid" | "list";

export type PropertyCardData = {
  id: string;
  name: string;
  area: string;
  photoUrl: string;
  /** The derived sizes for `photoUrl`, when the photo has them. A card is
   *  drawn ~407 px wide; pulling a 2560 px master to do it is the single
   *  biggest avoidable cost on the search page. */
  photoCardUrl?: string | null;
  photoDetailUrl?: string | null;
  pricePerMonth: number;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  amenities: string[];
  verified?: boolean;
  billsIncluded?: boolean;
  depositProtected?: boolean;
  /** Only present once the list projection carries it; the card degrades quietly. */
  description?: string;
  months: MonthAvailability[];
};

export type Stay = { moveIn: string; moveOut: string }; // both YYYY-MM-DD

export function PropertyCard({
  property,
  locale,
  view = "grid",
  active = false,
  selected = false,
  onHover,
  onSelect,
  stay,
  onOpen,
}: {
  property: PropertyCardData;
  locale: string;
  view?: CardView;
  active?: boolean;
  selected?: boolean;
  onHover?: (id: string | null) => void;
  // Card-level pick: mark this home on the map and pan/zoom to it. Navigation
  // to the detail page is reserved for the explicit "View home" button.
  onSelect?: (id: string) => void;
  // The stay the visitor searched for, carried into the detail link so the
  // booking panel opens on their dates instead of its own default.
  stay?: Stay;
  // Fired when the visitor leaves for this home's page, so the list can put
  // them back here when they return.
  onOpen?: (id: string) => void;
}) {
  const t = useTranslations("listing");
  const list = view === "list";

  // v1 formatting rule (docs/spec/09 R-X-2): ES "1.350", EN "1,350" — es-ES
  // only groups from 10000 by default, so force grouping.
  const price = new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    useGrouping: "always" as Intl.NumberFormatOptions["useGrouping"],
  }).format(property.pricePerMonth);

  const href = {
    pathname: "/property",
    query: stay
      ? { id: property.id, from: stay.moveIn, to: stay.moveOut }
      : { id: property.id },
  };

  const highlights = [
    property.verified && { key: "verified", Icon: Check, label: t("verified") },
    property.depositProtected && {
      key: "deposit",
      Icon: RotateCcw,
      label: t("refundableDeposit"),
    },
    property.billsIncluded && {
      key: "bills",
      Icon: Check,
      label: t("bills"),
    },
  ].filter(Boolean) as { key: string; Icon: LucideIcon; label: string }[];

  const pick = () => onSelect?.(property.id);

  return (
    <article
      /* Named so the list can scroll this card back into view on return. */
      id={`home-${property.id}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={t("selectOnMap", { name: property.name })}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
      onMouseEnter={() => onHover?.(property.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`flex cursor-pointer gap-3.5 rounded-(--radius-card) border bg-surface p-[0.4375rem] shadow-(--shadow-card) transition-[box-shadow,border-color] duration-(--dur-standard) ${
        list ? "flex-col sm:flex-row sm:gap-6" : "flex-col"
      } ${active ? "border-brand" : "border-line hover:shadow-(--shadow-pop)"}`}
    >
      <div
        /* The cap is the point. Everything below the photo is a fixed ~192px —
           name, area, specs, band, button — but an uncapped 16/11 box grows
           with the column, so the wider the card the more of it is picture: at
           605px (two columns of an unbroken 1280 page) the photo alone was
           406px tall. Capped, the photo's share FALLS as the card widens,
           which is the direction it should move, and a card is a stable
           ~420px object at every width instead of one that balloons. */
        /* `w-full` is load-bearing, not decoration. A box with an aspect ratio
           and an *auto* width transfers its max-height back through the ratio
           into a max-width — so this box's width was capped at 13.5rem × 16/11
           = 314px. Chrome and Firefox hide it (flex stretch wins), WebKit does
           not: in Safari the photo sat 314px wide inside a wider card, leaving
           a gap down the right, and overflowed the rounded corner on cards
           narrower than 314px. A specified width is not an automatic size, so
           nothing is transferred and the ratio only ever drives the height. */
        className={`relative w-full shrink-0 overflow-hidden rounded-[0.625rem] bg-surface-2 ${
          list
            ? "aspect-[16/11] sm:aspect-auto sm:max-h-[22rem] sm:w-[300px]"
            : "aspect-[16/11] max-h-[13.5rem]"
        }`}
      >
        {/* Absolutely positioned so the photo NEVER dictates the card's height —
            a portrait shot at 300px wide would otherwise stretch a list card to
            its own tall aspect. The box takes its height from the text column
            (capped by max-h above); the image just fills and crops from centre. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized */}
        <img
          src={property.photoCardUrl ?? property.photoUrl}
          srcSet={srcSet({
            url: property.photoUrl,
            cardUrl: property.photoCardUrl,
            detailUrl: property.photoDetailUrl,
          })}
          sizes={SIZES.card}
          alt=""
          // Results run well past the fold, and a search that loads every
          // photo before the visitor has scrolled pays for photos nobody sees.
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        {/* In list view the same facts are spelled out in the text column, so
            the overlay badges would just be noise on the photo. */}
        {!list && (
          <div className="absolute left-3 top-3 flex gap-1.5">
            {property.verified && (
              <span className="data rounded-full bg-white/95 px-2.5 py-[5px] text-[0.625rem] font-semibold tracking-[0.1em] text-brand-strong">
                {t("verified").toUpperCase()}
              </span>
            )}
            {property.billsIncluded && (
              <span className="data rounded-full bg-river-strong/95 px-2.5 py-[5px] text-[0.625rem] font-semibold tracking-[0.1em] text-white">
                {t("bills").toUpperCase()}
              </span>
            )}
          </div>
        )}
      </div>

      <div className={`flex flex-1 flex-col ${list ? "gap-3" : "gap-2.5"}`}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="mt-0.5 min-w-0 truncate font-display text-[1.0625rem] font-semibold text-ink">
            {property.name}
          </h3>
          <span className="flex shrink-0 flex-col items-end leading-none">
            <span className="data text-base font-semibold text-ink">{price} €</span>
            <span className="mt-0.5 text-[0.6875rem] text-muted">/{t("month")}</span>
          </span>
        </div>

        <p className="truncate text-[0.8125rem] text-muted">
          {property.area}, Zaragoza
        </p>

        <p className="data text-[0.8125rem] text-muted">
          {t("specs", {
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
            size: property.sizeSqm,
          })}
        </p>

        {list && property.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-body">
            {property.description}
          </p>
        )}

        {list && highlights.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {highlights.map(({ key, Icon, label }) => (
              <span
                key={key}
                className="flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-[5px] text-xs font-semibold text-brand-strong"
              >
                <Icon size={14} strokeWidth={2.2} aria-hidden />
                {label}
              </span>
            ))}
          </div>
        )}

        {list && property.amenities.length > 0 && (
          <AmenityRow amenities={property.amenities} />
        )}

        <div className={list ? "" : "mt-auto"}>
          <AvailabilityBand months={property.months} />
        </div>

        <div className="mt-1.5 flex gap-2">
          <Link
            href={href}
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.(property.id);
            }}
            className="flex-1 rounded-(--radius-control) bg-brand px-3.5 py-2.5 text-center text-[0.8125rem] font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong"
          >
            {t("viewHome")}
          </Link>
          {list && onSelect && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(property.id);
              }}
              className="flex items-center justify-center gap-1.5 rounded-(--radius-control) border border-line px-4 py-2.5 text-[0.8125rem] font-semibold text-ink transition-colors duration-(--dur-standard) hover:bg-surface-2"
            >
              <MapPin size={15} strokeWidth={2} aria-hidden />
              {t("showOnMap")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// Amenities are a single line by contract: the row is a texture you scan, not
// a list you read. Whatever does not fit collapses into one "+N" chip that
// discloses the rest on hover/focus. Re-measured on resize and view change.
function AmenityRow({ amenities }: { amenities: string[] }) {
  const t = useTranslations();
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const items = Array.from(
        el.querySelectorAll<HTMLElement>("[data-amenity]"),
      );
      const more = el.querySelector<HTMLElement>("[data-more]");
      if (!items.length || !more) return;

      items.forEach((i) => (i.style.display = ""));
      more.style.display = "none";

      const lineTop = items[0].offsetTop;
      const overflowing = items.filter((i) => i.offsetTop > lineTop);

      if (overflowing.length > 0) {
        overflowing.forEach((i) => (i.style.display = "none"));
        more.style.display = "";
        // The chip needs room too — give back items until it sits on line one.
        const visible = items.filter((i) => i.style.display !== "none");
        while (visible.length > 1 && more.offsetTop > lineTop) {
          const last = visible.pop()!;
          last.style.display = "none";
          overflowing.push(last);
        }
      }

      // Items dropped to make room for the chip are collected last; re-sort so
      // the popup reads in the property's own amenity order.
      const next = overflowing
        .sort((a, b) => items.indexOf(a) - items.indexOf(b))
        .map((i) => i.dataset.amenity!);
      setHidden((prev) =>
        prev.length === next.length && prev.every((v, i) => v === next[i])
          ? prev
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [amenities]);

  const label = (a: string) => (t.has(`amenity.${a}`) ? t(`amenity.${a}`) : a);

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      {amenities.map((a) => {
        const Icon = AMENITY_ICONS[a];
        return (
          <span
            key={a}
            data-amenity={a}
            className="flex items-center gap-1.5 text-xs text-body"
          >
            {Icon && <Icon size={15} strokeWidth={2} aria-hidden />}
            {label(a)}
          </span>
        );
      })}

      <span data-more className="group relative" style={{ display: "none" }}>
        <button
          type="button"
          className="rounded-full border border-line px-2 py-0.5 text-xs text-muted transition-colors duration-(--dur-standard) hover:border-line-strong hover:text-ink"
          aria-label={hidden.map(label).join(", ")}
        >
          +{hidden.length}
        </button>
        <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 hidden w-max max-w-56 flex-wrap gap-x-3 gap-y-1 rounded-(--radius-control) border border-line bg-surface p-2.5 text-xs text-body shadow-(--shadow-pop) group-hover:flex group-focus-within:flex">
          {hidden.map((a) => {
            const Icon = AMENITY_ICONS[a];
            return (
              <span key={a} className="flex items-center gap-1.5">
                {Icon && <Icon size={14} strokeWidth={2} aria-hidden />}
                {label(a)}
              </span>
            );
          })}
        </span>
      </span>
    </div>
  );
}
