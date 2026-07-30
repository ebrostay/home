"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  EyeOff,
  ImageUp,
  Loader2,
  Map,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError, uploadHostPhoto, type HostListing, type HostPhoto } from "@/lib/api";
import { ACCEPT, shrink } from "@/lib/photos";
import { referencedPhotoUrls } from "@/lib/rich-text";

// The gallery, in the order a guest will swipe through it.
//
// Uploading goes through the API, never straight to storage: the container is
// public-read, so the Function is what guarantees the bytes behind a URL we
// host are pixels we encoded (ADR-019). No SAS token is involved.
//
// An upload APPLIES LIVE — it is a write of its own, not part of the page's
// diff. Holding bytes in the browser until the owner presses Save would mean
// losing an eight-photo upload to a closed tab, and would make the save bar
// claim a listing is unchanged while a file transfer is in flight. Everything
// else about a photo — order, floor-plan flag, removal — stays in the diff,
// because those are claims about the listing rather than transfers.
//
// Order is the whole ranking: the first photo that is not a floor plan is the
// cover, on the card and at the top of the detail page. Moving a photo is
// therefore a content edit like any other, not a cosmetic one — which is why
// the section is in the diff.
//
// Reordering is buttons, not drag-and-drop. Drag would match the handoff and
// exclude every keyboard user; two arrows do the same job for everyone, and a
// gallery of a dozen photos is not a sorting problem.

/** Mirrors `HostValidation.MaxPhotos`. Duplicated deliberately and kept small:
 *  the server is what enforces it, and this only exists so the owner is told
 *  before they pick forty files rather than after. */
const MAX_PHOTOS = 40;

