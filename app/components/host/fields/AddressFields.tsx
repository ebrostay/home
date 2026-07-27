"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Bilingual, HostListing } from "@/lib/api";
import { LIMITS, cadastreValid, postcodeValid } from "@/lib/listing";
import {
  SAME_PLACE_M,
  formatDistance,
  geocode,
  metresBetween,
  type GeoCandidate,
} from "@/lib/geocode";
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
//   · a hand-placed pin is shown against the suggested one and kept until the
//     owner chooses.
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
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
}) {
  const t = useTranslations("host.edit.address");
  const locale = useLocale();

  const [found, setFound] = useState<GeoCandidate[]>([]);
  // The candidate is held by id rather than by object: it always has to be one
  // of `found`, and storing a copy is how a selection outlives the list it
  // came from.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [lookup, setLookup] = useState<"idle" | "searching" | "none" | "error">("idle");
  // Set the moment the owner drags or clicks the map, cleared when they accept
  // a suggestion. It is the whole of "is this pin theirs or ours".
  const [pinIsManual, setPinIsManual] = useState(false);

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
   * `respectManualPin` is what separates the automatic path from a deliberate
   * one. An automatic result must not move a pin the owner dragged onto their
   * doorway; clicking a candidate, or "Move the pin here", is the owner saying
   * to move it, so it does.
   */
  const apply = (c: GeoCandidate, respectManualPin: boolean) => {
    const next: HostListing = { ...value };
    if (c.postcode && !value.postcode?.trim()) next.postcode = c.postcode;
    if (c.area && !value.area?.es?.trim() && !value.area?.en?.trim()) {
      // Both languages from the Spanish call. Most Zaragoza neighbourhoods are
      // proper nouns that do not translate — the seed data's areas are
      // identical in ES and EN — so a second request to maybe improve a
      // handful of districts is the wrong trade. The owner edits the English
      // where it genuinely differs.
      next.area = { es: c.area, en: c.area };
    }

    const keepPin = respectManualPin && pinIsManual;
    if (!keepPin) {
      next.lat = c.lat;
      next.lng = c.lng;
    }
    onChange(next);
    if (!keepPin) setPinIsManual(false);
    setChosenId(c.placeId);
  };

  // In an effect, not during render: a ref is not render output.
  useEffect(() => {
    applyRef.current = apply;
  });

  // Fields the candidate disagrees with, offered rather than taken.
  const conflicts = chosen
    ? [
        chosen.postcode && value.postcode && chosen.postcode !== value.postcode
          ? { key: "postcode" as const, theirs: chosen.postcode }
          : null,
        chosen.area && value.area?.es?.trim() && chosen.area !== value.area.es
          ? { key: "area" as const, theirs: chosen.area }
          : null,
      ].filter((c) => c !== null)
    : [];

  // Shown only when there is a hand-placed pin to protect AND the geocoder
  // actually disagrees with it. Street-level accuracy is ~25 m, so anything
  // closer is the same answer twice.
  const distance =
    chosen && pinIsManual ? metresBetween(chosen, { lat: value.lat, lng: value.lng }) : 0;
  const suggestion = chosen && pinIsManual && distance > SAME_PLACE_M ? chosen : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2.5 rounded-(--radius-control) bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] text-body">
        <Lock size={15} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
        {t("locked")}
      </p>

      <div className="grid items-start gap-3.5 min-[34rem]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TextField
          label={t("street")}
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
          {t(`conflict.${c.key}` as "conflict.postcode", { value: c.theirs })}
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
        </p>
      ))}

      <div className="grid items-start gap-3.5 min-[34rem]:grid-cols-2">
        <TextField
          label={t("cadastre")}
          tag={t("optional")}
          value={value.cadastralRef ?? ""}
          onChange={(v) => set("cadastralRef", v.trim() === "" ? null : v.toUpperCase())}
          maxLength={20}
          mono
          placeholder="4721903XM7147S0001WK"
          hint={t("cadastreHint")}
          error={cadastreValid(value.cadastralRef ?? "") ? undefined : t("cadastreInvalid")}
        />
        {/* The neighbourhood, and the one address-side field a guest reads in
            their own language — "Casco Histórico" / "Old Town". */}
        <div className="flex flex-col gap-3.5">
          <TextField
            label={t("area")}
            tag="ES"
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

      <div className="flex flex-col gap-2.5">
        <LocationPicker
          lat={value.lat}
          lng={value.lng}
          onChange={(lat, lng) => onChange({ ...value, lat, lng })}
          onDragged={() => setPinIsManual(true)}
          suggestion={suggestion}
          label={t("mapLabel")}
          caption={status === "searching" ? t("searching") : t("mapCaption")}
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
              // Dismissing drops the candidate, not the pin: without it the
              // suggestion sits on the map nagging about a settled decision.
              onClick={() => setChosenId(null)}
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
