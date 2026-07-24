import { Link } from "@/i18n/navigation";
import { Wordmark } from "./Logo";
import { MainNav } from "./MainNav";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitch } from "./LanguageSwitch";
import { AuthMenu } from "./AuthMenu";

// Three tracks: the outer two are flex-1 so the nav pill sits optically
// centred however wide the logo or the auth button get.
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/92 backdrop-blur-md">
      <div className="mx-auto flex h-(--header-h) max-w-7xl items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>
        </div>

        <MainNav />

        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <LanguageSwitch />
          <ThemeToggle />
          <AuthMenu />
        </div>
      </div>
    </header>
  );
}
