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
// One template, because MainNav is now present at every width — it shrinks
// rather than leaving (see the ladder there). A `display:none` grid item is
// not a grid item at all, and had it kept vanishing the control cluster would
// slide into the middle column and sit centred beside an empty track.
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/92 backdrop-blur-md">
      <div className="mx-auto grid h-(--header-h) max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <div className="flex items-center">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>
        </div>

        <MainNav />

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          {/* Both move into CompactNav's popover below 54rem — the width where
              the bar can no longer hold them and the full pill at once. */}
          <div className="hidden shrink-0 min-[54rem]:block">
            <LanguageSwitch />
          </div>
          <div className="hidden shrink-0 min-[54rem]:block">
            <ThemeToggle />
          </div>
          <AuthMenu />
          <CompactNav />
        </div>
      </div>
    </header>
  );
}
