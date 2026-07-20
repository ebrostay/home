// Status vocabulary of the marketplace. Colors follow the system semantics:
// green = live/yours, river = informational, amber = waiting on review,
// neutral = drafts, danger = rejected.
type Tone = "brand" | "river" | "warn" | "danger" | "neutral";

const tones: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-strong",
  river: "bg-river-soft text-river-deep",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-muted",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`data inline-flex items-center rounded-full px-2.5 py-1 text-[0.6875rem] uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
