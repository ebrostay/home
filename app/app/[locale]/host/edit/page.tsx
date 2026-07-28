"use client";

// Edit listing — the owner's twice-a-year view.
// URL: /{locale}/host/edit?id={slug}, matching the query-param model the rest
// of the product uses (static export has no dynamic segments).
//
// The other half of the split Manage started (ADR-025/ADR-027): Manage holds
// what an owner touches weekly and applies live; this holds what the listing
// CLAIMS, and saving it sends an approved listing back to the review queue.
//
// One diff drives the entire page. `changedSections()` runs once per render
// and everything reads its result — the rail's discs, the save bar's chips,
// the count, the review note, whether Save is live. Six section-level dirty
// flags would be six chances for the rail and the chips to disagree.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ApiError,
  biText,
  fetchHostProperty,
  saveHostDeclined,
  saveHostListing,
  saveHostStatus,
  type Declined,
  type HostListing,
  type HostPhoto,
  type HostPropertyDetail,
} from "@/lib/api";
import { stamped, withDecline } from "@/lib/declined";
import {
  SECTIONS,
  attentionOf,
  blockersOf,
  changedSections,
  completenessOf,
  goesBackToReview,
  type SectionKey,
} from "@/lib/listing";
import { ContextBar } from "@/components/host/manage/ContextBar";
import { SectionCard } from "@/components/host/manage/SectionCard";
import { SectionNav, type SectionStatus } from "@/components/host/SectionNav";
import { SaveBar, type SaveState } from "@/components/host/edit/SaveBar";
import { DangerZone } from "@/components/host/edit/DangerZone";
import { BasicsFields } from "@/components/host/fields/BasicsFields";
import { AddressFields } from "@/components/host/fields/AddressFields";
import { PhotoManager } from "@/components/host/fields/PhotoManager";
import { DescriptionFields } from "@/components/host/fields/DescriptionFields";
import { AmenityPicker } from "@/components/host/fields/AmenityPicker";
import { RulesFields } from "@/components/host/fields/RulesFields";
import { Button } from "@/components/ui/Button";

/** The width at which this page has a left column, as a media query for the
 *  nav. Must equal the `min-[64rem]:` on the grid below — they are two spellings
 *  of one decision, kept in one file so they cannot drift apart. */
const RAIL_QUERY = "(min-width: 64rem)";

type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "ready"; detail: HostPropertyDetail };

export default function EditPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <EditContent />
    </Suspense>
  );
}

