"use client";

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
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Stable per form, so two segmented controls on a page cannot collide. */
  name: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-[3px] rounded-(--radius-control) border border-line bg-surface-2 p-[3px]"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <label
            key={o.value}
            className={`flex flex-1 cursor-pointer items-center justify-center rounded-md px-1.5 py-2 text-center text-[0.78125rem] font-semibold transition-colors duration-(--dur-standard) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--ring) ${
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
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
