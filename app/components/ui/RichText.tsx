"use client";

import { Fragment } from "react";
import { Image as ImageIcon, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { PropertyPhoto, PublicNearbyEntry } from "@/lib/api";
import { formatDistance } from "@/lib/geocode";
import { reachFor, type NearbyProfile } from "@/lib/nearby";
import { PROFILE_ICONS } from "@/lib/profile-icons";
import type { RichNode } from "@/lib/rich-text";

// Renders a description document as React ELEMENTS. There is no HTML string
// anywhere in this file, and there must never be one: that absence is the
// whole security argument (design §8). No dangerouslySetInnerHTML, and no
// import of @tiptap/html.
//
// A reference resolves against the listing's own records, so the text can only
// ever show a photo the listing already publishes and a distance it already
// measured.

export type RichTextProps = {
  doc: RichNode | null;
  photos: PropertyPhoto[];
  nearby: PublicNearbyEntry[];
  profile: NearbyProfile;
  /** Open the gallery overlay at this photo. */
  onPhoto?: (url: string) => void;
  /** Select this entry in the neighbourhood section. */
  onPlace?: (entryId: string) => void;
};

export function RichText({ doc, photos, nearby, profile, onPhoto, onPlace }: RichTextProps) {
  // Same two namespaces Nearby.tsx (the sibling section this component sits
  // beside) reads from: "minutes" is shared verbatim, and "richText" holds
  // the two chip labels this module owns.
  const t = useTranslations("detail.nearby");
  const tr = useTranslations("detail.richText");
  const locale = useLocale();
  if (!doc?.content?.length) return null;
  const byUrl = new Map(photos.map((p) => [p.url, p]));
  const byId = new Map(nearby.map((n) => [n.id, n]));
  const ctx = { byUrl, byId, profile, onPhoto, onPlace, t, tr, locale };
  return <div className="flex flex-col gap-3">{doc.content.map((n, i) => <Block key={i} node={n} ctx={ctx} />)}</div>;
}

type Ctx = {
  byUrl: Map<string, PropertyPhoto>;
  byId: Map<string, PublicNearbyEntry>;
  profile: NearbyProfile;
  onPhoto?: (url: string) => void;
  onPlace?: (entryId: string) => void;
  t: ReturnType<typeof useTranslations>;
  tr: ReturnType<typeof useTranslations>;
  locale: string;
};

const PROSE = "text-[0.96875rem] leading-relaxed";

function Block({ node, ctx }: { node: RichNode; ctx: Ctx }) {
  switch (node.type) {
    case "paragraph":
      return <p className={PROSE}><Inline nodes={node.content} ctx={ctx} /></p>;

    // Always h3: the page owns h1 and h2, so an owner cannot outrank it.
    case "heading":
      return <h3 className="text-[1.0625rem] font-semibold text-ink"><Inline nodes={node.content} ctx={ctx} /></h3>;

    case "bulletList":
      return <ul className="flex list-disc flex-col gap-1.5 pl-5">{listItems(node, ctx)}</ul>;
    case "orderedList":
      return <ol className="flex list-decimal flex-col gap-1.5 pl-5">{listItems(node, ctx)}</ol>;

    // A quiet aside, deliberately NOT alert-shaped. A callout that looks like a
    // warning invites owners to restate terms the booking engine enforces, and
    // prose contradicting ADR-022 is a dispute with our own UI as evidence.
    case "callout":
      return (
        <div className="rounded-(--radius-control) border-l-2 border-river bg-river-soft py-2.5 pl-3.5 pr-3">
          {(node.content ?? []).map((c, i) => (
            <p key={i} className={`${PROSE} text-river-deep`}><Inline nodes={c.content} ctx={ctx} /></p>
          ))}
        </div>
      );

    case "photoFigure": {
      const photo = node.attrs?.url ? ctx.byUrl.get(node.attrs.url) : undefined;
      // A missing target renders NOTHING — no broken image, no placeholder. A
      // guest has no use for the knowledge that a listing is inconsistent.
      if (!photo) return null;
      return (
        <figure className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => ctx.onPhoto?.(photo.url)}
            className="overflow-hidden rounded-(--radius-control)"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.detailUrl ?? photo.url}
              alt=""
              loading="lazy"
              className="w-full object-cover transition-[filter] duration-(--dur-standard) hover:brightness-95"
            />
          </button>
          {node.attrs?.caption && (
            <figcaption className="text-xs text-muted">{node.attrs.caption}</figcaption>
          )}
        </figure>
      );
    }

    case "placeCard": {
      const place = node.attrs?.entryId ? ctx.byId.get(node.attrs.entryId) : undefined;
      if (!place) return null;
      const reach = reachFor(place, ctx.profile);
      const ProfileIcon = PROFILE_ICONS[ctx.profile];
      return (
        <button
          type="button"
          onClick={() => ctx.onPlace?.(place.id)}
          className="flex items-center justify-between gap-3 rounded-(--radius-control) border border-line px-3.5 py-2.5 text-left transition-[filter] duration-(--dur-standard) hover:brightness-95"
        >
          <span className="flex items-center gap-2 text-sm text-ink">
            <MapPin size={14} strokeWidth={2} aria-hidden />
            {place.name}
          </span>
          {/* The card has the room the inline chip does not, so its figure
              keeps its profile beside it rather than losing the figure. */}
          {reach && (
            <span className="flex items-center gap-1.5 text-muted">
              <ProfileIcon size={12} strokeWidth={2} aria-hidden />
              <span className="data text-xs">
                {ctx.t("minutes", { count: reach.minutes })} ·{" "}
                {formatDistance(reach.metres, ctx.locale)}
              </span>
            </span>
          )}
        </button>
      );
    }

    default:
      return null;
  }
}

