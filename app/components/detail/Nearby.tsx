"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HeartPulse,
  ShoppingCart,
  TramFront,
  Trees,
  TriangleAlert,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError, fetchNearbyRoute, type PublicNearbyEntry, type RouteBand } from "@/lib/api";
import { NEARBY_GROUPS, publicReachFor, type NearbyGroup, type NearbyProfile } from "@/lib/nearby";
import { formatDistance } from "@/lib/geocode";
import { useDelayed } from "./measuring";
import { ReachInfo } from "./ReachInfo";
import { PROFILE_ICONS } from "@/lib/profile-icons";
import type { NeighbourhoodMapDestination } from "./NeighbourhoodMap";

// The guest's half of "what's nearby" (ADR-028, design §9 as amended by
// Task 12's merge): a card per group, entries ranked by the active profile's
// minutes, and a click that asks the map above this list to draw the real
// route.
//
// This list owns almost nothing. The travel profile and the current selection
// both live on the property page (ADR-040), because they are shared with
// "Your places" one list down and with the map both lists draw on — three
// components reading one answer, so exactly one of them can hold it, and it
// cannot be either list. What is left here is the part nobody else needs: the
// routes this list has already fetched.
//
// `onRoute` is only ever called WITH a destination, never with `(null, null)`
// to clear. Clearing belongs to whoever changed the selection — the page — and
// a list that cleared on its own would race the other list setting it: effects
// run in tree order, so "place selected, then nearby clears" and "nearby
// selected, then place clears" cannot both be right.

const CATEGORY_ICONS: Record<NearbyGroup, LucideIcon> = {
  transport: TramFront,
  groceries: ShoppingCart,
  food: UtensilsCrossed,
  outdoors: Trees,
  health: HeartPulse,
};

/** This listing's route for one entry under one profile. */
const routeKey = (entryId: string, profile: NearbyProfile) => `${entryId}|${profile}`;

