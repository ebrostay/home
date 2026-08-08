"use client";

// One listing under review (spec §4.5).
//
// The reviewer's question is "is this a real home, described honestly?", so
// the page puts the listing itself in the main column — every field, both
// languages, every photo — and the two signals in a rail beside it. Neither
// signal answers the question; they are what a person weighs before answering
// it themselves.
//
// URL: /{locale}/admin/review?id={id} — the query-param model every working
// surface uses, because `output: "export"` has no dynamic segments.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ApiError,
  approveProperty,
  biText,
  fetchAdminProperty,
  rejectProperty,
  type AdminPropertyDetail,
  type PublicNearbyEntry,
} from "@/lib/api";
import { formatEuro } from "@/lib/pricing";
import { Badge } from "@/components/ui/Badge";
import { RichText } from "@/components/ui/RichText";
import { AdminShell } from "@/components/admin/AdminShell";
import { BandSignal } from "@/components/admin/BandSignal";
import { CatastroSignal } from "@/components/admin/CatastroSignal";
import { DecisionBar, type Decision } from "@/components/admin/Decision";
import { PhotoSignal } from "@/components/admin/PhotoSignal";
import { STATUS_TONE } from "@/lib/admin";

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "ready"; detail: AdminPropertyDetail };

export default function AdminReviewPage() {
  return (
    <Suspense fallback={<AdminShell section="queue">{null}</AdminShell>}>
      <ReviewContent />
    </Suspense>
  );
}

