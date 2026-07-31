"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { loginUrl, PROVIDER, PROVIDER_MSA } from "@/lib/auth";

// The official four squares. Hard-coded rather than themed: a brand mark that
// shifts with our palette stops being the brand mark, and recognising it
// instantly is the entire reason this button beats Entra's grey placeholder.
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

function Buttons() {
  const t = useTranslations("signIn");
  // Where to land afterwards. Only same-origin paths: `redirect` arrives in a
  // URL anyone can edit, and handing an absolute URL to post_login_redirect_uri
  // would turn this page into an open redirect.
  const raw = useSearchParams().get("redirect") ?? "/";
  const back = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return (
    <div className="mt-7 space-y-3">
      <a
        href={loginUrl(back, PROVIDER)}
        className="flex h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring)"
      >
        {t("email")}
      </a>

      {/* Not a decorative divider: it says these are two ways into the same
          account, not two different accounts. */}
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-line" />
        {/* Lower case, and no letter-spacing. The site's mono voice is
            uppercase and tracked, but Spanish's "o" alone becomes a tracked
            capital O, which at this size is a zero. */}
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
// The fallback matches the buttons' height so the card does not resize when it
// swaps in.
export function Choices() {
  return (
    <Suspense fallback={<div className="mt-7 h-[9.25rem]" />}>
      <Buttons />
    </Suspense>
  );
}
