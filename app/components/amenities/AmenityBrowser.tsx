"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  AMENITY_GROUPS,
  AMENITY_ICONS,
  keysInGroup,
  searchAmenities,
  type AmenityGroup,
} from "@/lib/amenities";

// Sixty amenities is more than anyone reads, and a flat wall of chips is how
// two owners end up picking different words for one thing — one of them gives
// up scanning and types their own. So the vocabulary is offered two ways at
// once, in the same box:
//
//   typing    — ranked matches, across every group, on the label in the
//               owner's language OR a synonym in either (`searchAmenities`).
//               "elevator", "ascensor" and "lift" all reach the same key.
//   browsing  — the groups, in catalogue order, for the owner who does not
//               yet know what to look for.
//
// The results are INLINE, replacing the group list, rather than a floating
// popup over it. A popup inside the filter Dialog would be a second layer to
// trap focus in and dismiss, and it would hide the browse list at the exact
// moment someone is deciding whether their word exists here at all.

export function AmenityBrowser({
  selected,
  onToggle,
  omit,
  groups = AMENITY_GROUPS,
  boxed = false,
}: {
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Keys handled by another control on the same page — the wizard asks the
   *  baseline nine outright above this, and offering them again here would
   *  let one listing answer the same question twice. */
  omit?: ReadonlySet<string>;
  groups?: readonly AmenityGroup[];
  /** Cap the list's height and scroll it, for a caller whose own container
   *  cannot grow — the filter dialog, where sixty chips otherwise push Apply
   *  a phone-screen-and-a-half below the fold.
   *
   *  Off by default, and the wizard leaves it off: there the page itself
   *  scrolls, and a scroll region nested in a scrolling form is a trap you
   *  have to escape to keep reading. The search box stays OUTSIDE the capped
   *  region either way, so the fastest route through the list is never the
   *  thing that scrolls out of reach. */
  boxed?: boolean;
}) {
  const t = useTranslations("amenity");
  const tg = useTranslations("amenityGroup");
  const tb = useTranslations("amenityBrowser");
  const [query, setQuery] = useState("");

  const label = useMemo(() => (key: string) => t(key), [t]);
  const results = useMemo(
    () => searchAmenities(query, label, { exclude: omit }),
    [query, label, omit],
  );

  const searching = query.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          size={15}
          strokeWidth={2}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={tb("searchLabel")}
          placeholder={tb("placeholder")}
          // `type="search"` for the semantics (and Escape-to-clear), but the
          // WebKit decoration is suppressed: it draws a second × on top of
          // ours, and two clear buttons in one field is one too many.
          className="w-full rounded-(--radius-control) border border-line bg-surface py-2 pr-9 pl-9 text-sm text-ink transition-colors placeholder:text-muted hover:border-line-strong focus:border-line-strong [&::-webkit-search-cancel-button]:appearance-none"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={tb("clear")}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-muted transition-colors hover:text-ink"
          >
            <X size={14} strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>

      {/* Announced, not just drawn: someone typing "elev" needs to hear that
          one thing matched without tabbing into the list to count it. */}
      <p role="status" className="sr-only">
        {searching ? tb("resultCount", { count: results.length }) : ""}
      </p>

      {/* `pr-1` keeps the rightmost chip's focus ring off the scrollbar. */}
      <div
        className={
          boxed ? "max-h-[min(45vh,19rem)] overflow-y-auto pr-1" : undefined
        }
      >
        {searching ? (
          results.length === 0 ? (
            <p className="py-2 text-sm text-muted">
              {tb("noResults", { query: query.trim() })}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {results.map(({ key }) => (
                <AmenityToggle
                  key={key}
                  amenityKey={key}
                  on={selected.has(key)}
                  onClick={() => onToggle(key)}
                  label={t(key)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => {
              const keys = keysInGroup(group).filter((k) => !omit?.has(k));
              if (keys.length === 0) return null;
              return (
                <div key={group} className="flex flex-col gap-2.5">
                  {/* The section voice this design system already speaks —
                      hairline plus a small-caps mono label. */}
                  <div className="ledger-rule">
                    <span>{tg(group)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {keys.map((key) => (
                      <AmenityToggle
                        key={key}
                        amenityKey={key}
                        on={selected.has(key)}
                        onClick={() => onToggle(key)}
                        label={t(key)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** One chip. Same shape the picker has always used: the amenity's own icon
 *  while off, a tick while on — the tick is the state, so it replaces the
 *  glyph rather than crowding in beside it. */
function AmenityToggle({
  amenityKey,
  on,
  onClick,
  label,
}: {
  amenityKey: string;
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = AMENITY_ICONS[amenityKey];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
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
      {label}
    </button>
  );
}
