import {
  Bricolage_Grotesque,
  Familjen_Grotesk,
  Schibsted_Grotesk,
  Fraunces,
} from "next/font/google";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogoMark } from "@/components/site/Logo";

// Display-face comparison page (internal): the incumbent vs three
// deliberately different skeletons. Fonts load only with this route.

const bricolage = Bricolage_Grotesque({ subsets: ["latin"] });
const familjen = Familjen_Grotesk({ subsets: ["latin"] });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"] });
const fraunces = Fraunces({ subsets: ["latin"] });

const faces = [
  { key: "bricolage", name: "Bricolage Grotesque", font: bricolage, current: true },
  { key: "familjen", name: "Familjen Grotesk", font: familjen, current: false },
  { key: "schibsted", name: "Schibsted Grotesk", font: schibsted, current: false },
  { key: "fraunces", name: "Fraunces", font: fraunces, current: false },
] as const;

export default async function TypeComparePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("typeCompare");
  const td = await getTranslations("design");

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="data text-xs uppercase tracking-[0.16em] text-muted">
        Ebrostay v2
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold text-ink">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-xl">{t("intro")}</p>

      {faces.map((f) => (
        <section key={f.key} className="mt-14">
          <div className="ledger-rule">
            <span>
              {f.name}
              {f.current ? ` · ${t("current")}` : ""}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted">{t(`note.${f.key}`)}</p>

          {/* headline specimen at display weight + tracking */}
          <p
            className="mt-5 text-5xl font-bold text-ink"
            style={{ fontFamily: f.font.style.fontFamily, letterSpacing: "-0.015em" }}
          >
            {td("displaySample")}
          </p>

          {/* wordmark fit */}
          <div className="mt-6 flex items-center gap-2">
            <LogoMark size={28} />
            <span
              className="text-2xl font-semibold tracking-tight text-ink"
              style={{ fontFamily: f.font.style.fontFamily }}
            >
              Ebrostay
            </span>
          </div>

          {/* in-context: card title + price against Onest body */}
          <div className="mt-6 max-w-sm rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)">
            <div className="flex items-baseline justify-between gap-3">
              <h3
                className="text-base font-semibold text-ink"
                style={{ fontFamily: f.font.style.fontFamily }}
              >
                Piso Movera I
              </h3>
              <p className="data text-sm text-ink">
                1.350 €<span className="text-muted">/mes</span>
              </p>
            </div>
            <p className="mt-1 text-sm text-muted">Movera, Zaragoza</p>
            <p className="mt-2 text-sm">{td("bodySample")}</p>
          </div>
        </section>
      ))}
    </main>
  );
}
