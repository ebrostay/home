import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Wordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitch } from "./LanguageSwitch";

export function Header() {
  const t = useTranslations("nav");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/92 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        <nav aria-label={t("mainNav")} className="hidden items-center gap-6 sm:flex">
          <Link
            href="/"
            className="text-sm font-medium text-body transition-colors hover:text-ink"
          >
            {t("homes")}
          </Link>
          <Link
            href="/about"
            className="text-sm font-medium text-body transition-colors hover:text-ink"
          >
            {t("about")}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeToggle />
          {/* Sign-in entry point; wired to /.auth in the auth task */}
          <Link
            href="/account"
            className="hidden rounded-(--radius-control) bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-strong sm:block"
          >
            {t("signIn")}
          </Link>
        </div>
      </div>
    </header>
  );
}
