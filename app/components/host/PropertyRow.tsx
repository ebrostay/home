"use client";

import { Camera, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AvailabilityBand } from "@/components/MonthBand";
import type { HostProperty } from "@/lib/api";
import { formatEuro } from "@/lib/pricing";
import { bucketOf, isDimmed, monthsFor, type Tab } from "@/lib/portfolio";

// ============================================================
// One row per listing, covering every lifecycle state. The row is a status
// report first and a launchpad second: what is this home doing, and what — if
// anything — does it need from me.
//
// Controls whose destination does not exist yet are rendered disabled rather
// than hidden. A row that quietly loses its primary button in one state reads
// as a different kind of row; a disabled one reads as "not yet", which is the
// truth. `title` carries the reason.
// ============================================================

type Bucket = Exclude<Tab, "all">;

const PILL: Record<Bucket, { chip: string; dot: string }> = {
  live: { chip: "bg-brand-soft text-brand-strong", dot: "bg-brand" },
  review: { chip: "bg-river-soft text-river-deep", dot: "bg-river-deep" },
  changes: { chip: "bg-warn-soft text-warn", dot: "bg-warn" },
  draft: { chip: "bg-surface-2 text-muted", dot: "bg-line-strong" },
  paused: { chip: "bg-surface-2 text-body", dot: "bg-occupied" },
};

const NOTE_TONE = {
  quiet: "bg-surface-2 text-body",
  warn: "bg-warn-soft text-warn",
  river: "bg-river-soft text-ink",
} as const;

