"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// The overflow menu on a portfolio row.
//
// It exists because the row has two buttons and more than two destinations.
// The pair is chosen per lifecycle state — a live listing offers Overview and
// View as guest, a draft offers Continue and Delete — and the listing editor
// fits none of those pairs without displacing something an owner needs more
// often. So it lives here, which is also where the row's later actions
// (duplicate, delete a live listing) will go.
//
// Reachable from the row on purpose: before this, the only route to the editor
// was Manage's context bar, so editing a listing meant opening a different
// page first to find the link. That is two clicks and a wrong mental model —
// the details are not part of Manage.
//
// Dismissal follows `InfoPopover`: a transparent full-screen button catches
// the outside click, plus Escape. Focus returns to the trigger on close,
// because a menu that dumps focus at the top of the document leaves a keyboard
// user re-navigating the whole page to get back to the row they were on.
//
// The panel is `position: fixed` rather than absolute, and that is not a
// preference. The row card is `overflow-hidden` — load-bearing, since it is
// what clips the photo to the rounded corners — so an absolutely positioned
// panel is cut off at the card's edge, which is exactly what happened. A fixed
// element escapes ancestor overflow (the card sets no transform, filter or
// containment, so it is not a containing block), which fixes it without
// touching the card or reaching for a portal.
//
// The cost of fixed is that the panel no longer travels with the page, so it
// closes on scroll and resize instead of drifting away from its trigger.

/** Enough for the items below plus the panel's padding. Only used to decide
 *  whether the menu opens downward or flips up, so being a little out just
 *  flips it slightly early near the bottom of the window. */
const PANEL_HEIGHT = 56;
const GAP = 6;

/** Viewport coordinates for the panel, anchored to the trigger and flipped
 *  above it when there is no room below. */
type At = { right: number; top?: number; bottom?: number };

export function RowMenu({
  propertyId,
  label,
}: {
  propertyId: string;
  /** Names the trigger: "More actions for Movera 7". */
  label: string;
}) {
  const t = useTranslations("host");
  const [at, setAt] = useState<At | null>(null);
  const open = at !== null;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (returnFocus = false) => {
    setAt(null);
    if (returnFocus) trigger.current?.focus();
  };

  const toggle = () => {
    if (open) return close();
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    // Right-aligned to the trigger: the menu sits at the end of a row's action
    // rail, so a left-anchored panel would hang off the card.
    const right = window.innerWidth - box.right;
    setAt(
      box.bottom + GAP + PANEL_HEIGHT > window.innerHeight
        ? { right, bottom: window.innerHeight - box.top + GAP }
        : { right, top: box.bottom + GAP },
    );
  };

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    // A fixed panel does not move with the page, so it has to go rather than
    // hang in space beside a trigger that has scrolled on. Capture, because
    // the scroll may happen in any container between here and the window.
    const onMove = () => close();

    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        onClick={toggle}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-(--radius-control) border bg-surface text-ink transition-colors duration-(--dur-standard) hover:bg-surface-2 ${
          open ? "border-ink" : "border-line"
        }`}
      >
        <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
      </button>

      {at && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => close()}
          />
          <div
            id={id}
            role="menu"
            aria-label={label}
            style={{ right: at.right, top: at.top, bottom: at.bottom }}
            className="fixed z-50 min-w-[13rem] rounded-(--radius-card) border border-line bg-surface p-1 shadow-(--shadow-pop)"
          >
            <Link
              role="menuitem"
              href={{ pathname: "/host/edit", query: { id: propertyId } }}
              className="flex items-center gap-2.5 rounded-(--radius-control) px-2.5 py-2 text-[0.8125rem] font-medium text-ink transition-colors duration-(--dur-standard) hover:bg-surface-2"
            >
              <Pencil size={14} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
              {t("manage.editListing")}
            </Link>
          </div>
        </>
      )}
    </span>
  );
}