const listItems = (node: RichNode, ctx: Ctx) =>
  (node.content ?? []).map((li, i) => (
    <li key={i} className={PROSE}>
      {(li.content ?? []).map((c, j) => <Inline key={j} nodes={c.content} ctx={ctx} />)}
    </li>
  ));

function Inline({ nodes, ctx }: { nodes?: RichNode[]; ctx: Ctx }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => {
        if (n.type === "text") {
          let el = <>{n.text}</>;
          // Marks are applied outward, so bold+italic nests either way round.
          for (const m of n.marks ?? []) {
            if (m.type === "bold") el = <strong className="font-semibold">{el}</strong>;
            if (m.type === "italic") el = <em>{el}</em>;
          }
          return <Fragment key={i}>{el}</Fragment>;
        }

        if (n.type === "photoRef") {
          const photo = n.attrs?.url ? ctx.byUrl.get(n.attrs.url) : undefined;
          if (!photo) return null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => ctx.onPhoto?.(photo.url)}
              className="mx-0.5 inline-flex items-baseline gap-1 rounded-(--radius-control) bg-surface-2 px-1.5 py-0.5 text-[0.875em] text-ink transition-[filter] duration-(--dur-standard) hover:brightness-95"
            >
              <ImageIcon size={12} strokeWidth={2} aria-hidden />
              {photo.isFloorplan ? ctx.tr("floorplan") : ctx.tr("photo")}
            </button>
          );
        }

        if (n.type === "placeRef") {
          const place = n.attrs?.entryId ? ctx.byId.get(n.attrs.entryId) : undefined;
          if (!place) return null;
          // The name only. This chip sits inside a sentence, where there is no
          // room to say what a figure is measured on — "3 min" mid-paragraph
          // is a number the reader cannot use, because nothing beside it says
          // whether that is a walk or a drive. The figure, with its profile
          // stated, is one click away in the list this chip selects.
          return (
            <button
              key={i}
              type="button"
              onClick={() => ctx.onPlace?.(place.id)}
              className="mx-0.5 inline-flex items-baseline gap-1 rounded-(--radius-control) bg-brand-soft px-1.5 py-0.5 text-[0.875em] text-brand-strong transition-[filter] duration-(--dur-standard) hover:brightness-95"
            >
              <MapPin size={12} strokeWidth={2} aria-hidden />
              {place.name}
            </button>
          );
        }

        return null;
      })}
    </>
  );
}
