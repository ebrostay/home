"use client";

import { useId } from "react";

// A euro amount the owner types. Controlled and locale-formatted: the value in
// state is a plain number, the value on screen is grouped (`1.350`), and every
// keystroke is stripped back to digits — so a paste of "1.350,00 €" lands as
// 1350 rather than as a validation error.
//
// Deliberately not <input type="number">: the spinner is meaningless on a rent
// and mobile keyboards already follow inputMode.

export function MoneyField({
  label,
  value,
  onChange,
  hint,
  hintTone = "muted",
  unit = "€",
  max,
  disabled,
  compact,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  hint?: string;
  hintTone?: "muted" | "good" | "warn";
  unit?: string;
  max?: number;
  disabled?: boolean;
  /** Inline shape for the bills cap: label and value on one line. */
  compact?: boolean;
}) {
  const id = useId();
  // `useGrouping: "always"` is load-bearing: es-ES leaves four-digit numbers
  // ungrouped by default, so a rent would render "1350" here and "1.350 €"
  // three lines down in the payout breakdown, which formats the same way.
  const grouped =
    value === null
      ? ""
      : new Intl.NumberFormat("es-ES", {
          useGrouping: "always" as Intl.NumberFormatOptions["useGrouping"],
        }).format(value);

  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const next = digits === "" ? 0 : Number(digits);
    onChange(max !== undefined ? Math.min(next, max) : next);
  };

  const field = (
    <div
      className={`flex items-center gap-2 rounded-(--radius-control) border border-line-strong bg-surface transition-colors duration-(--dur-standard) focus-within:border-brand ${
        compact ? "px-[13px] py-[9px]" : "px-[13px] py-[11px]"
      } ${disabled ? "opacity-55" : ""}`}
    >
      {compact && (
        <label htmlFor={id} className="text-[0.78125rem] text-muted">
          {label}
        </label>
      )}
      <input
        id={id}
        value={grouped}
        onChange={(e) => handle(e.target.value)}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        className={`data w-full min-w-0 border-0 bg-transparent font-semibold text-ink outline-none disabled:cursor-not-allowed ${
          compact ? "text-right text-[0.9375rem]" : "text-[1.0625rem]"
        }`}
      />
      <span className="shrink-0 text-[0.8125rem] text-muted">{unit}</span>
    </div>
  );

  if (compact) return field;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-semibold text-ink">
        {label}
      </label>
      {field}
      {hint && (
        <p
          className={`text-xs leading-[1.4] ${
            hintTone === "good"
              ? "text-brand-strong"
              : hintTone === "warn"
                ? "text-warn"
                : "text-muted"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
