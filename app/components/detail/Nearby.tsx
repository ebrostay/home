"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  HeartPulse,
  Loader2,
  ShoppingCart,
  TramFront,
  Trees,
  TriangleAlert,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError, fetchNearbyRoute, type PublicNearbyEntry } from "@/lib/api";
import { NEARBY_GROUPS, NEARBY_PROFILES, reachFor, type NearbyGroup, type NearbyProfile } from "@/lib/nearby";
import { formatDistance } from "@/lib/geocode";
import { Segmented } from "@/components/host/fields/Segmented";
import type { NeighbourhoodMapDestination } from "./NeighbourhoodMap";

// The guest's half of "what's nearby" (ADR-028, design §9 as amended by
// Task 12's merge): a card per group, entries ranked by the active profile's
// minutes, and a click that asks the map beside this list to draw the real
// route. This component owns the profile toggle and the per-entry
// loading/error state; it only ever hands the PARENT the two things the map
// needs — which point is active and what line (if any) to draw — via
// `onRouteChange`, because the map lives in a sibling section (NeighbourhoodMap),
// not inside this one.

const CATEGORY_ICONS: Record<NearbyGroup, LucideIcon> = {
  transport: TramFront,
  groceries: ShoppingCart,
  food: UtensilsCrossed,
  outdoors: Trees,
  health: HeartPulse,
};

type EntryStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; status: number }
  | { kind: "ready" };

/** Imperative handle so a sibling section (the description's place chips,
 *  ADR-028 as amended for the rich-text renderer) can select an entry here
 *  without this component handing its internal `activeId`/`status` state to
 *  the parent — the same reasoning `onRouteChange` already documents for why
 *  the map only ever gets the two derived values, not the state itself. */
export type NearbyHandle = {
  select: (entryId: string) => void;
};

