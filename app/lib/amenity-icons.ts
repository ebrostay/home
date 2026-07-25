import {
  ArrowUpDown,
  Car,
  ChefHat,
  Flame,
  Laptop,
  Trees,
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
};
