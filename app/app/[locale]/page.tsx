import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function HomePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm uppercase tracking-widest opacity-60">
        {t("kicker")}
      </p>
      <h1 className="text-4xl font-semibold">{t("title")}</h1>
      <p className="max-w-md opacity-80">{t("tagline")}</p>
      <p className="text-xs opacity-50">{t("scaffold")}</p>
    </main>
  );
}
