import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Choices } from "./Choices";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "signIn" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    // Nothing here belongs in an index: it is a doorway, and the destinations
    // behind it are private.
    robots: { index: false, follow: true },
  };
}

export default async function SignInPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "signIn" });

  return (
    // Sized to what is left under the 4rem header rather than to a fraction of
    // the viewport: at 70vh the photograph stopped short and left a band of
    // page background above the footer, which on a phone read as the image
    // having failed to load.
    <main className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-16">
      {/* The same photograph Entra's hosted page uses as its background. The
          whole point of this page is that pressing either button should not
          feel like leaving Ebrostay — and half of that is our page and theirs
          being visibly the same room. If the Entra branding image is ever
          changed, change it here too or the seam reopens. */}
      <div
        aria-hidden
        className="absolute inset-0 left-1/2 w-screen -translate-x-1/2 overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static export serves images unoptimized */}
        <img
          src="/brand/zaragoza-hero.webp"
          alt=""
          className="h-full w-full object-cover"
        />
        {/* Even, not angled: the card is centred, so there is no side for the
            weight to favour. Kept light — matching the weight Entra puts over
            the same photograph is what makes the two pages read as one place,
            and the card is opaque so nothing here is carrying text contrast. */}
        <div className="absolute inset-0 bg-[rgba(21,37,31,.45)]" />
      </div>

      <div className="relative w-full max-w-[26rem] rounded-(--radius-card) border border-line bg-surface p-7 shadow-(--shadow-pop) sm:p-8">
        <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-ink">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-body">{t("lead")}</p>

        <Choices />

        <p className="mt-6 text-xs leading-relaxed text-muted">{t("newAccount")}</p>
      </div>
    </main>
  );
}
