"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { NeighbourhoodMap } from "@/components/detail/NeighbourhoodMap";
import { deriveBand, type AdminBandReview } from "@/lib/api";
import { Panel } from "./Panel";

// The street band, put in front of a person before it is put in front of a
// guest (§4.5, ADR-041).
//
// This is the only derived thing on the review page that nobody has ever read.
// The photos, the price, the text — an owner typed those and meant them. The
// band came out of an OSM query, and until this panel existed it went straight
// to the public map without a single human ever looking at which street it had
// picked. So the panel shows the LINE, not a summary: a band down the wrong
// street is obvious on a map and invisible in a row of figures.
//
// It is also where derivation happens at all. Overpass was measured at 8-9 s
// per query, three queries per band, `504` on two probes in three
// (2026-08-08). That used to run inside the owner's save and inside every
// guest's page load; it now runs here, where somebody is waiting for exactly
// this answer and can press the button again.

export function BandSignal({
  propertyId,
  band,
  onBand,
  confirmed,
  onConfirmed,
}: {
  propertyId: string;
  band: AdminBandReview;
  /** The panel owns the derivation, so it hands the fresh reading back up —
   *  the page gates Approve on it. */
  onBand: (band: AdminBandReview) => void;
  confirmed: boolean;
  onConfirmed: (v: boolean) => void;
}) {
  const t = useTranslations("admin.signals.band");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const derive = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const fresh = await deriveBand(propertyId);
      onBand(fresh);
      // A derivation that comes back empty is not an exception — Overpass
      // answered, it just had nothing (or timed out inside our 20s budget).
      // Say so plainly rather than leaving the panel looking untouched.
      setFailed(!fresh.hasBand);
      // A new line is a new judgement; a tick carried over from the old one
      // would be a lie. The API clears its own copy for the same reason.
      onConfirmed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t("title")} note={t("note")}>
      {band.hasBand ? (
        <div className="space-y-3">
          <NeighbourhoodMap
            band={band.line.map((p) => [p.lat, p.lng] as [number, number])}
            bandLabel={band.streetName ?? t("unnamed")}
            mapLabel={t("mapLabel")}
            destination={null}
            route={null}
            className="h-56"
          />

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted">{t("street")}</dt>
            <dd className="text-ink">{band.streetName ?? t("unnamed")}</dd>
            <dt className="text-muted">{t("length")}</dt>
            <dd className="text-ink">{t("metres", { n: band.lengthMetres })}</dd>
          </dl>

          {/* The disclosure warning. Never a block — a 40 m band over a
              terrace of forty flats is fine, and only a person can tell that
              from a 40 m band over one villa. */}
          {band.identifiesSingleHome && (
            <p
              role="alert"
              className="rounded-(--radius-control) border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-ink"
            >
              {t("tooShort", { n: band.lengthMetres })}
            </p>
          )}

          {/* The tick the API demands. Deliberately worded as the two things
              the reviewer is actually asserting — right street, not one door —
              rather than a bare "confirm", which would be clicked without
              being read. */}
          <label className="flex cursor-pointer items-start gap-2 rounded-(--radius-control) border border-line p-3 text-xs leading-relaxed text-body">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => onConfirmed(e.target.checked)}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            <span>{t("confirm")}</span>
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-body">
            {band.attemptedAt ? t("failed") : t("never")}
          </p>
          {band.attemptedAt && (
            <p className="data text-[0.6875rem] text-muted">
              {t("attemptedAt", { at: new Date(band.attemptedAt).toLocaleString() })}
            </p>
          )}
        </div>
      )}

      {failed && !busy && (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-danger">
          {t("retryFailed")}
        </p>
      )}

      <div className="mt-3">
        <Button variant="secondary" onClick={derive} disabled={busy}>
          {busy ? t("deriving") : band.hasBand ? t("rederive") : t("retry")}
        </Button>
        {busy && (
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">
            {t("derivingNote")}
          </p>
        )}
      </div>
    </Panel>
  );
}
