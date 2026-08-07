"use client";

// Property detail. URL: /{locale}/property?id={slug} (v1's URL model — plays
// nicely with static export; pretty paths can come later via SWA rewrites).

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, MapPin, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useShortMonths } from "@/i18n/dates";
import { shortDate } from "@/lib/dates";
import {
  ApiError,
  biDoc,
  biText,
  fetchProperty,
  type PropertyDetail,
  type RouteBand,
} from "@/lib/api";
import { resultsQueryFor } from "@/components/search/resultsHandoff";
import { AMENITY_ICONS } from "@/lib/amenity-icons";
import { monthStates } from "@/lib/availability";
import {
  DEFAULT_NEARBY_PROFILE,
  NEARBY_PROFILES,
  publicReachFor,
  type NearbyProfile,
} from "@/lib/nearby";
import { formatEuro } from "@/lib/pricing";
import { AvailabilityBand } from "@/components/MonthBand";
import { Badge } from "@/components/ui/Badge";
import { Segmented } from "@/components/host/fields/Segmented";
import { Button } from "@/components/ui/Button";
import { RichText } from "@/components/ui/RichText";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { BookingPanel } from "@/components/detail/BookingPanel";
/* Both lightbox surfaces are Fancybox (licensed 2026-08-03): the mosaic
   opens the gallery group, and `showPhoto` opens a description-referenced
   photo on its own. YARL and its Gallery/Lightbox pair were removed once
   this page stopped needing them — spec §6.2 records the decision. */
import { FancyboxMosaic, showPhoto } from "@/components/detail/FancyboxMosaic";
import { NeighbourhoodMap, type NeighbourhoodMapDestination } from "@/components/detail/NeighbourhoodMap";
import { OwnerBar } from "@/components/detail/OwnerBar";
import { PreviewNotice } from "@/components/detail/PreviewNotice";
import { PROFILE_ICONS } from "@/lib/profile-icons";
import { Nearby } from "@/components/detail/Nearby";
import { StayTerms } from "@/components/detail/StayTerms";
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

  // ?from=&to= — the stay the visitor searched for, handed over by the result
  // card. Anything malformed is dropped rather than repaired: the panel's own
  // default is a better answer than a half-read URL. Dates that don't SUIT the
  // home are kept, though — the panel says so and blocks the request, which is
  // more use than silently showing different dates than the ones asked for.
  const searched = useMemo(() => {
    const moveIn = params.get("from") ?? "";
    const moveOut = params.get("to") ?? "";
    return isIsoDate(moveIn) && isIsoDate(moveOut) && moveOut > moveIn
      ? { moveIn, moveOut }
      : undefined;
  }, [params]);

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [fetched, setFetched] = useState<"loading" | "ok" | "missing" | "error">(
    "loading",
  );

  // No id in the query is knowable while rendering, so it is derived and not
  // stored: an effect that only exists to write "missing" into state would
  // render the skeleton first and correct itself a frame later.
  const state = id ? fetched : "missing";

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchProperty(id)
      .then((p) => {
        if (cancelled) return;
        setProperty(p);
        setFetched("ok");
      })
      .catch((e) => {
        if (cancelled) return;
        setFetched(e instanceof ApiError && e.status === 404 ? "missing" : "error");
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

  return <DetailBody property={property} locale={locale} searched={searched} />;
}

// A real "YYYY-MM-DD", not just the shape: "2026-02-31" must not survive.
function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
  );
}

