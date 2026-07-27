"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Bilingual, HostListing } from "@/lib/api";
import { LIMITS } from "@/lib/listing";
import { TextAreaField, TextField } from "./TextField";

// The words a guest reads. Bilingual is a hard requirement in this product,
// so the two languages sit side by side and neither is a second-class field.
//
// The English description carries an approval gate the other fields don't
// (ADR-027). It is the one paragraph read as the owner's own voice, and the
// only one long enough for a bad rendering to mislead — "beds: 2 dobles" says
// the same thing however it is translated; a paragraph does not.
//
// 🔜 The handoff has this text machine-translated with the owner approving the
// result. The gate ships; the translation does not — there is no translate
// endpoint yet (ADR-020 keeps DeepSeek for it). So the owner writes both, and
// the button drops into this same panel later.

export function DescriptionFields({
  value,
  onChange,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
}) {
  const t = useTranslations("host.edit.description");

  const setBi = (key: "copy" | "details" | "beds", locale: "es" | "en", next: string) => {
    const current = value[key];
    const merged: Bilingual = { es: current?.es ?? null, en: current?.en ?? null };
    merged[locale] = next.trim() === "" ? null : next;
    onChange({
      ...value,
      [key]: merged.es === null && merged.en === null ? null : merged,
    });
  };

  const approved = value.copyEnApproved;
  const hasEnglish = !!value.copy?.en?.trim();

  return (
    <div className="flex flex-col gap-5">
      <TextAreaField
        label={t("about")}
        tag={t("aboutTagEs")}
        value={value.copy?.es ?? ""}
        onChange={(v) => setBi("copy", "es", v)}
        maxLength={LIMITS.maxCopy}
        hint={t("aboutHint")}
      />

      {/* River, not brand: this panel is informational — it is where the two
          languages are reconciled, not another thing to fill in. */}
      <div className="flex flex-col gap-3 rounded-(--radius-control) border border-river bg-river-soft p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="data text-[0.65625rem] tracking-[0.1em] text-river-deep">
            {approved ? t("enApproved") : t("enPending")}
          </span>
          <span className="ml-auto text-xs text-river-deep">
            {approved ? t("enApprovedHint") : t("enPendingHint")}
          </span>
        </div>

        <TextAreaField
          label={t("about")}
          tag="EN"
          value={value.copy?.en ?? ""}
          onChange={(v) => setBi("copy", "en", v)}
          maxLength={LIMITS.maxCopy}
        />

        <button
          type="button"
          // Disabled with nothing to approve: an approval of an empty
          // paragraph is a claim about nothing, and it would satisfy the
          // blocker without anyone having written a word.
          disabled={!hasEnglish}
          aria-pressed={approved}
          onClick={() => onChange({ ...value, copyEnApproved: !approved })}
          className={`flex w-fit items-center gap-2 rounded-(--radius-control) px-3.5 py-2 text-[0.78125rem] font-semibold transition-[filter,background-color] duration-(--dur-standard) disabled:cursor-not-allowed disabled:opacity-45 ${
            approved
              ? "bg-surface-2 text-muted hover:brightness-95"
              : "bg-brand text-white hover:brightness-95"
          }`}
        >
          {approved && <Check size={14} strokeWidth={3} aria-hidden />}
          {approved ? t("approvedButton") : t("approveButton")}
        </button>
      </div>

      {/* Short, factual, and read on the detail page as a table rather than as
          prose — so they get plain paired fields, not the approval treatment. */}
      <div className="grid items-start gap-3.5 min-[46rem]:grid-cols-2">
        <TextAreaField
          label={t("details")}
          tag="ES"
          rows={3}
          value={value.details?.es ?? ""}
          onChange={(v) => setBi("details", "es", v)}
          maxLength={LIMITS.maxDetails}
          hint={t("detailsHint")}
        />
        <TextAreaField
          label={t("details")}
          tag="EN"
          rows={3}
          value={value.details?.en ?? ""}
          onChange={(v) => setBi("details", "en", v)}
          maxLength={LIMITS.maxDetails}
        />
        <TextField
          label={t("beds")}
          tag="ES"
          value={value.beds?.es ?? ""}
          onChange={(v) => setBi("beds", "es", v)}
          maxLength={LIMITS.maxBeds}
          placeholder={t("bedsPlaceholder")}
          hint={t("bedsHint")}
        />
        <TextField
          label={t("beds")}
          tag="EN"
          value={value.beds?.en ?? ""}
          onChange={(v) => setBi("beds", "en", v)}
          maxLength={LIMITS.maxBeds}
        />
      </div>
    </div>
  );
}
