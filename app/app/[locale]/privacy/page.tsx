import type { Metadata } from "next";
import { Fragment } from "react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { privacyContent } from "./content";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

const EMAIL = "info@ebrostay.com";

function pick(locale: string) {
  return privacyContent[locale === "en" ? "en" : "es"];
}

// Turns every mention of the contact address into a mailto link, so the
// content stays plain typed strings.
function linkifyEmail(text: string) {
  const parts = text.split(EMAIL);
  return parts.map((part, i) => (
    <Fragment key={`${i}-${part.slice(0, 12)}`}>
      {part}
      {i < parts.length - 1 && (
        <a
          href={`mailto:${EMAIL}`}
          className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-line-strong"
        >
          {EMAIL}
        </a>
      )}
    </Fragment>
  ));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale);
  return { title: c.metaTitle, description: c.metaDescription };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="data text-xs uppercase tracking-[0.16em] text-muted">
        {c.kicker}
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold text-ink">
        {c.title}
      </h1>
      <p className="data mt-4 text-xs text-muted">{c.updated}</p>

      {c.sections.map((section) => (
        <section key={section.title} className="mt-12">
          <div className="ledger-rule">
            <span>{section.title}</span>
          </div>
          <div className="mt-4 space-y-3">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.text.slice(0, 32)} className="leading-relaxed">
                {paragraph.strong && (
                  <strong className="font-semibold text-ink">
                    {paragraph.strong}
                  </strong>
                )}
                {paragraph.strong ? " " : null}
                {linkifyEmail(paragraph.text)}
              </p>
            ))}
          </div>
        </section>
      ))}

      <div className="mt-12">
        <Link
          href="/"
          className="inline-block rounded-(--radius-control) bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
        >
          {c.backHome}
        </Link>
      </div>
    </main>
  );
}
