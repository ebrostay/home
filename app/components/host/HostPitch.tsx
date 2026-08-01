"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/site/AuthProvider";
import { currentPath, signInPath } from "@/lib/auth";

// What /host is to someone who is not signed in. The route is public since
// 2026-08-01: an owner following an old bookmark used to be 401'd by the SWA
// gate and dropped on a bare sign-in form, which answers a question they had
// not asked yet. This answers it first, and puts the sign-in button under the
// answer.
//
// The steps are the owner's journey, deliberately not the guest's — /about's
// "how it works" is Filter / Review / Request, which is what a tenant does.
export function HostPitch() {
  const t = useTranslations("host.pitch");
  const { me, loading } = useAuth();

  // Read in an effect, not during render: this page is prerendered at build
  // time and window.location does not exist there, so a value read during
  // render would disagree with the server's HTML on hydration.
  const [back, setBack] = useState("/");
  useEffect(() => setBack(currentPath()), []);

  const steps = t.raw("steps") as { title: string; copy: string }[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="data text-xs uppercase tracking-[0.16em] text-muted">
        {t("eyebrow")}
      </p>
      <h1 className="mt-2 max-w-3xl font-display text-4xl font-bold tracking-[-0.015em] text-ink">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed">{t("lead")}</p>

      <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card)"
          >
            <p className="data text-xs text-muted">0{i + 1}</p>
            <h2 className="mt-2 font-display text-lg font-semibold text-ink">
              {step.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed">{step.copy}</p>
          </li>
        ))}
      </ol>

      {/* The button is the point of the page, so it sits under the answer
          rather than in the header where a nav item would be. A skeleton for
          the one tick AuthProvider takes to resolve: rendering "Sign in" to
          someone who already is, then swapping it, is the same flash we spend
          effort removing elsewhere. */}
      <div className="mt-10">
        {loading ? (
          <div className="skeleton h-[42px] w-60 rounded-(--radius-control)" />
        ) : me.authenticated ? (
          <Link
            href="/host"
            className="inline-flex h-[42px] items-center rounded-(--radius-control) bg-brand px-[18px] text-sm font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong"
          >
            {t("ctaSignedIn")}
          </Link>
        ) : (
          <Link
            href={signInPath(back)}
            className="inline-flex h-[42px] items-center rounded-(--radius-control) bg-brand px-[18px] text-sm font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong"
          >
            {t("cta")}
          </Link>
        )}
      </div>
    </main>
  );
}
