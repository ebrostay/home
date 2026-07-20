import type {
  InputHTMLAttributes,
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

// The Select control lives in ./Select.tsx (Radix-based, client component).

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${controlBase} min-h-24 ${props.className ?? ""}`}
    />
  );
}
