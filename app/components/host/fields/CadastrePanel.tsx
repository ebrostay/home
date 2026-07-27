"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Loader2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HostListing } from "@/lib/api";
import { cadastreChecksum } from "@/lib/listing";
import { lookupCadastre, type CadastreRecord } from "@/lib/catastro";
import { SAME_PLACE_M, formatDistance, metresBetween } from "@/lib/geocode";

// What the Catastro says about the reference the owner typed.
//
// The owner always keeps the last word. Catastro records go stale — a reform
// nobody declared, a surface measured to a different boundary — so a field is
// filled outright only when it is empty, and otherwise offered. Nothing is
// locked and nothing is overwritten.
//
// The disagreements are the point, not a nuisance. A listing claiming 94 m²
// against a register that says 78 is exactly the kind of claim review exists
// to look at, so the differences stay on screen rather than being resolved
// silently in either direction.
//
// Nothing here is stored. The listing keeps the reference — the question —
// and both the owner and, later, the reviewer ask the Catastro live. A stored
// answer would be a stale second copy, and one the client reported, so an
// owner could simply claim the register agreed with them.
//
// Self-contained on purpose: give it the listing and it does its own lookup,
// so the create-a-listing wizard can drop it into a step unchanged.

// Every result carries the reference it describes. Without that the panel
// keeps answering about the PREVIOUS reference while a new one resolves —
// showing a real address and a real surface area next to a reference that has
// nothing to do with either, which is the worst kind of wrong here.
type State =
  | { kind: "idle"; ref: string }
  | { kind: "looking"; ref: string }
  | { kind: "found"; ref: string; record: CadastreRecord }
  | { kind: "notFound"; ref: string }
  | { kind: "error"; ref: string };

