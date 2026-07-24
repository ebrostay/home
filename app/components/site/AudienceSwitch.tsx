"use client";

import { useTranslations } from "next-intl";

export type Audience = "find" | "manage";

// v1 parity: the "audience switch" — the primary decision (find a stay vs.
// manage my flat) reads as a segmented control, not a nav item. Both segments
// share one grid track so their heights always match.
export function AudienceSwitch({
  value,
  onChange,
}: {
  value: Audience;
  onChange: (a: Audience) => void;
}) {
  const t = useTranslations("home.audience");
  const items: { key: Audience; label: string }[] = [
    { key: "find", label: t("findLabel") },
    { key: "manage", label: t("manageLabel") },
  ];

  return (
    <div>
      <div
        role="tablist"
        aria-label={t("ariaLabel")}
        className="inline-grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1 shadow-(--shadow-card)"
      >
        {items.map((it) => {
          const active = value === it.key;
          return (
            <button
              key={it.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(it.key)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-brand text-white shadow-(--shadow-card)"
                  : "text-body hover:text-ink"
              }`}
            >
              {it.label}
            </button>
          );
        })}
      </div>
      <p role="status" className="mt-2.5 text-sm text-muted">
        {value === "find" ? t("findNote") : t("manageNote")}
      </p>
    </div>
  );
}
