"use client";

import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AvailabilityBand } from "@/components/MonthBand";
import { RowMenu } from "@/components/host/RowMenu";
import type { HostProperty } from "@/lib/api";
import { formatEuro } from "@/lib/pricing";
import { bucketOf, formatDay, isDimmed, monthsFor, type Tab } from "@/lib/portfolio";

// ============================================================
// One row per listing, covering every lifecycle state. The row is a status
// report first and a launchpad second: what is this home doing, and what — if
// anything — does it need from me.
//
// Split-row layout (design 1c): three zones — photo · identity · action rail —
// each owning its own padding, with none on the article itself. That is what
// lets the photo reach the top and bottom edges instead of floating inside a
// padded card.
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
  const bucket = bucketOf(p);
  const dim = isDimmed(p);
  const isDraft = p.status === "draft";
  const soon = t("soon");

  // Falls back to the em dash this row already shows for a missing date, so
  // an unreadable one costs this line and not the page (see `formatDay`).
  const day = (iso: string) => formatDay(iso, locale) ?? "—";

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

  // Rendered twice — beside the title when the row stacks, in the rail when it
  // does not — because the two layouts put it under different parents. One
  // function, so the two can never drift. No aria-hidden needed: the copy the
  // layout is not using is display:none, already out of the a11y tree.
  const price = (hiddenClass: string, align: string) => (
    <div className={`${hiddenClass} ${align}`}>
      <p
        className={`data text-[1.3125rem] font-semibold leading-none tracking-[-0.01em] ${
          p.priceNumber > 0 ? "text-ink" : "text-muted"
        }`}
      >
        {p.priceNumber > 0
          ? `${formatEuro(p.priceNumber, locale)} €`
          : t("row.priceUnset")}
      </p>
      <p className="mt-1.5 text-[0.71875rem] text-muted">
        {p.priceNumber > 0 ? t("row.priceNote") : t("row.priceNoteUnset")}
      </p>
    </div>
  );

  return (
    <article
      className={`grid overflow-hidden rounded-(--radius-card) border bg-surface shadow-(--shadow-card) transition-colors duration-(--dur-standard) hover:border-line-strong min-[50rem]:grid-cols-[13.125rem_minmax(0,1fr)_14.25rem] ${
        bucket === "changes" ? "border-warn" : "border-line"
      }`}
    >
      {/* Photo zone — the image is absolute so it fills the row's full height
          whatever the identity zone does. */}
      <div className="relative min-h-44 bg-surface-2">
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized
          <img
            src={p.coverUrl}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover ${
              dim ? "opacity-[0.72]" : ""
            }`}
          />
        ) : (
          <div
            className={`absolute inset-3 flex flex-col items-center justify-center gap-1.5 rounded-(--radius-control) border border-dashed border-line-strong ${
              dim ? "opacity-[0.72]" : ""
            }`}
          >
            <Camera size={18} strokeWidth={2} className="text-muted" aria-hidden />
            <span className="text-[0.71875rem] text-muted">{t("row.noPhotos")}</span>
          </div>
        )}

        {/* The state belongs to the home, so it sits on the home. The card
            shadow is what keeps it legible over an arbitrary photo. */}
        <span
          className={`absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 shadow-(--shadow-card) ${PILL[bucket].chip}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${PILL[bucket].dot}`} />
          <span className="data text-[0.625rem] font-semibold tracking-[0.08em]">
            {t(`state.${bucket}` as "state.live")}
          </span>
        </span>
      </div>

      {/* Identity zone */}
      <div className="flex min-w-0 flex-col gap-[9px] px-5 py-4">
        <div className="flex min-w-0 items-baseline gap-2.5">
          {/* Two lines when stacked, one in the wide row. Truncating to one
              line on a phone collapsed "…3 - 1 IZQ" and "…3 - 2 IZQ" to the
              same string — the ellipsis ate the only part that told two
              listings in the same building apart. */}
          <h2 className="line-clamp-2 min-w-0 font-display text-[1.1875rem] font-bold leading-[1.15] tracking-[-0.015em] text-ink min-[50rem]:line-clamp-1">
            {p.name}
          </h2>
          {p.reference && (
            <span className="data shrink-0 text-[0.6875rem] text-muted max-[50rem]:hidden">
              {p.reference}
            </span>
          )}
          {price("min-[50rem]:hidden", "ml-auto shrink-0 text-right")}
        </div>

        <p className="truncate text-[0.8125rem] text-muted">
          {p.address ?? t("row.addressUnset")}
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

        {/* Pinned to the bottom so the bands line up across rows whether or not
            the row above carried a note. */}
        {isDraft ? (
          <div className="mt-auto flex items-center gap-3 pt-2">
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
          <div
            className={`mt-auto max-w-[27.5rem] pt-2 ${dim ? "opacity-50" : ""}`}
          >
            <AvailabilityBand months={monthsFor(p, locale, now)} />
          </div>
        )}
      </div>

      {/* Action rail */}
      <div className="flex flex-col gap-3 border-line bg-surface p-4 max-[50rem]:border-t min-[50rem]:border-l">
        {price("max-[50rem]:hidden", "")}

        {p.requestCount > 0 && (
          <span className="flex items-center gap-1.5 self-start rounded-full border border-river bg-river-soft px-2.5 py-[5px]">
            <span className="data text-[0.6875rem] font-semibold text-river-deep">
              {p.requestCount}
            </span>
            <span className="text-xs text-ink">
              {t("row.requests", { count: p.requestCount })}
            </span>
          </span>
        )}

        {/* Stacked, the three controls share one line; in the wide row they
            stack so the rail stays narrow. */}
        <div className="mt-auto flex w-full flex-wrap gap-2 min-[50rem]:flex-col">
          {(() => {
            const primaryClass = `h-[38px] min-w-36 flex-1 rounded-(--radius-control) text-[0.8125rem] font-semibold transition-colors duration-(--dur-standard) disabled:cursor-not-allowed disabled:opacity-45 min-[50rem]:w-full min-[50rem]:flex-none ${
              actions.quiet
                ? "border border-line bg-surface-2 text-ink hover:bg-line"
                : "bg-brand text-white hover:bg-brand-strong"
            }`;
            const label = t(`actions.${actions.primary}` as "actions.overview");
            // A destination makes it a link; without one it keeps the same
            // button shape, disabled, so a row does not change silhouette by
            // state.
            return actions.primaryTo ? (
              <Link
                href={{ pathname: actions.primaryTo, query: { id: p.id } }}
                className={`${primaryClass} flex items-center justify-center`}
              >
                {label}
              </Link>
            ) : (
              <button type="button" disabled title={soon} className={primaryClass}>
                {label}
              </button>
            );
          })()}

          <div className="flex flex-1 gap-2 min-[50rem]:w-full min-[50rem]:flex-none">
            {actions.secondaryTo ? (
              <Link
                href={{ pathname: actions.secondaryTo, query: { id: p.id } }}
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
            {/* The row's two buttons are chosen per lifecycle state, and none
                of those pairs has room for the listing editor without pushing
                out something an owner reaches for more often. It goes here —
                which is also the only route to the editor from this page. */}
            <RowMenu propertyId={p.id} label={t("actions.more", { name: p.name })} />
          </div>
        </div>
      </div>
    </article>
  );
}

// A row never spends its two buttons on the same job: the note-line link and
// the primary action always route somewhere different.
//
// A button's destination is a path, not a flag per page. The flags this table
// used to carry (`primaryManage`, `primaryHref`, `secondaryManage`,
// `secondaryHref`) were four spellings of one question — and adding the
// wizard as a fifth answer would have made it six.
const ACTIONS: Record<
  Bucket,
  {
    primary: string;
    secondary: string;
    quiet?: boolean;
    /** Where the button goes, with `?id=`. Absent means the destination does
     *  not exist yet, and the button renders disabled. "/property" is the
     *  guest page — only meaningful since ADR-029 made it answer to its owner
     *  in every state. */
    primaryTo?: "/host/manage" | "/host/new" | "/property";
    secondaryTo?: "/host/manage" | "/property";
  }
> = {
  live: { primary: "overview", secondary: "viewAsGuest", primaryTo: "/host/manage", secondaryTo: "/property" },
  // The one quiet primary: nothing to do while review has the listing, so the
  // button must not look like the moment's action. It never hovers to brand.
  // "View submission" is what the reviewer is looking at, which since ADR-029
  // is a page the owner can open — the label promised this before it existed.
  review: { primary: "viewSubmission", secondary: "withdraw", quiet: true, primaryTo: "/property" },
  // Fix reopens the wizard, the one surface with a Send-for-review button —
  // the editor can change a rejected listing but deliberately never resubmits
  // it (a save must not re-queue a listing as a side effect). A rejected
  // listing is usually complete, so the wizard resumes on its last step:
  // the Send button beside the list of anything still missing. Preview is a
  // real link since ADR-029: the guest page answers to its own owner in every
  // state, so "what does the reviewer see?" is one click from the row that is
  // asking the owner to change it.
  changes: { primary: "fix", secondary: "preview", primaryTo: "/host/new", secondaryTo: "/property" },
  // Continue reopens the wizard, which restores the draft and lands on its
  // first unfinished step (ADR-030). Delete stays disabled: there is no
  // delete endpoint, and "keep the data, close the listing" is `paused`.
  draft: { primary: "continue", secondary: "delete", primaryTo: "/host/new" },
  // Reopening is a mutation that does not exist yet, so the route into Manage
  // is the secondary — a paused home still has a calendar and a price worth
  // reading, and the owner should be able to get to them.
  paused: { primary: "reopen", secondary: "manage", secondaryTo: "/host/manage" },
};
