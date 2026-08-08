import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ink";
type Size = "md" | "lg" | "sm";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-strong disabled:hover:bg-brand",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-ink disabled:hover:border-line-strong",
  ghost: "text-body hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white hover:opacity-90",
  // Weighty, and deliberately not red. For confirming something serious that
  // is nonetheless not destructive — closing an account, which an admin
  // undoes on request and which the person can take back themselves. Ink is
  // the system's own word for "closed" (globals.css: river = open, green =
  // yours, ink = occupied), so this says "shut" without saying "danger".
  ink: "bg-ink text-inverse hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-(--radius-control) font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${className}`}
    />
  );
}
