"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

// A small "what is this?" next to a field label.
//
// A popover rather than a permanent hint because the answer is long and only
// needed once: an owner who knows what a cadastral reference is should not
// read a paragraph about it every time they open the page, and one who does
// not should not have to leave to find out.
//
// Dismissal follows the pattern the date pickers already use — a transparent
// full-screen button behind the panel catches the outside click — plus Escape,
// which is what anyone who opened it with a keyboard will reach for.

export function InfoPopover({
  label,
  title,
  children,
  align = "start",
}: {
  /** Names the trigger for assistive tech: "What is a cadastral reference?" */
  label: string;
  title: string;
  children: ReactNode;
  /** Which edge the panel hangs from. `end` keeps it onscreen in a right
   *  column, where a left-anchored panel would run off the viewport. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`grid h-[1.125rem] w-[1.125rem] place-items-center rounded-full transition-colors duration-(--dur-standard) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring) ${
          open ? "bg-river-soft text-river-deep" : "text-muted hover:text-river-deep"
        }`}
      >
        <Info size={14} strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default max-[40rem]:bg-(--overlay)"
            onClick={() => setOpen(false)}
          />
          {/* Anchored to the icon on a wide screen, centred on a narrow one.
              The icon sits inline in a label, so "hang the panel off it" puts
              its left edge wherever the label text happens to end — on a phone
              that is far enough right that a 20rem panel runs off the screen
              and the whole page starts scrolling sideways. At that width a
              paragraph of explanation is a sheet, not a popover. */}
          <div
            id={id}
            role="dialog"
            aria-label={title}
            className={`absolute top-6 z-50 w-[min(22rem,calc(100vw-3rem))] rounded-(--radius-card) border border-line bg-surface p-4 text-left shadow-(--shadow-pop) max-[40rem]:fixed max-[40rem]:left-1/2 max-[40rem]:top-1/2 max-[40rem]:-translate-x-1/2 max-[40rem]:-translate-y-1/2 ${
              align === "end" ? "right-0" : "left-0"
            }`}
          >
            <p className="mb-2 text-[0.84375rem] font-semibold text-ink">{title}</p>
            <div className="flex flex-col gap-2 text-[0.8125rem] leading-relaxed font-normal text-body">
              {children}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
