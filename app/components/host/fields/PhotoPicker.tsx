"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { HostPhoto } from "@/lib/api";

// Picks a photo already on the listing, or uploads a new one through the
// EXISTING endpoint. There is deliberately no second upload path: a second
// path is a second place to get EXIF stripping wrong, and that shipped once
// already (PropertyDoc.cs:14).

export type PhotoPickerProps = {
  open: boolean;
  photos: HostPhoto[];
  onClose: () => void;
  onPick: (url: string, asFigure: boolean) => void;
  onUpload: (file: File, alsoInGallery: boolean) => Promise<string>;
  strings: Record<"title" | "asChip" | "asFigure" | "upload" | "alsoInGallery" | "uploading" | "failed" | "empty", string>;
};

export function PhotoPicker({ open, photos, onClose, onPick, onUpload, strings }: PhotoPickerProps) {
  const [asFigure, setAsFigure] = useState(false);
  // NOT pre-ticked: an upload begun inside the description is a description
  // photo until someone says otherwise, and this checkbox is the moment the
  // owner thinks about it at all.
  const [alsoInGallery, setAlsoInGallery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setBusy(true);
    setFailed(false);
    try {
      const url = await onUpload(f, alsoInGallery);
      onPick(url, asFigure);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={strings.title}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Choice on={!asFigure} onClick={() => setAsFigure(false)}>{strings.asChip}</Choice>
          <Choice on={asFigure} onClick={() => setAsFigure(true)}>{strings.asFigure}</Choice>
        </div>

        {photos.length === 0 ? (
          <p className="text-sm text-muted">{strings.empty}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p) => (
              <li key={p.url}>
                <button
                  type="button"
                  onClick={() => { onPick(p.url, asFigure); onClose(); }}
                  className="block w-full overflow-hidden rounded-(--radius-control) border border-line transition-[filter] duration-(--dur-standard) hover:brightness-95"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.cardUrl ?? p.url} alt="" className="aspect-[4/3] w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={alsoInGallery}
              onChange={(e) => setAlsoInGallery(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            {strings.alsoInGallery}
          </label>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => file.current?.click()}
            className="w-fit rounded-(--radius-control) bg-brand px-3.5 py-2 text-[0.78125rem] font-semibold text-white transition-[filter] duration-(--dur-standard) hover:brightness-95 disabled:opacity-45"
          >
            {busy ? strings.uploading : strings.upload}
          </button>
          {failed && <p className="text-xs text-danger">{strings.failed}</p>}
        </div>
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
