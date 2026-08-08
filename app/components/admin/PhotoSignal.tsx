"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDistance } from "@/lib/geocode";
import { readPhotoLocations, type ReviewPhoto } from "@/lib/review";
import { Panel } from "./Panel";

// Where the camera said each photo was taken (ADR-019 amendment).
//
// THIS IS A SIGNAL AND NEVER A VERIFICATION, and the panel says so in both
// languages rather than leaving the reader to infer it. `exiftool` rewrites
// GPS in seconds, so a determined bad actor defeats it completely; what it
// catches is honest mistakes and lazy fraud. The same discipline as the badge
// ADR-027 refused to draw.
//
// The published images have had their EXIF stripped. These are what the files
// said before it went.

export function PhotoSignal({
  photos,
  pin,
}: {
  photos: ReviewPhoto[];
  pin: { lat: number; lng: number };
}) {
  const t = useTranslations("admin.signals.photos");
  const locale = useLocale();
  const summary = readPhotoLocations(photos, pin);

  return (
    <Panel title={t("title")} note={t("note")}>
      {summary.located === 0 ? (
        // The common case, and deliberately not a warning: WhatsApp and most
        // social platforms strip EXIF, screenshots never had it, and location
        // services are off on plenty of phones. Flagging absence would flag
        // nearly every listing and teach reviewers to skip this panel.
        <p className="text-xs text-muted">{t("none", { total: photos.length })}</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <Figure label={t("located")}>
              <span className="data text-ink">
                {summary.located}/{photos.length}
              </span>
            </Figure>
            <Figure label={t("farthest")}>
              <span className="data text-ink">
                {summary.farthestM === null
                  ? "—"
                  : formatDistance(summary.farthestM, locale)}
              </span>
            </Figure>
            {/* The strongest of the three: a set shot in three districts is
                not one home, however close to the pin each photo is. */}
            <Figure label={t("spread")}>
              <span className="data text-ink">
                {summary.spreadM === null
                  ? "—"
                  : formatDistance(summary.spreadM, locale)}
              </span>
            </Figure>
          </dl>

          <ul className="mt-4 flex flex-wrap gap-2">
            {summary.readings.map((r) => (
              <li
                key={r.url}
                className="flex items-center gap-2 rounded-(--radius-control) border border-line px-2 py-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.url}
                  alt=""
                  className="h-8 w-8 rounded-sm object-cover"
                />
                <span className="data text-[0.6875rem] text-body">
                  {r.metres === null ? "—" : formatDistance(r.metres, locale)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function Figure({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="data text-[0.5625rem] uppercase tracking-[0.14em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}
