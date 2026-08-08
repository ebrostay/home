"use client";

import { useTranslations } from "next-intl";
import type { PropertyStatus } from "@/lib/api";
import { Button } from "@/components/ui/Button";

// Close the listing, or reopen it.
//
// Deleting is not offered. The handoff asks for it behind a typed
// confirmation, and even that is the wrong shape here: a listing carries stay
// history, and "keep my data, take it out of search" is exactly what `paused`
// means (ADR-024). Reopening is not a re-review — the listing was approved,
// and pausing changed nothing about what it claims.

export function DangerZone({
  status,
  busy,
  onPause,
  onReopen,
}: {
  status: PropertyStatus;
  busy: boolean;
  onPause: () => void;
  onReopen: () => void;
}) {
  const t = useTranslations("host.edit.danger");
  const paused = status === "paused";
  // A listing whose owner has asked to close their account (design
  // 2026-08-08): still public — `closed` reads exactly like `published` to
  // `PublicStatus.IsPublic` and `ListingVisibility.ForRoutes` — but the
  // account is flagged and `RequireWritableAsync` (Task 4) refuses every
  // write on it, so there genuinely is no pause/reopen to offer here.
  const closed = status === "closed";
  // Nothing to close that is open: a draft or a listing in the queue is not in
  // search to begin with, so the control would be a no-op with a scary label.
  const actionable = paused || status === "published";

  return (
    <section className="flex flex-wrap items-start gap-4 rounded-(--radius-card) border border-warn bg-warn-soft px-6 py-5">
      <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
        <h2 className="text-[0.9375rem] font-semibold text-ink">
          {closed ? t("titleClosed") : paused ? t("titlePaused") : t("title")}
        </h2>
        <p className="text-[0.84375rem] leading-relaxed text-body">
          {closed
            ? t("bodyClosed")
            : paused
              ? t("bodyPaused")
              : actionable
                ? t("body")
                : t("bodyNotLive")}
        </p>
      </div>
      {actionable && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={paused ? onReopen : onPause}
        >
          {paused ? t("reopen") : t("pause")}
        </Button>
      )}
    </section>
  );
}
