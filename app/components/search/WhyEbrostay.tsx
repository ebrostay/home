import { Clock, FileCheck, MessageCircle, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";

// The page's one warm moment: a dark green panel with terracotta accents,
// after the results rather than before them — you read the argument once you
// have seen the homes it is about.
const CARDS = [
  { key: "book", Icon: Clock, soon: true },
  { key: "transparent", Icon: Receipt, soon: false },
  { key: "automated", Icon: FileCheck, soon: false },
  { key: "support", Icon: MessageCircle, soon: false },
] as const;

export function WhyEbrostay() {
  const t = useTranslations("search.why");

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <div
        className="rounded-[1.375rem] px-6 py-12 sm:px-12"
        style={{
          background:
            "radial-gradient(120% 140% at 15% 0%, #2c5f43 0%, var(--brand-strong) 42%, #132e21 100%)",
        }}
      >
        <p className="data text-xs uppercase tracking-[0.16em] text-clay">
          {t("eyebrow")}
        </p>
        <h2 className="mt-3 max-w-[20ch] font-display text-3xl font-bold text-white sm:text-[2.875rem] sm:leading-[1.05]">
          {t("title")}
        </h2>
        <p className="mt-4 max-w-[62ch] text-[1.0625rem] leading-relaxed text-white/85">
          {t("intro")}
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map(({ key, Icon, soon }) => (
            <div
              key={key}
              className="rounded-(--radius-card) border border-white/10 bg-white/5 p-5"
            >
              <span
                className="grid h-11 w-11 place-items-center rounded-(--radius-control) text-clay"
                style={{ background: "rgba(231,154,107,.14)" }}
              >
                <Icon size={20} strokeWidth={2} aria-hidden />
              </span>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <h3 className="font-display text-[1.0625rem] font-semibold text-white">
                  {t(`${key}.title`)}
                </h3>
                {soon && (
                  <span className="data rounded-full bg-white/10 px-2 py-0.5 text-[0.5625rem] uppercase tracking-[0.1em] text-white/75">
                    {t("comingSoon")}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[0.84375rem] leading-relaxed text-white/70">
                {t(`${key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
