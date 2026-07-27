"use client";

import { ChevronLeft, ChevronRight, ImageUp, Map, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HostListing, HostPhoto } from "@/lib/api";

// The gallery, in the order a guest will swipe through it.
//
// What this cannot do is add a photo. Uploading goes through the API so it can
// validate, compress and set cache headers (ADR-019), and that endpoint is not
// built — so the drop zone says so plainly instead of opening a file picker
// that leads nowhere. Everything else about an existing photo is editable:
// order, whether it is a floor plan, and whether it stays at all.
//
// Order is the whole ranking: the first photo that is not a floor plan is the
// cover, on the card and at the top of the detail page. Moving a photo is
// therefore a content edit like any other, not a cosmetic one — which is why
// the section is in the diff.
//
// Reordering is buttons, not drag-and-drop. Drag would match the handoff and
// exclude every keyboard user; two arrows do the same job for everyone, and a
// gallery of a dozen photos is not a sorting problem.

export function PhotoManager({
  value,
  onChange,
}: {
  value: HostListing;
  onChange: (value: HostListing) => void;
}) {
  const t = useTranslations("host.edit.photos");
  const photos = value.photos;
  const setPhotos = (next: HostPhoto[]) => onChange({ ...value, photos: next });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPhotos(next);
  };

  // The cover is derived, never stored: a stored "isCover" flag and a photo
  // list are two places to say the same thing, and they drift the first time
  // a photo is deleted.
  const coverIndex = photos.findIndex((p) => !p.isFloorplan);

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
                {/* eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized */}
                <img
                  src={photo.url}
                  alt={t("photoAlt", { n: i + 1 })}
                  loading="lazy"
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

      <p className="flex items-center gap-2.5 rounded-(--radius-control) border border-dashed border-line-strong bg-surface-2 px-3.5 py-3 text-[0.8125rem] text-muted">
        <ImageUp size={16} strokeWidth={2} className="shrink-0" aria-hidden />
        {t("uploadSoon")}
      </p>
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
