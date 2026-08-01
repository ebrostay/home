import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

// /host is public since 2026-08-01: signed out it is the owner pitch, signed
// in it is the portfolio. The page itself is a client component and cannot
// export metadata, and its prerendered body is deliberately a bare skeleton —
// auth is unresolved at build time and the owner chrome must not paint at a
// stranger. So the only thing describing this page to a crawler or a shared
// link is here.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "host.pitch" });
  return { title: t("title"), description: t("lead") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
