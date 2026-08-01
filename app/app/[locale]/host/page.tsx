"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ApiError, fetchHostProperties, type HostProperty } from "@/lib/api";
import { bucketOf, portfolioStats, tabCounts, type Tab } from "@/lib/portfolio";
import { PortfolioLedger } from "@/components/host/PortfolioLedger";
import { PendingRollup } from "@/components/host/PendingRollup";
import { StatusTabs } from "@/components/host/StatusTabs";
import { PropertyRow } from "@/components/host/PropertyRow";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/site/AuthProvider";
import { HostPitch } from "@/components/host/HostPitch";

// The owner's home. One question: what is my portfolio doing right now, and
// what is waiting for me. Everything on the page answers it from a single
// dataset — see lib/portfolio.ts for why nothing here is stored twice.

type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "error" }
  // `now` is captured with the data, not read during render: this page is
  // prerendered at build time, and a clock in the render path would disagree
  // with that HTML on hydration.
  | { kind: "ready"; data: HostProperty[]; now: Date };

export default function HostPage() {
  const t = useTranslations("host");
  const locale = useLocale();

  const { me, loading: authLoading } = useAuth();

  const [state, setState] = useState<State>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<Tab>("all");

  // Retry resets to loading itself, so the effect only ever fetches — the
  // initial state is already `loading`.
  const retry = () => {
    setState({ kind: "loading" });
    setReloadKey((k) => k + 1);
  };

  // Gated on auth so a signed-out stranger never fires the owner fetch: it
  // would only ever come back 401 and log a stray console error. A session
  // that expires mid-visit still has `me.authenticated === true` at mount, so
  // the fetch still runs for it and the 401 still lands on `state.kind ===
  // "signedOut"` below — that branch is a late signal, not the only signal.
  useEffect(() => {
    if (authLoading || !me.authenticated) return;
    let cancelled = false;
    fetchHostProperties()
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data, now: new Date() });
      })
      .catch((err) => {
        if (cancelled) return;
        const anon = err instanceof ApiError && err.status === 401;
        setState({ kind: anon ? "signedOut" : "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, authLoading, me.authenticated]);

  const data = state.kind === "ready" ? state.data : null;

  const stats = useMemo(
    () =>
      state.kind === "ready"
        ? portfolioStats(state.data, locale, state.now)
        : null,
    [state, locale],
  );

  const counts = useMemo(() => (data ? tabCounts(data) : null), [data]);
  const rows = useMemo(
    () => (data ?? []).filter((p) => tab === "all" || bucketOf(p) === tab),
    [data, tab],
  );
  const pending = (data ?? []).filter((p) => p.requestCount > 0);

  // Signed out, this route is not the portfolio at all: it is the pitch, with
  // its own <main>. Returning before the owner chrome is deliberate — the
  // signed-out branch used to render a notice *under* an <h1>Manage
  // Property</h1> and beside an "Add property" button that led somewhere the
  // visitor could not go.
  //
  // Driven by /api/me rather than by the portfolio's own 401, because the two
  // arrive at different times: AuthProvider is already fetching /api/me when
  // this page mounts, while `state` sits in `loading` until the owner
  // endpoint answers. Waiting for the 401 would paint the owner chrome —
  // "Manage Property", "Add property" — at a stranger for as long as that
  // request takes, then swap it for the pitch. The 401 is still honoured
  // below as the late signal it is: a session that expired mid-visit.
  if (!authLoading && !me.authenticated) return <HostPitch />;
  if (state.kind === "signedOut") return <HostPitch />;

  // Auth not resolved yet — which is also the state this page is PRERENDERED
  // in, since a static export has no visitor at build time. Anything rendered
  // here is what a stranger paints before hydration, so it must not name the
  // owner: no "Manage Property" heading, no "Add property" link.
  if (authLoading) {
    return (
      <main
        aria-busy="true"
        className="mx-auto flex max-w-7xl flex-col gap-5 px-6 pb-24 pt-6"
      >
        <div className="skeleton h-[7.5rem] rounded-(--radius-card)" />
        <div className="skeleton h-40 rounded-(--radius-card)" />
        <div className="skeleton h-40 rounded-(--radius-card)" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 px-6 pb-24 pt-6">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="data text-[0.6875rem] tracking-[0.12em] text-muted">
            {t("eyebrow")}
          </p>
          <h1 className="mt-1.5 font-display text-[2.125rem] font-bold leading-[1.05] tracking-[-0.015em] text-ink">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-[64ch] text-pretty text-[0.90625rem] leading-normal text-body">
            {t("tagline")}
          </p>
        </div>

        {/* Real since ADR-030. It was a disabled button for the whole of v2 —
            every home in the system arrived by seed script. */}
        <Link
          href="/host/new"
          className="flex h-[42px] shrink-0 items-center gap-2 rounded-(--radius-control) bg-brand px-[18px] text-sm font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong"
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden />
          {t("add")}
        </Link>
      </header>

      {state.kind === "loading" && (
        <>
          <div className="skeleton h-[7.5rem] rounded-(--radius-card)" />
          <div className="skeleton h-40 rounded-(--radius-card)" />
          <div className="skeleton h-40 rounded-(--radius-card)" />
          <p className="sr-only">{t("loading")}</p>
        </>
      )}

      {state.kind === "error" && (
        <Notice title={t("error")} body="">
          <Button variant="secondary" onClick={retry}>
            {t("retry")}
          </Button>
        </Notice>
      )}

      {state.kind === "ready" && data && stats && counts && (
        <>
          {/* A brand-new owner gets the invitation, not an empty ledger of
              zeroes and six tabs that all read 0. */}
          {data.length === 0 ? (
            <AddPrompt promoted />
          ) : (
            <>
              <PortfolioLedger stats={stats} locale={locale} now={state.now} />

              {stats.pendingTotal > 0 && (
                <PendingRollup
                  properties={pending}
                  total={stats.pendingTotal}
                  soon={t("soon")}
                />
              )}

              <StatusTabs value={tab} counts={counts} onChange={setTab} />

              <div className="flex flex-col gap-3">
                {rows.map((p) => (
                  <PropertyRow
                    key={p.id}
                    property={p}
                    locale={locale}
                    now={state.now}
                  />
                ))}
              </div>

              <AddPrompt />
            </>
          )}
        </>
      )}
    </main>
  );
}

function AddPrompt({ promoted = false }: { promoted?: boolean }) {
  const t = useTranslations("host");
  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-5 rounded-(--radius-card) border border-dashed border-line-strong px-[1.375rem] py-[1.125rem] ${
        promoted ? "mt-4 py-10" : ""
      }`}
    >
      <div>
        <p className="text-[0.9375rem] font-semibold text-ink">
          {promoted ? t("empty.title") : t("prompt.title")}
        </p>
        <p className="mt-1 max-w-[60ch] text-[0.84375rem] text-body">
          {promoted ? t("empty.body") : t("prompt.body")}
        </p>
      </div>
      <Link
        href="/host/new"
        className="flex h-10 shrink-0 items-center rounded-(--radius-control) border border-brand bg-surface px-4 text-sm font-semibold text-brand-strong transition-colors duration-(--dur-standard) hover:bg-brand-soft"
      >
        {t("prompt.cta")}
      </Link>
    </section>
  );
}

function Notice({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-(--radius-card) border border-line bg-surface px-6 py-10 shadow-(--shadow-card)">
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {body && <p className="max-w-[60ch] text-sm text-body">{body}</p>}
      {children}
    </section>
  );
}
