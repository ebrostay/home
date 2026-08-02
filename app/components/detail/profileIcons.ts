import { Car, Footprints } from "lucide-react";

// One icon per travel profile, shared by everything on the detail page that
// has to say "on foot" or "by car" without room for the words: the toggle
// floating on the map at phone widths, and the figure beside each saved place.
// Two components picking their own icons for the same two ideas is how a page
// ends up telling you a walk with a shoe in one place and a footprint in
// another.
export const PROFILE_ICONS = { foot: Footprints, car: Car } as const;
