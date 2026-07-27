"use client";

import { ChevronLeft, Eye, MoreHorizontal, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { HostProperty } from "@/lib/api";
import { bucketOf } from "@/lib/portfolio";

// Where am I, whose home is this, and how do I get out. Sticky under the global
// header so those three answers survive a long scroll — this page is tall
// enough that an owner can lose track of which of their listings they are
// editing, and the price they are about to change belongs to a specific home.

const PILL: Record<string, { chip: string; dot: string }> = {
  live: { chip: "bg-brand-soft text-brand-strong", dot: "bg-brand" },
  review: { chip: "bg-river-soft text-river-deep", dot: "bg-river-deep" },
  changes: { chip: "bg-warn-soft text-warn", dot: "bg-warn" },
  draft: { chip: "bg-surface-2 text-muted", dot: "bg-line-strong" },
  paused: { chip: "bg-surface-2 text-body", dot: "bg-occupied" },
};

export function ContextBar({ property }: { property: HostProperty }) {
  const t = useTranslations("host");
  const bucket = bucketOf(property);
  const soon = t("soon");

  return (
    <div className="sticky top-(--header-h) z-[25] -mx-6 flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-6 py-2.5">
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
        <BarButton
          icon={<Pencil size={14} strokeWidth={2} aria-hidden />}
          label={t("manage.editListing")}
          title={soon}
        />

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
