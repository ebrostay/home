"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import type { HostNearbyEntry } from "@/lib/api";

export type PlacePickerProps = {
  open: boolean;
  entries: HostNearbyEntry[];
  onClose: () => void;
  onPick: (entryId: string, asCard: boolean) => void;
  strings: Record<"title" | "asChip" | "asCard" | "empty", string>;
};

export function PlacePicker({ open, entries, onClose, onPick, strings }: PlacePickerProps) {
  const [asCard, setAsCard] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={strings.title}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Choice on={!asCard} onClick={() => setAsCard(false)}>{strings.asChip}</Choice>
          <Choice on={asCard} onClick={() => setAsCard(true)}>{strings.asCard}</Choice>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">{strings.empty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => { onPick(e.id, asCard); onClose(); }}
                  className="flex w-full items-center gap-2 rounded-(--radius-control) px-3 py-2 text-left text-sm text-body hover:bg-surface-2"
                >
                  <MapPin size={14} strokeWidth={2} aria-hidden />
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

const Choice = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={`rounded-(--radius-control) px-3 py-1.5 text-[0.78125rem] font-semibold ${on ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}
  >
    {children}
  </button>
);
