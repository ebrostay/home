import type { Metadata } from "next";

// Same reasoning as the admin and /host/new layouts: the page is a client
// component and cannot export metadata itself, and its prerendered body is a
// bare skeleton because auth is unresolved at build time. Without this the
// route inherits the root metadata and is indexable — two empty pages in the
// index, every link on them pointing at a private surface. The edge rule
// below it in staticwebapp.config.json says nothing to a crawler, which never
// had a session to lose.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
