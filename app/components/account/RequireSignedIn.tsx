"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/site/AuthProvider";
import { currentPath, signInPath } from "@/lib/auth";

// The gate on /account — the third sibling of `admin/RequireAdmin` and
// `host/RequireOwner`, and like both of them NOT the authorization boundary
// (§3.5): the functions refuse the data, this only hides a page.
//
// Simpler than either sibling, because there is no second answer to give. Any
// signed-in person may see their own account; a signed-out one is sent to sign
// in, keeping the locale and the destination so the round trip ends here.
export function RequireSignedIn({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me.authenticated) router.replace(signInPath(currentPath()));
  }, [loading, me.authenticated, router]);

  if (loading || !me.authenticated) {
    return (
      <main aria-busy="true" className="mx-auto max-w-2xl px-6 pt-6">
        <div className="skeleton h-40 rounded-(--radius-card)" />
      </main>
    );
  }

  return <>{children}</>;
}