export const Nearby = forwardRef<NearbyHandle, {
  propertyId: string;
  entries: PublicNearbyEntry[];
  locale: string;
  /** Fired whenever the active entry or its route changes: the destination
   *  point appears as soon as an entry is clicked (before the route
   *  resolves — it comes from the document, same reasoning as the figures
   *  never disappearing on a failed lookup), and the polyline follows once
   *  ORS answers. `(null, null)` means nothing is active. */
  onRouteChange: (destination: NeighbourhoodMapDestination | null, polyline: string | null) => void;
  /** So the description section (RichText) can label its own place chips
   *  under whichever profile is active here — the two sections show the same
   *  figures, and a chip that disagreed with the list beside it would read as
   *  a bug. */
  onProfileChange?: (profile: NearbyProfile) => void;
}>(function Nearby({ propertyId, entries, locale, onRouteChange, onProfileChange }, ref) {
  const t = useTranslations("detail.nearby");
  const tType = useTranslations("nearby");

  const [profile, setProfile] = useState<NearbyProfile>("foot");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<EntryStatus>({ kind: "idle" });

  // Read inside the fetch effect rather than named as a dependency: a new
  // arrow function arrives from the parent on every render, and reacting to
  // that would refetch the route on every unrelated re-render. Written in an
  // effect, not during render, for the reason NearbyMap's header gives for
  // its own handler refs.
  const onRouteChangeRef = useRef(onRouteChange);
  useEffect(() => {
    onRouteChangeRef.current = onRouteChange;
  }, [onRouteChange]);

  const entryLookup = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  // One card per group, entries with no figure for the active profile
  // dropped (reachFor returns null — a place ORS genuinely could not route
  // to, not zero minutes), the rest ranked ascending, and any group left
  // empty by that filter dropped from the grid entirely.
  const groups = useMemo(
    () =>
      NEARBY_GROUPS.map((group) => ({
        group,
        list: entries
          .filter((e) => e.group === group)
          .flatMap((entry) => {
            const reach = reachFor(entry, profile);
            return reach ? [{ entry, reach }] : [];
          })
          .sort((a, b) => a.reach.minutes - b.reach.minutes),
      })).filter((g) => g.list.length > 0),
    [entries, profile],
  );

  // Fetch the route whenever the active entry, the profile, or a retry
  // (`attempt`) changes. A profile switch re-runs this for whichever entry
  // is still active, which is what "redraws any drawn line" means in
  // practice; `selectProfile` below clears the selection first if the newly
  // active profile has no figure for it at all (the entry would otherwise
  // vanish from the grid while still "active").
  //
  // The transition INTO "loading" happens in the event handlers below
  // (`selectEntry`/`selectProfile`), never synchronously here — same
  // reasoning as NearbyEditor's candidate search and preview-route effects:
  // this effect's own body only ever calls `setStatus` from inside the
  // fetch's `.then`/`.catch`.
  useEffect(() => {
    if (!activeId) return;
    const entry = entryLookup.get(activeId);
    if (!entry) return;

    const destination: NeighbourhoodMapDestination = {
      lat: entry.lat,
      lng: entry.lng,
      label: entry.name,
    };
    // Clear any previous line immediately: the destination pin should never
    // lag behind the click, even though the route itself takes a moment.
    onRouteChangeRef.current(destination, null);

    const controller = new AbortController();
    fetchNearbyRoute(propertyId, activeId, profile, controller.signal)
      .then((route) => {
        if (controller.signal.aborted) return;
        setStatus({ kind: "ready" });
        onRouteChangeRef.current(destination, route.polyline);
      })
      .catch((err) => {
        if (controller.signal.aborted || (err as Error).name === "AbortError") return;
        setStatus({ kind: "error", status: err instanceof ApiError ? err.status : 0 });
      });
    return () => controller.abort();
  }, [activeId, profile, attempt, propertyId, entryLookup]);

  const selectProfile = (next: NearbyProfile) => {
    setProfile(next);
    onProfileChange?.(next);
    if (!activeId) return;
    const entry = entryLookup.get(activeId);
    if (!entry || !reachFor(entry, next)) {
      // The active entry has nothing to show under the new profile — it is
      // about to disappear from the grid, so there is nothing left to be
      // "active" and no line left to draw.
      setActiveId(null);
      setStatus({ kind: "idle" });
      onRouteChangeRef.current(null, null);
    } else {
      setStatus({ kind: "loading" });
    }
  };

  // Every click re-triggers a fetch, including a second click on the entry
  // already active — the `/route` response is cached for 86400s server-side
  // (NearbyFunctions.Route), so a repeat click costs the browser's HTTP
  // cache, not a fresh call.
  const selectEntry = (id: string) => {
    setActiveId(id);
    setStatus({ kind: "loading" });
    setAttempt((n) => n + 1);
  };

  // The only thing exposed to the parent beyond `onRouteChange`: a place
  // chip in the description asking this list to select an entry it already
  // knows about. An id this listing doesn't have (should never happen — the
  // document only ever references ids the server validated) is a no-op
  // rather than a crash.
  useImperativeHandle(ref, () => ({
    select: (id: string) => {
      if (entryLookup.has(id)) selectEntry(id);
    },
  }));

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

  // No entries on this listing at all: nothing to rank, nothing to toggle.
  // The caller keeps the map and the address; this half simply isn't there.
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-display text-[1.375rem] font-semibold text-ink">{t("title")}</h3>
        <p className="mt-1 text-sm text-muted">{t(`subtitle.${profile}`)}</p>
      </div>

      <Segmented
        label={t("profileLabel")}
        name="nearby-profile"
        value={profile}
        options={NEARBY_PROFILES.map((p) => ({ value: p, label: t(`profile.${p}`) }))}
        onChange={selectProfile}
      />

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
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {list.map(({ entry, reach }) => {
                    const active = activeId === entry.id;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => selectEntry(entry.id)}
                          aria-pressed={active}
                          className="flex w-full items-baseline justify-between gap-3 text-left"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-ink">{entry.name}</span>
                            <span className="block truncate text-xs text-muted">{typeLabel(entry)}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="data block text-sm font-semibold text-ink">
                              {t("minutes", { count: reach.minutes })}
                            </span>
                            <span className="data block text-xs text-muted">
                              {formatDistance(reach.metres, locale)}
                            </span>
                          </span>
                        </button>
                        {active && status.kind === "loading" && (
                          <p role="status" className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                            <Loader2 size={12} strokeWidth={2.2} className="animate-spin" aria-hidden />
                            {t("loadingRoute")}
                          </p>
                        )}
                        {active && status.kind === "error" && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warn">
                            <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
                            {status.status === 404 ? t("routeMissing") : t("routeUnavailable")}
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
});
