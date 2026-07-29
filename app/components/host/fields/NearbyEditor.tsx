"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, RotateCw, Search, TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  biText,
  fetchNearbyCandidates,
  fetchNearbyVocabulary,
  fetchPreviewRoute,
  type HostNearbyEntry,
  type NearbyCandidate,
  type NearbyReachMap,
} from "@/lib/api";
import { NEARBY_GROUPS, NEARBY_PROFILES, reachFor, type NearbyGroup } from "@/lib/nearby";
import { formatDistance } from "@/lib/geocode";
import { ChipGroup } from "./ChipGroup";
import { NearbyMap, type NearbyMapPin } from "./NearbyMap";
import { TextField } from "./TextField";

// The owner's half of "what's nearby" (ADR-028 Decision 7, design §7.1): pick
// a group, search around the pin, and choose what the listing mentions. The
// list is the source of truth throughout — every candidate is addable from it
// with no pointer — and the map is the enhancement layered on top: a click
// (never a hover, which would fire a request per mouse movement) draws the
// walking route to whichever pin or row is active.
//
// The type vocabulary is fetched, never hard-coded — `NearbyGroups.cs` is its
// one definition (see `lib/nearby.ts`'s header). A type can arrive over the
// wire before its catalogue label exists, so every label lookup goes through
// `typeLabel`, which hides rather than throws.
//
// A brand-new entry gets a CLIENT id (`tempId`) purely so React and the
// remove button have something to key on before the save round-trip. The
// server never trusts it: `HostDetailsUpdate` only matches a client id
// against ids already stored on this same document, so this one simply fails
// to match, is treated as new, and is measured again — from scratch, both
// profiles — before it is written. What is shown here (from the candidate
// search's own measurement, or from the manual drop's own preview-route
// pair) is a preview, not the figure that ends up saved; it is honest because
// it comes from the same ORS the server itself calls.

/** Mirrors `HostValidation.MaxNearby`/`MaxNearbyPerGroup` (api/Models/HostWrites.cs).
 *  Duplicated on purpose, same reasoning as `PhotoManager`'s `MAX_PHOTOS`: the
 *  server enforces it for real, this only stops the owner reaching the wall
 *  blind. */
const MAX_TOTAL = 24;
const MAX_PER_GROUP = 6;
/** Mirrors `HostValidation.MaxNearbyNameLength` / `MaxNearbyCustomTypeLength`. */
const MAX_NAME = 80;
const MAX_CUSTOM = 40;

/** Sentinel for "Other…" in a native `<select>`, which cannot carry `null`
 *  as an option value. Never sent anywhere — every read of the select
 *  translates it back to `null` immediately. */
const OTHER = "__other__";

const tempId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** A candidate row's own name/select button, as a plain DOM id rather than a
 *  collected ref: focus needs to land on a row whose osmId is only known
 *  once an add has happened (see `focusCandidateAfterAdd`), and
 *  `document.getElementById` needs no CSS-escaping of an osmId's characters
 *  the way a `querySelector` would. */
const candidateButtonId = (osmId: string) => `nearby-candidate-${osmId}`;

type Vocab =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; types: Partial<Record<NearbyGroup, string[]>> };

type Search =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; candidates: NearbyCandidate[] };

type Measure =
  | { kind: "idle" }
  | { kind: "measuring" }
  | { kind: "error" }
  | { kind: "ready"; reach: NearbyReachMap };

/** A candidate row's pending type choice, before "Add" is pressed. Seeded
 *  lazily from the candidate's own OSM-derived type — see `draftFor`. */
type Draft = { type: string | null; es: string; en: string };

