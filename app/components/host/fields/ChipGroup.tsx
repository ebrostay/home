"use client";

// Single-select over a handful of discrete values — the shortest stay accepted,
// and whatever the wizard needs in the same shape. Same radiogroup semantics as
// Segmented; the difference is presentational, and deliberate: Segmented reads
// as one control with a switch inside it, chips read as a row of independent
// values, which is what a number of months is.

export function ChipGroup<T extends string | number>({
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
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <label
            key={String(o.value)}
            className={`data cursor-pointer rounded-(--radius-control) border px-4 py-[9px] text-[0.8125rem] font-semibold transition-colors duration-(--dur-standard) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--ring) ${
              selected
                ? "border-brand bg-brand text-white"
                : "border-line-strong bg-surface text-ink hover:border-brand"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={String(o.value)}
              checked={selected}
              onChange={() => onChange(o.value)}
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
