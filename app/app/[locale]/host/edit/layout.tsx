import type { Metadata } from "next";

// Ungated at the edge since 2026-08-01 so the in-app bounce can be
// locale-correct, which also made these routes crawlable. They are the
// owner's working surfaces: nothing here is for a search result, and the
// prerendered body is a bare skeleton, so indexing them would put six
// near-empty pages in the index. `follow: false` too — every link on them
// points further into the same private area.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
