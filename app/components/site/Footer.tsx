import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LogoMark } from "./Logo";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <LogoMark size={24} />
              <span className="font-display font-semibold text-ink">Ebrostay</span>
            </div>
            <p className="mt-3 text-sm text-muted">{t("tagline")}</p>
          </div>

          <nav aria-label={t("siteLinks")} className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <Link href="/" className="text-body hover:text-ink">{t("homes")}</Link>
            <Link href="/about" className="text-body hover:text-ink">{t("about")}</Link>
            <Link href="/privacy" className="text-body hover:text-ink">{t("privacy")}</Link>
            <a href="mailto:info@ebrostay.com" className="text-body hover:text-ink">
              info@ebrostay.com
            </a>
          </nav>
        </div>

        <div className="ledger-rule mt-10">
          <span>Zaragoza · {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