export function Nearby({
  propertyId,
  entries,
  locale,
  profile,
  activeId,
  onSelect,
  onRoute,
  onPending,
}: {
  propertyId: string;
  entries: PublicNearbyEntry[];
  locale: string;
  /** Raised while a route is on its way, so the map can say so on the pin it
   *  has already drawn — the wait is reported THERE, not in this list, which
   *  must not change height mid-click. Only this list can tell "still coming"
   *  apart from "already failed", which is why the map cannot derive it from
   *  a null polyline. */
  onPending: (pending: boolean) => void;
  /** The page's toggle. This list renders no control of its own. */
  profile: NearbyProfile;
  /** The entry this list currently has selected, or null — including when the
   *  selection belongs to the places list instead. */
  activeId: string | null;
  onSelect: (entryId: string) => void;
  /** Fired when the active entry resolves: the destination point appears as
   *  soon as an entry is clicked (it comes from the document, so it never
   *  waits on ORS), and the route band follows once it arrives. */
  onRoute: (destination: NeighbourhoodMapDestination, route: RouteBand | null) => void;
}) {
  const t = useTranslations("detail.nearby");
  const tType = useTranslations("nearby");

  // Only the terminal states are stored, keyed by entry AND profile: absence
  // is "still measuring". That is what keeps every `setState` below inside a
  // promise callback instead of synchronously in an effect, and it means
  // switching profile and back redraws from memory rather than re-fetching.
  const [routes, setRoutes] = useState<Record<string, RouteBand>>({});
  const [errors, setErrors] = useState<Record<string, number>>({});

  // Read inside the fetch effect rather than named as a dependency: a new
  // arrow function arrives from the parent on every render, and reacting to
  // that would refetch the route on every unrelated re-render. Written in an
  // effect, not during render, because a ref is not render output.
  const onRouteRef = useRef(onRoute);
  useEffect(() => {
    onRouteRef.current = onRoute;
  }, [onRoute]);
  const routesRef = useRef(routes);
  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);
  const errorsRef = useRef(errors);
  useEffect(() => {
    errorsRef.current = errors;
  }, [errors]);

  const entryLookup = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  // Only the ACTIVE entry can be measuring, so the wait is one value on the
  // list rather than one per row — which is also what lets `useDelayed` be a
  // hook at all, since a hook cannot be called from inside the row loop.
  const activeEntry = activeId ? entryLookup.get(activeId) : undefined;
  const activeKey = activeId ? routeKey(activeId, profile) : "";
  const measuring =
    !!activeEntry &&
    !!publicReachFor(activeEntry, profile) &&
    !routes[activeKey] &&
    errors[activeKey] === undefined;
  const showMeasuring = useDelayed(measuring);

  // Tell the map. Same ref dance as `onRoute`: the parent hands us a new
  // function on every render.
  const onPendingRef = useRef(onPending);
  useEffect(() => {
    onPendingRef.current = onPending;
  }, [onPending]);
  useEffect(() => {
    onPendingRef.current(showMeasuring);
  }, [showMeasuring]);

  // One card per group, entries with no figure for the active profile
  // dropped (publicReachFor returns null — a place ORS genuinely could not
  // route to, not zero minutes), the rest ranked ascending by the fastest end
  // of the range, and any group left empty by that filter dropped from the
  // grid entirely.
  const groups = useMemo(
    () =>
      NEARBY_GROUPS.map((group) => ({
        group,
        list: entries
          .filter((e) => e.group === group)
          .flatMap((entry) => {
            const reach = publicReachFor(entry, profile);
            return reach ? [{ entry, reach }] : [];
          })
          .sort((a, b) => a.reach.minMinutes - b.reach.minMinutes),
      })).filter((g) => g.list.length > 0),
    [entries, profile],
  );

  // Draw the active entry, fetching its route the first time this profile
  // needs it. A profile switch re-runs this for whichever entry is still
  // selected, which is what "redraws any drawn line" means in practice; an
  // entry with no reach under the new profile has just left the grid, so it
  // draws nothing and the page's own selection is simply pointing at
  // something invisible until the guest clicks elsewhere.
  useEffect(() => {
    if (!activeId) return;
    const entry = entryLookup.get(activeId);
    if (!entry || !publicReachFor(entry, profile)) return;

    const key = routeKey(activeId, profile);
    const destination: NeighbourhoodMapDestination = {
      lat: entry.lat,
      lng: entry.lng,
      label: entry.name,
    };

    // The pin lands immediately — it is already known, and the same figure is
    // already on screen — carrying whatever band we have for it, which is the
    // real one on a revisit and none at all the first time.
    const known = routesRef.current[key];
    onRouteRef.current(destination, known ?? null);
    if (known || errorsRef.current[key] !== undefined) return;

    const controller = new AbortController();
    fetchNearbyRoute(propertyId, activeId, profile, controller.signal)
      .then((route) => {
        if (controller.signal.aborted) return;
        setRoutes((prev) => ({ ...prev, [key]: route }));
        onRouteRef.current(destination, route);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err as Error).name === "AbortError") return;
        setErrors((prev) => ({
          ...prev,
          [key]: err instanceof ApiError ? err.status : 0,
        }));
      });
    return () => controller.abort();
  }, [activeId, profile, propertyId, entryLookup]);

  // Selecting an entry that failed clears the failure first, so the effect
  // above measures again instead of returning the remembered error. Only on
  // the way IN: clicking the active entry puts the line away, and clearing
  // then would hide the message the guest is still reading.
  const click = (entryId: string) => {
    if (activeId !== entryId) {
      const key = routeKey(entryId, profile);
      setErrors((prev) => {
        if (prev[key] === undefined) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    onSelect(entryId);
  };

  // A known machine type reads through the catalogue; a type the catalogue
  // has no label for (served before its string shipped) falls back to
  // `unknownType`, same guard NearbyEditor's `typeLabel` uses and for the
  // same reason. A custom type has no catalogue entry at all — EN prefers
  // its own text and falls back to the Spanish one (always present, per
  // HostValidation), ES reads its own directly.
  const typeLabel = (entry: PublicNearbyEntry): string => {
    if (entry.type) {
      return tType.has(`type.${entry.type}` as "type.tram")
        ? tType(`type.${entry.type}` as "type.tram")
        : tType("unknownType");
    }
    if (entry.customType) {
      return locale === "en"
        ? (entry.customType.en ?? entry.customType.es ?? "")
        : (entry.customType.es ?? "");
    }
    return tType("unknownType");
  };

  // No entries on this listing at all: nothing to rank. The caller keeps the
  // map, the address and the places list; this half simply isn't there.
  if (entries.length === 0) return null;

  const ProfileIcon = PROFILE_ICONS[profile];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-display text-[1.375rem] font-semibold text-ink">{t("title")}</h3>
        {/* The subtitle says the figures come from the street; the popover
            says what follows from that — why one of them is a range and the
            next is a single number. Sat on the subtitle rather than the
            heading: it explains the figures, not the section. */}
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          {t(`subtitle.${profile}`)}
          <ReachInfo />
        </p>
      </div>

      {groups.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {groups.map(({ group, list }) => {
            const Icon = CATEGORY_ICONS[group];
            return (
              <div key={group} className="rounded-(--radius-card) border border-line bg-surface p-4">
                <p className="flex items-center gap-2 text-brand-strong">
                  <Icon size={16} strokeWidth={2} aria-hidden />
                  <span className="data text-[0.6875rem] uppercase tracking-[0.14em]">
                    {t(`category.${group}`)}
                  </span>
                  {/* What the minutes below are measured on, sitting over the
                      column they describe. Muted and small: it labels the
                      figures, it does not head the card — the category does.

                      Hidden from a screen reader on purpose. The subtitle
                      above these cards already says "Walking times from this
                      address" in words, and repeating it once per card is
                      noise for the one reader who cannot see that it is the
                      same icon every time. */}
                  <ProfileIcon
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    className="ml-auto shrink-0 text-muted"
                  />
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {list.map(({ entry, reach }) => {
                    const active = activeId === entry.id;
                    const key = routeKey(entry.id, profile);
                    const failed = errors[key];
                    const loading = active && showMeasuring;
                    return (
                      <li
                        key={entry.id}
                        // The tint needs a box, and a box needs padding — but
                        // the negative margin gives it straight back, so the
                        // rows sit exactly where they sat before and only the
                        // painted area is bigger.
                        className={`-mx-2 -my-1 rounded-(--radius-control) px-2 py-1 transition-colors duration-(--dur-standard) ${
                          active ? "bg-brand-soft" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => click(entry.id)}
                          aria-pressed={active}
                          className="flex w-full items-baseline justify-between gap-3 text-left"
                        >
                          <span className="min-w-0">
                            <span
                              className={`block truncate text-sm ${
                                active ? "font-semibold text-brand-strong" : "text-ink"
                              }`}
                            >
                              {entry.name}
                            </span>
                            <span className="block truncate text-xs text-muted">{typeLabel(entry)}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="data block text-sm font-semibold text-ink">
                              {reach.minMinutes === reach.maxMinutes
                                ? t("minutes", { count: reach.maxMinutes })
                                : t("minutesRange", { lo: reach.minMinutes, hi: reach.maxMinutes })}
                            </span>
                            <span className="data block text-xs text-muted">
                              {formatDistance(reach.metres, locale)}
                            </span>
                          </span>
                        </button>
                        {/* The wait shows on the MAP, which a screen reader
                            cannot see at all, so it is also said out loud —
                            this is the only report of it in the list. */}
                        {loading && (
                          <span role="status" className="sr-only">
                            {t("loadingRoute")}
                          </span>
                        )}
                        {active && failed !== undefined && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warn">
                            <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
                            {failed === 404 ? t("routeMissing") : t("routeUnavailable")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
