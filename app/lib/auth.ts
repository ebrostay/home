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

export type Provider = "github" | "aad";

export function loginUrl(provider: Provider, redirectTo: string): string {
  return `/.auth/login/${provider}?post_login_redirect_uri=${encodeURIComponent(redirectTo)}`;
}

export function logoutUrl(redirectTo: string): string {
  return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(redirectTo)}`;
}

// Current locale-prefixed path, for round-tripping the user back after auth.
export function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}
