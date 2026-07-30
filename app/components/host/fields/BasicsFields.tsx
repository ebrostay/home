"use client";

import { useTranslations } from "next-intl";
import type { HostListing } from "@/lib/api";
import { ENERGY_RATINGS, LIMITS, PROPERTY_TYPES } from "@/lib/listing";
import type { MarkFor } from "@/components/host/new/import/ImportMark";
import { ChipGroup } from "./ChipGroup";
import { TextField, UnitField } from "./TextField";

// What the home IS: what to call it, what kind it is, and how much of it there
// is. Controlled and page-agnostic — value in, value out, no fetching and no
// save button, exactly like PricingFields. The editor wraps it in a section
// card; the create-a-listing wizard will wrap the same component in a step.
//
// Every section component in this folder takes the whole `HostListing` and
// returns the whole `HostListing`. Slicing each one to its own fields would be
// tidier in isolation and worse in use: the wizard holds a single draft
// listing, and six slice types would each need assembling and taking apart.

export function BasicsFields({
  value,
  onChange,
  mark,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
  /** The import's glyph, per field key — see `AddressFields`' own prop. */
  mark?: MarkFor;
}) {
  const t = useTranslations("host.edit.basics");
  const tType = useTranslations("type");
  const set = <K extends keyof HostListing>(key: K, next: HostListing[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={t("name")}
        // The listing has one stored name and it is the Spanish one — the
        // document has no bilingual title. Tagging it says which language to
        // write in instead of leaving the owner to guess from the placeholder.
        tag="ES"
        mark={mark?.("name")}
        value={value.name}
        onChange={(v) => set("name", v)}
        maxLength={LIMITS.maxName}
        hint={t("nameHint")}
      />

      {/* ONE mark on the group label, not one per chip: a portal's "piso"
          mapping onto one of five kinds is one answer to one question, and a
          glyph on every option would be five claims about the four it did not
          choose. Same rule for the energy scale below. */}
      <div className="flex flex-col gap-2">
        <span className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-semibold text-ink">
          {t("type")}
          {mark?.("type")}
        </span>
        <ChipGroup<string>
          name="propertyType"
          label={t("type")}
          value={value.type}
          onChange={(v) => set("type", v)}
          options={PROPERTY_TYPES.map((key) => ({
            value: key,
            // Reused from the search filters rather than translated again: a
            // home is called the same thing on both sides of the product.
            label: tType(key),
          }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 min-[34rem]:grid-cols-2 min-[52rem]:grid-cols-4">
        <UnitField
          label={t("size")}
          mark={mark?.("sizeM2")}
          unit="m²"
          value={value.sizeM2 || null}
          onChange={(v) => set("sizeM2", v ?? 0)}
          max={LIMITS.maxSizeM2}
        />
        <UnitField
          label={t("bedrooms")}
          mark={mark?.("bedrooms")}
          value={value.bedrooms || null}
          onChange={(v) => set("bedrooms", v ?? 0)}
          max={LIMITS.maxRooms}
        />
        <UnitField
          label={t("bathrooms")}
          mark={mark?.("bathrooms")}
          value={value.bathrooms || null}
          onChange={(v) => set("bathrooms", v ?? 0)}
          max={LIMITS.maxRooms}
        />
        <UnitField
          label={t("guests")}
          mark={mark?.("guests")}
          value={value.guests || null}
          onChange={(v) => set("guests", v ?? 0)}
          max={LIMITS.maxGuests}
        />
      </div>

      {/* Floor sits alone at the width of one of the fields above rather than
          stretching: it is a one- or two-digit answer, and a full-width box
          invites a full-width answer. */}
      <div className="max-w-[14rem]">
        <UnitField
          label={t("floor")}
          mark={mark?.("floorNumber")}
          value={value.floorNumber}
          // Genuinely optional, and genuinely signed: a ground floor is 0 and
          // a Spanish sótano is negative, so "not answered" cannot be 0.
          onChange={(v) => set("floorNumber", v)}
          min={LIMITS.minFloor}
          max={LIMITS.maxFloor}
        />
      </div>

      {/* Its own row: eight options read as the A–G scale they are only when
          they fit on one line. */}
      <div className="flex flex-col gap-2">
        <span className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-semibold text-ink">
          {t("energy")}
          {mark?.("energyRating")}
        </span>
        <ChipGroup<string>
          name="energyRating"
          label={t("energy")}
          value={value.energyRating ?? ""}
          onChange={(v) => set("energyRating", v === "" ? null : v)}
          options={[
            { value: "", label: t("energyNone") },
            ...ENERGY_RATINGS.map((r) => ({ value: r, label: r })),
          ]}
        />
        <p className="text-xs leading-[1.4] text-muted">{t("energyHint")}</p>
      </div>
    </div>
  );
}
