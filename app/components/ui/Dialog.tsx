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
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
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
      className="m-auto w-[min(92vw,28rem)] rounded-(--radius-card) bg-surface p-0 text-body shadow-(--shadow-pop) backdrop:bg-overlay"
    >
      <div className="p-6">
        <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
        <DialogPortalContext.Provider value={portal}>
          <div className="mt-3">{children}</div>
        </DialogPortalContext.Provider>
      </div>
      {/* Top-layer portal target for popups opened from within the dialog. */}
      <div ref={setPortal} />
    </dialog>
  );
}
