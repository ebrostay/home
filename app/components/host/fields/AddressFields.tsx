"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Bilingual, Declined, HostListing } from "@/lib/api";
import { LIMITS, cadastreChecksum, cadastreValid, postcodeValid } from "@/lib/listing";
import { pinValue, verdictFor } from "@/lib/declined";
import { InfoPopover } from "@/components/ui/InfoPopover";
import type { MarkFor } from "@/components/host/new/import/ImportMark";
import {
  SAME_PLACE_M,
  formatDistance,
  geocode,
  metresBetween,
  reverseArea,
  type GeoCandidate,
} from "@/lib/geocode";
import { CadastreFinder } from "./CadastreFinder";
import { CadastrePanel } from "./CadastrePanel";
import { LocationPicker } from "./LocationPicker";
import { TextField } from "./TextField";

// Where the home is. The most consequential section on the page: an address
// edit moves the pin a guest travels to, so it re-enters review like any other
// claim — which the locked note says out loud before the owner starts typing.
//
// Typing the street resolves the rest. The geocoder's answer is a PROPOSAL,
// never a silent rewrite:
//   · empty fields are filled outright — there is nothing to lose,
//   · filled fields get a one-line "OSM says X" with an apply button, because
//     OSM's administrative boundaries are not always what locals call a place,
//   · an existing pin is shown against the suggested one and kept until the
//     owner chooses.
//
// The pin was the exception to that rule and should not have been: it was
// overwritten on sight, and since the lookup runs on mount, every saved
// listing opened with an unsaved address change nobody had made. Coordinates
// now follow the same rule as everything else — see `pinIsPlaced`.
//
// Declining is remembered (`lib/declined.ts`). An offer the owner has ruled on
// is not put to them again until the answer itself changes; otherwise the page
// asks the same settled question on every visit, and the way people end a
// question like that is by pressing yes.
//
// The street itself is never rewritten, not even to OSM's official spelling.
// It is the field the owner is typing in, and the detail OSM lacks is exactly
// the detail that matters here: normalising "Calle Movera 7, 4.º B" to the
// road OSM knows would delete the door on the way past.
//
// Two fields the handoff asks for are deliberately absent (ADR-027): no
// MATCHED badge beside the cadastral reference, because nothing checks it
// against the Catastro and a badge would claim a verification that never ran;
// and no tourist-licence field, because Ebrostay lets mid-term homes and a
// vivienda de uso turístico licence is the wrong instrument for one.

/** Long enough that a pause reads as "done typing", short enough that the
 *  result is there before the eye leaves the field. */
const DEBOUNCE_MS = 800;

