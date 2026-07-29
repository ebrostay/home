"use client";

// Single-select over a handful of discrete values — the shortest stay accepted,
// and whatever the wizard needs in the same shape. Same radiogroup semantics as
// Segmented; the difference is presentational, and deliberate: Segmented reads
// as one control with a switch inside it, chips read as a row of independent
// values, which is what a number of months is.

// `quiet` is the same control one level down: a chip row nested under another
// chip row has to read as subordinate to it, or the two compete for the same
// "this is the thing you are choosing" role and neither wins. Smaller, and a
// tinted selection rather than a solid one.
const VARIANT = {
  primary: {
    base: "px-4 py-[9px] text-[0.8125rem]",
    on: "border-brand bg-brand text-white",
    off: "border-line-strong bg-surface text-ink hover:border-brand",
  },
  quiet: {
    base: "px-3 py-1.5 text-[0.75rem]",
    on: "border-brand bg-brand-soft text-brand-strong",
    off: "border-line bg-surface text-body hover:border-line-strong hover:text-ink",
  },
};

export function ChipGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  name,
  variant = "primary",
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  name: string;
  variant?: keyof typeof VARIANT;
}) {
  const v = VARIANT[variant];
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <label
            key={String(o.value)}
            className={`data cursor-pointer rounded-(--radius-control) border font-semibold transition-colors duration-(--dur-standard) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--ring) ${v.base} ${
              selected ? v.on : v.off
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
