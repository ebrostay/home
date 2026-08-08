import type { Metadata } from "next";

// The admin routes carry an edge rule (`/es/admin/*` → role `admin` in
// staticwebapp.config.json), which is cosmetic — §3.5 — and says nothing to a
// crawler that never gets a 401 because it never had a session to lose. These
// are working surfaces whose prerendered body is a bare skeleton: indexing
// them would put four empty pages in the index, and every link on them points
// further into the same private area.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
