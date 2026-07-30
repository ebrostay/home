"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

// A GLYPH, not a label (§10.4). Twenty fields each captioned FROM YOUR LISTING
// was noise: the words repeat, they widen every label, and they compete with
// the label they annotate. As an icon it also gets to keep river — 3:1 is the
// bar for non-text, where the same colour would fail as 9px type.
//
// River, never green: green means YOURS in this product, and a value the
// machine proposed is not yours yet.

export function ImportMark() {
  const t = useTranslations("host.import");
  return (
    <svg
      role="img"
      aria-label={t("markLabel")}
      viewBox="0 0 16 16"
      width="13"
      height="13"
      className="inline-block shrink-0 align-[-1px] text-river-deep"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{t("markLabel")}</title>
      <path d="M8 2v7" />
      <path d="M5 6.5 8 9.5l3-3" />
      <path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

/**
 * How a mark reaches a field.
 *
 * **The wizard owns no fields** — every step but the last wraps a component the
 * listing editor already uses (see `host/new/page.tsx`'s banner). So the marks
 * have to be rendered by those shared components, and they must not appear on
 * the editor's own page, which has no import and nothing to review.
 *
 * Hence a prop rather than a read of `listing.imported`: a listing loaded in
 * the editor carries that array too, and a component that read it would mark
 * the editor's fields as well. The wizard passes this; the editor passes
 * nothing, and `mark?.("price")` renders nothing at all.
 *
 * It hands back a node rather than a boolean so no field component has to know
 * what a mark looks like, or import anything from this folder at runtime.
 */
export type MarkFor = (key: string) => ReactNode;