export function CadastrePanel({
  value,
  onChange,
  pinIsManual,
  onPinMoved,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
  /** When the pin was placed by hand, the parcel centroid is offered rather
   *  than taken — the same rule the geocoder follows. */
  pinIsManual: boolean;
  onPinMoved: () => void;
}) {
  const t = useTranslations("host.edit.address");
  const [result, setResult] = useState<State>({ kind: "idle", ref: "" });

  const ref = (value.cadastralRef ?? "").trim().toUpperCase();
  // Only ask about a reference that could exist. A checksum failure means the
  // owner is mid-typing or has miscopied it, and asking the register about a
  // string we already know is malformed would be noise on both sides.
  const askable = /^[A-Z0-9]{20}$/.test(ref) && cadastreChecksum(ref) !== false;

  const applyRef = useRef<(r: CadastreRecord) => void>(() => {});

  useEffect(() => {
    if (!askable) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResult({ kind: "looking", ref });
      lookupCadastre(ref, controller.signal)
        .then((answer) => {
          if (controller.signal.aborted) return;
          if (answer.kind === "found") {
            setResult({ kind: "found", ref, record: answer.record });
            // Fills only what is empty. Everything else becomes a difference
            // the owner can accept, or leave for a reviewer to look at.
            applyRef.current(answer.record);
          } else {
            setResult({ kind: answer.kind === "notFound" ? "notFound" : "error", ref });
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ kind: "error", ref });
        });
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ref, askable]);

  /** Take what is missing; never replace what is there. */
  const fillGaps = (r: CadastreRecord) => {
    const next = { ...value };
    let touched = false;
    if (r.postcode && !value.postcode?.trim()) {
      next.postcode = r.postcode;
      touched = true;
    }
    if (r.street && !value.address?.trim()) {
      next.address = r.street;
      touched = true;
    }
    // Lands in Basics, not here — which is right, and the save bar will say
    // so by lighting up both sections.
    if (r.sizeM2 && value.sizeM2 === 0) {
      next.sizeM2 = Math.round(r.sizeM2);
      touched = true;
    }
    if (r.lat !== null && r.lng !== null && !pinIsManual) {
      next.lat = r.lat;
      next.lng = r.lng;
      touched = true;
    }
    if (touched) onChange(next);
  };
  useEffect(() => {
    applyRef.current = fillGaps;
  });

  // Anything about a different reference is not about this one. Derived
  // rather than cleared from an effect: a changed reference is a fact about
  // what is on screen, not an event that needs handling.
  const state: State = result.ref === ref ? result : { kind: "looking", ref };

  if (!askable || state.kind === "idle") return null;

  if (state.kind === "looking") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted" role="status">
        <Loader2 size={13} strokeWidth={2.2} className="animate-spin" aria-hidden />
        {t("cadastreLooking")}
      </p>
    );
  }

  if (state.kind === "notFound" || state.kind === "error") {
    return (
      <p className="flex items-center gap-2.5 rounded-(--radius-control) border border-warn bg-warn-soft px-3.5 py-2.5 text-[0.8125rem] text-ink">
        <TriangleAlert size={15} strokeWidth={2} className="shrink-0 text-warn" aria-hidden />
        {t(state.kind === "notFound" ? "cadastreNotFound" : "cadastreUnreachable")}
      </p>
    );
  }

  const r = state.record;
  const distance =
    r.lat !== null && r.lng !== null
      ? metresBetween({ lat: r.lat, lng: r.lng }, { lat: value.lat, lng: value.lng })
      : 0;

  // Only real disagreements — a field the owner has filled in, that the
  // register answers differently.
  const differences: { key: string; label: string; apply: () => void }[] = [];
  if (r.postcode && value.postcode?.trim() && r.postcode !== value.postcode) {
    differences.push({
      key: "postcode",
      label: t("cadastreDiffPostcode", { value: r.postcode }),
      apply: () => onChange({ ...value, postcode: r.postcode }),
    });
  }
  if (r.sizeM2 && value.sizeM2 > 0 && Math.round(r.sizeM2) !== value.sizeM2) {
    differences.push({
      key: "size",
      label: t("cadastreDiffSize", { value: Math.round(r.sizeM2) }),
      apply: () => onChange({ ...value, sizeM2: Math.round(r.sizeM2!) }),
    });
  }
  if (r.lat !== null && r.lng !== null && pinIsManual && distance > SAME_PLACE_M) {
    differences.push({
      key: "pin",
      label: t("cadastreDiffPin", { distance: formatDistance(distance, "es") }),
      apply: () => {
        onChange({ ...value, lat: r.lat!, lng: r.lng! });
        onPinMoved();
      },
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-(--radius-control) border border-river bg-river-soft p-3.5">
      <p className="flex items-center gap-2">
        <BadgeCheck size={15} strokeWidth={2} className="shrink-0 text-river-deep" aria-hidden />
        {/* Says exactly what was checked. "Verified" on its own would be read
            as "we verified this listing", which is a much larger claim than
            "this reference names a real property". */}
        <span className="data text-[0.65625rem] tracking-[0.1em] text-river-deep">
          {t("cadastreFound")}
        </span>
      </p>

      {r.address && <p className="text-[0.8125rem] text-ink">{r.address}</p>}

      <p className="data text-[0.78125rem] text-body">
        {[
          r.use,
          r.sizeM2 ? t("cadastreSize", { value: Math.round(r.sizeM2) }) : null,
          r.year ? t("cadastreYear", { year: r.year }) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {differences.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 border-t border-river pt-2.5">
          {differences.map((d) => (
            <li key={d.key} className="flex flex-wrap items-center gap-2.5">
              <span className="min-w-[10rem] flex-1 text-[0.8125rem] text-ink">
                {d.label}
              </span>
              <button
                type="button"
                onClick={d.apply}
                className="rounded-(--radius-control) border border-river-deep bg-surface px-2.5 py-1 text-xs font-semibold text-river-deep transition-colors duration-(--dur-standard) hover:bg-river-soft"
              >
                {t("useThis")}
              </button>
            </li>
          ))}
          <li className="text-xs leading-[1.4] text-muted">{t("cadastreDiffNote")}</li>
        </ul>
      )}
    </div>
  );
}
