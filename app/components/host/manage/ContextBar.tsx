"use client";

import { useEffect, useRef } from "react";
import { BarChart3, ChevronLeft, Eye, MoreHorizontal, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { HostProperty } from "@/lib/api";
import { bucketOf } from "@/lib/portfolio";

// Where am I, whose home is this, and how do I get out. Sticky under the global
// header so those three answers survive a long scroll — these pages are tall
// enough that an owner can lose track of which of their listings they are
// editing, and the price they are about to change belongs to a specific home.
//
// Shared by both halves of the owner portal, which is what makes the pair feel
// like one place: the only difference is which way the cross-link points.
//
// It PUBLISHES ITS OWN HEIGHT as `--context-bar-h`, because the section nav
// parks directly beneath it and this bar does not have a fixed height: below
// roughly 900px the buttons wrap to a second row and it grows from 55px to
// 91px. Both pages used to hardcode the one-row figure, so as soon as it
// wrapped the section nav parked 36px too high and vanished underneath it —
// the same class of bug twice, because a measurement was written down as a
// constant instead of being measured.

const PILL: Record<string, { chip: string; dot: string }> = {
  live: { chip: "bg-brand-soft text-brand-strong", dot: "bg-brand" },
  review: { chip: "bg-river-soft text-river-deep", dot: "bg-river-deep" },
  changes: { chip: "bg-warn-soft text-warn", dot: "bg-warn" },
  draft: { chip: "bg-surface-2 text-muted", dot: "bg-line-strong" },
  paused: { chip: "bg-surface-2 text-body", dot: "bg-occupied" },
};

export function ContextBar({
  property,
  current,
}: {
  property: HostProperty;
  /** Which half of the portal we are on. Decides which way the cross-link
   *  points — never render a link back to the page you are already on. */
  current: "manage" | "edit";
}) {
  const t = useTranslations("host");
  const bucket = bucketOf(property);
  const soon = t("soon");
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;

    // On the root, because the consumer is a sibling several levels away and
    // there is exactly one of these bars per page. Cleared on unmount so a
    // page without a context bar cannot inherit a stale height.
    const publish = () =>
      document.documentElement.style.setProperty(
        "--context-bar-h",
        `${el.getBoundingClientRect().height}px`,
      );

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--context-bar-h");
    };
  }, []);

  return (
    <div
      ref={bar}
      className="sticky top-(--header-h) z-[25] -mx-6 flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-6 py-2.5"
    >
      {/* The label goes on a phone but the chevron stays: with it, the bar
          fits the home's name and its state on one line. */}
      <Link
        href="/host"
        aria-label={t("title")}
        className="flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-body transition-colors duration-(--dur-standard) hover:text-ink"
      >
        <ChevronLeft size={15} strokeWidth={2} aria-hidden />
        <span className="max-[40rem]:sr-only">{t("title")}</span>
      </Link>
      <span aria-hidden className="text-line-strong max-[40rem]:hidden">
        /
      </span>
      <span className="min-w-0 max-w-[26ch] truncate text-[0.8125rem] font-semibold text-ink">
        {property.name}
      </span>

      <span
        className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${PILL[bucket].chip}`}
      >
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${PILL[bucket].dot}`} />
        <span className="data text-[0.65625rem] font-semibold tracking-[0.08em]">
          {t(`state.${bucket}` as "state.live")}
        </span>
      </span>

      {/* Icon-only on a phone. This bar is sticky, and with both labels it
          wrapped to three rows — a fifth of the viewport permanently spent on
          navigation, on the narrowest screen there is. */}
      <div className="ml-auto flex items-center gap-2">
        {property.status === "published" ? (
          <Link
            href={{ pathname: "/property", query: { id: property.id } }}
            className={BAR_BUTTON}
          >
            <Eye size={14} strokeWidth={2} aria-hidden />
            <span className="max-[40rem]:sr-only">{t("actions.viewAsGuest")}</span>
          </Link>
        ) : (
          <BarButton icon={<Eye size={14} strokeWidth={2} aria-hidden />} label={t("actions.viewAsGuest")} title={soon} />
        )}

        {/* The other half of the owner portal. Manage is visited weekly; the
            listing details are visited twice a year — the cross-link is how an
            owner gets from one habit to the other. */}
        <Link
          href={{
            pathname: current === "manage" ? "/host/edit" : "/host/manage",
            query: { id: property.id },
          }}
          className={BAR_BUTTON}
        >
          {current === "manage" ? (
            <Pencil size={14} strokeWidth={2} aria-hidden />
          ) : (
            <BarChart3 size={14} strokeWidth={2} aria-hidden />
          )}
          <span className="max-[40rem]:sr-only">
            {t(current === "manage" ? "manage.editListing" : "edit.goToManage")}
          </span>
        </Link>

        <button
          type="button"
          disabled
          title={soon}
          aria-label={t("actions.more", { name: property.name })}
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-(--radius-control) border border-line bg-surface text-ink transition-colors duration-(--dur-standard) hover:bg-page disabled:cursor-not-allowed disabled:opacity-45 max-[40rem]:hidden"
        >
          <MoreHorizontal size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// Shared so the one Link and the disabled buttons cannot drift apart.
const BAR_BUTTON =
  "flex h-[34px] shrink-0 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-[13px] text-[0.8125rem] font-semibold text-ink transition-colors duration-(--dur-standard) hover:bg-page disabled:cursor-not-allowed disabled:opacity-45 max-[40rem]:px-2.5";

function BarButton({
  icon,
  label,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
}) {
  return (
    <button type="button" disabled title={title} aria-label={label} className={BAR_BUTTON}>
      {icon}
      <span className="max-[40rem]:sr-only">{label}</span>
    </button>
  );
}