function ReviewContent() {
  const t = useTranslations("admin.review");
  const te = useTranslations("admin.errors");
  const locale = useLocale();
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";

  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The reviewer's band tick (§4.5). Page-level rather than inside BandSignal
  // because it gates the Approve button in the bar, which is a sibling — and
  // deliberately NOT seeded from `band.approvedAt`: a listing that was
  // confirmed once and has come back for re-review is a fresh judgement, and
  // pre-ticking the box would answer for the reviewer.
  const [bandConfirmed, setBandConfirmed] = useState(false);

  useEffect(() => {
    // No id is not a load that failed — it is a URL with nothing in it, and
    // it is decided during render below rather than by writing state from an
    // effect that would then render twice to say so.
    if (!id) return;
    let live = true;
    fetchAdminProperty(id)
      .then((detail) => live && setState({ kind: "ready", detail }))
      .catch((err: unknown) => {
        if (!live) return;
        setState(
          err instanceof ApiError && err.status === 404
            ? { kind: "missing" }
            : { kind: "error" },
        );
      });
    return () => {
      live = false;
    };
  }, [id]);

  // Both decisions end the same way: back to the queue, which is the next
  // thing the reviewer wants and also the only view guaranteed to be correct
  // about what is still waiting.
  const decide = useCallback(
    async (decision: Decision, note?: string) => {
      setBusy(decision);
      setError(null);
      try {
        if (decision === "approve") await approveProperty(id, bandConfirmed);
        else await rejectProperty(id, note ?? "");
        router.push("/admin");
      } catch (err: unknown) {
        setBusy(null);
        const code = err instanceof ApiError ? err.code : undefined;
        // A stale write or a status that moved underneath us means someone
        // else decided first — the honest answer is "reload", never a retry
        // that would overwrite their decision.
        setError(te(code && KNOWN.includes(code) ? code : "generic"));
      }
    },
    [id, router, te],
  );

  const view: State = id ? state : { kind: "missing" };

  if (view.kind !== "ready") {
    return (
      <AdminShell section="queue">
        {view.kind === "loading" ? (
          <div aria-busy="true" className="skeleton mt-6 h-64 rounded-(--radius-card)" />
        ) : (
          <p className="mt-10 text-sm text-muted">
            {view.kind === "missing" ? t("missing") : t("error")}
          </p>
        )}
      </AdminShell>
    );
  }

  const detail = view.detail;
  const { property, listing, pricing, photos, owner, declined } = detail;

  return (
    <AdminShell section="queue">
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            {listing.name || t("untitled")}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {[listing.address, biText(listing.area, locale)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={STATUS_TONE[property.status]}>
            {t(`status.${property.status}` as "status.published")}
          </Badge>
          <Link
            href={`/host/edit?id=${encodeURIComponent(property.id)}`}
            className="text-xs font-semibold text-brand-strong underline-offset-4 hover:underline"
          >
            {t("edit")}
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-4">
            <Fact label={t("owner")}>
              {owner.name ?? "—"}
              {owner.isDeactivated && (
                <span className="ml-2 text-danger">{t("deactivated")}</span>
              )}
            </Fact>
            <Fact label={t("price")}>{formatEuro(pricing.priceNumber, locale)}</Fact>
            <Fact label={t("size")}>
              {listing.sizeM2 > 0 ? `${listing.sizeM2} m²` : "—"}
            </Fact>
            <Fact label={t("rooms")}>
              {listing.bedrooms} / {listing.bathrooms}
            </Fact>
          </dl>

          {/* Both languages, side by side. Spanish is the listing; English is
              a claim the owner has or has not stood behind (ADR-027), and the
              reviewer is the person who finds out which. */}
          <section className="mt-6 grid gap-6 sm:grid-cols-2">
            <Description
              lang="es"
              label={t("descriptionEs")}
              detail={view.detail}
            />
            <Description
              lang="en"
              label={t("descriptionEn")}
              detail={view.detail}
              flag={
                listing.descriptionEnApproved ? undefined : t("enNotApproved")
              }
            />
          </section>

          <section className="mt-6">
            <h3 className="data text-[0.625rem] uppercase tracking-[0.14em] text-muted">
              {t("photos", { n: photos.length })}
            </h3>
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p) => (
                <li key={p.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.cardUrl ?? p.url}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-(--radius-control) object-cover"
                  />
                  {p.isFloorplan && (
                    <span className="data absolute left-1 top-1 rounded-full bg-page/90 px-1.5 py-0.5 text-[0.5625rem] uppercase tracking-wider text-muted">
                      {t("floorplan")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {/* First in the column on purpose: it is the only panel here that
              can stop an approval, and the only one showing something no
              person has read yet. */}
          <BandSignal
            propertyId={id}
            band={detail.band}
            onBand={(band) =>
              setState({ kind: "ready", detail: { ...detail, band } })
            }
            confirmed={bandConfirmed}
            onConfirmed={setBandConfirmed}
          />
          <PhotoSignal
            photos={photos}
            pin={{ lat: listing.lat, lng: listing.lng }}
          />
          <CatastroSignal
            // Keyed on the reference: it is the question the panel asks, so a
            // different reference is a different panel, not the same one with
            // a stale answer still on screen.
            key={listing.cadastralRef ?? "none"}
            cadastralRef={listing.cadastralRef}
            claim={{
              postcode: listing.postcode,
              sizeM2: listing.sizeM2,
              pin: { lat: listing.lat, lng: listing.lng },
            }}
            declined={declined.filter((d) => d.source === "catastro")}
          />
        </aside>
      </div>

      <DecisionBar
        busy={busy}
        error={error}
        // Approve is blocked until there IS a band and a person has said it is
        // right. The API enforces both independently (`band_missing`,
        // `band_not_confirmed`) — this is the courtesy of saying so before the
        // press, not the control.
        blocked={
          !detail.band.hasBand
            ? "bandMissing"
            : !bandConfirmed
              ? "bandUnconfirmed"
              : null
        }
        onApprove={() => decide("approve")}
        onReject={(note) => decide("reject", note)}
      />
    </AdminShell>
  );
}

/** The API's stable error codes this page has copy for. Anything else falls
 *  through to the generic sentence rather than showing a machine string. */
const KNOWN = ["not_in_review", "not_reviewable", "note_required", "stale_write"];

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="data text-[0.5625rem] uppercase tracking-[0.14em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

function Description({
  lang,
  label,
  detail,
  flag,
}: {
  lang: "es" | "en";
  label: string;
  detail: AdminPropertyDetail;
  flag?: string;
}) {
  const { listing, photos } = detail;

  // The owner's own nearby entries, rendered through the visitor's component.
  // Their measurement is a single number, so it travels as a range with the
  // same value at both ends — the honest rendering of "measured from the
  // door", not a public range this listing never published.
  const nearby: PublicNearbyEntry[] = listing.nearby.map((n) => ({
    id: n.id,
    group: n.group,
    type: n.type,
    customType: n.customType,
    name: n.name,
    lat: n.lat,
    lng: n.lng,
    reach: Object.fromEntries(
      Object.entries(n.reach).map(([profile, r]) => [
        profile,
        { minMinutes: r!.minutes, maxMinutes: r!.minutes, metres: r!.metres },
      ]),
    ),
  }));

  return (
    <div>
      <h3 className="data flex items-center gap-2 text-[0.625rem] uppercase tracking-[0.14em] text-muted">
        {label}
        {flag && <span className="text-warn">{flag}</span>}
      </h3>
      <div className="mt-2 text-sm">
        <RichText
          doc={listing.description?.[lang] ?? null}
          photos={photos}
          nearby={nearby}
          profile="foot"
        />
      </div>
    </div>
  );
}
