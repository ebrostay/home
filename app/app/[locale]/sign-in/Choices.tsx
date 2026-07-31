"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/components/site/AuthProvider";
import { loginUrl, PROVIDER, PROVIDER_MSA } from "@/lib/auth";

// The official four squares. Hard-coded rather than themed: a brand mark that
// shifts with our palette stops being the brand mark, and instant recognition
// is the entire reason this button exists.
function MicrosoftMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="shrink-0">
      <rect x="0" y="0" width="7.2" height="7.2" fill="#f25022" />
      <rect x="8.8" y="0" width="7.2" height="7.2" fill="#7fba00" />
      <rect x="0" y="8.8" width="7.2" height="7.2" fill="#00a4ef" />
      <rect x="8.8" y="8.8" width="7.2" height="7.2" fill="#ffb900" />
    </svg>
  );
}

// Two buttons, two doors, two identity spaces — deliberately (ADR-036 as
// amended, 2026-08-01). Email goes through the Entra tenant: local accounts,
// the hosted page, Google once configured. Microsoft goes DIRECTLY to the
// consumer login in one hop, no Entra page in between — the accepted price is
// that the same person using both doors is two accounts. The divider is
// therefore honest this time: these are two ways in, not two skins over one.
function Buttons() {
  const t = useTranslations("signIn");
  const locale = useLocale();
  const { me, loading } = useAuth();

  // Only same-origin paths: `redirect` arrives in a URL anyone can edit, and
  // an absolute URL in post_login_redirect_uri would make this an open
  // redirect.
  const raw = useSearchParams().get("redirect") ?? "/";
  let back = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  // A target pointing back at this page would land a signed-in visitor right
  // here again. Send it home, and resolve "/" ourselves: the platform's
  // /-to-locale redirect only exists on SWA, not on the dev server.
  if (back === "/" || back.includes("/sign-in")) back = `/${locale}/`;

  // Already signed in? Nothing here to do — forward to where they were going.
  useEffect(() => {
    if (!loading && me.authenticated) window.location.replace(back);
  }, [loading, me.authenticated, back]);

  if (loading || me.authenticated) return <div className="mt-7 h-[9.25rem]" />;

  return (
    <div className="mt-7 space-y-3">
      <a
        href={loginUrl(back, PROVIDER)}
        className="flex h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring)"
      >
        {t("email")}
      </a>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-line" />
        {/* Lower case, no letter-spacing: the site's mono voice is uppercase
            and tracked, but Spanish's lone "o" becomes a tracked capital O,
            which at this size reads as a zero. */}
        <span className="data text-[0.6875rem] text-muted">{t("or")}</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <a
        href={loginUrl(back, PROVIDER_MSA)}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-(--radius-control) border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring)"
      >
        <MicrosoftMark />
        {t("microsoft")}
      </a>
    </div>
  );
}

// useSearchParams needs a Suspense boundary to prerender under output:"export".
// The fallback matches the buttons' height so the card does not resize.
export function Choices() {
  return (
    <Suspense fallback={<div className="mt-7 h-[9.25rem]" />}>
      <Buttons />
    </Suspense>
  );
}
