"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/site/AuthProvider";
import { currentPath, signInPath } from "@/lib/auth";

// The gate on every admin route — the sibling of `host/RequireOwner`, and
// like it, NOT the authorization boundary. That is `RequireAdminAsync` in the
// C# functions (§3.5): this component hides a page, the functions refuse the
// data, and only the second one matters.
//
// Two different answers, deliberately:
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

  return <>{children}</>;
}
