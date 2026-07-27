import {
  Archive,
  ArrowUpDown,
  BellRing,
  Car,
  ChefHat,
  Fan,
  Flame,
  Laptop,
  Sofa,
  Trees,
  Tv,
  UtensilsCrossed,
  WashingMachine,
  Wifi,
  Wind,
  type LucideIcon,
} from "lucide-react";

// One icon per amenity, shared by every surface that lists them — the result
// card, the detail page, the quick filters. A home's wifi has to look the same
// in the grid as it does on its own page, so the mapping lives here rather than
// once per component.
//
// Keys mirror messages/*.json `amenity.*`. Anything the API sends that isn't
// here renders label-only: callers must handle a missing icon rather than
// substitute a generic one, since a stand-in glyph would claim a meaning the
// key doesn't have.
export const AMENITY_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  ac: Wind,
  heating: Flame,
  desk: Laptop,
  kitchen: ChefHat,
  terrace: Trees,
  lift: ArrowUpDown,
  washer: WashingMachine,
  parking: Car,
  furnished: Sofa,
  dryer: Fan,
  dishwasher: UtensilsCrossed,
  tv: Tv,
  storage: Archive,
  concierge: BellRing,
};

// The vocabulary an owner may choose from, in the order the picker offers it:
// what a corporate tenant checks first, then the appliances, then the extras.
// The API validates the SHAPE of an amenity key, never this list — so adding
// one here plus its two translations is the whole change, with no API deploy.
//
// Deliberately NOT here: "pets allowed". The handoff offers it as a chip, but
// it is `petsAllowed` on the document and a rule in the editor. As an amenity
// too, one listing could answer it both ways.
export const AMENITY_KEYS = [
  "wifi",
  "furnished",
  "heating",
  "ac",
  "kitchen",
  "washer",
  "dryer",
  "dishwasher",
  "lift",
  "desk",
  "tv",
  "terrace",
  "parking",
  "storage",
  "concierge",
] as const;
