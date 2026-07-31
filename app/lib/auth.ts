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

// One provider: the Entra External ID tenant brokers email+password and Google
// behind a single branded page, so there is nothing for the app to choose. The
// name matches the key under customOpenIdConnectProviders in
// public/staticwebapp.config.json — change one and you must change the other.
export const PROVIDER = "ebrostay";

export function loginUrl(redirectTo: string): string {
  return `/.auth/login/${PROVIDER}?post_login_redirect_uri=${encodeURIComponent(redirectTo)}`;
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
