"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Plus, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { fetchPlaceRoute } from "@/lib/api";
import { formatDistance, geocode, type GeoCandidate } from "@/lib/geocode";
import { type NearbyProfile } from "@/lib/nearby";
import {
  MAX_PLACES,
  loadPlaces,
  readCachedRoute,
  routeKey,
  storePlaces,
  writeCachedRoute,
  type CachedRoute,
  type SavedPlace,
} from "@/lib/places";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useDelayed } from "./measuring";
import { PROFILE_ICONS } from "./profileIcons";
import type { NeighbourhoodMapDestination } from "./NeighbourhoodMap";

// ============================================================
// "Your places" — the other half of the neighbourhood question. "What's
// nearby" answers what is around the home; this answers the thing a
// relocating tenant actually decides on, which is how far the home is from
// the one address they cannot change.
//
// Measured, never estimated. The first version of this section asked the
// guest to type a distance in kilometres and turned it into minutes with a
// table of average speeds — a number that looked like a fact and was not one.
// It now asks only for the address and routes it exactly as the nearby list
// does: same OpenRouteService profiles, same figures, same map (ADR-039).
//
// Literally the same map, and the same toggle. Both live on the property page
// and are shared with the nearby list (ADR-040) — this list renders no control
// of its own and mounts no map of its own. `onRoute` is only ever called WITH
// a destination; clearing is the page's job, for the reason `Nearby.tsx`
// spells out.
//
// What stays local is the guest's side of it. The places live in this browser
// (`lib/places.ts`) and are never sent to us for storage — an office address
// is not something a rental site needs to keep — and so do the routes measured
// for them, which is what stops five saved places from costing five outbound
// calls on every listing view.
// ============================================================

/** Long enough that a pause reads as "done typing", short enough that the
 *  result is there before the eye leaves the field. Same figure as the
 *  listing editor's address lookup, and for the same reason. */
const DEBOUNCE_MS = 800;

/** More matches than this is a query too vague to choose from — the answer is
 *  a better query, not a longer list. */
const MAX_CANDIDATES = 5;

/** Only the two terminal states are stored. "Measuring" is the absence of an
 *  entry, which is what lets every `setState` here happen inside a promise
 *  callback rather than synchronously in an effect. */
type RouteState = { kind: "ready"; route: CachedRoute } | { kind: "error" };

