import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

const controlBase =
  "w-full rounded-(--radius-control) border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors hover:border-line-strong focus:border-line-strong";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy?: string) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold tracking-wide text-ink"
      >
        {label}
      </label>
      {children(id, hintId)}
      {(error || hint) && (
        <p
          id={hintId}
          className={`text-xs ${error ? "text-danger" : "text-muted"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlBase} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  // appearance-none: Safari ignores padding on native-rendered selects (wrong
  // height) and every browser paints its own arrow. We own the closed control
  // and draw the chevron; the OPEN menu stays OS-native on purpose — v1 tried
  // a hand-rolled dropdown and paid for it in Safari/stacking bugs.
  return (
    <span className="relative block">
      <select
        {...props}
        className={`${controlBase} appearance-none pr-9 ${props.className ?? ""}`}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6.5 8 10l4-3.5" />
      </svg>
    </span>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${controlBase} min-h-24 ${props.className ?? ""}`}
    />
  );
}
