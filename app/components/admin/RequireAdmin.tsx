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
//   admin, but      → a plain panel carrying `auth.deactivated` — the site's
//   deactivated       ONE sentence for this fact, the same one the header menu
//                     and the account page show, deliberately not a second
//                     wording invented here. `RequireActiveAsync` refuses a
//                     deactivated principal before anything else (§3.7), so
//                     this session fails every admin call exactly like the
//                     closing one, and rendering the console left the person
//                     reading "could not be read. Reload the page." on all
//                     nine panels, with reloading unable to help.
//
//                     It promises nothing about getting the console back:
//                     nothing this person can press does that. Deactivation is
//                     admin-imposed and only an admin lifts it, which is why
//                     the sentence ends in "contact us" rather than in a link.
//
// Deactivation is checked FIRST, and the order is the decision. It is the
// stronger, admin-imposed state, and it is the one the API refuses on first —
// so an admin who is both deactivated and closing must get this panel and not
// the closing one, whose promise that cancelling "brings the console back"
// would be false for them: deactivation would still refuse every call.
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations("admin.gate");
  // The deactivation sentence is shared with the header menu and `/account`
  // (§8): one fact about the account, told once, in one form of words.
  const tAuth = useTranslations("auth");

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

  // Deactivation first — see the block comment above. It is the state the API
  // refuses on before it looks at anything else, so it is also the state this
  // gate must name first, whatever else is true of the account.
  if (me.isDeactivated) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-ink">{t("deactivatedTitle")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-body">{tAuth("deactivated")}</p>
      </main>
    );
  }

  // Order matters (see the block comment above): deactivation wins, so this
  // only fires for an admin who is closing and NOT also deactivated. The
  // second clause is redundant with the branch above and kept anyway — it is
  // what the promise in `closingBody` depends on, and it should not be
  // possible to break by moving a block.
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
