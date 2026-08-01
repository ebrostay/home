// The primary decision — am I looking for a home, or do I have one to let? —
// rendered by MainNav as a segmented control. The model lives here, apart
// from the component, because the matcher is logic and logic gets tested:
// between 2026-07-2x and 2026-08-01 the owner segment pointed at
// /about#hosts when signed out while its matcher only recognised /host, so
// the pill silently went blank for every signed-out visitor and no test could
// see it.
//
// ONE href per segment, in every auth state. /host serves the owner pitch to
// a signed-out visitor and the portfolio to a signed-in one (see
// components/host/HostPitch.tsx), so there is no second destination left to
// disagree with the matcher.

export type NavKey = "find" | "list" | "how";

export type NavItem = {
  key: NavKey;
  href: string;
  match: (pathname: string) => boolean;
  // A tag, not a component: this module stays free of React so vitest can
  // load it without a DOM. MainNav maps the tag to the icon.
  icon: "search" | "building" | null;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "find",
    href: "/",
    match: (p) => p === "/",
    icon: "search",
  },
  {
    key: "list",
    href: "/host",
    match: (p) => p === "/host" || p.startsWith("/host/"),
    icon: "building",
  },
  // An anchor on /about, which no segment owns — /about is also where "About"
  // in the footer goes. Highlighting it would mean highlighting on arrival
  // from either, so it highlights on neither.
  {
    key: "how",
    href: "/about#how",
    match: () => false,
    icon: null,
  },
] as const;

export function navMatch(pathname: string): NavKey | null {
  return NAV_ITEMS.find((item) => item.match(pathname))?.key ?? null;
}