export function NearbyEditor({
  value,
  lat,
  lng,
  onChange,
}: {
  value: HostNearbyEntry[];
  lat: number;
  lng: number;
  onChange: (value: HostNearbyEntry[]) => void;
}) {
  const t = useTranslations("host.edit.nearby");
  const tType = useTranslations("nearby");
  const locale = useLocale();

  const [activeGroup, setActiveGroup] = useState<NearbyGroup>("transport");
  const [finderOpen, setFinderOpen] = useState(false);

  const [vocab, setVocab] = useState<Vocab>({ kind: "loading" });
  const [search, setSearch] = useState<Search>({ kind: "idle" });
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const [activeId, setActiveId] = useState<string | null>(null);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);

  const [dropMode, setDropMode] = useState(false);
  const [dropPoint, setDropPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [measure, setMeasure] = useState<Measure>({ kind: "idle" });
  const [measureAttempt, setMeasureAttempt] = useState(0);
  const [manualName, setManualName] = useState("");
  const [manualType, setManualType] = useState<string | null>(null);
  const [manualEs, setManualEs] = useState("");
  const [manualEn, setManualEn] = useState("");

  // The "Add manually" control itself — the fallback focus target for a
  // manual add made while the search list is empty, so focus still lands
  // somewhere in the finder rather than nowhere at all.
  const manualAddButtonRef = useRef<HTMLButtonElement>(null);

  // The vocabulary, once. Translations for it live in the message
  // catalogues (bundled), but WHICH keys are valid per group is server data
  // — this is the one call in the whole editor with no retry UI of its own,
  // because losing it does not block adding anything (see `typesUnavailable`).
  useEffect(() => {
    const controller = new AbortController();
    fetchNearbyVocabulary(controller.signal)
      .then((v) => {
        if (controller.signal.aborted) return;
        const types: Partial<Record<NearbyGroup, string[]>> = {};
        for (const g of v.groups) types[g.key as NearbyGroup] = g.types;
        setVocab({ kind: "ready", types });
      })
      .catch((err) => {
        if (controller.signal.aborted || (err as Error).name === "AbortError") return;
        setVocab({ kind: "error" });
      });
    return () => controller.abort();
  }, []);

  // The candidate search — only while the finder is open, and re-run whenever
  // the active group changes (each group is its own Overpass query) or the
  // retry button is pressed. The transition INTO "loading" is set by whatever
  // event handler opens the finder, changes the group, or presses retry
  // (below) — never synchronously here — so this effect's own body only ever
  // calls setState from inside the fetch's `.then`/`.catch`.
  useEffect(() => {
    if (!finderOpen) return;
    const controller = new AbortController();
    fetchNearbyCandidates(lat, lng, activeGroup, controller.signal)
      .then((candidates) => {
        if (controller.signal.aborted) return;
        setSearch({ kind: "ready", candidates });
      })
      .catch((err) => {
        if (controller.signal.aborted || (err as Error).name === "AbortError") return;
        setSearch({ kind: "error" });
      });
    return () => controller.abort();
  }, [finderOpen, activeGroup, lat, lng, searchAttempt]);

  // Opening the finder, closing it, switching group, retrying a failed
  // search, and picking a pin all reset some slice of the finder's state.
  // Done here, as the event handlers that cause them, rather than reactively
  // in effects: each is a one-off action, not a value this component is
  // synchronizing with an external system.
  const openFinder = () => {
    if (!finderOpen) setSearch({ kind: "loading" });
    setFinderOpen(true);
  };
  const closeFinder = () => {
    setFinderOpen(false);
    setSearch({ kind: "idle" });
    setActiveId(null);
    setRoutePolyline(null);
    setDropMode(false);
    setDropPoint(null);
    setMeasure({ kind: "idle" });
    setDrafts({});
  };
  const retrySearch = () => {
    setSearch({ kind: "loading" });
    setSearchAttempt((n) => n + 1);
  };
  const selectGroup = (g: NearbyGroup) => {
    setActiveGroup(g);
    setActiveId(null);
    setRoutePolyline(null);
    if (finderOpen) setSearch({ kind: "loading" });
  };
  const selectPin = (id: string | null) => {
    setActiveId(id);
    setRoutePolyline(null);
  };

  const chosenForGroup = useMemo(
    () =>
      value
        .filter((e) => e.group === activeGroup)
        // Walking time, ascending — the editor's own ranking (spec §7.1),
        // nulls (no foot figure at all) last rather than first.
        .slice()
        .sort(
          (a, b) =>
            (reachFor(a, "foot")?.metres ?? Number.POSITIVE_INFINITY) -
            (reachFor(b, "foot")?.metres ?? Number.POSITIVE_INFINITY),
        ),
    [value, activeGroup],
  );

  // Which of this group's candidates the owner has already chosen — used to
  // grey out "Added" candidate rows, keep already-chosen pins off the
  // candidates layer, and find the next still-addable row to focus after an
  // add (see `focusCandidateAfterAdd`/`focusAfterManualAdd` below, both of
  // which close over this).
  const chosenOsmIds = useMemo(
    () => new Set(chosenForGroup.map((e) => e.osmId).filter((id): id is string => id !== null)),
    [chosenForGroup],
  );

  // A point already on the map (candidate or already-chosen) that a click can
  // resolve to, for the route-preview effect below.
  const pinLookup = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    if (search.kind === "ready") for (const c of search.candidates) map.set(c.osmId, c);
    for (const e of chosenForGroup) map.set(e.id, e);
    return map;
  }, [search, chosenForGroup]);

  // Click, not hover: this effect only ever runs from `selectPin` (the
  // explicit onPick/row-click handler above), never from pointer movement.
  // `selectPin` already clears `routePolyline` synchronously, so this effect
  // only ever needs to set it again once a fetch actually resolves. A
  // failure here is silent by design (spec §8.1: "the line does not draw,
  // figures unaffected") — the walking figure already shown came from the
  // candidate search or the saved entry, not from this preview.
  useEffect(() => {
    if (!activeId) return;
    const point = pinLookup.get(activeId);
    if (!point) return;
    const controller = new AbortController();
    fetchPreviewRoute({ lat, lng }, point, "foot", controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setRoutePolyline(r.polyline);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRoutePolyline(null);
      });
    return () => controller.abort();
  }, [activeId, pinLookup, lat, lng]);

  // Measuring a manually dropped point — the one place the owner never types
  // a distance: both profiles are fetched so the saved entry carries the same
  // shape a candidate does, even though only `foot` is ever shown here. The
  // transition into "measuring" happens where `dropPoint` is set (the map's
  // `onDrop`) and on retry, both event handlers rather than this effect body.
  useEffect(() => {
    if (!dropPoint) return;
    const controller = new AbortController();
    Promise.allSettled(
      NEARBY_PROFILES.map((profile) =>
        fetchPreviewRoute({ lat, lng }, dropPoint, profile, controller.signal).then(
          (r) => [profile, r] as const,
        ),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const reach: NearbyReachMap = {};
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const [profile, line] = r.value;
        reach[profile] = { metres: Math.round(line.metres), minutes: Math.round(line.seconds / 60) };
      }
      // No walking figure at all means nothing to rank or show — the same
      // rule the server applies when it re-measures this same point.
      if (!reach.foot) {
        setMeasure({ kind: "error" });
        return;
      }
      setMeasure({ kind: "ready", reach });
    });
    return () => controller.abort();
  }, [dropPoint, lat, lng, measureAttempt]);

  const groupCountOf = (g: NearbyGroup) => value.filter((e) => e.group === g).length;
  const atGroupCap = groupCountOf(activeGroup) >= MAX_PER_GROUP;
  const atTotalCap = value.length >= MAX_TOTAL;
  const capped = atGroupCap || atTotalCap;
  const capMessage = atTotalCap ? t("limitReached") : atGroupCap ? t("groupFull") : null;

  // Never a raw machine key: the vocabulary arrives over the wire while the
  // labels stay in the catalogue, so a type can legitimately be served
  // before its string ships. `unknownType` ("Place"/"Lugar") is the
  // catch-all a person can actually read. This matters beyond the type
  // <select> (which only ever offers pre-filtered, known keys) because a
  // SAVED entry can carry a type this session's catalogue has no label
  // for — the select never lets you create one, but loading a listing
  // that already has one is exactly the case this exists for.
  const typeLabel = (key: string) =>
    tType.has(`type.${key}` as "type.tram") ? tType(`type.${key}` as "type.tram") : tType("unknownType");
  const knownType = (key: string) => tType.has(`type.${key}` as "type.tram");

  const visibleTypes = useMemo(
    () => (vocab.kind === "ready" ? (vocab.types[activeGroup] ?? []).filter(knownType) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- knownType reads `tType`, stable for a page's life
    [vocab, activeGroup],
  );

  const draftFor = (c: NearbyCandidate): Draft =>
    drafts[c.osmId] ?? { type: knownType(c.type) ? c.type : null, es: "", en: "" };
  const setDraft = (osmId: string, next: Draft) =>
    setDrafts((d) => ({ ...d, [osmId]: next }));

  const reachText = (metres: number, minutes: number) =>
    `${t("minutes", { count: minutes })} · ${formatDistance(metres, locale)}`;

  // What a chosen entry's type chip reads. `type` and `customType` are
  // meant to be exclusive (the select either names a real type or reveals
  // the custom fields), but an entry with a real `type` this catalogue
  // cannot label still prefers its `customType` if one is somehow present
  // before falling back to the generic `typeLabel` — belt and braces over
  // an invariant nothing here enforces at the type level.
  const entryTypeLabel = (entry: HostNearbyEntry) => {
    if (entry.type && knownType(entry.type)) return typeLabel(entry.type);
    return biText(entry.customType, locale) || (entry.type ? typeLabel(entry.type) : t("customType"));
  };

  // `addEntry` never decides where focus goes on its own — the two calling
  // paths below (search vs. manual) have different notions of "next", and
  // the one thing they must agree on is NOT jumping focus up to the chosen
  // list: the list a keyboard user is IN is the finder's own candidate
  // list (or its manual-add controls), and that is where focus has to stay
  // for "add three in a row" to work without forcing a re-find of place.
  const addEntry = (entry: HostNearbyEntry, focusAfter: () => void) => {
    onChange([...value, entry]);
    focusAfter();
  };

  // The next row worth landing on: the first candidate, in the search's own
  // order, that is neither the one just added nor already chosen. Falls
  // back to the just-added row's own name button when it is the last one —
  // that button survives the Add→Added swap (only the button BESIDE it
  // changes), so it is always there to receive focus.
  const focusCandidateAfterAdd = (justAdded: NearbyCandidate) => {
    const pool = search.kind === "ready" ? search.candidates : [];
    const next = pool.find((x) => x.osmId !== justAdded.osmId && !chosenOsmIds.has(x.osmId));
    const targetId = next?.osmId ?? justAdded.osmId;
    document.getElementById(candidateButtonId(targetId))?.focus();
  };

  const addCandidate = (c: NearbyCandidate) => {
    if (capped) return;
    const draft = draftFor(c);
    if (draft.type === null && draft.es.trim() === "") return;
    addEntry(
      {
        id: tempId(),
        group: activeGroup,
        type: draft.type,
        customType: draft.type === null ? { es: draft.es.trim(), en: draft.en.trim() || null } : null,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        reach: c.reach,
        osmId: c.osmId,
        measuredAt: new Date().toISOString(),
        needsCheck: false,
      },
      () => focusCandidateAfterAdd(c),
    );
  };

  const resetManual = () => {
    setDropPoint(null);
    setMeasure({ kind: "idle" });
    setManualName("");
    setManualType(null);
    setManualEs("");
    setManualEn("");
  };

  const retryMeasure = () => {
    setMeasure({ kind: "measuring" });
    setMeasureAttempt((n) => n + 1);
  };

  // No candidate row to land on (a manual entry has no `osmId` of its own),
  // so this prefers the first still-addable search result — keeping focus
  // in the same finder territory the reviewer asked for — and only falls
  // back to the "Add manually" control itself when the list is empty.
  const focusAfterManualAdd = () => {
    const pool = search.kind === "ready" ? search.candidates : [];
    const first = pool.find((x) => !chosenOsmIds.has(x.osmId));
    if (first) {
      document.getElementById(candidateButtonId(first.osmId))?.focus();
      return;
    }
    manualAddButtonRef.current?.focus();
  };

  const addManual = () => {
    if (capped || !dropPoint || measure.kind !== "ready") return;
    const name = manualName.trim();
    if (name === "" || (manualType === null && manualEs.trim() === "")) return;
    addEntry(
      {
        id: tempId(),
        group: activeGroup,
        type: manualType,
        customType: manualType === null ? { es: manualEs.trim(), en: manualEn.trim() || null } : null,
        name,
        lat: dropPoint.lat,
        lng: dropPoint.lng,
        reach: measure.reach,
        osmId: null,
        measuredAt: new Date().toISOString(),
        needsCheck: false,
      },
      focusAfterManualAdd,
    );
    resetManual();
  };

  const remove = (id: string) => onChange(value.filter((e) => e.id !== id));

  const candidatePins: NearbyMapPin[] = useMemo(
    () =>
      search.kind === "ready"
        ? search.candidates
            .filter((c) => !chosenOsmIds.has(c.osmId))
            .map((c) => ({ id: c.osmId, lat: c.lat, lng: c.lng, label: c.name }))
        : [],
    [search, chosenOsmIds],
  );
  const chosenPins: NearbyMapPin[] = useMemo(
    () => chosenForGroup.map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, label: e.name })),
    [chosenForGroup],
  );

  const groupOptions = NEARBY_GROUPS.map((g) => ({
    value: g,
    label: `${t(`group.${g}` as "group.transport")} ${groupCountOf(g)}`,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.84375rem] leading-relaxed text-body">{t("hint")}</p>

      <ChipGroup
        label={t("groupsLabel")}
        name="nearby-group"
        value={activeGroup}
        options={groupOptions}
        onChange={selectGroup}
      />

      <div className="flex flex-col gap-2">
        {chosenForGroup.length === 0 ? (
          <p className="rounded-(--radius-control) border border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center text-[0.8125rem] text-muted">
            {t("empty")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {chosenForGroup.map((entry) => {
              const reach = reachFor(entry, "foot");
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-(--radius-control) border border-line bg-surface px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{entry.name}</span>
                    <span className="data block text-xs text-muted">{entryTypeLabel(entry)}</span>
                  </span>
                  {entry.needsCheck && (
                    <span className="data flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[0.59375rem] tracking-[0.06em] text-warn">
                      <TriangleAlert size={11} strokeWidth={2.4} aria-hidden />
                      {t("needsCheck")}
                    </span>
                  )}
                  <span className="data shrink-0 text-xs font-semibold text-ink">
                    {reach ? reachText(reach.metres, reach.minutes) : "–"}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    aria-label={t("remove", { name: entry.name })}
                    className="shrink-0 rounded-full p-1 text-muted transition-colors duration-(--dur-standard) hover:text-danger"
                  >
                    <X size={15} strokeWidth={2.5} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => (finderOpen ? closeFinder() : openFinder())}
          className="flex items-center gap-2 rounded-(--radius-control) border border-line-strong bg-surface px-3 py-1.5 text-[0.78125rem] font-semibold text-body transition-colors duration-(--dur-standard) hover:border-ink hover:text-ink"
        >
          <Search size={13} strokeWidth={2.2} aria-hidden />
          {finderOpen ? t("close") : t("find")}
        </button>
        <button
          ref={manualAddButtonRef}
          type="button"
          disabled={capped}
          onClick={() => {
            openFinder();
            setDropMode(true);
          }}
          className="flex items-center gap-2 rounded-(--radius-control) border border-line-strong bg-surface px-3 py-1.5 text-[0.78125rem] font-semibold text-body transition-colors duration-(--dur-standard) hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line-strong disabled:hover:text-body"
        >
          <Plus size={13} strokeWidth={2.2} aria-hidden />
          {t("addManually")}
        </button>
        {capMessage && <p className="min-w-[12rem] flex-1 text-xs text-warn">{capMessage}</p>}
      </div>

      {finderOpen && (
        <div className="flex flex-col gap-3.5 rounded-(--radius-control) border border-line-strong bg-surface-2 p-3.5">
          <p className="data text-[0.65625rem] tracking-[0.1em] text-muted">{t("title")}</p>

          {/* Container query, not a media query: the edit page grows a rail
              at 64rem, so this card's own width is not a function of the
              viewport, and a media query would be wrong in exactly that
              case. */}
          <div className="@container">
            <div className="grid gap-3.5 @min-[34rem]:grid-cols-[15rem_minmax(0,1fr)]">
              <NearbyMap
                home={{ lat, lng }}
                homeLabel={t("homeLabel")}
                candidates={candidatePins}
                chosen={chosenPins}
                activeId={activeId}
                routePolyline={routePolyline}
                dropMode={dropMode}
                onPick={selectPin}
                onDrop={(dLat, dLng) => {
                  setDropMode(false);
                  setMeasure({ kind: "measuring" });
                  setDropPoint({ lat: dLat, lng: dLng });
                }}
                className="h-64 w-full"
              />

              <div className="flex flex-col gap-3">
                {dropMode && (
                  <p role="status" className="text-[0.8125rem] text-body">
                    {t("dropHint")}
                  </p>
                )}

                {dropPoint && measure.kind === "measuring" && <Waiting label={t("measuring")} />}

                {dropPoint && measure.kind === "error" && (
                  <Unreachable
                    message={t("orsDown")}
                    retryLabel={t("retry")}
                    onRetry={retryMeasure}
                    cancelLabel={t("cancel")}
                    onCancel={resetManual}
                  />
                )}

                {dropPoint && measure.kind === "ready" && (
                  <div className="flex flex-col gap-2.5 rounded-(--radius-control) border border-line-strong bg-surface p-3">
                    <p className="data text-xs font-semibold text-ink">
                      {measure.reach.foot && reachText(measure.reach.foot.metres, measure.reach.foot.minutes)}
                    </p>
                    <TextField
                      label={t("nameLabel")}
                      value={manualName}
                      onChange={setManualName}
                      maxLength={MAX_NAME}
                      placeholder={t("namePlaceholder")}
                    />
                    {vocab.kind === "ready" ? (
                      <TypeSelect
                        id="nearby-manual-type"
                        label={t("typeLabel")}
                        types={visibleTypes}
                        typeLabel={typeLabel}
                        value={manualType}
                        onChange={setManualType}
                        otherLabel={t("customType")}
                      />
                    ) : (
                      <p className="text-xs text-muted">{t("typesUnavailable")}</p>
                    )}
                    {(manualType === null || vocab.kind !== "ready") && (
                      <div className="grid gap-2 min-[24rem]:grid-cols-2">
                        <TextField
                          label={t("customEs")}
                          value={manualEs}
                          onChange={setManualEs}
                          maxLength={MAX_CUSTOM}
                        />
                        <TextField
                          label={t("customEn")}
                          value={manualEn}
                          onChange={setManualEn}
                          maxLength={MAX_CUSTOM}
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={addManual}
                        disabled={
                          capped ||
                          manualName.trim() === "" ||
                          (manualType === null && manualEs.trim() === "")
                        }
                        className="rounded-(--radius-control) border border-brand bg-brand px-3 py-1.5 text-[0.78125rem] font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {t("add")}
                      </button>
                      <button
                        type="button"
                        onClick={resetManual}
                        className="rounded-(--radius-control) px-3 py-1.5 text-[0.78125rem] font-semibold text-body transition-colors duration-(--dur-standard) hover:text-ink"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                )}

                {search.kind === "loading" && <Waiting label={t("searching")} />}

                {search.kind === "error" && (
                  <Unreachable
                    message={t("lookupFailed")}
                    retryLabel={t("retry")}
                    onRetry={retrySearch}
                  />
                )}

                {search.kind === "ready" && search.candidates.length === 0 && (
                  <p className="text-[0.8125rem] text-body">{t("noResults")}</p>
                )}

                {search.kind === "ready" && search.candidates.length > 0 && (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {search.candidates.map((c) => {
                      const draft = draftFor(c);
                      const already = chosenOsmIds.has(c.osmId);
                      const reach = reachFor(c, "foot");
                      const rowDisabled = capped || already || (draft.type === null && draft.es.trim() === "");
                      return (
                        <li
                          key={c.osmId}
                          className={`flex flex-col gap-2 rounded-(--radius-control) border bg-surface p-2.5 transition-colors duration-(--dur-standard) ${
                            activeId === c.osmId ? "border-brand" : "border-line"
                          }`}
                        >
                          <button
                            id={candidateButtonId(c.osmId)}
                            type="button"
                            onClick={() => selectPin(c.osmId)}
                            aria-pressed={activeId === c.osmId}
                            className="flex items-baseline justify-between gap-2 text-left"
                          >
                            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-ink">
                              {c.name}
                            </span>
                            <span className="data shrink-0 text-xs text-muted">
                              {reach ? reachText(reach.metres, reach.minutes) : "–"}
                            </span>
                          </button>

                          <div className="flex flex-wrap items-center gap-2">
                            {vocab.kind === "ready" ? (
                              <TypeSelect
                                id={`nearby-type-${c.osmId}`}
                                label={t("typeLabel")}
                                hideLabel
                                types={visibleTypes}
                                typeLabel={typeLabel}
                                value={draft.type}
                                onChange={(v) => setDraft(c.osmId, { ...draft, type: v })}
                                otherLabel={t("customType")}
                              />
                            ) : knownType(c.type) ? (
                              <TypeSelect
                                id={`nearby-type-${c.osmId}`}
                                label={t("typeLabel")}
                                hideLabel
                                types={[c.type]}
                                typeLabel={typeLabel}
                                value={draft.type}
                                onChange={(v) => setDraft(c.osmId, { ...draft, type: v })}
                                otherLabel={t("customType")}
                                disabled
                              />
                            ) : (
                              <p className="flex-1 text-xs text-muted">{t("typesUnavailable")}</p>
                            )}
                            {already ? (
                              <span className="data text-xs text-muted">{t("added")}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => addCandidate(c)}
                                disabled={rowDisabled}
                                className="shrink-0 rounded-(--radius-control) border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors duration-(--dur-standard) hover:border-ink disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                {t("add")}
                              </button>
                            )}
                          </div>

                          {draft.type === null && !already && (
                            <div className="grid gap-2 min-[24rem]:grid-cols-2">
                              <TextField
                                label={t("customEs")}
                                value={draft.es}
                                onChange={(v) => setDraft(c.osmId, { ...draft, es: v })}
                                maxLength={MAX_CUSTOM}
                              />
                              <TextField
                                label={t("customEn")}
                                value={draft.en}
                                onChange={(v) => setDraft(c.osmId, { ...draft, en: v })}
                                maxLength={MAX_CUSTOM}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <p className="text-[0.6875rem] text-muted">{tType("attribution")}</p>
        </div>
      )}
    </div>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted" role="status">
      <Loader2 size={13} strokeWidth={2.2} className="animate-spin" aria-hidden />
      {label}
    </p>
  );
}

function Unreachable({
  message,
  retryLabel,
  onRetry,
  cancelLabel,
  onCancel,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
}) {
  return (
    <p className="flex flex-wrap items-center gap-2.5 rounded-(--radius-control) border border-warn bg-warn-soft px-3.5 py-2.5 text-[0.8125rem] text-ink">
      <TriangleAlert size={15} strokeWidth={2} className="shrink-0 text-warn" aria-hidden />
      <span className="min-w-[10rem] flex-1">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-(--radius-control) border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink transition-colors duration-(--dur-standard) hover:border-ink"
      >
        <RotateCw size={12} strokeWidth={2.4} aria-hidden />
        {retryLabel}
      </button>
      {onCancel && cancelLabel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-(--radius-control) px-2.5 py-1 text-xs font-semibold text-body transition-colors duration-(--dur-standard) hover:text-ink"
        >
          {cancelLabel}
        </button>
      )}
    </p>
  );
}

/** The type control (design §7.1): built entirely from the vocabulary handed
 *  in, never from a list of its own, with "Other…" always last. `hideLabel`
 *  keeps the visible `<label>` for screen readers only, for the compact
 *  per-candidate-row usage where the row's own text already reads as a
 *  label. */
function TypeSelect({
  id,
  label,
  hideLabel,
  types,
  typeLabel,
  value,
  onChange,
  otherLabel,
  disabled,
}: {
  id: string;
  label: string;
  hideLabel?: boolean;
  types: string[];
  typeLabel: (key: string) => string;
  value: string | null;
  onChange: (value: string | null) => void;
  otherLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-xs font-semibold text-ink"}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? OTHER}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === OTHER ? null : e.target.value)}
        className="w-full min-w-0 rounded-(--radius-control) border border-line-strong bg-surface px-2.5 py-1.5 text-[0.78125rem] text-ink outline-none transition-colors duration-(--dur-standard) focus:border-brand disabled:opacity-60"
      >
        {types.map((k) => (
          <option key={k} value={k}>
            {typeLabel(k)}
          </option>
        ))}
        <option value={OTHER}>{otherLabel}</option>
      </select>
    </div>
  );
}

