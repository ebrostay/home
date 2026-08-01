import type { Metadata } from "next";
import { Familjen_Grotesk, Onest, Spline_Sans_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Analytics } from "@/components/site/Analytics";
import { AuthProvider } from "@/components/site/AuthProvider";
import { ThemeSync } from "@/components/site/ThemeSync";
import "../globals.css";

// Display face: Familjen Grotesk (chosen 2026-07-22 via /design/type
// comparison; replaced Bricolage, which was also v1's display face).
const familjen = Familjen_Grotesk({
  variable: "--font-familjen",
  subsets: ["latin"],
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin"],
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ebrostay",
  description: "Alquiler corporativo de media estancia en Zaragoza",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Runs before paint: resolves the theme from localStorage (user choice) or the
// OS preference and stamps it on <html>, so there is no flash of wrong theme.
const themeBootstrap = `(function(){try{var s=localStorage.getItem("ebrostay-theme");var t=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* A plain inline <script>, on purpose. `next/script` with
            `beforeInteractive` does NOT emit one: it emits a
            `(self.__next_s=self.__next_s||[]).push([...])` queue entry that
            Next's client runtime drains, and that runtime arrives in an async
            chunk. "Before interactive" means before hydration, not before
            paint — so between 2026-07-2x and now every page painted with no
            `data-theme` at all (light, per globals.css) and then repainted
            dark once the chunks landed. That is the flash the script exists to
            prevent, and it was worst on exactly the visitors it matters most
            for: a cold cache or a slow phone widens the gap.

            This runs synchronously, before the body is parsed, so the theme is
            on <html> for the first pixel. React logs a dev-only warning about
            an inline script in the tree (allowlisted in e2e/pages.spec.ts, and
            absent from the production build) — that is the whole price. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body
        /* dvh, not vh: on mobile browsers 100vh is the height with the toolbar
           retracted, so on first paint the page is taller than what you can
           see and the pinned footer sits below the fold with a strip of bare
           background under it. dvh tracks the visible viewport. */
        className={`${familjen.variable} ${onest.variable} ${splineMono.variable} flex min-h-dvh flex-col antialiased`}
      >
        {/* Covers what the script above cannot: a language switch is a client
            navigation across the [locale] segment, so this layout remounts and
            React wipes every attribute off <html> — data-theme included — on
            its way to re-mounting the singleton. See ThemeSync. */}
        <ThemeSync />
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <Header />
            <div className="flex-1">{children}</div>
            <Footer />
          </AuthProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
