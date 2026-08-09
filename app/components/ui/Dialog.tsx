"use client";

import { createContext, useEffect, useRef, useState } from "react";

// A portal target that lives INSIDE the modal. A native <dialog>.showModal()
// renders in the browser's top layer — above every page z-index — so a popup
// that portals to document.body (e.g. a Radix Select) opens BEHIND the modal
// and is invisible. Components rendered inside a Dialog read this context and
// portal here instead, keeping their popups in the same top layer. Outside a
// Dialog the context is null and they portal to the body as before.
export const DialogPortalContext = createContext<HTMLElement | null>(null);

// Native <dialog>-based modal: focus trapping, Esc, and backdrop come free.
export function Dialog({
  open,
  onClose,
  title,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Controls that must stay reachable however long the body gets — the
   *  filter dialog's Reset and Apply. Given here rather than at the end of
   *  `children`, they sit OUTSIDE the scrolling region and are always on
   *  screen.
   *
   *  Every other caller leaves this out and is unaffected: with no footer the
   *  body is the whole dialog, and a short one never reaches the cap. It
   *  earned a prop when the amenity filters went from six chips to sixty and
   *  pushed Apply a screen and a half below the fold on a phone. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // click on the backdrop (the dialog element itself) closes
        if (e.target === ref.current) onClose();
      }}
      // `[&[open]]:flex`, NOT a bare `flex`. The UA stylesheet hides a closed
      // dialog with `dialog:not([open]) { display: none }`, and an author
      // declaration beats a UA one whatever the specificity — so a plain
      // `flex` here leaves every CLOSED dialog laid out and covering the page,
      // swallowing clicks on whatever is behind it. Caught by the editor's
      // undo/redo test, where a closed "Insert a place" ate the toolbar.
      //
      // The column and its cap only bite when there is a footer to hold back;
      // with none the body is the only child and grows as it always did. 88vh
      // rather than the UA's own near-100% keeps the backdrop visible as an
      // escape route on a phone.
      className="m-auto w-[min(92vw,28rem)] flex-col overflow-hidden rounded-(--radius-card) bg-surface p-0 text-body shadow-(--shadow-pop) backdrop:bg-overlay [&[open]]:flex [&[open]]:max-h-[88vh]"
    >
      <div className="min-h-0 overflow-y-auto p-6">
        <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
        <DialogPortalContext.Provider value={portal}>
          <div className="mt-3">{children}</div>
        </DialogPortalContext.Provider>
      </div>
      {footer && (
        <div className="shrink-0 border-t border-line px-6 py-4">{footer}</div>
      )}
      {/* Top-layer portal target for popups opened from within the dialog. */}
      <div ref={setPortal} />
    </dialog>
  );
}
