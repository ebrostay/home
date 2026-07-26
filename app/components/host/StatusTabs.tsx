"use client";

import { useTranslations } from "next-intl";
import { TABS, type Tab } from "@/lib/portfolio";

// Filter tabs on the left, band legend on the right. Both describe the same
// list — one says which rows are shown, the other how to read their bars.
export function StatusTabs({
  value,
  counts,
  onChange,
}: {
  value: Tab;
  counts: Record<Tab, number>;
  onChange: (tab: Tab) => void;
}) {
  const t = useTranslations("host");

  return (
    <div className="flex flex-wrap items-center justify-between gap-5">
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const on = tab === value;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(tab)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.8125rem] transition-colors duration-(--dur-standard) ${
                on
                  ? "border-brand bg-brand-soft font-semibold text-brand-strong"
                  : "border-line bg-surface font-medium text-ink hover:border-brand"
              }`}
            >
              {t(`tabs.${tab}` as "tabs.all")}
              <span
                className={`data text-[0.6875rem] ${on ? "text-brand-strong" : "text-muted"}`}
              >
                {counts[tab]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <span className="data text-[0.65625rem] tracking-[0.1em] text-muted">
          {t("legend.title")}
        </span>
        <Swatch className="bg-river" label={t("legend.open")} />
        <Swatch
          style={{
            background:
              "linear-gradient(90deg, var(--occupied) 50%, var(--river) 50%)",
          }}
          label={t("legend.partial")}
        />
        <Swatch className="bg-occupied" label={t("legend.taken")} />
      </div>
    </div>
  );
}

function Swatch({
  className = "",
  style,
  label,
}: {
  className?: string;
  style?: React.CSSProperties;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span
        aria-hidden
        style={style}
        className={`h-[7px] w-4 rounded-full ${className}`}
      />
      {label}
    </span>
  );
}
