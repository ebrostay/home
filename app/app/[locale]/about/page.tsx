import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LogoMark } from "@/components/site/Logo";
import { aboutContent } from "./content";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

function pick(locale: string) {
  return aboutContent[locale === "en" ? "en" : "es"];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale);
  return { title: c.metaTitle, description: c.metaDescription };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Intro */}
      <p className="data text-xs uppercase tracking-[0.16em] text-muted">
        {c.kicker}
      </p>
      <h1 className="mt-2 max-w-3xl font-display text-4xl font-bold text-ink">
        {c.title}
      </h1>
      <p className="mt-4 max-w-2xl text-lg">{c.lead}</p>

      {/* Mission & vision */}
      <section className="mt-14">
        <div className="ledger-rule">
          <span>{c.missionLabel}</span>
        </div>
        <h2 className="mt-6 font-display text-2xl font-bold text-ink">
          {c.missionTitle}
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {[c.mission, c.vision].map((item) => (
            <div
              key={item.label}
              className="rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card)"
            >
              <h3 className="font-display text-lg font-semibold text-ink">
                {item.label}
              </h3>
              <p className="mt-2 text-sm leading-relaxed">{item.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The bridge */}
      <section className="mt-14">
        <div className="ledger-rule">
          <span>{c.bridgeLabel}</span>
        </div>
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
          <div className="shrink-0 rounded-(--radius-card) border border-line bg-surface p-5 shadow-(--shadow-card)">
            <LogoMark size={72} />
          </div>
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold text-ink">
              {c.bridgeTitle}
            </h2>
            {c.bridgeCopy.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className="mt-4 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mt-14 scroll-mt-24">
        <div className="ledger-rule">
          <span>{c.howLabel}</span>
        </div>
        <h2 className="mt-6 font-display text-2xl font-bold text-ink">
          {c.howTitle}
        </h2>
        <ol className="mt-6 grid gap-5 sm:grid-cols-3">
          {c.steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card)"
            >
              <p className="data text-xs text-muted">0{i + 1}</p>
              <h3 className="mt-2 font-display text-lg font-semibold text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed">{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* For hosts (v2 marketplace model) */}
      <section id="hosts" className="mt-14 scroll-mt-24">
        <div className="ledger-rule">
          <span>{c.hostsLabel}</span>
        </div>
        <div className="mt-6 rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card) sm:p-8">
          <h2 className="font-display text-2xl font-bold text-ink">
            {c.hostsTitle}
          </h2>
          <p className="mt-3 max-w-2xl">{c.hostsLead}</p>
          <ul className="mt-5 max-w-2xl space-y-2.5">
            {c.hostsPoints.map((point) => (
              <li key={point} className="flex gap-3 text-sm leading-relaxed">
                <span aria-hidden="true" className="data text-brand">
                  —
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Roots & CTAs */}
      <section className="mt-14">
        <div className="ledger-rule">
          <span>{c.rootsLabel}</span>
        </div>
        <h2 className="mt-6 font-display text-2xl font-bold text-ink">
          {c.rootsTitle}
        </h2>
        <p className="mt-3 max-w-2xl">{c.rootsCopy}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-(--radius-control) bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            {c.ctaFind}
          </Link>
          {/* Sign-in entry point; wired to /.auth in the auth task */}
          <Link
            href="/account"
            className="rounded-(--radius-control) border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-line-strong"
          >
            {c.ctaList}
          </Link>
        </div>
      </section>
    </main>
  );
}
