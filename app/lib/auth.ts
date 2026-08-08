// SWA built-in auth client (spec §3.1/§3.6). /.auth/* is ALWAYS same-origin
// on the SWA platform (never the func-host base), so those links are relative.
// GET /api/me goes through the API base like every other call.

export type Me = {
  authenticated: boolean;
  userId: string | null;
  name: string | null;
  provider: string | null;
  roles: string[];
  isAdmin: boolean;
  isDeactivated: boolean;
  deletionRequestedAt: string | null;
};

export const ANON: Me = {
  authenticated: false,
  userId: null,
  name: null,
  provider: null,
  roles: ["anonymous"],
  isAdmin: false,
  isDeactivated: false,
  deletionRequestedAt: null,
};

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function fetchMe(): Promise<Me> {
  try {
    const res = await fetch(`${BASE}/api/me`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return ANON;
    return (await res.json()) as Me;
  } catch {
    // dev without a func host, or offline → anonymous
    return ANON;
  }
}

// Two providers, two identity spaces — deliberately (ADR-036 as amended).
// Both names match keys under customOpenIdConnectProviders in
// public/staticwebapp.config.json — change one and you must change the other.
//
// PROVIDER goes through the Entra tenant: local accounts, the hosted page,
// and (once configured) Google. PROVIDER_MSA points SWA DIRECTLY at
// Microsoft's consumer endpoint — one hop to the live login, no Entra
// involved. The price, accepted explicitly on 2026-08-01: a person who uses
// both doors is two userIds, because each entry mints identity from its own
// issuer's tokens. Do not "fix" that by routing MSA through the tenant —
// every mechanism for doing so with a branded button is dead and documented
// in ADR-036.
export const PROVIDER = "ebrostay";
export const PROVIDER_MSA = "ebrostay-msa";

export function loginUrl(redirectTo: string, provider: string = PROVIDER): string {
  return `/.auth/login/${provider}?post_login_redirect_uri=${encodeURIComponent(redirectTo)}`;
}

// Our own sign-in page, which is where a signed-out person is sent — never
// straight to /.auth/login. It carries the destination so the round trip ends
// where it started.
export function signInPath(redirectTo?: string): string {
  return redirectTo ? `/sign-in?redirect=${encodeURIComponent(redirectTo)}` : "/sign-in";
}

export function logoutUrl(redirectTo: string): string {
  return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(redirectTo)}`;
}

// Current locale-prefixed path, for round-tripping the user back after auth.
export function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

// Where sign-out lands. It must be public: by the time the redirect is
// followed the browser holds no session, and every gated route answers 403
// rather than bouncing to login. Returning to currentPath() was the bug.
export function localeHome(locale: string): string {
  return `/${locale}/`;
}
