"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IMPORT_SOURCES, matchSource } from "@/lib/import";

// The offer (§10.1). Not a banner on step 1: the import is a fork in the road,
// and a dismissible banner above the address field would make the blank path
// the default and the import an afterthought — backwards for the majority case.
//
// No rail and no step card either. This is not step 0 of 9, and the wizard's
// progress header would say "1 of 9" over a screen that has no question on it.

/** Idealista, Fotocasa … — the source key as a name. The same rule the banner
 *  in the wizard uses, so one source never has two spellings on one flow. */
const named = (key: string) => key[0].toUpperCase() + key.slice(1);

export function StartScreen({
  onStart,
  onBlank,
  error,
  busy,
}: {
  onStart: (url: string) => void;
  onBlank: () => void;
  /** Already translated — the page owns the `ApiError.code` → copy mapping,
   *  because the poll's `job.error.code` needs exactly the same table. */
  error: string | null;
  busy: boolean;
}) {
  const t = useTranslations("host.import");
  const [url, setUrl] = useState("");

  const source = matchSource(url);
  const typed = url.trim().length > 0;
  let host = "";
  try {
    host = new URL(url.trim()).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }

  const dead = !source || busy;

  return (
    <div className="mx-auto flex w-full max-w-[53.75rem] flex-col gap-[22px]">
      <h1 className="font-display text-[2.125rem] font-bold leading-[1.15] text-ink">
        {t("title")}
      </h1>

      <section className="rounded-(--radius-card) border border-line bg-surface px-6 py-[22px] shadow-(--shadow-card)">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-[1.1875rem] font-bold text-ink">{t("pasteHead")}</h2>
          <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">
            {t("pasteEyebrow")}
          </span>
        </div>

        {/* The closed list, named BEFORE anything is pasted: an unmapped page
            yields values in the wrong fields, so the answer arrives before the
            effort does. The lit pill is the same fact the status line states in
            words — colour alone never carries it. */}
        <ul className="mt-4 flex list-none flex-wrap gap-2 p-0">
          {IMPORT_SOURCES.map((s) => {
            const lit = source === s.key;
            return (
              <li
                key={s.key}
                className={
                  "rounded-full border px-[0.8125rem] py-[0.375rem] text-[0.78125rem] " +
                  (lit
                    ? "border-river-deep bg-river-soft font-semibold text-ink"
                    : "border-line bg-surface-2 text-body")
                }
              >
                {named(s.key)}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="sr-only" htmlFor="import-url">
            {t("urlLabel")}
          </label>
          <input
            id="import-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("urlPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="data min-w-[15rem] flex-1 rounded-(--radius-control) border border-line-strong bg-surface px-[13px] py-[11px] text-[0.84375rem] text-ink outline-none transition-colors duration-(--dur-standard) placeholder:text-muted focus:border-brand"
          />
          <button
            type="button"
            // GENUINELY disabled, attribute and all — an actionable-looking
            // button that silently does nothing is worse than a plainly dead
            // one (§10.1). The handler's own guard is the belt, not the braces.
            disabled={dead}
            aria-disabled={dead}
            onClick={() => source && onStart(url.trim())}
            className="rounded-(--radius-control) bg-brand px-4 py-[11px] text-[0.84375rem] font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-line disabled:text-muted disabled:hover:bg-line"
          >
            {t("read")}
          </button>
        </div>

        {/* One line, three states, one live region: the button's disabledness
            said in words. `--ink` rather than `--muted` for everything that is
            not a hint — this sits on --surface and has to clear 4.5:1. */}
        <p className="mt-2.5 text-[0.78125rem] leading-[1.5] text-ink" aria-live="polite">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : !typed ? (
            <span className="text-body">{t("statusEmpty")}</span>
          ) : source ? (
            t("statusKnown", { source: named(source) })
          ) : (
            t("statusUnknown", { host: host || url.trim() })
          )}
        </p>
      </section>

      {/* Card B renders DISABLED rather than hidden (ADR-033 Decision 9): the
          document route is the answer for an owner whose home is not on any
          portal, and hiding it makes them think we never thought of them.
          Shown, so it must be PLAINLY dead — inert surface, dashed edge, no
          shadow. Not `opacity`: a translucent card composites its text toward
          the page and quietly drops the copy below 4.5:1. */}
      <section
        className="rounded-(--radius-card) border border-dashed border-line-strong bg-surface-2 px-6 py-[22px]"
        aria-labelledby="import-doc-head"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="import-doc-head" className="font-display text-[1.1875rem] font-bold text-ink">
            {t("docHead")}
          </h2>
          <span className="data rounded-full border border-line bg-surface px-2.5 py-[3px] text-[0.65625rem] tracking-[0.1em] text-body">
            {t("docSoon")}
          </span>
        </div>
        <p className="mt-2 text-[0.78125rem] leading-[1.5] text-body">{t("docBody")}</p>
        {/* No drop, dragover or change handler is attached AT ALL, so a dragged
            file cannot be silently swallowed (ADR-033 Decision 9). A drop zone
            that accepts a file and does nothing with it is the one outcome
            worse than not offering the route yet. */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="mt-4 w-full cursor-not-allowed rounded-(--radius-control) border border-dashed border-line-strong bg-surface py-6 text-[0.8125rem] text-body"
        >
          {t("docSoon")}
        </button>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-line bg-surface-2 px-[22px] py-4">
        <p className="text-[0.8125rem] leading-[1.5] text-body">{t("blankProse")}</p>
        <button
          type="button"
          onClick={onBlank}
          className="shrink-0 rounded-(--radius-control) border border-line-strong bg-surface px-4 py-2 text-[0.84375rem] font-semibold text-ink transition-colors duration-(--dur-standard) hover:bg-page"
        >
          {t("blank")}
        </button>
      </div>

      {/* Said BEFORE the read, not after it: three things an import will never
          fill, each with the reason it cannot. An owner who learns this from a
          gap on step 4 learns it as a failure. */}
      <section>
        {/* `text-body`, not the `text-muted` the eyebrow inside a card gets:
            this one sits on --page, where --muted measures 4.37:1 and misses
            4.5. On --surface the same pairing measures 4.66 and is legal,
            which is why the two eyebrows differ. */}
        <p className="data text-[0.65625rem] tracking-[0.12em] text-body">{t("neverEyebrow")}</p>
        <hr className="mt-2 border-line" />
        <dl className="mt-3 flex flex-col gap-3">
          {(["Photos", "Availability", "Paperwork"] as const).map((k) => (
            <div key={k}>
              <dt className="text-[0.8125rem] font-semibold text-ink">
                {t(`never${k}Head` as "neverPhotosHead")}
              </dt>
              <dd className="text-[0.78125rem] leading-[1.55] text-body">
                {t(`never${k}` as "neverPhotos")}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
