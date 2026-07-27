"use client";

import { Check } from "lucide-react";
import { SECTIONS, type SectionKey } from "@/lib/listing";

// The editor's spine: nine — here six — anchors down the left, each reporting
// whether you have changed that section, whether it still needs something, or
// neither.
//
// Deliberately NOT a scroll spy, unlike Manage's tab bar. That page's nav
// answers "where am I in a long read"; this one answers "what have I touched
// and what is left", and a highlight that follows the scroll would compete
// with the discs for the same attention. The two pages are navigated for
// different reasons and are allowed to look it.

export function SectionRail({
  labels,
  edited,
  attention,
  ariaLabel,
}: {
  labels: Record<SectionKey, string>;
  edited: Set<SectionKey>;
  attention: Set<SectionKey>;
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-col gap-0.5 max-[56rem]:-mx-6 max-[56rem]:flex-row max-[56rem]:gap-1 max-[56rem]:overflow-x-auto max-[56rem]:px-6 max-[56rem]:pb-1 min-[56rem]:sticky min-[56rem]:top-[calc(var(--header-h)+4.5rem)]"
    >
      <span className="data px-2.5 pb-2 text-[0.625rem] tracking-[0.12em] text-muted max-[56rem]:hidden">
        {ariaLabel}
      </span>
      {SECTIONS.map((key) => {
        // Edited wins: once you are working in a section, what you need to
        // know is that the change is captured, not that it was already thin.
        const isEdited = edited.has(key);
        const needs = !isEdited && attention.has(key);
        return (
          <a
            key={key}
            href={`#sec-${key}`}
            className={`flex shrink-0 items-center gap-2.5 rounded-(--radius-control) px-2.5 py-[7px] text-[0.8125rem] transition-colors duration-(--dur-standard) hover:bg-surface ${
              isEdited
                ? "font-semibold text-brand-strong"
                : needs
                  ? "font-semibold text-ink"
                  : "font-medium text-body"
            }`}
          >
            <span
              aria-hidden
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                isEdited
                  ? "bg-brand"
                  : needs
                    ? "shadow-[inset_0_0_0_1.5px_var(--warn)]"
                    : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
              }`}
            >
              {isEdited && <Check size={10} strokeWidth={3.5} className="text-white" />}
              {needs && <span className="h-[5px] w-[5px] rounded-full bg-warn" />}
            </span>
            {labels[key]}
          </a>
        );
      })}
    </nav>
  );
}
