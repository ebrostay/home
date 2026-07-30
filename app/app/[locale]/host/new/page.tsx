"use client";

// Add a property — how a listing comes into existence (ADR-030).
// URL: /{locale}/host/new, plus ?id= to resume a draft from the portfolio.
//
// It is not a form. It is one question per screen, in the order a host can
// answer them: where it is → what is around it → what it is → what it looks
// like → how you'd describe it → what it comes with → what it costs → your
// rules → the paperwork.
//
// **The wizard owns no fields.** Every step but the last wraps a component the
// editor already uses, over ONE draft `HostListing` plus its pricing and its
// blocks — which is the shape those components were written for, and said so
// in their own comments before this page existed. A create form with its own
// fields would be a second place to spell the geocoder's proposal-not-
// overwrite rule, the cadastral tri-state, the sequential uploader and the
// English approval gate; two spellings of one rule diverge on the first bug
// fixed in only one of them.
//
// The document is created on leaving step 1, because photo uploads are live
// writes that need a real id, and because "saved as you go" has to be true
// before an owner has typed enough to mind losing it.

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ApiError,
  createHostProperty,
  fetchHostProperty,
  fetchProperties,
  saveHostAvailability,
  saveHostDeclined,
  saveHostListing,
  saveHostPricing,
  submitHostProperty,
  type Declined,
  type HostPricing,
  type HostProperty,
  type HostPropertyDetail,
  type HostListing,
  type HostPhoto,
  type HostRange,
  type PropertySummary,
} from "@/lib/api";
import { stamped, withDecline } from "@/lib/declined";
import { adoptNearbyIds, changedSections, richTextError } from "@/lib/listing";
import { blocksDirty, isOwnerBlock, priceBandFor, pricingDirty } from "@/lib/manage";
import {
  CREATES_DRAFT,
  SKIPPABLE,
  STEPS,
  STEP_OF,
  attentionSteps,
  blankListing,
  blankPricing,
  clampStep,
  progressAt,
  stepBlockers,
  submitBlockers,
  type StepKey,
} from "@/lib/wizard";
import { SectionNav, type SectionStatus } from "@/components/host/SectionNav";
import { usePublishedBarHeight } from "@/components/host/manage/ContextBar";
import { StepCard } from "@/components/host/new/StepCard";
import { StepFooter, type SaveState } from "@/components/host/new/StepFooter";
import { PayoutCard } from "@/components/host/new/PayoutCard";
import { PaperworkStep } from "@/components/host/new/PaperworkStep";
import { SentPanel } from "@/components/host/new/SentPanel";
import { AddressFields } from "@/components/host/fields/AddressFields";
import { NearbyEditor } from "@/components/host/fields/NearbyEditor";
import { BasicsFields } from "@/components/host/fields/BasicsFields";
import { PhotoManager } from "@/components/host/fields/PhotoManager";
import { DescriptionFields } from "@/components/host/fields/DescriptionFields";
import { AmenityPicker } from "@/components/host/fields/AmenityPicker";
import { PricingFields } from "@/components/host/fields/PricingFields";
import { AvailabilityEditor } from "@/components/host/fields/AvailabilityEditor";
import { RulesFields } from "@/components/host/fields/RulesFields";

/** The width at which this page has a left column, as a media query for the
 *  nav. Must equal the `min-[64rem]:` on the grid below — the same pairing the
 *  editor keeps, and for the same reason: two spellings of one decision, kept
 *  in one file so they cannot drift. */
const RAIL_QUERY = "(min-width: 64rem)";

/** What the page holds that the API owns. Null until the draft exists — which
 *  is the whole first step, and the reason this is not one `detail` object. */
type Saved = {
  property: HostProperty;
  listing: HostListing;
  pricing: HostPricing;
  blocks: HostRange[];
};

export default function NewPropertyPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <NewPropertyContent />
    </Suspense>
  );
}

