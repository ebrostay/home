// SWA built-in auth client (spec-v2 §3.1/§3.6). /.auth/* is ALWAYS same-origin
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
};

export const ANON: Me = {
  authenticated: false,
  userId: null,
  name: null,
  provider: null,
  roles: ["anonymous"],
  isAdmin: false,
  isDeactivated: false,
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

// Two entries, one tenant. Both names match keys under
// customOpenIdConnectProviders in public/staticwebapp.config.json — change one
// and you must change the other.
//
// PROVIDER is the plain route: it opens Entra's hosted page, which since the
// Microsoft provider was taken out of the user flow offers email and password
// only. PROVIDER_MSA is the same endpoint and the same credentials, and
// differs solely in carrying domain_hint=login.live.com, which sends the
// browser past that page straight to the Microsoft account sign-in.
//
// The hint value is the HOST of the provider's Issuer URI. `live.com` also
// reaches a Microsoft page, but through Entra's built-in MSA federation — a
// different client, and a redirect URI that is not registered in an external
// tenant, so it dies with invalid_request. It looks close enough to working
// to cost an afternoon.
//
// Verified 2026-07-31: the hint still resolves even though the provider is no
// longer listed in the user flow. That is what lets us draw both buttons
// ourselves instead of accepting the unbranded tile Entra renders for custom
// OIDC providers.
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
