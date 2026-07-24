"use client";

import { LayoutGrid, Maximize2, Rows3 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CardView } from "@/components/PropertyCard";

export function ViewControls({
  view,
  onViewChange,
  wide,
  onWideChange,
}: {
  view: CardView;
  onViewChange: (v: CardView) => void;
  wide: boolean;
  onWideChange: (w: boolean) => void;
}) {
  const t = useTranslations("search.view");

  return (
    <div className="mb-5 flex items-center gap-4">
      <div className="ledger-rule flex-1">
        <span>{t("available")}</span>
      </div>

      <button
        type="button"
        onClick={() => onWideChange(!wide)}
        aria-pressed={wide}
        className={`hidden h-[34px] shrink-0 items-center gap-[7px] rounded-(--radius-control) border px-3 text-[0.8125rem] font-semibold transition-colors duration-(--dur-standard) lg:flex ${
          wide
            ? "border-brand bg-brand-soft text-brand-strong"
            : "border-line text-body hover:border-line-strong hover:text-ink"
        }`}
      >
        <Maximize2 size={16} strokeWidth={2} aria-hidden />
        {wide ? t("fitPage") : t("wide")}
      </button>

      <span className="flex shrink-0 overflow-hidden rounded-(--radius-control) border border-line">
        <ViewButton
          active={view === "grid"}
          onClick={() => onViewChange("grid")}
          label={t("gridView")}
        >
          <LayoutGrid size={16} strokeWidth={2} aria-hidden />
        </ViewButton>
        <ViewButton
          active={view === "list"}
          onClick={() => onViewChange("list")}
          label={t("listView")}
        >
          <Rows3 size={16} strokeWidth={2} aria-hidden />
        </ViewButton>
      </span>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`grid h-[34px] w-[34px] place-items-center transition-colors duration-(--dur-standard) ${
        active
          ? "bg-brand-soft text-brand-strong"
          : "text-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
