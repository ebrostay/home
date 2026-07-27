"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HostListing } from "@/lib/api";
import { AMENITY_ICONS, AMENITY_KEYS } from "@/lib/amenity-icons";

// What the home offers. Multi-select over a fixed vocabulary, which is what
// makes an amenity searchable — free text would give every listing its own
// word for the washing machine and no filter could find any of them.
//
// Selection order is preserved rather than sorted into the vocabulary's order:
// the card and the detail page both read the list in the property's own order,
// so the first amenities an owner picks are the ones a guest sees first in the
// grid. Sorting here would quietly re-rank them.

export function AmenityPicker({
  value,
  onChange,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
}) {
  const t = useTranslations("amenity");
  const te = useTranslations("host.edit.amenities");
  const selected = new Set(value.amenities);

  const toggle = (key: string) =>
    onChange({
      ...value,
      amenities: selected.has(key)
        ? value.amenities.filter((a) => a !== key)
        : [...value.amenities, key],
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.84375rem] leading-relaxed text-body">{te("intro")}</p>
      <div className="flex flex-wrap gap-2">
        {AMENITY_KEYS.map((key) => {
          const on = selected.has(key);
          const Icon = AMENITY_ICONS[key];
          return (
            <button
              key={key}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggle(key)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.8125rem] font-medium transition-colors duration-(--dur-standard) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring) ${
                on
                  ? "border-brand bg-brand-soft text-brand-strong"
                  : "border-line bg-surface text-body hover:border-brand"
              }`}
            >
              {on ? (
                <Check size={13} strokeWidth={3} aria-hidden />
              ) : (
                Icon && <Icon size={14} strokeWidth={1.75} aria-hidden />
              )}
              {t(key)}
            </button>
          );
        })}
      </div>
      {/* The handoff lists "pets allowed" among the chips. It is a house rule
          on this same page, and offering it twice lets one listing answer it
          both ways — so the pointer goes here rather than a second control. */}
      <p className="text-xs leading-[1.4] text-muted">{te("petsNote")}</p>
    </div>
  );
}
