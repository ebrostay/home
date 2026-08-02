"use client";

import type { ReactNode } from "react";

// A small single-select where every option should be readable at once — two or
// three choices, no more. Above that it becomes a row of chips (ChipGroup) or a
// select; a segmented control with five segments is a tab bar wearing a hat.
//
// Radios rather than buttons: arrow keys move between options for free, and the
// group announces itself as one control instead of N unrelated buttons.

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  name,
  variant = "field",
}: {
  label: string;
  value: T;
  /** `icon` is drawn before the label, and is what the `overlay` variant falls
   *  back to on a phone, where the words do not fit. Only supply one for an
   *  option whose meaning an icon can carry alone. */
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  /** Stable per form, so two segmented controls on a page cannot collide. */
  name: string;
  /** `field` fills the column it is in, like every other input on a form.
   *  `overlay` hugs its own labels and carries a shadow, for floating over
   *  something — the detail page's map. A full-width tray for a two-way
   *  choice reads as a tab bar: furniture in proportion to the room, not to
   *  the decision. Positioning is the caller's; this only sets the shape.
   *
   *  Below `sm` the overlay drops its words and stacks: two icon cells in a
   *  column, the shape the zoom buttons in the opposite corner already have.
   *  A map that small has no horizontal room to spare, and the control it
   *  turns into is one the reader has already learnt to read on this map. */
  variant?: "field" | "overlay";
}) {
  const overlay = variant === "overlay";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex gap-[3px] rounded-(--radius-control) border border-line bg-surface-2 p-[3px] ${
        overlay ? "flex-col shadow-(--shadow-card) sm:flex-row" : ""
      }`}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md text-center text-[0.78125rem] font-semibold transition-colors duration-(--dur-standard) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--ring) ${
              overlay ? "p-2 sm:px-3 sm:py-1.5" : "flex-1 px-1.5 py-2"
            } ${
              selected ? "bg-surface text-ink shadow-(--shadow-card)" : "text-muted hover:text-ink"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={selected}
              onChange={() => onChange(o.value)}
              // Explicit, not left to the wrapping <label>: the visible text is
              // a sibling of a visually-hidden input, and the two together read
              // as the stored value in some tooling.
              aria-label={o.label}
              className="sr-only"
            />
            {o.icon}
            {/* Hidden, not dropped: `hidden` takes the word out of the flex
                row so the gap above closes with it, and the accessible name
                is on the input either way. */}
            <span className={overlay && o.icon ? "hidden sm:inline" : ""}>{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}
