"use client";

import { useTranslations } from "next-intl";
import type { HostRange } from "@/lib/api";
import { AvailabilityEditor } from "@/components/host/fields/AvailabilityEditor";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "./SectionCard";
import type { SaveState } from "./PricingSection";

// The calendar, plus the save row that commits it. The editor itself is
// controlled and page-agnostic (the wizard composes the same component), so
// everything about *saving* — dirty state, errors, the API call — stays here.

export function AvailabilitySection({
  blocks,
  holds,
  availableFrom,
  turnoverDays,
  onChange,
  state,
  errorText,
  onSave,
  onDiscard,
  locale,
  now,
}: {
  blocks: HostRange[];
  holds: HostRange[];
  availableFrom: string | null;
  turnoverDays: number;
  onChange: (blocks: HostRange[]) => void;
  state: SaveState;
  /** Already localized by the page — one code→copy map, not one per section. */
  errorText?: string;
  onSave: () => void;
  onDiscard: () => void;
  locale: string;
  now: Date;
}) {
  const t = useTranslations("host.manage.availability");
  const dirty = state === "dirty" || state === "error";

  return (
    <SectionCard
      id="availability"
      label={t("label")}
      figure={
        state === "saving"
          ? t("badge.saving")
          : state === "saved"
            ? t("badge.saved")
            : dirty
              ? t("badge.unsaved")
              : t("badge.upToDate")
      }
      figureTone={dirty ? "text-warn" : "text-brand-strong"}
    >
      <AvailabilityEditor
        blocks={blocks}
        holds={holds}
        availableFrom={availableFrom}
        turnoverDays={turnoverDays}
        onChange={onChange}
        locale={locale}
        now={now}
      />

      {state === "error" && (
        <p className="rounded-(--radius-control) bg-warn-soft px-3.5 py-2.5 text-[0.8125rem] text-warn">
          {errorText}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[18rem] flex-1 text-[0.78125rem] leading-[1.5] text-muted">
          {t("saveNote")}
        </p>
        {dirty && (
          <Button variant="secondary" onClick={onDiscard} className="h-[38px] text-[0.84375rem]">
            {t("discard")}
          </Button>
        )}
        <Button
          onClick={onSave}
          disabled={!dirty}
          className="h-[38px] px-[18px] text-[0.84375rem]"
        >
          {state === "saving" ? t("saving") : dirty ? t("save") : t("savedLabel")}
        </Button>
      </div>
    </SectionCard>
  );
}