export function PhotoManager({
  value,
  onChange,
  propertyId,
  onUploaded,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
  propertyId: string;
  /** The server's photo list after an upload. It goes to the page rather than
   *  through `onChange` because it has to update the SAVED baseline too — a
   *  photo that is already stored must not read as an unsaved change. */
  onUploaded: (photos: HostPhoto[]) => void;
}) {
  const t = useTranslations("host.edit.photos");
  const te = useTranslations("host.edit");
  const photos = value.photos;
  const setPhotos = (next: HostPhoto[]) => onChange({ ...value, photos: next });

  const input = useRef<HTMLInputElement>(null);
  // How many of this batch are left, so the owner sees "3 of 8" rather than a
  // spinner that could mean anything.
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);

  const room = MAX_PHOTOS - photos.length;

  const send = async (files: File[]) => {
    setFailures([]);
    const batch = files.slice(0, room);
    setQueue({ done: 0, total: batch.length });

    const rejected: { name: string; reason: string }[] = [];
    let latest: HostPhoto[] | null = null;

    // Sequential, not parallel. Six concurrent uploads on a phone's uplink
    // finish no sooner and all crawl together, and the server re-encodes each
    // one — a queue that arrives in order also lands in the gallery in order.
    for (const [i, file] of batch.entries()) {
      try {
        latest = await uploadHostPhoto(propertyId, await shrink(file), false);
      } catch (err) {
        const code = err instanceof ApiError ? (err.code ?? "generic") : "generic";
        rejected.push({
          name: file.name,
          reason: te.has(`error.${code}`)
            ? te(`error.${code}` as "error.generic")
            : te("error.generic"),
        });
      }
      setQueue({ done: i + 1, total: batch.length });
    }

    // One update at the end: every successful upload is already in the last
    // response, so applying each one would re-render the grid per file for no
    // added truth.
    if (latest) onUploaded(latest);
    setFailures(rejected);
    setQueue(null);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPhotos(next);
  };

  // The cover is derived, never stored: a stored "isCover" flag and a photo
  // list are two places to say the same thing, and they drift the first time
  // a photo is deleted. Same rule as the two server-side cover picks
  // (PublicProjection.ToSummary, HostProjection.ToHostProperty): a photo the
  // owner hid from the gallery must not badge as the cover here either, or
  // this badge and the row's actual thumbnail would disagree about which
  // photo is the cover for the same listing.
  const coverIndex = photos.findIndex((p) => !p.isFloorplan && !p.hiddenFromGallery);

  // "Used in the description" is DERIVED, never stored — storing it is a
  // denormalised copy that goes stale on the next edit. Walked from both
  // documents on every render, not just once, so a chip removed a moment ago
  // in the description editor is reflected here immediately.
  const referenced = useMemo(() => {
    const out = new Set<string>();
    for (const d of [value.copy?.es, value.copy?.en])
      if (d) for (const url of referencedPhotoUrls(d)) out.add(url);
    return out;
  }, [value.copy]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.84375rem] leading-relaxed text-body">{t("intro")}</p>

      {photos.length === 0 ? (
        <p className="rounded-(--radius-control) border border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center text-[0.8125rem] text-muted">
          {t("none")}
        </p>
      ) : (
        <ul className="grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(9rem,1fr))]">
          {photos.map((photo, i) => (
            <li key={photo.url} className="flex min-w-0 flex-col gap-2">
              <div className="relative aspect-[4/3] overflow-hidden rounded-(--radius-card) bg-surface-2">
                {/* The card size, not the master. A dozen tiles at 9 rem is
                    no reason to pull a dozen 2560 px photos. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized */}
                <img
                  src={photo.cardUrl ?? photo.url}
                  alt={t("photoAlt", { n: i + 1 })}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                {i === coverIndex && (
                  <span className="data absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[0.59375rem] tracking-[0.08em] text-white">
                    {t("cover")}
                  </span>
                )}
                {photo.isFloorplan && (
                  <span className="data absolute left-2 top-2 rounded-full bg-river-deep px-2 py-0.5 text-[0.59375rem] tracking-[0.08em] text-white">
                    {t("planBadge")}
                  </span>
                )}
                {/* Usage badges, on the right so they never collide with the
                    cover/plan badges on the left. Three mutually exclusive
                    states, in order of how much attention each wants: an
                    ORPHAN — hidden from the gallery AND unreferenced, so it is
                    stored, counted against the photo cap, and shown nowhere —
                    is exactly the silent-storage-leak state D11 exists to
                    surface, so it gets the loudest treatment. */}
                {photo.hiddenFromGallery && referenced.has(photo.url) && (
                  <span className="data absolute right-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[0.59375rem] tracking-[0.08em] text-white">
                    {t("descriptionOnlyBadge")}
                  </span>
                )}
                {photo.hiddenFromGallery && !referenced.has(photo.url) && (
                  <span className="data absolute right-2 top-2 rounded-full bg-warn px-2 py-0.5 text-[0.59375rem] tracking-[0.08em] text-white">
                    {t("orphanBadge")}
                  </span>
                )}
                {!photo.hiddenFromGallery && referenced.has(photo.url) && (
                  <span className="data absolute right-2 top-2 rounded-full bg-surface px-2 py-0.5 text-[0.59375rem] tracking-[0.08em] text-ink shadow-[0_0_0_1px_var(--line)]">
                    {t("usedBadge")}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <TileButton
                  label={t("moveEarlier", { n: i + 1 })}
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                >
                  <ChevronLeft size={14} strokeWidth={2} aria-hidden />
                </TileButton>
                <TileButton
                  label={t("moveLater", { n: i + 1 })}
                  onClick={() => move(i, i + 1)}
                  disabled={i === photos.length - 1}
                >
                  <ChevronRight size={14} strokeWidth={2} aria-hidden />
                </TileButton>
                <TileButton
                  label={t("togglePlan", { n: i + 1 })}
                  pressed={photo.isFloorplan}
                  onClick={() =>
                    setPhotos(
                      photos.map((p, j) =>
                        j === i ? { ...p, isFloorplan: !p.isFloorplan } : p,
                      ),
                    )
                  }
                >
                  <Map size={14} strokeWidth={2} aria-hidden />
                </TileButton>
                <TileButton
                  label={t("toggleGallery", { n: i + 1 })}
                  pressed={photo.hiddenFromGallery}
                  onClick={() =>
                    setPhotos(
                      photos.map((p, j) =>
                        j === i ? { ...p, hiddenFromGallery: !p.hiddenFromGallery } : p,
                      ),
                    )
                  }
                >
                  <EyeOff size={14} strokeWidth={2} aria-hidden />
                </TileButton>
                <TileButton
                  label={t("remove", { n: i + 1 })}
                  destructive
                  onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} strokeWidth={2} aria-hidden />
                </TileButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2.5">
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            // Cleared before awaiting anything, so picking the same file twice
            // in a row still fires a change event the second time.
            e.target.value = "";
            if (files.length > 0) void send(files);
          }}
        />

        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={queue !== null || room <= 0}
          className="flex items-center justify-center gap-2.5 rounded-(--radius-control) border border-dashed border-line-strong bg-surface-2 px-3.5 py-4 text-[0.8125rem] font-semibold text-ink transition-colors duration-(--dur-standard) hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {queue ? (
            <>
              <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden />
              {t("uploading", { done: queue.done + 1, total: queue.total })}
            </>
          ) : (
            <>
              <ImageUp size={16} strokeWidth={2} aria-hidden />
              {room > 0 ? t("upload") : t("uploadFull", { max: MAX_PHOTOS })}
            </>
          )}
        </button>

        <p className="text-xs leading-relaxed text-muted">{t("uploadHint")}</p>

        {/* Named, because "some photos failed" in a batch of eight is not
            something an owner can act on. */}
        {failures.map((f) => (
          <p
            key={f.name}
            className="flex flex-wrap items-center gap-2 rounded-(--radius-control) border border-warn bg-warn-soft px-3.5 py-2.5 text-[0.8125rem] text-ink"
          >
            <TriangleAlert size={15} strokeWidth={2} className="shrink-0 text-warn" aria-hidden />
            <span className="font-semibold">{f.name}</span>
            <span className="min-w-[10rem] flex-1">{f.reason}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function TileButton({
  label,
  onClick,
  disabled,
  pressed,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`grid h-7 flex-1 place-items-center rounded-(--radius-control) border transition-colors duration-(--dur-standard) disabled:cursor-not-allowed disabled:opacity-35 ${
        pressed
          ? "border-river-deep bg-river-soft text-river-deep"
          : destructive
            ? "border-line bg-surface text-muted hover:border-danger hover:text-danger"
            : "border-line bg-surface text-muted hover:border-brand hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