function DetailBody({
  property: p,
  locale,
  searched,
}: {
  property: PropertyDetail;
  locale: string;
  searched?: { moveIn: string; moveOut: string };
}) {
  const t = useTranslations();
  const td = useTranslations("detail");
  // `months` is taken here — it is the availability band below.
  const monthNames = useShortMonths();

  // `hiddenFromGallery` photos exist only to be referenced from the
  // description (Task 11) — they must never show up in the mosaic or the
  // "all photos" group, even though the document below can still resolve
  // and display them itself.
  //
  // Still memoized on `p.photos`, though the stakes dropped with YARL's
  // removal: the open Fancybox reads the DOM it was bound to, not this
  // array, so a fresh identity no longer resets anyone's slide — it only
  // re-renders every tile on each of this component's frequent state
  // changes (`recentre`, map selection all live here).
  const gallery = useMemo(
    () => p.photos.filter((ph) => !ph.isFloorplan && !ph.hiddenFromGallery),
    [p.photos],
  );
  const floorplan = p.photos.find((ph) => ph.isFloorplan);

  // ------------------------------------------------------------------
  // The neighbourhood section's shared state (ADR-040).
  //
  // FOUR things read the travel profile — the nearby list, the places list,
  // the description's place chips, and the map's route — and TWO lists can
  // put a line on the one map. Both therefore live here, at the only node
  // above all of them. Neither list owns a toggle or mounts a map of its own.
  // ------------------------------------------------------------------
  const [profile, setProfile] = useState<NearbyProfile>(DEFAULT_NEARBY_PROFILE);

  // Which list holds the selection, and which row in it. One selection across
  // both, because there is one map: a row highlighted in each while a single
  // line is drawn would be two answers to "what am I looking at".
  const [selection, setSelection] = useState<{ source: "nearby" | "place"; id: string } | null>(
    null,
  );
  const [mapDestination, setMapDestination] = useState<NeighbourhoodMapDestination | null>(null);
  const [mapRoute, setMapRoute] = useState<RouteBand | null>(null);

  // Either list raises this while a route is in flight; the map turns it into
  // a pulse on the pin it has already drawn (neither list may change height
  // mid-click). One flag per list rather than one shared: only one selection
  // exists at a time, but the list losing it and the list gaining it both
  // write in the same commit, and a single flag would depend on which wrote
  // last.
  const [nearbyPending, setNearbyPending] = useState(false);
  const [placePending, setPlacePending] = useState(false);

  // Clearing the map happens HERE and nowhere else. The lists only ever push a
  // destination they actually have; if each cleared on its own, moving the
  // selection between them would race — effects run in tree order, so exactly
  // one of "the new list draws, then the old one clears" and the reverse would
  // be wrong, depending on which list happened to be rendered first.
  const select = (source: "nearby" | "place", id: string) => {
    const same = selection?.source === source && selection.id === id;
    setSelection(same ? null : { source, id });
    // The old line goes immediately either way: on a new selection the list
    // replaces it within the frame, and a line left over from the previous
    // one would briefly point at the wrong place.
    setMapRoute(null);
    if (same) setMapDestination(null);
  };

  const drawRoute = useCallback(
    (destination: NeighbourhoodMapDestination, route: RouteBand | null) => {
      setMapDestination(destination);
      setMapRoute(route);
    },
    [],
  );

  // A place chip in the description (RichText, Task 11) selects the entry it
  // names and brings the map to it. The guard lives here rather than in the
  // list because the page is what knows both the entries and the active
  // profile: a chip still renders for an entry the current profile has no
  // figure for, and selecting one would scroll to a row that is not in the
  // grid and draw a route to a place the list does not show.
  const selectNearbyEntry = (entryId: string) => {
    const entry = p.nearby.find((e) => e.id === entryId);
    if (!entry || !publicReachFor(entry, profile)) return;
    // Selects; never deselects. A row in the list is visibly lit, so a second
    // click on it reads as "put that away" — but a chip in a sentence carries
    // no such state, it reads as a reference to a place, and a reference
    // followed twice should still arrive at the place. The scroll happens
    // either way: the click was a request to go and look.
    const already = selection?.source === "nearby" && selection.id === entryId;
    if (!already) {
      setSelection({ source: "nearby", id: entryId });
      // Same reason as `select`: the previous line goes now rather than in the
      // frame where it would be pointing at the wrong place.
      setMapRoute(null);
    }
    document
      .getElementById("neighbourhood")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Below `lg` the map is not sticky (see the section), so a click far down
  // the places list would draw a line nobody can see. `block: "nearest"`
  // leaves an already-visible map exactly where it is, which is the desktop
  // case — no jump on the viewport that does not need one.

  // Clicking the street plate puts the street back in the middle of the map.
  // A counter rather than a boolean: every click has to reach the map,
  // including the second one in a row, and a flag that is already `true`
  // says nothing.
  const [recentre, setRecentre] = useState(0);

  // The plate lights the band: while hovered, and for five seconds after a
  // click — long enough to find the blue line on the map the click just
  // recentred, short enough that the map is back to normal by the time the
  // reader is studying it. Two flags OR-ed into one prop: leaving the plate
  // after a click must not cut the flash short, and a flash ending must not
  // darken a band still hovered.
  const [plateHover, setPlateHover] = useState(false);
  const [plateFlash, setPlateFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const showOnMap = () => {
    setRecentre((n) => n + 1);
    revealMap();
    setPlateFlash(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setPlateFlash(false), 5000);
  };

  // The plate's copy control, back by owner amendment to ADR-041 point 1
  // (2026-08-07): only the house number was ever the leak. What lands on the
  // clipboard is the street and the city — pasted into a maps app it resolves
  // mid-street, the same disclosure as the band already drawn on the map.
  const [copied, setCopied] = useState(false);
  const copyStreet = async () => {
    if (!p?.streetName) return;
    try {
      await navigator.clipboard.writeText(`${p.streetName}, Zaragoza`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the text is on screen either way.
    }
  };

  // Bring the map back when a place is picked from a list that has scrolled
  // past it — and ONLY then. The guard is not an optimisation: from `lg` up
  // the map is sticky, so it is already on screen at every scroll position,
  // and `scrollIntoView` on a stuck element does not reveal anything. It
  // re-seats the page against the element's `scroll-mt-24` (96px) while
  // sticky holds it at 84px, a target it cannot satisfy — so a click that
  // should not have moved the page at all moves it by a fixed 68px.
  const revealMap = () => {
    const el = document.getElementById("neighbourhood-map");
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    if (top >= 0 && bottom <= window.innerHeight) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // A photo chip/figure in the description opens a single-photo lightbox —
  // deliberately not the mosaic's "all photos" group, which now excludes
  // `hiddenFromGallery` photos: a description-only photo has to stay
  // viewable when the text points at it, just never discoverable by
  // browsing the gallery. Resolved against the FULL photo list (including
  // floorplan and hidden ones), matching what the document itself can
  // reference. `showPhoto` opens imperatively, so nothing here holds state
  // for it — the referential-stability contract that used to live on this
  // list died with the props-driven lightbox it fed.
  const openGalleryAt = (url: string) => {
    const photo = p.photos.find((ph) => ph.url === url);
    if (photo) showPhoto(photo);
  };

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

  // "All homes" goes back to the list this home was opened from, filters and
  // all — same destination as Back, but reachable when Back isn't (a middle
  // click, a long session). Falls back to the bare list for a visitor who
  // arrived on a shared link. Safe to read storage while rendering: this
  // component only mounts once the fetch resolves, so it never hydrates.
  const [back] = useState(() => {
    const q = resultsQueryFor(p.id);
    return {
      href: q === null ? "/" : `/${q}`, // "" is a real answer: the bare list
      // When the list is going to scroll itself back to this card, Next must
      // not also scroll to top — whichever landed last would win, and which
      // one that is depends on how fast the properties fetch resolves.
      fromResults: q !== null,
    };
  });

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
      {/* Above everything, including the way back: it is the first thing true
          about this page. Only the owner of an unpublished listing ever gets
          a `previewStatus` — see PreviewNotice. */}
      {p.previewStatus && <PreviewNotice status={p.previewStatus} />}

      <Link
        href={back.href}
        scroll={!back.fromResults}
        className="text-sm text-muted hover:text-ink"
      >
        ← {td("allHomes")}
      </Link>

      {/* Only ever rendered for the owner of this listing, and only as a way
          back into their own portal — the API is what enforces that, not this.
          Above the title because it frames everything below it: an owner needs
          to know they are looking at the guest's view before they read it. */}
      <OwnerBar propertyId={p.id} />

      {/* Title. Was a two-column row until the placeholder host block beside
          it was removed; the flex wrapper went with it, since a
          justify-between with one child is layout that describes something no
          longer there. */}
      <div className="mt-4 min-w-0">
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
          {/* Neighbourhood only up here — the street's home is the plate in
              the location section (ADR-041 point 1 as amended 2026-08-07). */}
          <MapPin size={15} strokeWidth={2} aria-hidden />
          {biText(p.area, locale)}, Zaragoza
        </p>
      </div>

      <div className="mt-6">
        <FancyboxMosaic photos={gallery} hasFloorplan={!!floorplan} />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_minmax(0,380px)] lg:items-start">
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
            <RichText
              doc={biDoc(p.description, locale)}
              photos={p.photos}
              nearby={p.nearby}
              profile={profile}
              onPhoto={openGalleryAt}
              onPlace={selectNearbyEntry}
            />
            {biText(p.details, locale) && (
              <p className="mt-3 text-[0.96875rem] leading-relaxed">
                {biText(p.details, locale)}
              </p>
            )}
          </Section>

          {/* 3 — Amenities */}
          {p.amenities.length > 0 && (
            <Section title={td("offers")}>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  date: shortDate(
                    new Date(`${p.availableFrom}T00:00:00`),
                    monthNames,
                    { locale, year: true },
                  ),
                })}
              </p>
            )}
          </section>

          {/* 5 — Stay terms */}
          <Section title={td("stayTerms")}>
            <StayTerms property={p} locale={locale} />
          </Section>

          {/* 6 — Conditions */}
          <Section title={td("conditions")}>
            <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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

          {/* 7 — Where you'll be. What used to be three things — this map,
              the "Nearby" section, and "Your places" below it — is one
              section with one map at the top of it (ADR-040). Task 12 merged
              the first two because a route has to draw in the same viewport
              as the list it came from; the places list wants exactly the
              same thing, and giving it a second map and a second toggle was
              answering one question twice.

              A listing without a band (ADR-041 — degraded: the street could
              not be derived) shows no location section at all — there is
              nothing precise left to put a map, a route or a places list
              against. The area badge in the header still names the
              neighbourhood on its own. */}
          {p.band && (
            <Section id="neighbourhood" title={td("whereYouWillBe")}>
              {/* The street plate, back by owner amendment to ADR-041 point 1
                  (2026-08-07): the card was never the leak — the house number
                  on it was. It shows exactly what the band on the map shows,
                  street and neighbourhood, and keeps its two jobs: the text
                  takes you to the street on the map, the icon puts the
                  street-and-city line on your clipboard. Deliberately OUTSIDE
                  the sticky block: the map is what you keep, the street is
                  what you read once (and take with you). */}
              {p.streetName && (
                <div className="mb-4 flex w-fit max-w-full items-center gap-2 rounded-(--radius-card) border border-line bg-surface py-3 pl-4 pr-2 shadow-(--shadow-card) transition-colors duration-(--dur-standard) focus-within:border-brand-strong hover:border-brand-strong lg:mb-0">
                  <button
                    type="button"
                    onClick={showOnMap}
                    onMouseEnter={() => setPlateHover(true)}
                    onMouseLeave={() => setPlateHover(false)}
                    aria-label={td("addressShowOnMap")}
                    className="group flex min-w-0 items-center gap-4 text-left"
                  >
                    <MapPin
                      size={18}
                      strokeWidth={2}
                      aria-hidden
                      className="shrink-0 text-brand-strong transition-transform duration-(--dur-standard) group-hover:-translate-y-0.5"
                    />
                    <span className="min-w-0">
                      <span className="data block text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
                        {td("addressLabel")}
                      </span>
                      <span className="data mt-0.5 block truncate text-[0.9375rem] font-semibold text-ink group-hover:text-brand-strong">
                        {p.streetName}
                      </span>
                      {biText(p.area, locale) && (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {biText(p.area, locale)}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={copyStreet}
                    aria-label={td("addressCopy")}
                    className="ml-auto shrink-0 rounded-(--radius-control) p-2 text-muted transition-colors duration-(--dur-standard) hover:bg-surface-2 hover:text-brand-strong"
                  >
                    {/* The confirmation happens where the eye already is — on
                        the control just pressed. Both icons stack in one 16px
                        cell and cross-fade, so the button never changes size
                        and the row never reflows. */}
                    <span className="grid h-4 w-4 place-items-center">
                      <Copy
                        size={15}
                        strokeWidth={2}
                        aria-hidden
                        className={`col-start-1 row-start-1 transition-opacity duration-(--dur-standard) ${
                          copied ? "opacity-0" : "opacity-100"
                        }`}
                      />
                      <Check
                        size={16}
                        strokeWidth={2.5}
                        aria-hidden
                        className={`col-start-1 row-start-1 text-brand-strong transition-opacity duration-(--dur-standard) ${
                          copied ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    </span>
                    {copied && (
                      <span role="status" className="sr-only">
                        {td("addressCopied")}
                      </span>
                    )}
                  </button>
                </div>
              )}
              <div
                id="neighbourhood-map"
                // `bg-page` is what the list disappears behind on its way past,
                // so the box that carries it has to reach both edges of the gap
                // it is covering. It parks flush under the header — the 20px of
                // air above the map is this box's own padding, not an offset —
                // because a `top` that starts 20px lower leaves a 20px slot in
                // which rows reappear between the header and the map. Nothing
                // under it, for the same reason in reverse: padding there is a
                // strip of empty page between the map's edge and the row
                // sliding beneath it. The card's own border is the cut line.
                className="scroll-mt-24 lg:sticky lg:top-(--header-h) lg:z-10 lg:bg-page lg:pt-5"
              >
                <div className="relative">
                  <NeighbourhoodMap
                    band={p.band}
                    bandLabel={td("streetBand")}
                    bandHot={plateHover || plateFlash}
                    mapLabel={td("location")}
                    destination={mapDestination}
                    route={mapRoute}
                    routePending={nearbyPending || placePending}
                    recentre={recentre}
                    className="h-60"
                  />
                  {/* No credit line under the map: OpenStreetMap and
                      openrouteservice/HeiGIT are both named in the map's own
                      attribution banner, which is where a reader looks for them
                      and where the licences ask for them. */}
                  {/* The one travel control on this page, and it lives ON the
                      map, in the corner Leaflet leaves free. It governs the
                      route line drawn right beside it and the figures in both
                      lists below, so it belongs to the map the way the zoom
                      buttons do — and a control that costs the pinned block no
                      height is a control that never pushes those figures off
                      the screen.

                      19px, one inset at every width, and the number is read off
                      the thing below it: 1px of card border + the 17px
                      attribution band + 1px of daylight. On a phone that band
                      runs the full width of the map and would otherwise pass
                      behind this pill; clearing it by a hair beats a control
                      that hops up the moment the window narrows.

                      z-1000 matches Leaflet's own controls; later in the DOM
                      than the map, so it wins the tie and sits above them. */}
                  <div className="absolute bottom-[19px] left-3 z-[1000]">
                    <Segmented
                      label={t("detail.nearby.profileLabel")}
                      name="travel-profile"
                      value={profile}
                      options={NEARBY_PROFILES.map((x) => {
                        const Icon = PROFILE_ICONS[x];
                        return {
                          value: x,
                          label: t(`detail.nearby.profile.${x}`),
                          icon: <Icon size={16} strokeWidth={2} aria-hidden />,
                        };
                      })}
                      onChange={setProfile}
                      variant="overlay"
                    />
                  </div>
                </div>
              </div>

              {p.nearby.length > 0 && (
                <div id="whats-nearby" className="mt-8">
                  <Nearby
                    propertyId={p.id}
                    entries={p.nearby}
                    locale={locale}
                    profile={profile}
                    activeId={selection?.source === "nearby" ? selection.id : null}
                    onSelect={(id) => select("nearby", id)}
                    onRoute={drawRoute}
                    onPending={setNearbyPending}
                  />
                </div>
              )}

              {/* Last, because it is the guest's own list rather than the
                  listing's — and it is the one part of this section that keeps
                  showing for a home with no nearby entries at all. */}
              <div id="your-places" className="mt-8">
                <YourPlaces
                  propertyId={p.id}
                  locale={locale}
                  profile={profile}
                  activeId={selection?.source === "place" ? selection.id : null}
                  onSelect={(id) => {
                    select("place", id);
                    revealMap();
                  }}
                  onRoute={drawRoute}
                  onPending={setPlacePending}
                />
              </div>
            </Section>
          )}

          {/* 9 — Floor plan */}
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

        <BookingPanel
          property={p}
          locale={locale}
          booked={booked}
          searched={searched}
        />
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  subtitle,
  action,
  plain,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  /** A control beside the title — used only by "Where you'll be", for the
   *  "show on map" button that replaced the address plate (ADR-041). */
  action?: React.ReactNode;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={plain ? "" : "border-t border-line pt-8 scroll-mt-24"}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[1.375rem] font-semibold text-ink">
          {title}
        </h2>
        {action}
      </div>
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
      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_minmax(0,380px)]">
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
