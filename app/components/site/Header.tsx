import { Link } from "@/i18n/navigation";
import { Wordmark } from "./Logo";
import { MainNav } from "./MainNav";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitch } from "./LanguageSwitch";
import { AuthMenu } from "./AuthMenu";
import { CompactNav } from "./CompactNav";

// GRID, NOT TWO flex-1 TRACKS. `flex-1` is `flex: 1 1 0%` — basis zero — so
// the outer tracks came out EXACTLY EQUAL at every width, whatever they held.
// The left holds a 113px wordmark; the right holds 305px of controls. Equal
// tracks meant the header only worked once *both* could be 305 wide, i.e.
// from 1110px, though its contents actually fit from 918. In the 191px band
// between, and on every phone, the right track was starved and its contents
// did not wrap or ellipse — LanguageSwitch clipped itself to a 2px sliver of
// border via its own overflow-hidden, the theme toggle lost half its icon,
// and the account button slid left underneath the nav pill.
//
// `1fr` in a grid is `minmax(auto, 1fr)`: equal shares when there is slack,
// but never narrower than the column's own min-content. So the pill still
// sits optically centred whenever the header has room to centre it, and when
// it does not the pill drifts left instead of the controls disappearing.
//
// The template is declared twice because a `display:none` MainNav is not a
// grid item at all — with three columns declared, the control cluster would
// slide into the middle one and sit centred with an empty track beside it.
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/92 backdrop-blur-md">
      <div className="mx-auto grid h-(--header-h) max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 min-[60rem]:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>
        </div>

        <MainNav />

        {/* gap-2 below sm: four controls and three gaps on a 343px phone, and
            8px a side is enough to separate them. */}
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <LanguageSwitch />
          {/* In CompactNav's popover below sm — see the note there. */}
          <div className="hidden shrink-0 sm:block">
            <ThemeToggle />
          </div>
          <AuthMenu />
          <CompactNav />
        </div>
      </div>
    </header>
  );
}
