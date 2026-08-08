"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { useAuth } from "@/components/site/AuthProvider";
import { currentPath, signInPath } from "@/lib/auth";

// The gate on every admin route — the sibling of `host/RequireOwner`, and
// like it, NOT the authorization boundary. That is `RequireAdminAsync` in the
// C# functions (§3.5): this component hides a page, the functions refuse the
// data, and only the second one matters.
//
// Three different answers, deliberately:
//
//   signed out      → sign in, keeping the locale and the destination, so the
//                     round trip ends where it started.
//   signed in, not  → a plain panel that says so. NOT a redirect: the person
//   an admin          most likely to see this is an admin who signed in
//                     through the OTHER door (§3.1 — two doors mint two
//                     identities), and bouncing them to a login they have
//                     already completed reads as a broken site rather than as
//                     the answer, which is "this account is not the one the
//                     role was granted to".
//   admin, but      → a plain panel, same reasoning as above: `RequireAdminAsync`
//   closing            now layers on `RequireWritableAsync` (§3.7 as amended),
//                     so a closing admin's session is genuinely an admin
//                     session — the console must not silently render and then
//                     fail nine times. It points at `/account`, where the
//                     closure can be cancelled, and says so: cancelling is
//                     what puts the console back (pinned by
//                     `CancellingGivesTheAdminSurfaceBack` on the API side).
//
// Deliberately NOT a fourth answer for `me.isDeactivated`: that flag gates
// nothing here today (AuthMenu renders the same "Admin panel" link either
// way, only adding a passive banner), and deactivation is the STRONGER,
// admin-imposed state — `RequireActiveAsync` refuses it before the closure
// check ever runs. Showing the closing panel to an admin who is also
// deactivated would promise that cancelling the closure "brings the console
// back", which would be false for them: deactivation would still refuse
// every call. So the closing panel only fires when deactivation is not also
// in play, leaving the deactivated case exactly as unchanged as this
// component already leaves it — a pre-existing gap, not one this change
// should paper over with an incorrect promise.
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations("admin.gate");

  useEffect(() => {
    if (!loading && !me.authenticated) router.replace(signInPath(currentPath()));
  }, [loading, me.authenticated, router]);

  if (loading || !me.authenticated) {
    return (
      <main aria-busy="true" className="mx-auto max-w-7xl px-6 pt-6">
        <div className="skeleton h-40 rounded-(--radius-card)" />
      </main>
    );
  }

  if (!me.isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-body">{t("body")}</p>
        <p className="mt-6 text-xs text-muted">
          {t("signedInAs")}{" "}
          <span className="data text-body">{me.name ?? me.userId}</span>
        </p>
      </main>
    );
  }

  // Order matters (see the block comment above): deactivation wins, so this
  // only fires for an admin who is closing and NOT also deactivated.
  if (me.deletionRequestedAt && !me.isDeactivated) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-ink">{t("closingTitle")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-body">{t("closingBody")}</p>
        <p className="mt-6 text-sm">
          <Link
            href="/account"
            className="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-line-strong"
          >
            {t("closingLink")}
          </Link>
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
