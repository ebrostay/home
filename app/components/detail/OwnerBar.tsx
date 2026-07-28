"use client";

import { useEffect, useState } from "react";
import { BarChart3, Eye, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { fetchHostProperties } from "@/lib/api";
import { useAuth } from "@/components/site/AuthProvider";

// The way back out of your own listing.
//
// An owner lands here from "View as guest", and until now that was a one-way
// door: the page a guest sees has no owner controls on it, so returning to
// Manage meant the browser's Back button or a trip through the portfolio.
//
// It is also the answer to "is what I just saved what a guest sees?" — the
// question an owner actually has while standing on this page.
//
// ─────────────────────────────────────────────────────────────────────────
// This is an AFFORDANCE, not a permission. Hiding a link protects nothing:
// the URLs it points at are guessable, and what stops a stranger using them is
// that every host endpoint resolves ownership from `x-ms-client-principal` and
// answers 404 otherwise (§3.5, `LoadOwnedAsync`). Nothing here is a check —
// it decides what to draw, and the API decides what may happen.
// ─────────────────────────────────────────────────────────────────────────
//
// Ownership is established by asking for the caller's OWN portfolio and
// looking for this listing in it. That request returns only the caller's data,
// so a non-owner learns nothing from making it — and an anonymous visitor,
// which is nearly everyone on this page, makes no request at all.

export function OwnerBar({ propertyId }: { propertyId: string }) {
  const t = useTranslations("host");
  const td = useTranslations("detail");
  const { me, loading } = useAuth();
  const [owned, setOwned] = useState(false);

  useEffect(() => {
    // The common case costs nothing: a signed-out visitor never asks.
    if (loading || !me.authenticated) return;

    let cancelled = false;
    fetchHostProperties()
      .then((mine) => {
        if (!cancelled) setOwned(mine.some((p) => p.id === propertyId));
      })
      // A failed lookup means no bar. Being unable to prove ownership is not
      // the same as not owning it, but this is a shortcut on a page that works
      // without it — an error banner on a guest-facing page would be worse
      // than a missing link.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [loading, me.authenticated, propertyId]);

  if (!owned) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-(--radius-control) border border-river bg-river-soft px-4 py-3">
      <Eye size={16} strokeWidth={2} className="shrink-0 text-river-deep" aria-hidden />
      {/* Says why the controls are here. Without it the bar reads as something
          every visitor sees, and an owner checking their listing cannot tell
          whether a guest is looking at the same page. */}
      <p className="min-w-[12rem] flex-1 text-[0.8125rem] text-ink">
        {td("ownerView")}
      </p>

      <Link href={{ pathname: "/host/manage", query: { id: propertyId } }} className={PILL}>
        <BarChart3 size={14} strokeWidth={2} aria-hidden />
        {t("actions.manage")}
      </Link>
      <Link href={{ pathname: "/host/edit", query: { id: propertyId } }} className={PILL}>
        <Pencil size={14} strokeWidth={2} aria-hidden />
        {t("manage.editListing")}
      </Link>
    </div>
  );
}

const PILL =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-(--radius-control) border border-river-deep bg-surface px-3 text-[0.78125rem] font-semibold text-river-deep transition-colors duration-(--dur-standard) hover:bg-river-soft";
