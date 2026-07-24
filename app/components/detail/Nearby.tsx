import {
  HeartPulse,
  ShoppingCart,
  TramFront,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { NearbyCategory } from "@/lib/detail-placeholders";

const CATEGORY_ICONS: Record<NearbyCategory["key"], LucideIcon> = {
  transport: TramFront,
  groceries: ShoppingCart,
  food: UtensilsCrossed,
  outdoors: Trees,
  health: HeartPulse,
};

export function Nearby({ categories }: { categories: NearbyCategory[] }) {
  const t = useTranslations("detail.nearby");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {categories.map((c) => {
        const Icon = CATEGORY_ICONS[c.key];
        return (
          <div
            key={c.key}
            className="rounded-(--radius-card) border border-line bg-surface p-4"
          >
            <p className="flex items-center gap-2 text-brand-strong">
              <Icon size={16} strokeWidth={2} aria-hidden />
              <span className="data text-[0.6875rem] uppercase tracking-[0.14em]">
                {t(`category.${c.key}`)}
              </span>
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {c.items.map((item) => (
                <li
                  key={item.name}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">
                      {item.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {item.detail}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="data block text-sm font-semibold text-ink">
                      {t("minutes", { count: item.minutes })}
                    </span>
                    <span className="data block text-xs text-muted">
                      {item.km} km
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
