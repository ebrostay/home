"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { loginUrl } from "@/lib/auth";

// One button, and this is why there is only one.
//
// This page briefly had a second, Microsoft-branded button that reached the
// Microsoft sign-in directly. It cannot be made to work (2026-07-31). Entra
// draws custom OIDC providers as an unbranded grey tile that no stylesheet can
// reach; domain_hint lands in Entra's built-in B2B federation rather than the
// tenant's provider, producing a #EXT# guest and no session; loginParameters is
// ignored; and a dedicated single-provider user flow cannot exist, because
// External ID requires every sign-up flow to keep an email method.
//
// So the provider choice belongs to Entra's hosted page and cannot be moved
// here. What this page still does is worth keeping: it is ours, it says where
// you are, and it is somewhere to send a signed-out visitor that is not a
// Microsoft URL. When Google is added it appears on that hosted page as a
// proper branded button — Google is a built-in provider, so it does not have
// the problem Microsoft has.
function Button() {
  const t = useTranslations("signIn");
  // Only same-origin paths: `redirect` arrives in a URL anyone can edit, and an
  // absolute URL in post_login_redirect_uri would make this an open redirect.
  const raw = useSearchParams().get("redirect") ?? "/";
  const back = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return (
    <a
      href={loginUrl(back)}
      className="mt-7 flex h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring)"
    >
      {t("continue")}
    </a>
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
