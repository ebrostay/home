"use client";

import {
  BadgeEuro,
  CalendarCheck,
  Receipt,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { PropertyDetail } from "@/lib/api";

// ============================================================
// Stay terms — what this listing actually commits to.
//
// Two kinds, deliberately kept apart (ADR-023):
//
// · DERIVED — the listing document already answers these, so reading them off
//   the same fields the Conditions table reads means the two can never
//   contradict each other. Bills used to be a fixed "capped utilities" card
//   shown even on homes whose billsPolicy was "included"; now the policy
//   writes the card.
//
// · DECLARED — `stayTerms` on the document: the owner tells us which apply.
//   Nothing else in the listing implies them, so nothing else can derive them.
//   An unknown key is skipped rather than rendered raw: the vocabulary belongs
//   to whoever ships the translations, not to whatever reaches the database.
// ============================================================

const DECLARED: Record<string, LucideIcon> = {
  cancellation: CalendarCheck,
  cleaning: Sparkles,
};

export function StayTerms({
  property: p,
  locale,
}: {
  property: PropertyDetail;
  locale: string;
}) {
  const t = useTranslations("detail.terms");
  const eur = (v: number) =>
    new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
      useGrouping: "always" as Intl.NumberFormatOptions["useGrouping"],
      maximumFractionDigits: 0,
    }).format(v);

  // A "capped" policy with no cap figure would render "included up to  €", so
  // it falls back to the plain included wording rather than a blank promise.
  const billsKey =
    p.billsPolicy === "capped" && !p.utilitiesCapEur
      ? "bills.included"
      : `bills.${p.billsPolicy}`;
  const cap = p.utilitiesCapEur ? eur(p.utilitiesCapEur) : "";

  const cards: { key: string; Icon: LucideIcon; title: string; body: string }[] =
    [
      // Billing is a company rule, identical on every home, and the one thing
      // visitors most often misread — so it always shows.
      {
        key: "billing",
        Icon: BadgeEuro,
        title: t("billing.title"),
        body: t("billing.body"),
      },
      {
        key: "bills",
        Icon: Receipt,
        // `cap` is passed to every variant, not just "capped": ICU ignores an
        // argument the message doesn't use, and a title that quietly drops one
        // it DOES use is exactly the bug this avoids.
        title: t(`${billsKey}.title` as "bills.included.title", { cap }),
        body: t(`${billsKey}.body` as "bills.included.body", { cap }),
      },
    ];

  if (p.depositAmount) {
    cards.push({
      key: "deposit",
      Icon: ShieldCheck,
      title: t("deposit.title", { amount: eur(p.depositAmount) }),
      body: t("deposit.body", { amount: eur(p.depositAmount) }),
    });
  }

  for (const key of p.stayTerms) {
    const Icon = DECLARED[key];
    if (!Icon) continue; // key we have no copy for — say nothing rather than guess
    cards.push({
      key,
      Icon,
      title: t(`${key}.title` as "cancellation.title"),
      body: t(`${key}.body` as "cancellation.body"),
    });
  }

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {cards.map(({ key, Icon, title, body }) => (
        <div
          key={key}
          className="flex gap-3 rounded-(--radius-card) border border-line bg-surface p-4"
        >
          <Icon
            size={18}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-brand"
            aria-hidden
          />
          <div>
            <p className="font-display text-[0.9375rem] font-semibold text-ink">
              {title}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-body">
              {body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