export function PropertyRow({
  property: p,
  locale,
  now,
}: {
  property: HostProperty;
  locale: string;
  now: Date;
}) {
  const t = useTranslations("host");
  const tl = useTranslations("listing");
  const bucket = bucketOf(p);
  const dim = isDimmed(p);
  const isDraft = p.status === "draft";
  const soon = t("soon");

  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00`));

  const note = noteFor();
  const actions = ACTIONS[bucket];

  function noteFor(): { text: string; tone: keyof typeof NOTE_TONE; action?: string } | null {
    if (bucket === "changes")
      return {
        text: p.reviewNote ?? t("row.changes"),
        tone: "warn",
        action: t("actions.seeComments"),
      };
    if (bucket === "review")
      return {
        text: t("row.submitted", { date: p.updatedAt ? day(p.updatedAt) : "—" }),
        tone: "river",
      };
    if (bucket === "draft") {
      const left = p.sectionsTotal - p.sectionsDone;
      return {
        text: left ? t("row.draft", { left }) : t("row.draftComplete"),
        tone: "quiet",
      };
    }
    if (bucket === "paused")
      return {
        text: t("row.paused"),
        tone: "quiet",
        action: p.requestCount > 0 ? t("actions.seeRequest") : undefined,
      };
    // Live: only worth a line when the home is actually busy.
    const today = new Date().toISOString().slice(0, 10);
    const busy = p.availability
      .filter((r) => r.start <= today && r.end > today)
      .map((r) => r.end)
      .sort()[0];
    return busy ? { text: t("row.occupied", { date: day(busy) }), tone: "quiet" } : null;
  }

  return (
    <article
      className={`grid items-start gap-[1.375rem] rounded-(--radius-card) border bg-surface p-4 shadow-(--shadow-card) transition-colors duration-(--dur-standard) hover:border-line-strong min-[56.25rem]:grid-cols-[9.75rem_minmax(0,1fr)_14.5rem] ${
        bucket === "changes" ? "border-warn" : "border-line"
      }`}
    >
      {/* Photo */}
      <div
        className={`relative overflow-hidden rounded-(--radius-card) border border-line bg-surface-2 max-[56.25rem]:aspect-[16/9] min-[56.25rem]:aspect-[4/3] ${
          dim ? "opacity-[0.72]" : ""
        }`}
      >
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized
          <img
            src={p.coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-2 flex flex-col items-center justify-center gap-1.5 rounded-(--radius-control) border border-dashed border-line-strong">
            <Camera size={18} strokeWidth={2} className="text-muted" aria-hidden />
            <span className="text-[0.71875rem] text-muted">{t("row.noPhotos")}</span>
          </div>
        )}
      </div>

      {/* Identity, note, availability */}
      <div className="flex min-w-0 flex-col gap-[9px]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${PILL[bucket].chip}`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${PILL[bucket].dot}`}
            />
            <span className="data text-[0.625rem] font-semibold tracking-[0.08em]">
              {t(`state.${bucket}` as "state.live")}
            </span>
          </span>
        </div>

        <div>
          <h2 className="font-display text-xl font-bold leading-[1.15] tracking-[-0.015em] text-ink">
            {p.name}
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            {p.address ?? t("row.addressUnset")}
          </p>
        </div>

        <p className="data text-[0.78125rem] text-body">
          {p.bedrooms > 0
            ? tl("specs", {
                bedrooms: p.bedrooms,
                bathrooms: p.bathrooms,
                size: p.sizeM2,
              })
            : t("row.specsUnset")}
        </p>

        {note && (
          <p
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-(--radius-control) px-3 py-2.5 text-[0.78125rem] leading-[1.45] ${NOTE_TONE[note.tone]}`}
          >
            <span className="min-w-0">{note.text}</span>
            {note.action && (
              <button
                type="button"
                disabled
                title={soon}
                className="ml-auto shrink-0 text-[0.78125rem] font-semibold underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {note.action}
              </button>
            )}
          </p>
        )}

        {isDraft ? (
          <div className="flex items-center gap-3">
            <span className="h-1.5 max-w-[17.5rem] flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-brand"
                style={{
                  width: `${Math.round((p.sectionsDone / p.sectionsTotal) * 100)}%`,
                }}
              />
            </span>
            <span className="data shrink-0 text-[0.71875rem] text-muted">
              {t("row.progress", { done: p.sectionsDone, total: p.sectionsTotal })}
            </span>
          </div>
        ) : (
          <div className={`max-w-[27.5rem] ${dim ? "opacity-50" : ""}`}>
            <AvailabilityBand months={monthsFor(p, locale, now)} />
          </div>
        )}
      </div>

      {/* Money and actions */}
      <div className="flex h-full flex-col items-stretch gap-3 min-[56.25rem]:items-end">
        <div className="min-[56.25rem]:text-right">
          <p
            className={`data text-[1.375rem] font-semibold leading-none tracking-[-0.01em] ${
              p.priceNumber > 0 ? "text-ink" : "text-muted"
            }`}
          >
            {p.priceNumber > 0
              ? `${formatEuro(p.priceNumber, locale)} €`
              : t("row.priceUnset")}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {p.priceNumber > 0 ? t("row.priceNote") : t("row.priceNoteUnset")}
          </p>
        </div>

        {p.requestCount > 0 && (
          <span className="flex items-center gap-1.5 self-start rounded-full border border-river bg-river-soft px-2.5 py-[5px] min-[56.25rem]:self-end">
            <span className="data text-[0.6875rem] font-semibold text-river-deep">
              {p.requestCount}
            </span>
            <span className="text-xs text-ink">
              {t("row.requests", { count: p.requestCount })}
            </span>
          </span>
        )}

        <div className="flex w-full flex-col gap-2 min-[56.25rem]:mt-auto">
          <button
            type="button"
            disabled
            title={soon}
            className={`h-[38px] w-full rounded-(--radius-control) text-[0.8125rem] font-semibold transition-colors duration-(--dur-standard) disabled:cursor-not-allowed disabled:opacity-45 ${
              actions.quiet
                ? "border border-line bg-surface-2 text-ink hover:bg-line"
                : "bg-brand text-white hover:bg-brand-strong"
            }`}
          >
            {t(`actions.${actions.primary}` as "actions.overview")}
          </button>

          <div className="flex gap-2">
            {actions.secondaryHref && p.status === "published" ? (
              <Link
                href={{ pathname: "/property", query: { id: p.id } }}
                className="flex h-9 flex-1 items-center justify-center rounded-(--radius-control) border border-line bg-surface text-[0.8125rem] font-medium text-ink transition-colors duration-(--dur-standard) hover:bg-surface-2"
              >
                {t(`actions.${actions.secondary}` as "actions.overview")}
              </Link>
            ) : (
              <button
                type="button"
                disabled
                title={soon}
                className="h-9 flex-1 rounded-(--radius-control) border border-line bg-surface text-[0.8125rem] font-medium text-ink transition-colors duration-(--dur-standard) hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {t(`actions.${actions.secondary}` as "actions.overview")}
              </button>
            )}
            <button
              type="button"
              disabled
              title={soon}
              aria-label={t("actions.more", { name: p.name })}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-(--radius-control) border border-line bg-surface text-ink transition-colors duration-(--dur-standard) hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// A row never spends its two buttons on the same job: the note-line link and
// the primary action always route somewhere different.
const ACTIONS: Record<
  Bucket,
  { primary: string; secondary: string; quiet?: boolean; secondaryHref?: boolean }
> = {
  live: { primary: "overview", secondary: "viewAsGuest", secondaryHref: true },
  // The one quiet primary: nothing to do while review has the listing, so the
  // button must not look like the moment's action. It never hovers to brand.
  review: { primary: "viewSubmission", secondary: "withdraw", quiet: true },
  changes: { primary: "fix", secondary: "preview" },
  draft: { primary: "continue", secondary: "delete" },
  paused: { primary: "reopen", secondary: "manage" },
};
