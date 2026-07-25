"use client";

// The one drag mechanic shared by the band (A) and the curve (B): a native
// range input laid over the drawing, invisible except for its thumb. Native
// buys arrow keys, Home/End, touch, and the platform's own drag inertia — a
// custom pointer handler would owe all of that back with interest.

export const THUMB_PX = 14;

/** Where the thumb centre actually sits, accounting for its own width. */
export function capOffset(pct: number): string {
  return `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${pct})`;
}

export function CapSlider({
  lo,
  hi,
  step,
  value,
  onChange,
  label,
  valueText,
}: {
  lo: number;
  hi: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  label: string;
  valueText: string;
}) {
  return (
    <input
      type="range"
      className="budget-range absolute inset-x-0 bottom-0 h-8 w-full"
      min={lo}
      max={hi}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
      aria-valuetext={valueText}
    />
  );
}
