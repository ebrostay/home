"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/site/AuthProvider";
import { currentPath, signInPath } from "@/lib/auth";

// The owner's working routes — new, edit, manage — are useless without a
// session, so a signed-out visitor is sent to sign in and brought back.
//
// This is in the app rather than in staticwebapp.config.json on purpose. The
// platform's allowedRoles produces a 401, and responseOverrides.401 is a
// SINGLE GLOBAL TARGET: it sent every English visitor to /es/sign-in/ and
// dropped the destination on the floor. Here the locale is whatever the
// visitor is already reading and the destination round-trips.
//
// It is NOT the authorization boundary. That is the C# functions, which read
// x-ms-client-principal and 401 a stranger regardless of what this renders.
export function RequireOwner({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();

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

  return <>{children}</>;
}
