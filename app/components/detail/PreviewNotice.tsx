"use client";

import { EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PropertyDetail } from "@/lib/api";
import { bucketOfStatus } from "@/lib/portfolio";

// "Nobody else can see this page."
//
// The guest view of a home that is not published, shown to the one person
// entitled to it. Without this line the preview is a trap: the page is
// pixel-identical to a live listing, so an owner checking their work would
// have no way to tell that review is still holding it — and would reasonably
// conclude it went live.
//
// ─────────────────────────────────────────────────────────────────────────
// Not a permission, and not a gate. Whether this page exists at all was
// decided by the API from `x-ms-client-principal` (ADR-029): a stranger on
// this URL gets a 404, not a page with the banner suppressed. This component
// only says WHY, and it never renders unless the API said so.
// ─────────────────────────────────────────────────────────────────────────
//
// The state words are the portfolio's own (`bucketOfStatus`), because an owner
// arrives here straight from a page showing that pill. Two names for one state
// would read as two different states.
//
// It carries no buttons. The OwnerBar directly below already routes to Manage
// and to the editor, and a second copy of those links would be the same offer
// made twice — the notice's job is the sentence, not the exit.

// Badge.tsx's semantics, not the portfolio pill's: amber is waiting-on-review
// and danger is rejected. The pill uses river for review, which is defensible
// on a page full of pills — but here the notice sits directly above the
// OwnerBar, which is itself river, and two soft blue boxes in a stack read as
// one repeated thing rather than two separate statements.
const TONE: Record<string, { box: string; icon: string }> = {
  review: { box: "border-warn bg-warn-soft", icon: "text-warn" },
  changes: { box: "border-danger bg-danger-soft", icon: "text-danger" },
  draft: { box: "border-line-strong bg-surface-2", icon: "text-muted" },
  paused: { box: "border-line-strong bg-surface-2", icon: "text-body" },
};

export function PreviewNotice({
  status,
}: {
  status: NonNullable<PropertyDetail["previewStatus"]>;
}) {
  const t = useTranslations("detail.preview");
  const bucket = bucketOfStatus(status);
  const tone = TONE[bucket] ?? TONE.draft;

  return (
    <div
      // Announced, not just coloured: the whole point is that the page lies
      // about its own visibility, and a screen reader gets no hint from the
      // border. `status` rather than `alert` — this is a standing condition of
      // the page, not something that just went wrong.
      role="status"
      className={`mb-5 flex items-start gap-3 rounded-(--radius-control) border px-4 py-3 ${tone.box}`}
    >
      <EyeOff
        size={17}
        strokeWidth={2}
        aria-hidden
        className={`mt-0.5 shrink-0 ${tone.icon}`}
      />
      <p className="min-w-0 text-[0.8125rem] text-ink">
        <span className="font-semibold">
          {t(`title.${bucket}` as "title.review")}
        </span>{" "}
        <span className="text-body">
          {t(`body.${bucket}` as "body.review")}
        </span>
      </p>
    </div>
  );
}
