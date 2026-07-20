"use client";

import * as RadixSelect from "@radix-ui/react-select";

// Radix-based select: the closed trigger matches Input exactly; the open list
// is OUR popup — themed, positioned below the trigger, identical in every
// browser. Chosen over the native <select> after cross-browser popup jank
// (see §6 design language); chosen over hand-rolling for the a11y/keyboard/
// focus machinery Radix carries (v1's DIY dropdown was a bug source).

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange}>
      <RadixSelect.Trigger
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className="flex w-full items-center justify-between gap-2 rounded-(--radius-control) border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-line-strong data-[placeholder]:text-muted"
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-4 w-4 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6.5 8 10l4-3.5" />
          </svg>
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-(--radius-control) border border-line bg-surface shadow-(--shadow-pop)"
        >
          <RadixSelect.Viewport className="max-h-72 p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="flex cursor-default items-center justify-between gap-3 rounded-[0.375rem] px-2.5 py-2 text-sm text-body outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-river-soft data-[highlighted]:text-ink data-[state=checked]:text-ink"
              >
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5 text-brand"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m3 8.5 3.5 3.5L13 5" />
                  </svg>
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
