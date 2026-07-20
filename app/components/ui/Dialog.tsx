"use client";

import { useEffect, useRef } from "react";

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
        <div className="mt-3">{children}</div>
      </div>
    </dialog>
  );
}
