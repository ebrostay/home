"use client";

// The page `AuthMenu` has linked to since the menu existed (§3.7). Three
// blocks, in the order a worried person reads them: who am I, what is
// happening to my account, and what can I do about my data.
//
// On the visual language, because two of these decisions carry meaning rather
// than taste:
//
//  - The closing state is RIVER, not amber or red. In this system river is
//    "informational, not your setting" (globals.css, and the suggested-pin
//    comment that spells it out). A closure request is exactly that: a state
//    we are holding for you until somebody writes to you, and one you can take
//    back with the button sitting next to it. An amber warn panel — the
//    treatment the listing DangerZone wears — would tell a calm truth in an
//    alarmed voice.
//  - The confirm button is INK, the system's word for "closed" (river = open,
//    green = yours, ink = occupied). Not `danger`: nothing is being destroyed
//    here, and a red button would be lying about that to make the moment feel
//    weightier than it is.
//
// The first two blocks are cards because they are about the person. The third
// is a hairline and some prose because it is housekeeping, and the hierarchy
// should say so before a word is read.

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/components/site/AuthProvider";
import { RequireSignedIn } from "@/components/account/RequireSignedIn";
import { requestAccountClosure, cancelAccountClosure } from "@/lib/api";
import { providerLabel, tableDate } from "@/lib/admin";
import { PROVIDER } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

const SUPPORT_EMAIL = "info@ebrostay.com";

export default function AccountPage() {
  return (
    <RequireSignedIn>
      <AccountBody />
    </RequireSignedIn>
  );
}

function AccountBody() {
  const t = useTranslations("account");
  const locale = useLocale();
  const { me, refresh } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Boolean(), not `!== null`: a fixture or an older API response that omits
  // the key entirely gives `undefined`, which `!== null` reads as "closing".
  const closing = Boolean(me.deletionRequestedAt);
  // Null when the timestamp is unreadable, and the line is dropped rather than
  // rendered with a dash — `tableDate` exists because one bad date from the
  // API took down a whole page on 2026-07-30, and this one is decoration
  // beside the sentence that actually matters.
  const requestedOn = tableDate(me.deletionRequestedAt, locale);

  // Whichever button currently carries this block's action — the trigger, the
  // confirm, or the undo. Exactly one of the three is mounted at a time, so
  // they share one id and "put focus back where the action is" is a single
  // move rather than three refs and a decision.
  const actionId = useId();

  // Every state change here REPLACES that button: the trigger becomes the
  // confirm, the confirm becomes the undo. Without this, focus falls to
  // <body> at each swap and a keyboard user has to tab from the top of the
  // document to reach a control they were never told had appeared — and
  // `disabled={busy}` blurs the pressed button mid-write on top of that.
  // The dialog this page deliberately does not use was providing this for
  // free; nothing else does. `NearbyEditor.focusAfterManualAdd` makes the
  // same move, the same way, for the same reason.
  //
  // A ref, not state: it must not cause a render, and — the part that matters
  // — it must not fire on mount. A page that took focus on load would drag a
  // reader past the identity block it opens with, to a button about leaving.
  const takeFocus = useRef(false);

  useEffect(() => {
    if (!takeFocus.current) return;
    takeFocus.current = false;
    document.getElementById(actionId)?.focus();
  });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
      await refresh();
      setConfirming(false);
    } catch {
      setFailed(true);
    } finally {
      // Both outcomes, and set here rather than in either branch: on success
      // the action button has been replaced by the next state's, and on
      // failure the same button comes back enabled with the alert underneath
      // it. Either way the person who pressed it is standing on it.
      takeFocus.current = true;
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl font-bold text-ink">{t("title")}</h1>

      {/* 1 — identity. A record, not a settings row: the initial is the same
          chip the header menu wears, so the page you land on looks like the
          control that sent you here, and the name gets the display face
          because on this page the person IS the subject. */}
      <section className="mt-8 rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card) sm:p-7">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-soft font-display text-lg font-bold text-brand-strong"
          >
            {(me.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="data text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
              {t("identity")}
            </p>
            <p className="mt-1 truncate font-display text-xl font-semibold text-ink">
              {me.name}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-4">
          <p className="data text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
            {t("provider")}
          </p>
          {/* The door's own name (§3.1), not the config key: nobody signed in
              with "ebrostay-msa", they pressed the Microsoft button. Same
              vocabulary the admin people table uses for the same fact. */}
          <p className="data text-sm text-body">
            {me.provider ? providerLabel(me.provider) : "—"}
          </p>
        </div>
      </section>

      {/* 2 — closure. `aria-live` because the write that changes this block
          changes it wholesale: after a successful request the heading, the
          date and the offer are all different, and the only other signal that
          anything happened is a focus move. Polite, not assertive — the person
          asked for this and is waiting for it; there is nothing to interrupt.
          The failure line below carries its own `role="alert"` and is
          therefore announced by that, not twice by this. */}
      <section
        aria-live="polite"
        className={`mt-6 rounded-(--radius-card) border p-6 sm:p-7 ${
          closing
            ? "border-river-deep/30 bg-river-soft"
            : "border-line bg-surface shadow-(--shadow-card)"
        }`}
      >
        {closing ? (
          <>
            <h2 className="text-lg font-semibold text-ink">{t("closingTitle")}</h2>
            {requestedOn && (
              <p className="mt-1.5 text-sm text-muted">
                {t("closingSince")}{" "}
                <span className="data text-river-deep">{requestedOn}</span>
              </p>
            )}
            <p className="mt-3 text-sm leading-relaxed text-body">{t("closingHelp")}</p>
            <Button
              id={actionId}
              variant="secondary"
              className="mt-5"
              disabled={busy}
              onClick={() => run(cancelAccountClosure)}
            >
              {t("closureUndo")}
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-ink">{t("closureTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-body">{t("closureHelp")}</p>
            {/* The confirm step happens in place, not in a modal. A dialog
                would take the sentence explaining what closure does off the
                screen at the exact moment it is being agreed to. */}
            {confirming ? (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button
                  id={actionId}
                  variant="ink"
                  disabled={busy}
                  onClick={() => run(requestAccountClosure)}
                >
                  {t("closureConfirm")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    takeFocus.current = true;
                    setConfirming(false);
                  }}
                >
                  {t("closureCancelConfirm")}
                </Button>
              </div>
            ) : (
              <Button
                id={actionId}
                variant="secondary"
                className="mt-5"
                onClick={() => {
                  takeFocus.current = true;
                  setConfirming(true);
                }}
              >
                {t("closureRequest")}
              </Button>
            )}
          </>
        )}
        {failed && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {t("error")}
          </p>
        )}
      </section>

      {/* 3 — data. The purge link is described as what it is: it revokes the
          sign-in connection and leaves the Ebrostay record alone. Calling it
          "delete my account" would be false, and this page is the one the
          privacy policy points at. A link, not a button, and no card around
          it: it hands you over to the identity platform, and it must not
          compete with the block above for the eye of somebody who came here
          meaning to leave. */}
      <section className="mt-10 border-t border-line pt-8">
        <h2 className="text-base font-semibold text-ink">{t("dataTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-body">{t("purgeHelp")}</p>
        <p className="mt-3">
          <a
            href={`/.auth/purge/${me.provider ?? PROVIDER}`}
            className="text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-line-strong"
          >
            {t("purge")}
          </a>
        </p>
        <p className="mt-6 text-sm text-muted">
          {t("support")}{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-line-strong"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </section>
    </main>
  );
}
