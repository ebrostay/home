import { X } from "lucide-react";

// The filter bar's one shape. Active chips carry the brand ring so a glance
// down the bar tells you what is actually narrowing the results.
export function Chip({
  active = false,
  onClear,
  clearLabel,
  onClick,
  children,
}: {
  active?: boolean;
  onClear?: () => void;
  clearLabel?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const tone = active
    ? "border-brand bg-brand-soft font-semibold text-brand-strong"
    : "border-line bg-surface font-medium text-body hover:border-line-strong";
  const shape = `flex items-center gap-[7px] rounded-full border px-3.5 py-2 text-[0.8125rem] transition-colors duration-(--dur-standard) ${tone}`;

  // A chip that can be cleared is a group: the label may itself be a button,
  // and the × is always its own control so it gets its own accessible name.
  if (onClear) {
    return (
      <span className={shape}>
        {children}
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          className="-mr-1 rounded-full p-0.5 opacity-70 transition-opacity duration-(--dur-standard) hover:opacity-100"
        >
          <X size={13} strokeWidth={2.5} aria-hidden />
        </button>
      </span>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shape}>
        {children}
      </button>
    );
  }

  return <span className={shape}>{children}</span>;
}
