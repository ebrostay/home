"use client";

import { useTranslations } from "next-intl";
import type { Blocker, SectionKey } from "@/lib/listing";
import { Button } from "@/components/ui/Button";

// The bar that answers the question the owner actually has before they save:
// what changed, and what happens when I press this.
//
// It always says something. Dirty, it names the changed sections and warns
// that the listing re-enters review. Clean, it reports what still stands
// between this and a listing worth publishing — so the bar is not dead weight
// on the two-thirds of visits that change nothing.
//
// The review warning is a PREDICTION. The server decides the transition from
// `status` alone (§2.2.1); a UI that computed it would be a second copy of the
// lifecycle, and the copy would be the one that goes stale.

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

export function SaveBar({
  changed,
  labels,
  blockers,
  state,
  reviewable,
  errorText,
  onSave,
  onDiscard,
}: {
  changed: SectionKey[];
  labels: Record<SectionKey, string>;
  blockers: Blocker[];
  state: SaveState;
  /** Whether saving sends this listing back to the review queue. */
  reviewable: boolean;
  errorText?: string;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("host.edit.save");
  const dirty = changed.length > 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[28] flex justify-center px-6 pb-[18px]">
      <div className="pointer-events-auto flex w-full max-w-[77rem] flex-wrap items-center gap-4 rounded-(--radius-card) border border-line bg-surface px-5 py-3 shadow-(--shadow-pop)">
        <p
          className="flex min-w-0 items-center gap-2.5"
          // The count is the page's headline state, and it changes without a
          // focus move — so it is announced rather than silently repainted.
          role="status"
        >
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${dirty ? "bg-warn" : "bg-brand"}`}
          />
          <span className="text-[0.84375rem] font-semibold text-ink">
            {errorText
              ? errorText
              : dirty
                ? t("unsaved", { count: changed.length })
                : state === "saved"
                  ? t("savedJustNow")
                  : t("noChanges")}
          </span>
        </p>

        <div className="flex min-w-[11rem] flex-1 flex-wrap items-center gap-2">
          {dirty
            ? changed.map((key) => (
                <span
                  key={key}
                  className="data rounded-full bg-brand-soft px-2.5 py-1 text-[0.65625rem] uppercase tracking-[0.06em] text-brand-strong"
                >
                  {labels[key]}
                </span>
              ))
            : blockers.map((b) => (
                <span
                  key={b.key}
                  className="flex items-center gap-2 text-[0.78125rem] text-body"
                >
                  <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-warn" />
                  {b.key === "missingTranslation"
                    ? t("blocker.missingTranslation", { count: b.count })
                    : t(`blocker.${b.key}` as "blocker.noPhotos")}
                </span>
              ))}
        </div>

        {dirty && (
          <>
            <p className="max-w-[34ch] text-xs leading-[1.4] text-muted">
              {reviewable ? t("reviewNote") : t("liveNote")}
            </p>
            <Button variant="secondary" onClick={onDiscard} disabled={state === "saving"}>
              {t("discard")}
            </Button>
          </>
        )}

        <Button onClick={onSave} disabled={!dirty || state === "saving"}>
          {state === "saving" ? t("saving") : dirty ? t("save") : t("saved")}
        </Button>
      </div>
    </div>
  );
}
