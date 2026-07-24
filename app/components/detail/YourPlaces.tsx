"use client";

import { useEffect, useState } from "react";
import { Bike, Bus, Car, Footprints, Plus, TrainFront, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

// ============================================================
// "Your places" — the commute question a relocating tenant actually
// asks: not "where is this flat" but "how far is it from the office".
// Places are stored per BROWSER, not per listing, so they follow you
// across every home you look at.
// ============================================================

const STORE_KEY = "ebrostay-your-places";

export type TravelMode = "walk" | "bike" | "tram" | "bus" | "car";

export type Place = {
  id: string;
  label: string;
  mode: TravelMode;
  km: number;
};

const MODES: TravelMode[] = ["walk", "bike", "tram", "bus", "car"];

const MODE_ICONS = {
  walk: Footprints,
  bike: Bike,
  tram: TrainFront,
  bus: Bus,
  car: Car,
} as const;

// Door-to-door averages for Zaragoza, km/h. Transit modes carry a flat
// wait so a 1 km tram trip does not read as faster than walking it.
const MODE_SPEED: Record<TravelMode, number> = {
  walk: 4.8,
  bike: 15,
  tram: 20,
  bus: 15,
  car: 24,
};
const MODE_WAIT: Record<TravelMode, number> = {
  walk: 0,
  bike: 1,
  tram: 4,
  bus: 5,
  car: 3,
};

export function commuteMinutes(place: Place): number {
  return Math.max(
    2,
    Math.round((place.km / MODE_SPEED[place.mode]) * 60 + MODE_WAIT[place.mode]),
  );
}

export function YourPlaces() {
  const t = useTranslations("detail.places");
  const [places, setPlaces] = useState<Place[]>([]);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<TravelMode>("tram");
  const [km, setKm] = useState("2");

  // localStorage cannot be read while rendering without breaking hydration
  // (the server has no idea what is in it), so the first paint is the empty
  // state and the saved places arrive on mount. Same shape as ThemeToggle.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setPlaces(JSON.parse(raw) as Place[]);
    } catch {
      // private mode or corrupt entry: start empty rather than throw
    }
  }, []);

  const persist = (next: Place[]) => {
    setPlaces(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // places just won't survive this session
    }
  };

  const add = () => {
    const distance = Number(km);
    if (!label.trim() || !Number.isFinite(distance) || distance <= 0) return;
    persist([
      ...places,
      {
        id: `${Date.now()}-${label.trim()}`,
        label: label.trim(),
        mode,
        km: Math.round(distance * 10) / 10,
      },
    ]);
    setLabel("");
    setKm("2");
    setAdding(false);
  };

  return (
    <section className="rounded-(--radius-card) border border-brand bg-brand-soft p-5 sm:p-6">
      <h2 className="font-display text-[1.375rem] font-semibold text-ink">
        {t("title")}
      </h2>
      <p className="mt-1.5 max-w-[60ch] text-sm text-body">{t("intro")}</p>

      {places.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2">
          {places.map((p) => {
            const Icon = MODE_ICONS[p.mode];
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-(--radius-control) border border-line bg-surface px-3 py-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-strong">
                  <Icon size={17} strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {p.label}
                  </span>
                  <span className="data block text-xs text-muted">
                    {t(`mode.${p.mode}`)} · {p.km} km
                  </span>
                </span>
                <span className="data shrink-0 text-sm font-semibold text-ink">
                  {t("minutes", { count: commuteMinutes(p) })}
                </span>
                <button
                  type="button"
                  onClick={() => persist(places.filter((x) => x.id !== p.id))}
                  aria-label={t("remove", { name: p.label })}
                  className="shrink-0 rounded-full p-1 text-muted transition-colors duration-(--dur-standard) hover:text-ink"
                >
                  <X size={15} strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="mt-5 rounded-(--radius-control) border border-line bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <Field label={t("nameLabel")}>
              {(id) => (
                <Input
                  id={id}
                  value={label}
                  autoFocus
                  placeholder={t("namePlaceholder")}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                />
              )}
            </Field>
            <Field label={t("modeLabel")}>
              {(id) => (
                <select
                  id={id}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as TravelMode)}
                  className="w-full rounded-(--radius-control) border border-line bg-surface px-3 py-2 text-sm text-ink"
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(`mode.${m}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {/* No geocoder in a static export, so the distance is asked for
                rather than invented — a made-up number would read as fact. */}
            <Field label={t("kmLabel")}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  className="w-24"
                />
              )}
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={add} disabled={!label.trim()}>
              {t("save")}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={16} strokeWidth={2.2} aria-hidden />
            {t("add")}
          </Button>
          {places.length === 0 && (
            <p className="mt-2.5 text-xs text-muted">{t("empty")}</p>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">{t("estimateNote")}</p>
    </section>
  );
}