export function YourPlaces({
  propertyId,
  locale,
  profile,
  activeId,
  onSelect,
  onRoute,
  onPending,
}: {
  propertyId: string;
  locale: string;
  /** The page's toggle, shared with the nearby list. */
  profile: NearbyProfile;
  /** The place this list currently has selected, or null — including when the
   *  selection belongs to the nearby list instead. */
  activeId: string | null;
  onSelect: (placeId: string) => void;
  onRoute: (destination: NeighbourhoodMapDestination, polyline: string | null) => void;
  /** Raised while the SELECTED place's route is on its way, so the map can say
   *  so on its pin — the same contract the nearby list has. Rarely true in
   *  practice: every place measures on mount, so by the time one is clicked
   *  its figure is usually already there. */
  onPending: (pending: boolean) => void;
}) {
  const t = useTranslations("detail.places");

  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [routes, setRoutes] = useState<Record<string, RouteState>>({});

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<GeoCandidate[]>([]);
  const [lookup, setLookup] = useState<"idle" | "searching" | "none" | "error">("idle");

  // localStorage cannot be read while rendering without breaking hydration —
  // the prerendered HTML has no idea what is in it — so the first paint is the
  // empty state and the saved places arrive on mount. Same shape as
  // ThemeToggle.
  useEffect(() => {
    // The store is unreadable until the client is running, so this state
    // cannot be seeded during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaces(loadPlaces());
  }, []);

  const persist = (next: SavedPlace[]) => {
    setPlaces(next);
    storePlaces(next);
  };

  // ----------------------------------------------------------------
  // Measuring
  // ----------------------------------------------------------------
  //
  // One route per place per profile, cache first.
  //
  // `inFlight` is the whole dedupe: a key is added when its measurement starts
  // and removed only if it FAILS, so a resolved route is never measured twice
  // — switching to `car` and back costs nothing, and a failed one retries the
  // next time this effect runs. It is a ref rather than state because nothing
  // renders from it and holding it in state would re-run the effect that
  // writes it.
  //
  // Each measurement carries its OWN AbortController, and the effect returns
  // no cleanup. A shared one torn down per run would abort four healthy
  // fetches the moment a fifth place was added — after the requests had
  // already reached ORS, so the retry would spend the allowance twice. The
  // only thing that legitimately cancels these is the page going away, which
  // is the unmount effect below.
  const inFlight = useRef(new Map<string, AbortController>());
  useEffect(
    () => () => {
      for (const controller of inFlight.current.values()) controller.abort();
    },
    [],
  );

  useEffect(() => {
    for (const place of places) {
      const key = routeKey(propertyId, place, profile);
      if (inFlight.current.has(key)) continue;

      const controller = new AbortController();
      inFlight.current.set(key, controller);

      const cached = readCachedRoute(propertyId, place, profile);
      // A cache hit resolves through the same promise as a fetch rather than
      // setting state on the spot: one path for both means the loading frame
      // (a microtask long, here) is the only thing that differs between them —
      // and no `setState` in this effect ever runs synchronously.
      const measuring: Promise<CachedRoute> = cached
        ? Promise.resolve(cached)
        : fetchPlaceRoute(propertyId, place, profile, controller.signal).then((route) => {
            writeCachedRoute(propertyId, place, profile, route);
            return { ...route, at: Date.now() };
          });

      measuring
        .then((route) => {
          if (controller.signal.aborted) return;
          setRoutes((prev) => ({ ...prev, [key]: { kind: "ready", route } }));
        })
        .catch((err: unknown) => {
          // Dropped from `inFlight` so the next run retries: a 503 is a
          // moment, not a verdict.
          inFlight.current.delete(key);
          if (controller.signal.aborted || (err as Error).name === "AbortError") return;
          // A 404 (this listing is gone) and a 503 (routing is down) read the
          // same to a guest looking at one row: this figure is missing. The
          // difference matters to us, not to them, so both land here.
          setRoutes((prev) => ({ ...prev, [key]: { kind: "error" } }));
        });
    }
  }, [places, profile, propertyId]);

  // The selected place's own wait, reported to the map exactly as the nearby
  // list reports its own — one vocabulary for "measuring" across both lists,
  // and the same 300ms floor, so a cached route (the common case here, since
  // every place measures on mount) never makes the pin twitch.
  const activePlace = places.find((p) => p.id === activeId);
  const activeMeasuring =
    !!activePlace && !routes[routeKey(propertyId, activePlace, profile)];
  const showMeasuring = useDelayed(activeMeasuring);

  const onPendingRef = useRef(onPending);
  useEffect(() => {
    onPendingRef.current = onPending;
  }, [onPending]);
  useEffect(() => {
    onPendingRef.current(showMeasuring);
  }, [showMeasuring]);

  // ----------------------------------------------------------------
  // Adding
  // ----------------------------------------------------------------

  const searchable = query.trim().length >= 4;

  useEffect(() => {
    if (!adding || !searchable) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLookup("searching");
      geocode(query, locale, controller.signal)
        .then((hits) => {
          if (controller.signal.aborted) return;
          setFound(hits.slice(0, MAX_CANDIDATES));
          setLookup(hits.length === 0 ? "none" : "idle");
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || (err as Error).name === "AbortError") return;
          setFound([]);
          setLookup("error");
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [adding, query, searchable, locale]);

  const closeAdd = () => {
    setAdding(false);
    setQuery("");
    setFound([]);
    setLookup("idle");
  };

  const save = (c: GeoCandidate) => {
    // Nominatim's place id is the identity: picking the same office twice,
    // from two differently-typed queries, is one place and not two.
    if (places.length >= MAX_PLACES || places.some((p) => p.id === c.placeId)) return;
    persist([
      ...places,
      {
        id: c.placeId,
        label: c.label,
        // The barrio and the postcode, not Nominatim's `display_name`: the
        // long form leads with whatever the query matched ("Unión de
        // Consumidores de Aragón, 20, …") and then repeats the street the
        // label already shows. Two facts the label does not carry are worth a
        // second line; a restatement of the first one is not.
        detail: [c.area, c.postcode].filter(Boolean).join(" · "),
        lat: c.lat,
        lng: c.lng,
      },
    ]);
    closeAdd();
  };

  const remove = (place: SavedPlace) => {
    // Deselect through the page, not locally: it owns the selection, and a
    // removed place must not leave its line drawn on the shared map.
    if (activeId === place.id) onSelect(place.id);
    persist(places.filter((p) => p.id !== place.id));
  };

  // ----------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------
  //
  // Hand the page whatever we have for the selected place: the destination
  // immediately (it is a saved coordinate — it never waits on ORS), and the
  // line as soon as the measurement lands, which is what re-running on
  // `routes` is for. Never called with null; clearing belongs to the page.
  const onRouteRef = useRef(onRoute);
  useEffect(() => {
    onRouteRef.current = onRoute;
  }, [onRoute]);

  useEffect(() => {
    if (!activeId) return;
    const place = places.find((p) => p.id === activeId);
    if (!place) return;
    const state = routes[routeKey(propertyId, place, profile)];
    onRouteRef.current(
      { lat: place.lat, lng: place.lng, label: place.label },
      state?.kind === "ready" ? state.route.polyline : null,
    );
  }, [activeId, places, routes, profile, propertyId]);

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  const full = places.length >= MAX_PLACES;
  const Icon = PROFILE_ICONS[profile];

  return (
    <section className="rounded-(--radius-card) border border-brand bg-brand-soft p-5 sm:p-6">
      {/* The heading, and what the figures down the right-hand side are
          measured on. In words as well as an icon: the nearby list can hide
          the same icon from a screen reader because its subtitle already says
          "Walking times from this address", and nothing in this section says
          it at all. */}
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[1.375rem] font-semibold text-ink">{t("title")}</h2>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <Icon size={14} strokeWidth={2} aria-hidden />
          {t(`timesBy.${profile}`)}
        </span>
      </div>
      <p className="mt-1.5 max-w-[60ch] text-sm text-body">{t("intro")}</p>

      {places.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2">
          {places.map((place) => {
            const state = routes[routeKey(propertyId, place, profile)];
            const selected = place.id === activeId;
            return (
              <li
                key={place.id}
                className={`flex items-center gap-3 rounded-(--radius-control) border bg-surface px-3 py-2.5 transition-colors duration-(--dur-standard) ${
                  selected ? "border-brand-strong" : "border-line"
                }`}
              >
                <button
                  type="button"
                  // Draws this place's route on the shared map above. A second
                  // click clears the line — the guest is comparing figures in
                  // the list, and a drawing they cannot put away is in the way.
                  onClick={() => onSelect(place.id)}
                  aria-pressed={selected}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors duration-(--dur-standard) ${
                      selected
                        ? "bg-brand text-white"
                        : "bg-brand-soft text-brand-strong"
                    }`}
                  >
                    {/* A pin, not the travel icon it used to be: the profile
                        is stated once in the heading above now, and the same
                        glyph repeated down every row said nothing a reader
                        could act on. What the chip says instead is what the
                        row is — a place you saved — and its fill is still
                        what says which one is drawn on the map. */}
                    <MapPin size={17} strokeWidth={2} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {place.label}
                    </span>
                    {place.detail && (
                      <span className="block truncate text-xs text-muted">{place.detail}</span>
                    )}
                  </span>
                  {/* One height for all three states. The figures genuinely do
                      not exist until the route lands here — unlike the nearby
                      list, whose minutes come from the document — so this slot
                      has to hold their place rather than fill it late: every
                      row measures at once on mount, and a list that grew a
                      line per row as the answers arrived would walk the whole
                      page up under the reader. `min-h-9` is the ready state's
                      own two lines (20px + 16px). */}
                  <span className="flex min-h-9 shrink-0 flex-col justify-center text-right">
                    {state?.kind === "ready" ? (
                      <>
                        <span className="data block text-sm font-semibold text-ink">
                          {t("minutes", { count: Math.max(1, Math.round(state.route.seconds / 60)) })}
                        </span>
                        <span className="data block text-xs text-muted">
                          {formatDistance(state.route.metres, locale)}
                        </span>
                      </>
                    ) : state?.kind === "error" ? (
                      <span className="flex items-center gap-1.5 text-xs text-warn">
                        <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
                        {t("routeUnavailable")}
                      </span>
                    ) : (
                      // Still measuring: a placeholder, not a spinner. The row
                      // is already marked as selected and the map's pin does
                      // the "working on it" — a second animation here would
                      // narrate the same wait twice, once in the place the
                      // reader is not looking.
                      <span className="data block text-sm font-semibold text-muted" aria-hidden>
                        —
                      </span>
                    )}
                    {!state && (
                      <span role="status" className="sr-only">
                        {t("measuring")}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(place)}
                  aria-label={t("remove", { name: place.label })}
                  className="shrink-0 rounded-full p-1 text-muted transition-colors duration-(--dur-standard) hover:text-ink"
                >
                  <X size={15} strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="mt-5 rounded-(--radius-control) border border-line bg-surface p-4">
          <Field
            label={t("addressLabel")}
            hint={
              lookup === "searching"
                ? t("searching")
                : lookup === "none"
                  ? t("noMatch")
                  : lookup === "error"
                    ? t("lookupFailed")
                    : t("addressHint")
            }
          >
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={query}
                autoFocus
                placeholder={t("addressPlaceholder")}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </Field>

          {found.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {found.map((c) => {
                const saved = places.some((p) => p.id === c.placeId);
                return (
                  <li key={c.placeId}>
                    <button
                      type="button"
                      onClick={() => save(c)}
                      disabled={saved}
                      title={c.detail}
                      className="flex w-full items-center gap-2 rounded-(--radius-control) px-3 py-2 text-left text-sm text-body transition-colors duration-(--dur-standard) hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
                    >
                      <MapPin size={14} strokeWidth={2} className="shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      {saved && (
                        <span className="shrink-0 text-xs text-muted">{t("alreadySaved")}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4">
            <Button variant="ghost" onClick={closeAdd}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          {full ? (
            <p className="text-xs text-muted">{t("limitReached", { count: MAX_PLACES })}</p>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <Plus size={16} strokeWidth={2.2} aria-hidden />
                {t("add")}
              </Button>
              {places.length === 0 && (
                <p className="mt-2.5 text-xs text-muted">{t("empty")}</p>
              )}
            </>
          )}
        </div>
      )}
      {/* No attribution line here: these figures come from the same
          OpenRouteService answer the nearby list shows, and the credit for it
          sits once, in the attribution banner of the map both lists draw on. */}
    </section>
  );
}
