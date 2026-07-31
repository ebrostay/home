"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/components/site/AuthProvider";
import { loginUrl } from "@/lib/auth";

// One button, and one is all there can be.
//
// This page briefly had a second, Microsoft-branded button that reached the
// Microsoft sign-in directly. It cannot be made to work (2026-07-31): Entra
// draws custom OIDC providers as an unbrandable tile, domain_hint resolves to
// the wrong federation, and a single-provider user flow cannot exist. The
// provider choice lives on Entra's hosted page.
//
// What was verified instead (2026-08-01) is that the hosted page handles
// Microsoft accounts on its own: an address Entra recognises as a Microsoft
// account is handed to login.live.com at sign-in with no password asked,
// while a known local account always gets the password prompt — the local
// account wins, so the routing is deterministic and cannot duplicate users.
// The METHODS line below exists to say so, because nothing else on either
// page does.
function Button() {
  const t = useTranslations("signIn");
  const locale = useLocale();
  const { me, loading } = useAuth();

  // Only same-origin paths: `redirect` arrives in a URL anyone can edit, and
  // an absolute URL in post_login_redirect_uri would make this an open
  // redirect.
  const raw = useSearchParams().get("redirect") ?? "/";
  let back = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  // A target pointing back at this page would land a signed-in visitor right
  // here again — which is exactly what happened when the header's own Sign in
  // button was pressed on this page (Test A, 2026-08-01). Send it home, and
  // resolve "/" ourselves: the platform's /-to-locale redirect only exists on
  // SWA, not on the dev server.
  if (back === "/" || back.includes("/sign-in")) back = `/${locale}/`;

  // Already signed in? Nothing here to do — forward to where they were going.
  // Before this guard the page showed a stale "Continue" to signed-in
  // visitors, which read as the login having failed.
  useEffect(() => {
    if (!loading && me.authenticated) window.location.replace(back);
  }, [loading, me.authenticated, back]);

  if (loading || me.authenticated) return <div className="mt-7 h-11" />;

  return (
    <>
      <a
        href={loginUrl(back)}
        className="mt-7 flex h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring)"
      >
        {t("continue")}
      </a>
      <p className="mt-4 text-xs leading-relaxed text-muted">{t("methods")}</p>
    </>
  );
}

// useSearchParams needs a Suspense boundary to prerender under output:"export".
// The fallback matches the button's height so the card does not resize.
export function Choices() {
  return (
    <Suspense fallback={<div className="mt-7 h-11" />}>
      <Button />
    </Suspense>
  );
}
