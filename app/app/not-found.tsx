import type { Metadata } from "next";
import { Familjen_Grotesk, Onest, Spline_Sans_Mono } from "next/font/google";
import { LogoMark } from "@/components/site/Logo";
import "./globals.css";

// Root 404 — the static export emits a single out/404.html from this page
// (staticwebapp.config.json rewrites 404s to it), so it is bilingual on one
// page and links out to both locale homes. It renders outside the [locale]
// layout, hence its own <html>/<body>, fonts and theme bootstrap.

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
  title: "404 — Ebrostay",
};

// Same pre-paint theme resolution as app/[locale]/layout.tsx.
const themeBootstrap = `(function(){try{var s=localStorage.getItem("ebrostay-theme");var t=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

const cta =
  "rounded-(--radius-control) bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong";

export default function NotFound() {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body
        className={`${familjen.variable} ${onest.variable} ${splineMono.variable} antialiased`}
      >
        <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
          <LogoMark size={44} />
          <p className="data mt-6 text-xs uppercase tracking-[0.16em] text-muted">
            404
          </p>

          <div lang="es" className="mt-4">
            <h1 className="font-display text-3xl font-bold text-ink">
              Página no encontrada.
            </h1>
            <p className="mt-2 text-sm text-muted">
              La dirección no existe o ha cambiado.
            </p>
            <a href="/es/" className={`mt-5 inline-block ${cta}`}>
              Ir al inicio
            </a>
          </div>

          <div lang="en" className="mt-10 w-full max-w-xs border-t border-line pt-8">
            <p className="font-display text-3xl font-bold text-ink">
              Page not found.
            </p>
            <p className="mt-2 text-sm text-muted">
              This address doesn&apos;t exist or has moved.
            </p>
            <a href="/en/" className={`mt-5 inline-block ${cta}`}>
              Go to the homepage
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
