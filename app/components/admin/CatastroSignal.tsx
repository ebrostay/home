"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { lookupCadastre, type CadastreResult } from "@/lib/catastro";
import { formatDistance } from "@/lib/geocode";
import { readRegister, type ListingClaim, type RegisterReading } from "@/lib/review";
import type { Declined } from "@/lib/api";
import { Panel } from "./Panel";

// What the register says about the reference the owner typed, beside what the
// listing claims (ADR-027, spec §4.5).
//
// Asked LIVE, at review time, and stored nowhere. The only copy we could keep
// would be one the client reported — and a copy of a fact the Catastro already
// holds goes stale from the moment it is written. What the listing keeps is
// the reference, which is the question, not the answer.
//
// None of these four is a rejection on its own. The register goes stale, and
// an owner may simply be right; that is why they are never blocked from saving
// a reference the register disagrees with (ADR-027 decision 4b). They are what
// a reviewer looks at.

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "answered"; result: CadastreResult; reading: RegisterReading | null };

export function CatastroSignal({
  cadastralRef,
  claim,
  declined,
}: {
  cadastralRef: string | null;
  claim: ListingClaim;
  declined: Declined[];
}) {
  const t = useTranslations("admin.signals.catastro");
  const locale = useLocale();
  // Seeded from the prop rather than written by the effect: the panel is
  // already asking by the time it first paints, so there is no frame where it
  // claims to be idle. The review page keys this component on the reference,
  // so a different question mounts a different panel.
  const [state, setState] = useState<State>(
    cadastralRef ? { kind: "loading" } : { kind: "idle" },
  );

  useEffect(() => {
    if (!cadastralRef) return;
    const controller = new AbortController();

    lookupCadastre(cadastralRef, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "answered",
          result,
          reading:
            result.kind === "found"
              ? readRegister(result.record, claim)
              : null,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ kind: "answered", result: { kind: "error" }, reading: null });
        }
      });

    return () => controller.abort();
    // The reference is the question. The claim travels with it and changes
    // only when the listing does, which on this page means never.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadastralRef]);

  if (!cadastralRef) {
    return (
      <Panel title={t("title")} note={t("note")}>
        <p className="text-xs text-muted">{t("noReference")}</p>
      </Panel>
    );
  }

  return (
    <Panel title={t("title")} note={t("note")}>
      <p className="data mb-3 text-[0.6875rem] tracking-wide text-muted">
        {cadastralRef}
      </p>

      {state.kind !== "answered" && (
        <p className="text-xs text-muted">{t("asking")}</p>
      )}

      {/* Three different things to say, never one empty state: the service
          did not answer, the register has no such property, and here is what
          it says are three different sentences to a reviewer. */}
      {state.kind === "answered" && state.result.kind === "error" && (
        <p className="text-xs text-warn">{t("unavailable")}</p>
      )}

      {state.kind === "answered" && state.result.kind === "notFound" && (
        <p className="text-xs text-danger">{t("notFound")}</p>
      )}

      {state.kind === "answered" && state.reading && (
        <dl className="divide-y divide-line">
          {/* The strongest of the four, and the reviewer's job rather than the
              owner's: a reference resolving to Comercial or
              Almacén-Estacionamiento is probably not a home. Deliberately not
              warned about in the editor, where a legitimately reclassified
              property would be nagged on every visit. */}
          <Line
            label={t("use")}
            register={state.reading.use ?? "—"}
            claim={null}
            agrees={state.reading.isResidential}
          />
          <Line
            label={t("size")}
            register={state.reading.size.register ?? "—"}
            claim={state.reading.size.claim}
            agrees={state.reading.size.agrees}
          />
          <Line
            label={t("postcode")}
            register={state.reading.postcode.register ?? "—"}
            claim={state.reading.postcode.claim}
            agrees={state.reading.postcode.agrees}
          />
          <Line
            label={t("position")}
            register={
              state.reading.position.metres === null
                ? "—"
                : t("fromPin", {
                    distance: formatDistance(state.reading.position.metres, locale),
                  })
            }
            claim={null}
            agrees={state.reading.position.agrees}
          />
        </dl>
      )}

      {/* Context, never a resolution and never evidence (§4.5). It records
          that a dismissal happened, not that the owner was right — and it
          suppresses nothing above: the comparison is computed from the live
          answer whether or not anything was declined. */}
      {declined.length > 0 && (
        <ul className="mt-3 space-y-1">
          {declined.map((d, i) => (
            <li key={i} className="text-[0.6875rem] text-muted">
              {t("declined", { field: t(`field.${d.field}` as "field.pin"), at: d.at })}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Line({
  label,
  register,
  claim,
  agrees,
}: {
  label: string;
  register: string;
  claim: string | null;
  /** null means the comparison could not be made — a third state, and never
   *  rendered as agreement. */
  agrees: boolean | null;
}) {
  const t = useTranslations("admin.signals.catastro");

  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="data text-[0.5625rem] uppercase tracking-[0.14em] text-muted">
        {label}
      </dt>
      <dd className="flex items-baseline gap-2 text-right text-xs">
        <span className="text-ink">{register}</span>
        {claim && (
          <span className="text-muted">
            {t("versus")} <span className="data">{claim}</span>
          </span>
        )}
        {/* The dot is the glance; the word behind it is what a screen reader
            reads, because a coloured circle says nothing out loud. */}
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            agrees === null ? "bg-line-strong" : agrees ? "bg-ok" : "bg-danger"
          }`}
        >
          <span className="sr-only">
            {t(agrees === null ? "unknown" : agrees ? "agrees" : "differs")}
          </span>
        </span>
      </dd>
    </div>
  );
}
