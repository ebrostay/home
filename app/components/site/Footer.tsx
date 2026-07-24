import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LogoMark } from "./Logo";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="data text-sm text-muted">
              © {new Date().getFullYear()} Ebrostay
            </span>
          </div>

          <nav
            aria-label={t("siteLinks")}
            className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm"
          >
            <Link href="/" className="text-body hover:text-ink">{t("homes")}</Link>
            <Link href="/about#how" className="text-body hover:text-ink">{t("howItWorks")}</Link>
            <Link href="/about#hosts" className="text-body hover:text-ink">{t("owners")}</Link>
            <Link href="/about" className="text-body hover:text-ink">{t("about")}</Link>
            <Link href="/privacy" className="text-body hover:text-ink">{t("privacy")}</Link>
          </nav>

          <a
            href="mailto:info@ebrostay.com"
            className="data text-sm text-body hover:text-ink"
          >
            info@ebrostay.com
          </a>
        </div>

        {/* One plain-language line, not a wall of legal text: what we do with
            the data and where to read the rest. */}
        <p className="mt-8 border-t border-line pt-6 text-center text-xs leading-relaxed text-muted">
          {t("gdpr")}{" "}
          <Link href="/privacy" className="text-body underline underline-offset-2 hover:text-ink">
            {t("privacy")}
          </Link>
        </p>
      </div>
    </footer>
  );
}