function EditContent() {
  const t = useTranslations("host");
  const te = useTranslations("host.edit");
  const locale = useLocale();
  const id = useSearchParams().get("id") ?? "";

  const [loaded, setState] = useState<State>({ kind: "loading" });
  const state: State = id ? loaded : { kind: "missing" };
  // The working copy. The saved baseline stays in `state.detail.listing`, so
  // the diff is always against what the server last confirmed — not against
  // whatever the form held a moment ago.
  const [listing, setListing] = useState<HostListing | null>(null);
  // Deliberately NOT part of `listing`, and therefore not part of the diff:
  // dismissing a suggestion is not an unsaved change and must never reach the
  // save bar or the content payload (ADR-027 decision 5). It applies live.
  const [declined, setDeclined] = useState<Declined[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    // No id is not a load failure, it is a fact about the URL — so it is
    // derived below rather than written into state from an effect.
    if (!id) return;
    let cancelled = false;

    fetchHostProperty(id)
      .then((detail) => {
        if (cancelled) return;
        setState({ kind: "ready", detail });
        setListing(detail.listing);
        setDeclined(detail.declined ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err instanceof ApiError ? err.status : 0;
        setState({
          kind: status === 401 ? "signedOut" : status === 404 ? "missing" : "error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const message = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? (err.code ?? "generic") : "generic";
      // Unknown codes fall back rather than rendering a raw key at the owner.
      return te.has(`error.${code}`)
        ? te(`error.${code}` as "error.generic")
        : te("error.generic");
    },
    [te],
  );

  const detail = state.kind === "ready" ? state.detail : null;

  const diff = useMemo(() => {
    if (!detail || !listing) return null;
    const changed = changedSections(listing, detail.listing);
    return {
      changed,
      edited: new Set(changed),
      attention: attentionOf(listing),
      blockers: blockersOf(listing),
      stats: completenessOf(listing),
      reviewable:
        goesBackToReview(changed) &&
        // The prediction only applies where the server actually moves the
        // status. A draft stays a draft however much you change in it.
        (detail.property.status === "published" || detail.property.status === "paused"),
    };
  }, [detail, listing]);

  if (state.kind === "loading") return <Skeleton />;
  if (state.kind !== "ready" || !detail || !listing || !diff) {
    return (
      <Notice
        title={t(state.kind === "signedOut" ? "signedOut.title" : "manage.notFound")}
        body={
          state.kind === "signedOut" ? t("signedOut.body") : t("manage.notFoundBody")
        }
      />
    );
  }

  const property = detail.property;

  const save = async () => {
    setSaveState("saving");
    try {
      const next = await saveHostListing(property.id, listing);
      setState({
        ...state,
        detail: { ...detail, property: next.property, listing: next.listing },
      });
      setListing(next.listing);
      setSaveState("saved");
      setError(undefined);
    } catch (err) {
      setError(message(err));
      setSaveState("error");
    }
  };

  // A finished upload is already stored, so it has to land in BOTH the working
  // copy and the saved baseline. Into the working copy alone it would show up
  // as an unsaved change to a photo the server already has — and pressing
  // Discard would then "undo" it back out of a gallery it is still in.
  //
  // What lands is only what the upload ADDED, appended to each list as it
  // stands. Taking the server's list wholesale would undo whatever the owner
  // did while the transfer was in flight — a reorder would snap back to
  // storage order, and a photo they had just removed would reappear, because
  // the server still has it until the content save goes through.
  const photosUploaded = (stored: HostPhoto[]) => {
    const before = new Set(detail.listing.photos.map((p) => p.url));
    const added = stored.filter((p) => !before.has(p.url));
    if (added.length === 0) return;

    setListing({ ...listing, photos: [...listing.photos, ...added] });
    setState({
      ...state,
      detail: {
        ...detail,
        listing: { ...detail.listing, photos: [...detail.listing.photos, ...added] },
      },
    });
  };

  // "Keep mine". Applied on screen first and written after, because the whole
  // point is that the offer goes away when the owner says so — a suggestion
  // that lingers for a round trip is one they will press again. A failed write
  // brings it back, which is the honest outcome: nothing was recorded.
  const decline = async (entry: Omit<Declined, "at">) => {
    const next = withDecline(declined, entry);
    const before = declined;
    setDeclined(stamped(declined, next, new Date().toISOString().slice(0, 10)));
    try {
      setDeclined(await saveHostDeclined(property.id, next));
      setError(undefined);
    } catch (err) {
      // Put the suggestion back and say why. A dismissal that silently fails
      // and then reappears on the next visit reads as the page ignoring the
      // owner, which is the complaint this whole mechanism exists to answer.
      setDeclined(before);
      setError(message(err));
    }
  };

  const setStatus = async (next: "paused" | "published") => {
    setStatusBusy(true);
    try {
      const updated = await saveHostStatus(property.id, next);
      setState({ ...state, detail: { ...detail, property: updated } });
      setError(undefined);
    } catch (err) {
      setError(message(err));
    } finally {
      setStatusBusy(false);
    }
  };

  const labels = Object.fromEntries(
    SECTIONS.map((key) => [key, te(`nav.${key}` as "nav.basics")]),
  ) as Record<SectionKey, string>;

  // The two sets the rail used to take separately, resolved here into the one
  // state per section the nav renders. Edited wins: once you are working in a
  // section, what matters is that the change is captured, not that it was
  // already thin.
  const statuses = Object.fromEntries(
    SECTIONS.map((key) => [
      key,
      diff.edited.has(key) ? "edited" : diff.attention.has(key) ? "needs" : "idle",
    ]),
  ) as Record<SectionKey, SectionStatus>;

  const stats = diff.stats;
  const cells = [
    { key: "photos", value: String(stats.photos), label: te("ledger.photos"), warn: stats.photos === 0 },
    // Never amber. A floor plan is worth having and worth counting, but plenty
    // of homes will never have one — and this is the only place it would ever
    // be raised, so an amber here would be a permanent complaint about
    // something nothing else treats as a problem.
    { key: "plans", value: String(stats.floorplans), label: te("ledger.floorplans"), warn: false },
    {
      key: "bilingual",
      value: `${stats.bilingual} / ${stats.bilingualTotal}`,
      label: te("ledger.bilingual"),
      warn: stats.bilingual < stats.bilingualTotal,
    },
    {
      key: "amenities",
      value: `${stats.amenities} / ${stats.amenitiesTotal}`,
      label: te("ledger.amenities"),
      warn: stats.amenities === 0,
    },
  ];

  return (
    // 8rem of bottom padding clears the fixed save bar; without it the danger
    // zone is permanently half-covered at the end of the page.
    <main
      className="mx-auto flex max-w-7xl flex-col gap-5 px-6 pb-32"
      style={
        {
          // Header + the context bar's MEASURED height — where the section
          // nav parks. The fallbacks are the figures this used to hardcode, so
          // the first paint and the static export are unchanged; both bars
          // overwrite them on mount and whenever they change shape.
          "--section-nav-top": "calc(var(--header-h) + var(--context-bar-h, 3.4375rem))",
          // …and where an anchor has to land to clear all of it, nav included.
          "--section-anchor-top":
            "calc(var(--header-h) + var(--context-bar-h, 3.4375rem) + var(--section-nav-h, 2.625rem) + 0.75rem)",
        } as React.CSSProperties
      }
    >
      <ContextBar property={property} current="edit" />

      <header className="flex flex-wrap items-end justify-between gap-7 pt-1">
        <div className="min-w-[16rem] flex-1">
          <p className="data text-[0.6875rem] tracking-[0.12em] text-muted">
            {property.reference
              ? te("eyebrow", { reference: property.reference })
              : te("eyebrowNoRef")}
          </p>
          {/* Bound to the live title field, so editing Basics retitles the
              page — the clearest possible confirmation that the change landed
              somewhere real. */}
          <h1 className="mt-1.5 font-display text-[2.125rem] font-bold leading-[1.05] tracking-[-0.015em] text-ink">
            {listing.name || te("untitled")}
          </h1>
          <p className="mt-2 text-[0.90625rem] leading-normal text-body">
            {[listing.address, biText(listing.area, locale)].filter(Boolean).join(" · ") ||
              te("noAddress")}
          </p>
        </div>

        {/* Not money, unlike Manage's ledger: these four are the things an
            owner can fix on this page that decide whether the listing is any
            good. All live — a completeness figure that only moves on save is
            a figure nobody trusts. */}
        <dl className="m-0 flex flex-wrap gap-6">
          {cells.map((c) => (
            <div key={c.key} className="flex flex-col gap-0.5">
              <dd
                className={`data m-0 whitespace-nowrap text-lg font-semibold ${
                  c.warn ? "text-warn" : "text-ink"
                }`}
              >
                {c.value}
              </dd>
              <dt className="data whitespace-nowrap text-[0.625rem] tracking-[0.1em] text-muted">
                {c.label}
              </dt>
            </div>
          ))}
        </dl>
      </header>

      {/* The two-column width. 64rem, not the 56rem it was: at 56rem the rail
          took 13rem and left the form about 640px, which is tight for the
          address section's map and cadastral panel side by side — and the
          section bar needs 905px, so between 896 and the rail there was no
          width at which it could appear. The nav's middle rung was
          unreachable. RAIL_QUERY below must stay this same width. */}
      <div className="grid items-start gap-9 min-[64rem]:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Rail while the grid above still has a left column, then the same
            hairline bar Manage uses, then "Sections". No scroll spy: the discs
            already own this glance, and a highlight chasing the scroll would
            compete with them for it. */}
        <SectionNav
          sections={SECTIONS}
          labels={labels}
          ariaLabel={te("nav.label")}
          sheetLabel={te("nav.label")}
          changedLabel={te("nav.changed")}
          status={statuses}
          railQuery={RAIL_QUERY}
          railTop="calc(var(--header-h) + 4.5rem)"
          // Below the context bar, not level with it. Parked at --header-h the
          // bar landed at the same offset as ContextBar and, one z-index
          // lower, disappeared entirely underneath it.
          stickyTop="var(--section-nav-top)"
        />

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-river bg-river-soft px-4 py-3.5">
            <Info size={16} strokeWidth={2} className="shrink-0 text-river-deep" aria-hidden />
            <p className="min-w-[12rem] flex-1 text-[0.8125rem] text-ink">
              {te("crossLink")}
            </p>
            <Link
              href={{ pathname: "/host/manage", query: { id: property.id } }}
              className="flex h-8 items-center rounded-(--radius-control) border border-river-deep bg-surface px-3 text-[0.78125rem] font-semibold text-river-deep transition-colors duration-(--dur-standard) hover:bg-river-soft"
            >
              {te("goToManage")}
            </Link>
          </div>

          <SectionCard id="basics" label={te("nav.basics")}>
            <BasicsFields value={listing} onChange={setListing} />
          </SectionCard>

          <SectionCard id="address" label={te("nav.address")}>
            <AddressFields
              value={listing}
              onChange={setListing}
              declined={declined}
              onDecline={decline}
            />
          </SectionCard>

          <SectionCard
            id="photos"
            label={te("nav.photos")}
            figure={te("photoCount", { count: stats.photos })}
          >
            <PhotoManager
              value={listing}
              onChange={setListing}
              propertyId={property.id}
              onUploaded={photosUploaded}
            />
          </SectionCard>

          <SectionCard
            id="description"
            label={te("nav.description")}
            figure={te("bilingualFigure", {
              done: stats.bilingual,
              total: stats.bilingualTotal,
            })}
            figureTone={
              stats.bilingual === stats.bilingualTotal ? "text-brand-strong" : "text-warn"
            }
          >
            <DescriptionFields value={listing} onChange={setListing} />
          </SectionCard>

          <SectionCard
            id="amenities"
            label={te("nav.amenities")}
            figure={te("amenityFigure", {
              done: stats.amenities,
              total: stats.amenitiesTotal,
            })}
          >
            <AmenityPicker value={listing} onChange={setListing} />
          </SectionCard>

          <SectionCard id="terms" label={te("nav.terms")}>
            <RulesFields
              value={listing}
              onChange={setListing}
              manageHref={te.rich("pricingPointer", {
                link: (chunks) => (
                  <Link
                    href={{ pathname: "/host/manage", query: { id: property.id } }}
                    className="font-semibold text-brand-strong underline underline-offset-2"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            />
          </SectionCard>

          <DangerZone
            status={property.status}
            busy={statusBusy}
            onPause={() => setStatus("paused")}
            onReopen={() => setStatus("published")}
          />
        </div>
      </div>

      <SaveBar
        changed={diff.changed}
        labels={labels}
        blockers={diff.blockers}
        state={saveState}
        reviewable={diff.reviewable}
        errorText={error}
        onSave={save}
        onDiscard={() => {
          setListing(detail.listing);
          setSaveState("clean");
          setError(undefined);
        }}
      />
    </main>
  );
}

function Skeleton() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 px-6 pb-24 pt-6">
      <div className="skeleton h-14 rounded-(--radius-card)" />
      <div className="skeleton h-20 rounded-(--radius-card)" />
      <div className="skeleton h-64 rounded-(--radius-card)" />
      <div className="skeleton h-64 rounded-(--radius-card)" />
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  const t = useTranslations("host");
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <section className="flex flex-col items-start gap-3 rounded-(--radius-card) border border-line bg-surface px-6 py-10 shadow-(--shadow-card)">
        <h1 className="font-display text-lg font-semibold text-ink">{title}</h1>
        <p className="max-w-[60ch] text-sm text-body">{body}</p>
        <Button variant="secondary" onClick={() => window.history.back()}>
          {t("manage.back")}
        </Button>
      </section>
    </main>
  );
}