function NewPropertyContent() {
  const tn = useTranslations("host.new");
  const locale = useLocale();
  const router = useRouter();
  const resumeId = useSearchParams().get("id") ?? "";

  const [step, setStep] = useState(0);
  // How far the owner has been. A step they have never seen must not wear an
  // amber disc for something they were never asked — "needs attention" is a
  // report about work, not a prediction of it.
  const [reached, setReached] = useState(0);
  const [sent, setSent] = useState(false);

  // The working draft. Everything on screen reads from these four.
  const [listing, setListing] = useState<HostListing>(blankListing);
  const [pricing, setPricing] = useState<HostPricing>(blankPricing);
  const [blocks, setBlocks] = useState<HostRange[]>([]);
  // Outside `listing`, and therefore outside every diff below: dismissing a
  // suggestion is not an unsaved change (ADR-027 decision 5). It applies live.
  const [declined, setDeclined] = useState<Declined[]>([]);

  // What the server last confirmed, or null while the draft is still local.
  const [saved, setSaved] = useState<Saved | null>(null);
  const [published, setPublished] = useState<PropertySummary[]>([]);
  const [save, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(!!resumeId);
  const [now] = useState(() => new Date());

  const message = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? (err.code ?? "generic") : "generic";
      return tn.has(`error.${code}`)
        ? tn(`error.${code}` as "error.generic")
        : tn("error.generic");
    },
    [tn],
  );

  // The comparables feed the rent hint. A failure there costs a sentence,
  // never the page — so it resolves to an empty list rather than rejecting.
  useEffect(() => {
    let cancelled = false;
    fetchProperties()
      .catch(() => [] as PropertySummary[])
      .then((rows) => {
        if (!cancelled) setPublished(rows);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Resuming: the portfolio's Draft row points back here with its id, and an
  // owner returns to the step they left rather than to step one.
  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;

    fetchHostProperty(resumeId)
      .then((detail) => {
        if (cancelled) return;
        // Only an unfinished listing is resumable here. Anything else belongs
        // to the editor — this page's Send button would offer a transition the
        // API refuses, and its "DRAFT" pill would be describing a live home.
        if (detail.property.status !== "draft" && detail.property.status !== "rejected") {
          router.replace({ pathname: "/host/edit", query: { id: resumeId } });
          return;
        }
        const own = detail.property.availability.filter(isOwnerBlock);
        setListing(detail.listing);
        setPricing(detail.pricing);
        setBlocks(own);
        setDeclined(detail.declined ?? []);
        setSaved({
          property: detail.property,
          listing: detail.listing,
          pricing: detail.pricing,
          blocks: own,
        });
        // Where they left off, not step one: a draft is resumed, not restarted.
        const at = firstUnfinished(detail);
        setStep(at);
        setReached(at);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(message(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resumeId, message, router]);

  const key = STEPS[step];
  const progress = progressAt(step);
  const blockers = useMemo(() => submitBlockers(listing, pricing), [listing, pricing]);
  const attention = useMemo(() => attentionSteps(blockers), [blockers]);
  const stepBlocked = stepBlockers(key, listing, pricing);
  const last = step === STEPS.length - 1;
  // What stops the primary button, whichever button it is. On the last step it
  // is Send, and Send answers to the SUBMIT list, not to the step's own —
  // paperwork gates nothing, so without this the button would be live with
  // seven things outstanding and do nothing at all when pressed. One missing
  // thing is named; several become a count, because a footer naming only the
  // first reads as a one-item list.
  const gate = last
    ? blockers.length > 0
      ? tn("remaining", { count: blockers.length })
      : undefined
    : stepBlocked.length > 1
      ? tn("requiredCount", { count: stepBlocked.length })
      : stepBlocked.length === 1
        ? tn(`blocked.${stepBlocked[0]}` as "blocked.street")
        : undefined;
  // What THIS step still owes submit, beyond what gates Continue. Blocking
  // belongs at submit (ADR-030 Decision 4) — but an owner should not have to
  // reach the last step to learn the description still wants its English, or
  // the address its zone. Continue stays live; the count does not.
  const pending =
    !last && !gate
      ? blockers.filter((b) => STEP_OF[b.key] === key).length
      : 0;

  const band = useMemo(
    () => priceBandFor(published, { id: saved?.property.id ?? "", bedrooms: listing.bedrooms }),
    [published, saved, listing.bedrooms],
  );

  const holds = saved?.property.availability.filter((r) => !isOwnerBlock(r)) ?? [];

  // ── Persistence ─────────────────────────────────────────────────────────
  // On leaving a step, not on every keystroke. A content PUT re-measures every
  // nearby entry when the pin has moved (ADR-028) and is the call that takes
  // an approved listing back into review — fired per keystroke it would be
  // both. What travels is whatever differs from the saved baseline, computed
  // by the same three helpers Manage and the editor already use.
  //
  // Returns false when the write failed, and the caller stays put: a wizard
  // that advances past a save it did not make is one that loses a step's work
  // silently.
  const persist = useCallback(async (): Promise<boolean> => {
    // Nothing to save until the address step has enough to create a document.
    if (!saved && stepBlockers(CREATES_DRAFT, listing, pricing).length > 0) return true;

    setSaveState("saving");
    try {
      let base = saved;
      if (!base) {
        const created = await createHostProperty();
        base = {
          property: created.property,
          listing: created.listing,
          pricing: created.pricing,
          blocks: [],
        };
        // The API owns these two: they are policy, not this listing's to set,
        // and the blanks the page has been showing are placeholders for them.
        setPricing((p) => ({
          ...p,
          maxStayMonths: created.pricing.maxStayMonths,
          platformCleaningFeeEur: created.pricing.platformCleaningFeeEur,
        }));
      }

      const id = base.property.id;
      let property = base.property;
      let nextListing = base.listing;
      let nextPricing = base.pricing;
      let nextBlocks = base.blocks;

      if (changedSections(listing, base.listing).length > 0) {
        // Same pre-empt as the editor's own `save()`: judged from the form
        // itself, before the round trip, wherever the answer is already
        // knowable. Thrown rather than returned so the catch below — which
        // already turns an `ApiError` into a translated message — handles it
        // with no second error surface.
        const copyError = richTextError(listing);
        if (copyError) throw new ApiError(400, copyError);
        const sent = listing;
        const result = await saveHostListing(id, listing);
        property = result.property;
        nextListing = result.listing;

        // Take back the ids the server just minted for places added in this
        // save. Without this the form keeps `NearbyEditor`'s temporary
        // `local-…` ids, sends them again next time, and the server — which
        // matches entries by id — treats every place as new: fresh ids,
        // discarded reach measurements, and a full round of metered routing
        // calls, on every save for the rest of the session.
        //
        // Functional, and only the ids: `persist` fires on leaving a step, so
        // the owner can have typed during the round trip, and replacing the
        // form with the server's copy (as the editor's own `save` does, where
        // there is no wizard step to leave) would throw that away. `sent` is
        // captured above rather than read here for the same reason — the
        // mapping is positional against what was actually sent.
        setListing((l) => adoptNearbyIds(l, sent, result.listing));
      }
      if (pricingDirty(pricing, base.pricing)) {
        nextPricing = await saveHostPricing(id, {
          priceNumber: pricing.priceNumber,
          depositAmount: pricing.depositAmount,
          billsPolicy: pricing.billsPolicy,
          utilitiesCapEur: pricing.utilitiesCapEur,
          minStayMonths: pricing.minStayMonths,
          cleaningBy: pricing.cleaningBy,
          cleaningFeeEur: pricing.cleaningFeeEur,
          turnoverDays: pricing.turnoverDays,
        });
      }
      if (blocksDirty(blocks, base.blocks)) {
        const stored = await saveHostAvailability(
          id,
          blocks.map((b) => ({ start: b.start, end: b.end, note: b.note })),
        );
        nextBlocks = stored.filter(isOwnerBlock);
        property = { ...property, availability: stored };
        setBlocks(nextBlocks);
      }

      setSaved({ property, listing: nextListing, pricing: nextPricing, blocks: nextBlocks });
      setSaveState("saved");
      setError(undefined);
      return true;
    } catch (err) {
      setError(message(err));
      setSaveState("error");
      return false;
    }
  }, [saved, listing, pricing, blocks, message]);

  const go = async (next: number) => {
    const target = clampStep(next);
    if (target === step) return;
    // Going back never needs a write to succeed first — the draft in memory is
    // still the draft, and refusing to move would trap an owner on a step
    // whose save is failing for a reason they can only fix by leaving it.
    if (target < step) {
      setStep(target);
      return;
    }
    // Forward past step one needs a document, because every later step writes
    // to one — photos most literally.
    if (!saved && stepBlockers(CREATES_DRAFT, listing, pricing).length > 0) {
      setStep(0);
      return;
    }
    if (!(await persist())) return;
    setStep(target);
    setReached((r) => Math.max(r, target));
  };

  const submit = async () => {
    if (!saved || blockers.length > 0) return;
    if (!(await persist())) return;
    setSaveState("saving");
    try {
      await submitHostProperty(saved.property.id);
      setSent(true);
      setSaveState("saved");
      setError(undefined);
    } catch (err) {
      setError(message(err));
      setSaveState("error");
    }
  };

  const exit = async () => {
    await persist();
    router.push("/host");
  };

  // A finished upload is already stored, so it lands in BOTH the working copy
  // and the saved baseline — into the working copy alone it would read as an
  // unsaved change to a photo the server already has. Only what the upload
  // ADDED, appended: taking the server's list wholesale would undo a reorder
  // made while the transfer was in flight.
  //
  // `before` is computed fresh inside each updater, off that updater's own
  // previous-state argument, not off `saved`/`listing` as closed over when
  // this callback was created. This fires after an `await`, with no render
  // guaranteed between two uploads finishing back to back; a `before`
  // computed once outside the updaters would make the second call filter
  // `stored` (the server's FULL list) against a snapshot that does not yet
  // include what the first call just added, and append that photo a second
  // time — duplicated in the working listing and the saved baseline alike,
  // surviving a Save. Recomputing inside each updater means the second call
  // sees the first call's result and filters it back out.
  //
  // `setListing` runs unconditionally where `setSaved` no-ops while `s` is
  // null. That's safe, not merely convenient: `listing`'s own type has no
  // "draft not created yet" case (it defaults to `blankListing`, never
  // null), and `PhotoManager` cannot fire an upload before the document
  // exists — this page creates it on leaving step 1 specifically because
  // uploads are live writes that need a real id (see the file banner). So by
  // the time `stored` can exist at all, `saved` is already non-null; the
  // `!s` branch here is defensive, not a path this reaches in practice.
  const photosUploaded = (stored: HostPhoto[]) => {
    setListing((l) => {
      const before = new Set(l.photos.map((p) => p.url));
      const added = stored.filter((p) => !before.has(p.url));
      return added.length === 0 ? l : { ...l, photos: [...l.photos, ...added] };
    });
    setSaved((s) => {
      if (!s) return s;
      const before = new Set(s.listing.photos.map((p) => p.url));
      const added = stored.filter((p) => !before.has(p.url));
      return added.length === 0
        ? s
        : { ...s, listing: { ...s.listing, photos: [...s.listing.photos, ...added] } };
    });
  };

  // "Keep mine". Applied on screen first and written after — a suggestion that
  // lingers for a round trip is one the owner will press again. Before the
  // draft exists there is nowhere to write it, and it simply applies locally.
  const decline = async (entry: Omit<Declined, "at">) => {
    const next = withDecline(declined, entry);
    const before = declined;
    setDeclined(stamped(declined, next, new Date().toISOString().slice(0, 10)));
    if (!saved) return;
    try {
      setDeclined(await saveHostDeclined(saved.property.id, next));
    } catch {
      setDeclined(before);
    }
  };

  if (loading) return <Skeleton />;

  const labels = Object.fromEntries(
    STEPS.map((k) => [k, tn(`step.${k}.name` as "step.address.name")]),
  ) as Record<StepKey, string>;

  const statuses = Object.fromEntries(
    STEPS.map((k, i) => [
      k,
      i === step
        ? "now"
        : // Amber only where the owner has been: a step nobody has seen is not
          // neglected, it is simply next.
          i <= reached && attention.has(k)
          ? "needs"
          : i < step
            ? "done"
            : "idle",
    ]),
  ) as Record<StepKey, SectionStatus>;

  return (
    <main
      className="mx-auto flex max-w-7xl flex-col gap-5 px-6 pb-20"
      style={
        {
          "--section-nav-top": "calc(var(--header-h) + var(--context-bar-h, 3.4375rem))",
        } as React.CSSProperties
      }
    >
      <DraftBar onExit={exit} busy={save === "saving"} sent={sent} />

      {sent ? (
        <SentPanel
          onAddAnother={() => {
            // A genuinely fresh draft, not a cleared form: the previous one is
            // a real document in the queue, and reusing its id would edit it.
            setSaved(null);
            setListing(blankListing());
            setPricing(blankPricing());
            setBlocks([]);
            setDeclined([]);
            setStep(0);
            setReached(0);
            setSaveState("idle");
            setSent(false);
          }}
        />
      ) : (
        <div className="grid items-start gap-9 min-[64rem]:grid-cols-[13rem_minmax(0,1fr)]">
          <SectionNav
            sections={STEPS}
            labels={labels}
            ariaLabel={tn("railLabel", { count: STEPS.length })}
            sheetLabel={tn("railLabel", { count: STEPS.length })}
            status={statuses}
            railQuery={RAIL_QUERY}
            railTop="calc(var(--header-h) + 4.5rem)"
            stickyTop="var(--section-nav-top)"
            onSelect={(k) => go(STEPS.indexOf(k))}
          />

          <div className="flex min-w-0 flex-col gap-5">
            <StepCard
              progress={progress}
              head={tn(`step.${key}.head` as "step.address.head")}
              lede={tn(`step.${key}.lede` as "step.address.lede")}
              why={tn(`step.${key}.why` as "step.address.why")}
              footer={
                <StepFooter
                  first={step === 0}
                  last={last}
                  skippable={SKIPPABLE.has(key)}
                  save={save}
                  errorText={error}
                  blocked={gate}
                  pending={pending > 0 ? tn("requiredCount", { count: pending }) : undefined}
                  onBack={() => go(step - 1)}
                  onSkip={() => go(step + 1)}
                  onNext={() => (last ? submit() : go(step + 1))}
                />
              }
            >
              <Step
                step={key}
                listing={listing}
                setListing={setListing}
                pricing={pricing}
                setPricing={setPricing}
                blocks={blocks}
                setBlocks={setBlocks}
                holds={holds}
                declined={declined}
                onDecline={decline}
                property={saved?.property ?? null}
                savedListing={saved?.listing ?? null}
                onUploaded={photosUploaded}
                band={band}
                locale={locale}
                now={now}
                blockers={blockers}
                onFix={(k) => go(STEPS.indexOf(k))}
              />
            </StepCard>

            {/* Dashed, because it is a promise about the process rather than a
                field. It sits below the card for the same reason. */}
            <p className="flex items-start gap-3 rounded-(--radius-card) border border-dashed border-line-strong px-[18px] py-3.5 text-[0.8125rem] leading-[1.5] text-body">
              <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              {tn("reassurance")}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

/** Where am I and how do I get out — the wizard's answer to the context bar.
 *  Not `ContextBar` itself: there is no listing to name, no state to report and
 *  nowhere to cross-link to. It publishes its height the same way, because the
 *  section nav parks under it and it wraps on a narrow window. */
function DraftBar({
  onExit,
  busy,
  sent,
}: {
  onExit: () => void;
  busy: boolean;
  /** Once it is in the queue there is no draft and nothing left to save —
   *  and a pill still reading DRAFT over a panel saying "sent for review"
   *  contradicts the page it sits on. The confirmation panel carries its own
   *  two ways out. */
  sent: boolean;
}) {
  const t = useTranslations("host");
  const tn = useTranslations("host.new");
  const bar = useRef<HTMLDivElement>(null);
  usePublishedBarHeight(bar);

  return (
    <div
      ref={bar}
      className="sticky top-(--header-h) z-[25] -mx-6 flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-6 py-2.5"
    >
      <Link
        href="/host"
        className="flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-body transition-colors duration-(--dur-standard) hover:text-ink"
      >
        {t("title")}
      </Link>
      <span aria-hidden className="text-line-strong max-[40rem]:hidden">
        /
      </span>
      <span className="text-[0.8125rem] font-semibold text-ink">{tn("title")}</span>

      {/* No status dot, unlike Manage and Edit: a draft has no live state to
          report. */}
      {!sent && (
        <span className="data rounded-full border border-line bg-surface px-2.5 py-1 text-[0.65625rem] tracking-[0.08em] text-muted max-[30rem]:hidden">
          {tn("draftPill")}
        </span>
      )}

      {!sent && (
        <div className="ml-auto">
          <button
            type="button"
            onClick={onExit}
            disabled={busy}
            className="flex h-[34px] shrink-0 items-center rounded-(--radius-control) border border-line bg-surface px-[13px] text-[0.8125rem] font-semibold text-ink transition-colors duration-(--dur-standard) hover:bg-page disabled:cursor-not-allowed disabled:opacity-45"
          >
            {tn("saveExit")}
          </button>
        </div>
      )}
    </div>
  );
}

/** The nine steps. Every one of them is a component that already ships, given
 *  the whole draft and handing the whole draft back. */
function Step({
  step,
  listing,
  setListing,
  pricing,
  setPricing,
  blocks,
  setBlocks,
  holds,
  declined,
  onDecline,
  property,
  savedListing,
  onUploaded,
  band,
  locale,
  now,
  blockers,
  onFix,
}: {
  step: StepKey;
  listing: HostListing;
  // A real Dispatch, not a plain "(value) => void": DescriptionFields needs
  // to call it with an updater function (see its own onChange comment for
  // why), and `listing`'s own useState<HostListing> setter is exactly that
  // already — this widens the prop type to match what is really passed in,
  // rather than narrowing what DescriptionFields can rely on.
  setListing: Dispatch<SetStateAction<HostListing>>;
  pricing: HostPricing;
  setPricing: (value: HostPricing) => void;
  blocks: HostRange[];
  setBlocks: (value: HostRange[]) => void;
  holds: HostRange[];
  declined: Declined[];
  onDecline: (entry: Omit<Declined, "at">) => void;
  property: HostProperty | null;
  savedListing: HostListing | null;
  onUploaded: (photos: HostPhoto[]) => void;
  band: ReturnType<typeof priceBandFor>;
  locale: string;
  now: Date;
  blockers: ReturnType<typeof submitBlockers>;
  onFix: (step: StepKey) => void;
}) {
  const tn = useTranslations("host.new");

  switch (step) {
    case "address":
      return (
        <AddressFields
          value={listing}
          onChange={setListing}
          declined={declined}
          onDecline={onDecline}
        />
      );

    case "nearby":
      return (
        <NearbyEditor
          value={listing.nearby}
          lat={listing.lat}
          lng={listing.lng}
          // Against the SAVED pin: every figure on these entries was measured
          // from the pin the server holds. On a draft with no saved pin yet
          // there is nothing to have moved.
          pinMoved={
            !!savedListing &&
            (listing.lat !== savedListing.lat || listing.lng !== savedListing.lng)
          }
          onChange={(nearby) => setListing({ ...listing, nearby })}
        />
      );

    case "basics":
      return <BasicsFields value={listing} onChange={setListing} />;

    case "photos":
      // The draft exists by now — the address step made it — but the type does
      // not know that, and a placeholder id would upload bytes into nothing.
      return property ? (
        <PhotoManager
          value={listing}
          onChange={setListing}
          propertyId={property.id}
          onUploaded={onUploaded}
        />
      ) : (
        <p className="text-sm text-muted">{tn("needsAddressFirst")}</p>
      );

    case "description":
      // Same guard as photos: the draft exists by now (address created it),
      // but the type does not know that, and a placeholder id would try to
      // upload description photos into nothing.
      return property ? (
        <DescriptionFields
          value={listing}
          onChange={setListing}
          propertyId={property.id}
          onUploaded={onUploaded}
        />
      ) : (
        <p className="text-sm text-muted">{tn("needsAddressFirst")}</p>
      );

    case "amenities":
      return <AmenityPicker value={listing} onChange={setListing} />;

    case "pricing":
      return (
        <div className="flex flex-col gap-6">
          <PricingFields
            value={pricing}
            onChange={(next) => setPricing({ ...pricing, ...next })}
            band={band}
            maxStayMonths={pricing.maxStayMonths}
            platformCleaningFeeEur={pricing.platformCleaningFeeEur}
            locale={locale}
          />
          <PayoutCard
            price={pricing.priceNumber}
            cleaningBy={pricing.cleaningBy}
            cleaningFeeEur={pricing.cleaningFeeEur}
            locale={locale}
          />
          <AvailabilityEditor
            blocks={blocks}
            holds={holds}
            availableFrom={property?.availableFrom ?? null}
            turnoverDays={pricing.turnoverDays}
            onChange={setBlocks}
            locale={locale}
            now={now}
          />
        </div>
      );

    case "rules":
      return <RulesFields value={listing} onChange={setListing} />;

    case "paperwork":
      return (
        <div className="flex flex-col gap-5">
          <PaperworkStep />
          <Remaining blockers={blockers} onFix={onFix} />
        </div>
      );
  }
}

/** What still stands between this draft and the review queue, on the step that
 *  has the Send button. Each one is a button back to the step that owns it —
 *  a list of complaints you cannot act on is a worse version of a modal. */
function Remaining({
  blockers,
  onFix,
}: {
  blockers: ReturnType<typeof submitBlockers>;
  onFix: (step: StepKey) => void;
}) {
  const tn = useTranslations("host.new");
  const tb = useTranslations("host.blocker");

  if (blockers.length === 0) {
    return <p className="text-[0.8125rem] text-brand-strong">{tn("readyToSend")}</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* The bullets beside each line carry the amber; this heading does not.
          `--warn` cannot reach 4.5:1 on any light-mode surface we have. */}
      <p className="data text-[0.65625rem] tracking-[0.1em] text-ink">
        {tn("remaining", { count: blockers.length })}
      </p>
      <ul className="flex list-none flex-col gap-1.5 p-0">
        {blockers.map((b) => (
          <li key={b.key}>
            <button
              type="button"
              onClick={() => onFix(STEP_OF[b.key])}
              className="flex items-center gap-2.5 text-left text-[0.8125rem] text-body transition-colors duration-(--dur-standard) hover:text-ink"
            >
              <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-warn" />
              {tb(b.key as "noPhotos")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The first step that is not finished — where a resumed draft reopens. */
function firstUnfinished(detail: HostPropertyDetail): number {
  const at = STEPS.findIndex(
    (k) => stepBlockers(k, detail.listing, detail.pricing).length > 0,
  );
  return at === -1 ? STEPS.length - 1 : at;
}

function Skeleton() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 px-6 pb-24 pt-6">
      <div className="skeleton h-14 rounded-(--radius-card)" />
      <div className="skeleton h-[28rem] rounded-(--radius-card)" />
    </main>
  );
}
