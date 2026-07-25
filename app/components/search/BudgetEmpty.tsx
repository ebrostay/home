"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/pricing";

// No homes to price: the other filters matched nothing, so there is no axis to
// draw and no ceiling worth dragging. It keeps the control's full shape anyway
// — same header, same plot height, same baseline — so the dialog doesn't jump
// as filters come and go, and an empty plot says "nothing here" more directly
// than a control that has quietly vanished.
export function BudgetEmpty({ value }: { value: number | null }) {
  const t = useTranslations("budget");
  const locale = useLocale();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-ink">
          {t("label")}
        </span>
        {/* The ceiling still stands even with nothing under it — saying
            "Sin límite" here would be a lie about the filter's state. */}
        <output className="data text-sm font-semibold text-muted">
          {value === null
            ? t("noLimit")
            : t("upTo", { value: formatEuro(value, locale) })}
        </output>
      </div>

      <div className="relative mt-3 h-[7.5rem]">
        <div className="absolute inset-x-0 bottom-8 top-0 px-[7px]">
          <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
        </div>
      </div>

      <p className="mt-2 text-xs text-muted">{t("empty")}</p>
    </div>
  );
}
