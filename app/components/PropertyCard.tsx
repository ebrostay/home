import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/Badge";
import { AvailabilityBand, type MonthAvailability } from "@/components/MonthBand";

export type PropertyCardData = {
  id: string;
  name: string;
  area: string;
  photoUrl: string;
  pricePerMonth: number;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  verified?: boolean;
  billsIncluded?: boolean;
  months: MonthAvailability[];
};

export function PropertyCard({
  property,
  locale,
}: {
  property: PropertyCardData;
  locale: string;
}) {
  const t = useTranslations("listing");
  // v1 formatting rule (docs/spec/09 R-X-2): ES "1.350", EN "1,350" — es-ES
  // only groups from 10000 by default, so force grouping.
  const price = new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    useGrouping: "always" as Intl.NumberFormatOptions["useGrouping"],
  }).format(property.pricePerMonth);

  return (
    <Link
      href={{ pathname: "/property", query: { id: property.id } }}
      className="group block overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card) transition-shadow hover:shadow-(--shadow-pop)"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export serves unoptimized images anyway */}
        <img
          src={property.photoUrl}
          alt={property.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {property.verified && <Badge tone="brand">{t("verified")}</Badge>}
          {property.billsIncluded && <Badge tone="river">{t("bills")}</Badge>}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate font-display text-base font-semibold text-ink">
            {property.name}
          </h3>
          <p className="data shrink-0 text-sm text-ink">
            {price} €<span className="text-muted">/{t("month")}</span>
          </p>
        </div>
        <p className="mt-0.5 text-sm text-muted">{property.area}, Zaragoza</p>

        <p className="data mt-2 text-xs text-muted">
          {t("specs", {
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
            size: property.sizeSqm,
          })}
        </p>

        <div className="mt-4 border-t border-line pt-3">
          <AvailabilityBand months={property.months} />
        </div>
      </div>
    </Link>
  );
}
