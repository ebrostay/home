"use client";

import { useId, type ReactNode } from "react";

// The plain text input the listing editor is mostly made of. Controlled, no
// internal state, no validation of its own — the page owns the value, and
// `error` is passed in by whoever knows the rule.
//
// `tag` is the small mono suffix the design puts after certain labels ("ES",
// "optional"): a second register in the label line rather than a second line
// of hint text, because it qualifies the field's name, not its behaviour.

export function TextField({
  label,
  tag,
  info,
  value,
  onChange,
  hint,
  warning,
  error,
  placeholder,
  maxLength,
  mono,
  inputMode,
}: {
  label: string;
  tag?: string;
  /** Sits after the label — an InfoPopover, for a field that needs explaining
   *  rather than merely hinting. */
  info?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** Something is probably wrong but the value is still accepted. Distinct
   *  from `error` on purpose: a checksum we cannot apply to every valid
   *  reference must not be allowed to block one. */
  warning?: string;
  /** Replaces the hint while set — one message per field, and the one that
   *  matters is always the problem. */
  error?: string;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
  inputMode?: "text" | "numeric";
}) {
  const id = useId();
  const note = error ?? warning ?? hint;
  const describedBy = note ? `${id}-note` : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-semibold text-ink"
      >
        {label}
        {tag && <span className="data font-normal text-muted">{tag}</span>}
        {info}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full min-w-0 rounded-(--radius-control) border bg-surface px-[13px] py-[11px] text-[0.9375rem] text-ink outline-none transition-colors duration-(--dur-standard) placeholder:text-muted focus:border-brand ${
          error ? "border-warn" : "border-line-strong"
        } ${mono ? "data" : ""}`}
      />
      {note && (
        <p
          id={describedBy}
          className={`text-xs leading-[1.4] ${
            error || warning ? "text-warn" : "text-muted"
          }`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/** A whole number with its unit inside the field — m², rooms, guests. The unit
 *  sits in the box rather than in the label so a row of six of these reads as
 *  six values, not as six sentences. */
export function UnitField({
  label,
  unit,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  unit?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max: number;
}) {
  const id = useId();

  const handle = (raw: string) => {
    // Empty means "not set", which is a real answer for the floor number —
    // coercing it to 0 would put every unanswered listing in the basement.
    const trimmed = raw.trim();
    if (trimmed === "") return onChange(null);
    const negative = min < 0 && trimmed.startsWith("-");
    const digits = trimmed.replace(/\D/g, "");
    if (digits === "") return onChange(null);
    const next = Number(digits) * (negative ? -1 : 1);
    onChange(Math.max(min, Math.min(max, next)));
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-semibold text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-(--radius-control) border border-line-strong bg-surface px-[13px] py-[11px] transition-colors duration-(--dur-standard) focus-within:border-brand">
        <input
          id={id}
          value={value === null ? "" : String(value)}
          onChange={(e) => handle(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          className="data w-full min-w-0 border-0 bg-transparent text-[0.90625rem] text-ink outline-none"
        />
        {unit && <span className="shrink-0 text-xs text-muted">{unit}</span>}
      </div>
    </div>
  );
}

/** Long-form copy. Same shell as TextField so a description and a title do not
 *  look like controls from two different products. */
export function TextAreaField({
  label,
  tag,
  value,
  onChange,
  hint,
  rows = 5,
  maxLength,
}: {
  label: string;
  tag?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
  maxLength?: number;
}) {
  const id = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-semibold text-ink">
        {label}
        {tag && <span className="data ml-1.5 font-normal text-muted">{tag}</span>}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 resize-y rounded-(--radius-control) border border-line-strong bg-surface px-[13px] py-3 text-[0.90625rem] leading-relaxed text-ink outline-none transition-colors duration-(--dur-standard) focus:border-brand"
      />
      {hint && <p className="text-xs leading-[1.4] text-muted">{hint}</p>}
    </div>
  );
}
