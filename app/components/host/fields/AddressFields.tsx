"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Bilingual, HostListing } from "@/lib/api";
import { LIMITS, cadastreValid, postcodeValid } from "@/lib/listing";
import { LocationPicker } from "./LocationPicker";
import { TextField } from "./TextField";

// Where the home is. The most consequential section on the page: an address
// edit moves the pin a guest travels to, so it re-enters review like any other
// claim — which the locked note says out loud before the owner starts typing.
//
// Two fields the handoff asks for are deliberately absent (ADR-027): no
// MATCHED badge beside the cadastral reference, because nothing checks it
// against the Catastro and a badge would claim a verification that never ran;
// and no tourist-licence field, because Ebrostay lets mid-term homes and a
// vivienda de uso turístico licence is the wrong instrument for one.

export function AddressFields({
  value,
  onChange,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
}) {
  const t = useTranslations("host.edit.address");
  const set = <K extends keyof HostListing>(key: K, next: HostListing[K]) =>
    onChange({ ...value, [key]: next });

  const setArea = (locale: "es" | "en", next: string) => {
    const area: Bilingual = { es: value.area?.es ?? null, en: value.area?.en ?? null };
    area[locale] = next.trim() === "" ? null : next;
    onChange({ ...value, area: area.es === null && area.en === null ? null : area });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2.5 rounded-(--radius-control) bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] text-body">
        <Lock size={15} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
        {t("locked")}
      </p>

      <div className="grid items-start gap-3.5 min-[34rem]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TextField
          label={t("street")}
          value={value.address ?? ""}
          onChange={(v) => set("address", v.trim() === "" ? null : v)}
          maxLength={LIMITS.maxAddress}
          placeholder={t("streetPlaceholder")}
        />
        <TextField
          label={t("postcode")}
          value={value.postcode ?? ""}
          onChange={(v) => set("postcode", v.trim() === "" ? null : v)}
          maxLength={5}
          mono
          inputMode="numeric"
          placeholder="50001"
          error={postcodeValid(value.postcode ?? "") ? undefined : t("postcodeInvalid")}
        />
      </div>

      <div className="grid items-start gap-3.5 min-[34rem]:grid-cols-2">
        <TextField
          label={t("cadastre")}
          tag={t("optional")}
          value={value.cadastralRef ?? ""}
          onChange={(v) => set("cadastralRef", v.trim() === "" ? null : v.toUpperCase())}
          maxLength={20}
          mono
          placeholder="4721903XM7147S0001WK"
          hint={t("cadastreHint")}
          error={cadastreValid(value.cadastralRef ?? "") ? undefined : t("cadastreInvalid")}
        />
        {/* The neighbourhood, and the one address-side field a guest reads in
            their own language — "Casco Histórico" / "Old Town". */}
        <div className="flex flex-col gap-3.5">
          <TextField
            label={t("area")}
            tag="ES"
            value={value.area?.es ?? ""}
            onChange={(v) => setArea("es", v)}
            maxLength={LIMITS.maxArea}
            placeholder={t("areaPlaceholder")}
          />
          <TextField
            label={t("area")}
            tag="EN"
            value={value.area?.en ?? ""}
            onChange={(v) => setArea("en", v)}
            maxLength={LIMITS.maxArea}
          />
        </div>
      </div>

      <LocationPicker
        lat={value.lat}
        lng={value.lng}
        onChange={(lat, lng) => onChange({ ...value, lat, lng })}
        label={t("mapLabel")}
        caption={t("mapCaption")}
      />
    </div>
  );
}
