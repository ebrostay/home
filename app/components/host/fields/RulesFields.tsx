"use client";

import { useTranslations } from "next-intl";
import type { HostListing } from "@/lib/api";
import { MIN_STAY_DAYS } from "@/lib/pricing";

// House rules, and the policy the owner does not get to set.
//
// The read-only block is the point of the section as much as the toggles are:
// Ebrostay handles every tenant conversation, so a handful of terms are the
// company's promise and identical on every home. Showing them here — flat,
// unclickable, no hover — is what stops an owner looking for the setting.
//
// The handoff also lists "Notice to leave · 30 días" as settled policy. It is
// not: no ADR decides a notice period, so it is left out rather than invented
// in a UI (ADR-027). What is shown is what is actually decided — the ADR-022
// stay window and the 48-hour cancellation.
//
// The four toggles are the four booleans the document holds. The handoff's
// "Events" and "Sharing with others" have no field behind them; `couplesAllowed`
// and `selfCheckin` do, and both already show on the guest's detail page.

const RULES = ["smoking", "pets", "couples", "selfCheckin"] as const;

const FIELD: Record<(typeof RULES)[number], keyof HostListing> = {
  smoking: "smokingAllowed",
  pets: "petsAllowed",
  couples: "couplesAllowed",
  selfCheckin: "selfCheckin",
};

export function RulesFields({
  value,
  onChange,
  /** Rendered as a pointer to Manage. Omitted by the wizard, which sets the
   *  price in a step of its own. */
  manageHref,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
  manageHref?: React.ReactNode;
}) {
  const t = useTranslations("host.edit.terms");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">
          {t("policyHeading")}
        </span>
        <div className="grid grid-cols-1 gap-3 min-[34rem]:grid-cols-2">
          <PolicyRow
            label={t("policyStay")}
            value={t("policyStayValue", { days: MIN_STAY_DAYS, months: 12 })}
          />
          <PolicyRow label={t("policyCancel")} value={t("policyCancelValue")} />
        </div>
      </div>

      {manageHref && (
        <p className="rounded-(--radius-control) bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] text-body">
          {manageHref}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 min-[34rem]:grid-cols-2">
        {RULES.map((rule) => {
          const key = FIELD[rule];
          const on = value[key] as boolean;
          return (
            <button
              key={rule}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => onChange({ ...value, [key]: !on })}
              className={`flex items-center justify-between gap-3 rounded-(--radius-control) border px-4 py-3 text-left transition-colors duration-(--dur-standard) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring) ${
                on ? "border-brand bg-brand-soft" : "border-line bg-surface-2 hover:border-brand"
              }`}
            >
              <span className="text-[0.84375rem] text-body">
                {t(`rule.${rule}` as "rule.pets")}
              </span>
              <span
                className={`data shrink-0 text-[0.78125rem] font-semibold ${
                  on ? "text-brand-strong" : "text-muted"
                }`}
              >
                {t(`${on ? "on" : "off"}.${rule}` as "on.pets")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-(--radius-control) border border-line bg-surface-2 px-4 py-3">
      <span className="text-[0.84375rem] text-body">{label}</span>
      <span className="data shrink-0 text-[0.84375rem] font-semibold text-ink">
        {value}
      </span>
    </div>
  );
}
