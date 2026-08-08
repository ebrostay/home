"use client";

// The review queue — the reason this section exists.
//
// `pending_review → published` is an admin act (ADR-030), and until this page
// existed nothing in the product could perform it: an owner could fill in a
// home, submit it, and wait forever. Oldest first, because a queue is a
// waiting line and the listing that has waited longest is the one with an
// owner wondering whether anybody works here.

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ApiError, biText, fetchReviewQueue, type AdminQueueItem } from "@/lib/api";
import { waitingHours } from "@/lib/review";
import { formatEuro } from "@/lib/pricing";
import { AdminShell, Empty, Ledger, Rows, Td, Th } from "@/components/admin/AdminShell";
import { Wait } from "@/components/admin/Wait";

type State =
  | { kind: "loading" }
  | { kind: "error"; status?: number }
  // `now` travels with the data rather than being read during render: these
  // pages are prerendered at build time, and a clock in the render path would
  // disagree with that HTML on hydration.
  | { kind: "ready"; items: AdminQueueItem[]; now: Date };

export default function AdminQueuePage() {
  const t = useTranslations("admin.queue");
  const locale = useLocale();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    fetchReviewQueue()
      .then((items) => live && setState({ kind: "ready", items, now: new Date() }))
      .catch((err: unknown) => {
        if (!live) return;
        setState({
          kind: "error",
          status: err instanceof ApiError ? err.status : undefined,
        });
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <AdminShell
      section="queue"
      count={state.kind === "ready" ? state.items.length : undefined}
    >
      {state.kind === "loading" && <Rows />}

      {state.kind === "error" && <Empty>{t("error")}</Empty>}

      {state.kind === "ready" && state.items.length === 0 && (
        <Empty>{t("empty")}</Empty>
      )}

      {state.kind === "ready" && state.items.length > 0 && (
        <Ledger>
          <thead>
            <tr>
              <Th className="w-24">{t("col.waiting")}</Th>
              <Th>{t("col.listing")}</Th>
              <Th className="hidden md:table-cell">{t("col.owner")}</Th>
              <Th align="right" className="hidden sm:table-cell">
                {t("col.price")}
              </Th>
              <Th align="right" className="hidden lg:table-cell">
                {t("col.size")}
              </Th>
              <Th align="right">{t("col.photos")}</Th>
              <Th className="hidden lg:table-cell">{t("col.signals")}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {state.items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <Wait hours={waitingHours(item.submittedAt, state.now)} />
                </Td>

                <Td>
                  <Link
                    href={`/admin/review?id=${encodeURIComponent(item.id)}`}
                    className="font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {item.name || t("untitled")}
                  </Link>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {[item.address, biText(item.area, locale)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Td>

                <Td className="hidden md:table-cell">
                  <span className="text-xs">{item.hostName ?? "—"}</span>
                </Td>

                <Td align="right" className="data hidden sm:table-cell">
                  {formatEuro(item.priceNumber, locale)}
                </Td>

                <Td align="right" className="data hidden lg:table-cell">
                  {item.sizeM2 > 0 ? `${item.sizeM2} m²` : "—"}
                </Td>

                <Td align="right" className="data">
                  {item.photoCount}
                </Td>

                {/* What the review view will have to show, said here so a
                    reviewer can see which rows carry a live register check
                    before opening them. Absence is never a warning — most
                    photos have no coordinates at all (ADR-019 amendment). */}
                <Td className="hidden lg:table-cell">
                  <span className="flex gap-3 text-[0.6875rem] text-muted">
                    {item.hasCadastralRef && <span>{t("signal.catastro")}</span>}
                    {item.locatedPhotos > 0 && (
                      <span className="data">
                        {t("signal.located", { n: item.locatedPhotos })}
                      </span>
                    )}
                  </span>
                </Td>

                <Td align="right">
                  <Link
                    href={`/admin/review?id=${encodeURIComponent(item.id)}`}
                    className="font-semibold text-brand-strong underline-offset-4 hover:underline"
                  >
                    {t("open")}
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Ledger>
      )}
    </AdminShell>
  );
}