export function AddressFields({
  value,
  onChange,
  declined,
  onDecline,
  mark,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
  /** Suggestions already ruled on. Applies live and is not part of the diff. */
  declined: Declined[];
  onDecline: (entry: Omit<Declined, "at">) => void;
  /** The import's "we filled this" glyph, per field key. Passed only by the
   *  wizard — see `ImportMark` for why it is a prop and not a read of
   *  `value.imported`, which the editor's listings carry too. */
  mark?: MarkFor;
}) {
  const t = useTranslations("host.edit.address");
  const locale = useLocale();

  const [found, setFound] = useState<GeoCandidate[]>([]);
  // The candidate is held by id rather than by object: it always has to be one
  // of `found`, and storing a copy is how a selection outlives the list it
  // came from.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [lookup, setLookup] = useState<"idle" | "searching" | "none" | "error">("idle");
  // Does this listing have a pin somebody decided on?
  //
  // Seeded from the loaded listing, which is the fix for the defect above: a
  // saved pin is a decision already made, whoever made it, and starting this
  // at `false` meant every page load counted as "no pin yet" and let the
  // geocoder's answer straight in.
  //
  // The question it used to ask — did the owner drag the map *in this
  // session* — was never the interesting one. What matters is whether there is
  // a pin to protect. A pin is never removed, so this only ever goes true.
  const [pinIsPlaced, setPinIsPlaced] = useState(
    () => value.lat !== 0 || value.lng !== 0,
  );
  const placePin = () => setPinIsPlaced(true);

  const set = <K extends keyof HostListing>(key: K, next: HostListing[K]) =>
    onChange({ ...value, [key]: next });

  const setArea = (loc: "es" | "en", next: string) => {
    const area: Bilingual = { es: value.area?.es ?? null, en: value.area?.en ?? null };
    area[loc] = next.trim() === "" ? null : next;
    onChange({ ...value, area: area.es === null && area.en === null ? null : area });
  };

  // The lookup. Keyed on the typed address alone: the postcode and area are
  // OUTPUTS of this, and including them would make every autofill trigger a
  // fresh search for what it just answered.
  const address = value.address ?? "";
  // Too short to be an address, so there is nothing to have found and nothing
  // to report. Derived rather than reset from the effect: an emptied field is
  // a fact about what is on screen, not an event that needs handling.
  const searchable = address.trim().length >= 4;

  // Applying calls `onChange`, which the effect below must not read as a new
  // question to ask. It never writes `address`, so the effect's dependencies
  // do not move and it does not re-run — the ref keeps that true through a
  // held reference rather than by luck.
  const applyRef = useRef<(c: GeoCandidate, movePin: boolean) => void>(() => {});

  useEffect(() => {
    if (!searchable) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLookup("searching");
      geocode(address, locale, controller.signal)
        .then((hits) => {
          if (controller.signal.aborted) return;
          setFound(hits);
          setChosenId(hits[0]?.placeId ?? null);
          setLookup(hits.length === 0 ? "none" : "idle");
          // The best match is taken automatically — that is the whole point of
          // typing an address instead of placing a pin. It fills only what is
          // empty, and it moves the pin only if the owner has not placed one
          // themselves; if they have, the two-pin comparison asks first.
          if (hits[0]) applyRef.current(hits[0], true);
        })
        .catch((err) => {
          if (controller.signal.aborted || (err as Error).name === "AbortError") return;
          // A geocoder that is down costs a convenience, never the section:
          // every field it fills can still be typed by hand.
          setLookup("error");
          setFound([]);
          setChosenId(null);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [address, locale, searchable]);

  const candidates = searchable ? found : [];
  const chosen = candidates.find((c) => c.placeId === chosenId) ?? null;
  const status = searchable ? lookup : "idle";

  /**
   * Take everything from a candidate that is safe to take.
   *
   * `respectPlacedPin` is what separates the automatic path from a deliberate
   * one. An automatic result must not move a pin that already exists; clicking
   * a candidate, or "Move the pin here", is the owner saying to move it, so it
   * does.
   */
  const apply = (c: GeoCandidate, respectPlacedPin: boolean) => {
    const next: HostListing = { ...value };
    if (c.postcode && !value.postcode?.trim()) next.postcode = c.postcode;
    const areaEmpty = !value.area?.es?.trim() && !value.area?.en?.trim();
    if (c.area && areaEmpty) {
      // Both languages from the Spanish call. Most Zaragoza neighbourhoods are
      // proper nouns that do not translate — the seed data's areas are
      // identical in ES and EN — so a second request to maybe improve a
      // handful of districts is the wrong trade. The owner edits the English
      // where it genuinely differs.
      next.area = { es: c.area, en: c.area };
    }

    const keepPin = respectPlacedPin && pinIsPlaced;
    if (!keepPin) {
      next.lat = c.lat;
      next.lng = c.lng;
    }
    onChange(next);
    // Whether it was filled or moved, there is a pin now.
    if (!keepPin) placePin();
    setChosenId(c.placeId);

    // The forward answer sometimes carries no neighbourhood at all — a house
    // node's hierarchy can jump from `road` to `city` even inside a mapped
    // barrio. One reverse lookup at the pin recovers it (see `reverseArea`).
    // Asked at the pin actually in effect: a kept pin is the home, and the
    // candidate merely agrees about the street.
    if (!c.area && areaEmpty) {
      fillAreaFromReverse(keepPin ? value.lat : c.lat, keepPin ? value.lng : c.lng);
    }
  };

  // The reverse fill's answer arrives AFTER `apply` returned, so it must not
  // write through the closure it was created in — a spread of that stale
  // `value` would undo whatever the owner typed while Nominatim thought. It
  // re-reads the live listing through a ref and fills only a still-empty area:
  // the same only-what-is-empty rule as the synchronous path, re-checked at
  // the moment it acts.
  const live = useRef(value);
  useEffect(() => {
    live.current = value;
  });
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const reverseLookup = useRef<AbortController | null>(null);
  const fillAreaFromReverse = (lat: number, lng: number) => {
    reverseLookup.current?.abort();
    const controller = new AbortController();
    reverseLookup.current = controller;
    reverseArea(lat, lng, controller.signal).then((name) => {
      if (controller.signal.aborted || !name) return;
      const v = live.current;
      if (v.area?.es?.trim() || v.area?.en?.trim()) return;
      onChangeRef.current({ ...v, area: { es: name, en: name } });
    });
  };
  useEffect(() => () => reverseLookup.current?.abort(), []);

  // In an effect, not during render: a ref is not render output.
  useEffect(() => {
    applyRef.current = apply;
  });

  // Everything OSM offers is about the address that was typed, so that is the
  // question a decision here gets recorded against.
  const ruling = (field: "pin" | "postcode" | "area", offered: string) =>
    verdictFor(declined, field, "osm", address, offered);

  // Fields the candidate disagrees with, offered rather than taken — minus the
  // ones the owner has already settled.
  const conflicts = (
    chosen
      ? [
          chosen.postcode && value.postcode && chosen.postcode !== value.postcode
            ? { key: "postcode" as const, theirs: chosen.postcode }
            : null,
          chosen.area && value.area?.es?.trim() && chosen.area !== value.area.es
            ? { key: "area" as const, theirs: chosen.area }
            : null,
        ].filter((c) => c !== null)
      : []
  )
    .map((c) => ({ ...c, ...ruling(c.key, c.theirs) }))
    .filter((c) => c.verdict !== "settled");

  // Shown only when there is a pin to protect AND the geocoder actually
  // disagrees with it. Street-level accuracy is ~25 m, so anything closer is
  // the same answer twice.
  const distance =
    chosen && pinIsPlaced ? metresBetween(chosen, { lat: value.lat, lng: value.lng }) : 0;
  const disagrees = chosen && pinIsPlaced && distance > SAME_PLACE_M ? chosen : null;
  const pinRuling = disagrees
    ? ruling("pin", pinValue(disagrees.lat, disagrees.lng))
    : null;
  // A settled disagreement is not raised again. A changed one is: the source
  // has moved since the owner looked, which is a new fact rather than the same
  // question asked twice.
  const suggestion = pinRuling?.verdict === "settled" ? null : disagrees;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2.5 rounded-(--radius-control) bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] text-body">
        <Lock size={15} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
        {t("locked")}
      </p>

      <div className="grid items-start gap-3.5 min-[34rem]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TextField
          label={t("street")}
          mark={mark?.("address")}
          value={address}
          onChange={(v) => set("address", v.trim() === "" ? null : v)}
          maxLength={LIMITS.maxAddress}
          placeholder={t("streetPlaceholder")}
          hint={
            status === "searching"
              ? t("searching")
              : status === "none"
                ? t("noMatch")
                : status === "error"
                  ? t("lookupFailed")
                  : t("streetHint")
          }
        />
        <TextField
          label={t("postcode")}
          mark={mark?.("postcode")}
          value={value.postcode ?? ""}
          onChange={(v) => set("postcode", v.trim() === "" ? null : v)}
          maxLength={5}
          mono
          inputMode="numeric"
          placeholder="50001"
          error={postcodeValid(value.postcode ?? "") ? undefined : t("postcodeInvalid")}
        />
      </div>

      {/* More than one match is the normal case for a Zaragoza street, and
          taking the first silently is how a listing ends up pinned to the
          wrong end of one. */}
      {candidates.length > 1 && (
        <fieldset className="m-0 flex flex-col gap-2 rounded-(--radius-control) border border-river bg-river-soft p-3.5">
          <legend className="data float-left w-full text-[0.65625rem] tracking-[0.1em] text-river-deep">
            {t("matches", { count: candidates.length })}
          </legend>
          <div className="flex flex-wrap gap-2">
            {candidates.slice(0, 6).map((c) => (
              <button
                key={c.placeId}
                type="button"
                title={c.detail}
                aria-pressed={chosen?.placeId === c.placeId}
                onClick={() => apply(c, false)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.78125rem] transition-colors duration-(--dur-standard) ${
                  chosen?.placeId === c.placeId
                    ? "border-river-deep bg-surface font-semibold text-river-deep"
                    : "border-line bg-surface text-body hover:border-river-deep"
                }`}
              >
                {chosen?.placeId === c.placeId && (
                  <Check size={12} strokeWidth={3} aria-hidden />
                )}
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* OSM's boundaries are not always what locals call a place, so a value
          the owner already wrote is offered against, never replaced. */}
      {conflicts.map((c) => (
        <p
          key={c.key}
          className="flex flex-wrap items-center gap-2.5 rounded-(--radius-control) bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] text-body"
        >
          <MapPin size={14} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
          <span className="min-w-[12rem] flex-1">
            {t(`conflict.${c.key}` as "conflict.postcode", { value: c.theirs })}
            {c.verdict === "changed" && (
              <span className="block text-xs text-muted">{t("changedSince")}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() =>
              c.key === "postcode"
                ? set("postcode", c.theirs)
                : onChange({ ...value, area: { es: c.theirs, en: c.theirs } })
            }
            className="rounded-(--radius-control) border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink transition-colors duration-(--dur-standard) hover:border-ink"
          >
            {t("useThis")}
          </button>
          <button
            type="button"
            onClick={() =>
              onDecline({ field: c.key, source: "osm", value: c.theirs, for: address })
            }
            className="rounded-(--radius-control) px-2.5 py-1 text-xs font-semibold text-body transition-colors duration-(--dur-standard) hover:text-ink"
          >
            {t("keepMine")}
          </button>
        </p>
      ))}

      <div className="grid items-start gap-3.5 min-[34rem]:grid-cols-2">
        <TextField
          label={t("cadastre")}
          tag={t("optional")}
          mark={mark?.("cadastralRef")}
          info={
            <InfoPopover label={t("cadastreWhat")} title={t("cadastreWhat")}>
              <p>{t("cadastreInfoWhat")}</p>
              <p>{t("cadastreInfoWhere")}</p>
              <p>{t("cadastreInfoWhy")}</p>
              <a
                href="https://www.sedecatastro.gob.es/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-river-deep underline underline-offset-2"
              >
                {t("cadastreInfoLink")}
              </a>
            </InfoPopover>
          }
          value={value.cadastralRef ?? ""}
          onChange={(v) => set("cadastralRef", v.trim() === "" ? null : v.toUpperCase())}
          maxLength={20}
          mono
          // The handoff's example is invented — its check digits do not match
          // the rest of it — so the placeholder shows the same shape with the
          // digits corrected. A worked example our own checker would reject is
          // the wrong thing to teach the format with.
          placeholder="4721903XM7147S0001BT"
          hint={t("cadastreHint")}
          error={cadastreValid(value.cadastralRef ?? "") ? undefined : t("cadastreInvalid")}
          // A warning, never an error. The check digits are only defined for
          // urban references on the common cadastre — a rural one, or a
          // property in Euskadi or Navarra, is checked by other rules, and
          // rejecting a valid reference is worse than accepting a typo.
          warning={
            cadastreChecksum(value.cadastralRef ?? "") === false
              ? t("cadastreChecksum")
              : undefined
          }
        />
        {/* The neighbourhood, and the one address-side field a guest reads in
            their own language — "Casco Histórico" / "Old Town". */}
        <div className="flex flex-col gap-3.5">
          <TextField
            label={t("area")}
            tag="ES"
            // The Spanish only: an import never fills an English field
            // (§10.5), so a mark on the EN box would claim a value we never
            // sent.
            mark={mark?.("area")}
            value={value.area?.es ?? ""}
            onChange={(v) => setArea("es", v)}
            maxLength={LIMITS.maxArea}
            placeholder={t("areaPlaceholder")}
          />
          <TextField
            label={t("area")}
            tag="EN"
            value={value.area?.en ?? ""}
            onChange={(v) => setArea("en", v)}
            maxLength={LIMITS.maxArea}
          />
        </div>
      </div>

      {/* The way in for an owner who does not have the IBI receipt to hand:
          the same register, asked the other way round. It only ever writes
          the reference field — everything that follows from one is the
          panel's job, which keeps a single answer to "what does the Catastro
          say about this listing" however the reference got there. */}
      <CadastreFinder
        address={address}
        postcode={value.postcode ?? ""}
        onPick={(ref) => set("cadastralRef", ref)}
      />

      {/* The register's own answer about that reference. Sits under the field
          it belongs to, above the map, because two of the three things it can
          disagree about are on the map or in Basics — the owner should read
          the disagreement before they go looking for the values. */}
      <CadastrePanel
        value={value}
        onChange={onChange}
        pinIsPlaced={pinIsPlaced}
        onPinPlaced={placePin}
        declined={declined}
        onDecline={onDecline}
      />

      <div className="flex flex-col gap-2.5">
        <LocationPicker
          lat={value.lat}
          lng={value.lng}
          onChange={(lat, lng) => onChange({ ...value, lat, lng })}
          onDragged={placePin}
          suggestion={suggestion}
          label={t("mapLabel")}
          caption={status === "searching" ? t("searching") : t("mapCaption")}
          mark={mark?.("pin")}
          suggestedLabel={t("suggestedPin")}
        />

        {status === "searching" && (
          <p className="flex items-center gap-2 text-xs text-muted" role="status">
            <Loader2 size={13} strokeWidth={2.2} className="animate-spin" aria-hidden />
            {t("searching")}
          </p>
        )}

        {suggestion && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-(--radius-control) border border-river bg-river-soft px-3.5 py-2.5">
            <p className="min-w-[12rem] flex-1 text-[0.8125rem] text-ink">
              {t("pinSuggestion", { distance: formatDistance(distance, locale) })}
              {pinRuling?.verdict === "changed" && (
                <span className="block text-xs text-muted">{t("changedSince")}</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => apply(suggestion, false)}
              className="rounded-(--radius-control) border border-river-deep bg-surface px-3 py-1.5 text-[0.78125rem] font-semibold text-river-deep transition-colors duration-(--dur-standard) hover:bg-river-soft"
            >
              {t("movePinHere")}
            </button>
            <button
              type="button"
              // Dismissing drops the candidate, not the pin — and is recorded,
              // so the same disagreement is not put to the owner again on the
              // next visit. Clearing the selection alone lasted until reload,
              // which for a page that re-asks on mount is no answer at all.
              onClick={() => {
                setChosenId(null);
                onDecline({
                  field: "pin",
                  source: "osm",
                  value: pinValue(suggestion.lat, suggestion.lng),
                  for: address,
                });
              }}
              className="rounded-(--radius-control) px-3 py-1.5 text-[0.78125rem] font-semibold text-body transition-colors duration-(--dur-standard) hover:text-ink"
            >
              {t("keepMine")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
