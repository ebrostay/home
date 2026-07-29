"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2, TriangleAlert } from "lucide-react";

// Back · the save state · (skip) · the primary. Same five slots on every step,
// in the same order, so an owner's hand goes to the same place nine times.

export type SaveState = "idle" | "saving" | "saved" | "error";

export function StepFooter({
  first,
  last,
  skippable,
  save,
  errorText,
  blocked,
  onBack,
  onSkip,
  onNext,
}: {
  first: boolean;
  last: boolean;
  skippable: boolean;
  save: SaveState;
  errorText?: string;
  /** Why Continue is unavailable, already localized. Empty means it is. */
  blocked?: string;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("host.new");

  return (
    <>
      {/* Present but inert on step 1, never removed: a footer that reflows
          the moment you leave the first step moves the button you were about
          to press. */}
      <button
        type="button"
        onClick={onBack}
        disabled={first}
        className="rounded-(--radius-control) border border-line bg-surface px-4 py-2.5 text-[0.8125rem] font-semibold text-ink transition-colors duration-(--dur-standard) hover:bg-page disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface"
      >
        {t("back")}
      </button>

      <SaveNote state={save} errorText={errorText} />

      <div className="flex-1" />

      {/* The icon carries the amber, the words do not: `--warn` is 3.66:1 on
          this bar in light mode, which is fine for a 13px glyph (3:1) and not
          fine for 11px mono (4.5:1). */}
      {blocked && (
        <p className="data flex items-center gap-1.5 text-[0.6875rem] tracking-[0.06em] text-body">
          <TriangleAlert size={13} strokeWidth={2} className="shrink-0 text-warn" aria-hidden />
          {blocked}
        </p>
      )}

      {/* Only where there is an escape hatch. It advances exactly like
          Continue — the difference is permission, not behaviour. */}
      {skippable && (
        <button
          type="button"
          onClick={onSkip}
          className="rounded-(--radius-control) px-2 py-2 text-[0.8125rem] font-medium text-muted transition-colors duration-(--dur-standard) hover:text-ink"
        >
          {t("skip")}
        </button>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!!blocked || save === "saving"}
        className="rounded-(--radius-control) bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-brand"
      >
        {last ? t("submit") : t("continue")}
      </button>
    </>
  );
}

/** The draft's promise, kept honestly. The prototype's static "Saved
 *  automatically" was a placeholder for a real state — and a page that claims
 *  to have saved while a request is in flight is the one lie this wizard
 *  cannot afford, because the whole product story is "stop whenever you like". */
function SaveNote({ state, errorText }: { state: SaveState; errorText?: string }) {
  const t = useTranslations("host.new");

  if (state === "error") {
    return (
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-body">
        <TriangleAlert size={13} strokeWidth={2} className="shrink-0 text-warn" aria-hidden />
        <span className="truncate">{errorText ?? t("saveFailed")}</span>
      </p>
    );
  }

  if (state === "saving") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 size={13} strokeWidth={2} className="animate-spin" aria-hidden />
        {t("saving")}
      </p>
    );
  }

  if (state === "saved") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Check size={13} strokeWidth={2.5} className="text-brand" aria-hidden />
        {t("saved")}
      </p>
    );
  }

  // Before anything has been written there is nothing to report, and "saved"
  // would be a claim about a document that does not exist yet.
  return <p className="text-xs text-muted">{t("savesAsYouGo")}</p>;
}
