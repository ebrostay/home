import {
  Accessibility,
  AirVent,
  AlarmSmoke,
  Archive,
  ArrowUpDown,
  Bath,
  BedDouble,
  Bell,
  BellRing,
  Bike,
  BriefcaseMedical,
  Car,
  ChefHat,
  Coffee,
  CookingPot,
  DoorOpen,
  Fan,
  Flame,
  FlameKindling,
  Flower2,
  Laptop,
  Leaf,
  Microwave,
  Monitor,
  MoonStar,
  Package,
  Printer,
  Refrigerator,
  Router,
  Shirt,
  ShieldCheck,
  Snowflake,
  Sofa,
  Sprout,
  Sun,
  Table,
  Trees,
  Tv,
  UtensilsCrossed,
  Utensils,
  VectorSquare,
  Volume2,
  WashingMachine,
  WavesLadder,
  Wifi,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

// ============================================================
// The amenity catalogue — one vocabulary, nine groups, and the nine answers
// every listing owes a guest whether the answer is yes or no.
//
// The problem this file exists to solve: a flat "tick what you have" list
// cannot tell a guest the difference between a home with no lift and an owner
// who did not scroll far enough. Both render as silence, and silence is what
// our own listing research kept finding — a reader assumes the baseline is
// there, books, and discovers otherwise. So the catalogue is split in two:
//
//   BASELINE  — asked explicitly, yes or no, and STATED either way on the
//               public page. Nine things a corporate tenant on a three-month
//               stay assumes without checking.
//   the rest  — opt-in, found by search, and never stated as an absence. A
//               home that does not mention its bread bin is not hiding one.
//
// Every surface reads this file: the wizard, the editor, the property page,
// the result card, the search filters. A key added here plus its two
// translations is the whole change — `HostValidation` (api/Models/HostWrites.cs)
// checks the SHAPE of an amenity key and never this list, so no API ships with
// a new amenity.
//
// Deliberately NOT here: "pets allowed", "smoking allowed", "self check-in".
// All three are house rules on the listing document with their own editor
// controls. As amenities too, one listing could answer them both ways.
// ============================================================

/** The order the groups are offered in, and the order the property page reads
 *  them back: what you need, then the rooms you use it in, then the building,
 *  then the things you notice only if they are missing. */
export const AMENITY_GROUPS = [
  "essentials",
  "kitchen",
  "laundry",
  "comfort",
  "workspace",
  "building",
  "outdoor",
  "safety",
  "access",
] as const;

export type AmenityGroup = (typeof AMENITY_GROUPS)[number];

type AmenityDef = {
  group: AmenityGroup;
  icon?: LucideIcon;
  /** Extra words that should FIND this amenity, in both languages, lowercase
   *  and unaccented. The translated label is always searchable and is never
   *  repeated here. These exist so two owners typing "elevator" and "ascensor"
   *  land on the same key instead of inventing two. */
  synonyms: string[];
};

// Icons: one per amenity, shared by every surface, so a home's wifi looks the
// same in the grid as it does on its own page. A few keys have none on
// purpose — no glyph in the set means "drying rack" and borrowing one that
// means something else is worse than the brand dot every caller already draws
// for a missing icon.
const CATALOGUE: Record<string, AmenityDef> = {
  // ---- 1 · Essentials — the nine, all baseline -------------------------
  wifi: {
    group: "essentials",
    icon: Wifi,
    synonyms: ["internet", "broadband", "wi-fi", "wireless", "banda ancha", "conexion", "inalambrico"],
  },
  heating: {
    group: "essentials",
    icon: Flame,
    synonyms: ["radiator", "radiators", "central heating", "heater", "warm", "radiador", "radiadores", "calefaccion central", "calefactor", "caldera"],
  },
  ac: {
    group: "essentials",
    icon: Wind,
    synonyms: ["air con", "air conditioning", "a/c", "aircon", "cooling", "climate", "aire", "clima", "climatizacion", "refrigeracion", "frio", "aire acond."],
  },
  furnished: {
    group: "essentials",
    icon: Sofa,
    synonyms: ["furniture", "fully furnished", "sofa", "muebles", "mobiliario", "amueblado", "sofa cama"],
  },
  kitchen: {
    group: "essentials",
    icon: ChefHat,
    synonyms: ["cook", "cooking", "hob", "stove", "kitchenette", "cocinar", "fogones", "vitroceramica", "induccion", "cocina americana", "equipped kitchen", "cocina equipada"],
  },
  washer: {
    group: "essentials",
    icon: WashingMachine,
    synonyms: ["washing machine", "laundry", "wash", "lavar", "colada", "lavarropas", "lavadora"],
  },
  desk: {
    group: "essentials",
    icon: Laptop,
    synonyms: ["workspace", "work space", "home office", "study", "remote work", "mesa de trabajo", "oficina en casa", "teletrabajo", "despacho", "estudio", "work desk", "escritorio"],
  },
  lift: {
    group: "essentials",
    icon: ArrowUpDown,
    synonyms: ["elevator", "elevador", "montacargas", "lift", "ascensor"],
  },
  parking: {
    group: "essentials",
    icon: Car,
    synonyms: ["car", "car space", "park", "aparcamiento", "plaza", "coche", "estacionamiento"],
  },

  // ---- 2 · Kitchen ------------------------------------------------------
  dishwasher: {
    group: "kitchen",
    icon: UtensilsCrossed,
    synonyms: ["dishes", "lavavajillas", "friegaplatos", "platos", "dishwasher"],
  },
  oven: {
    group: "kitchen",
    icon: CookingPot,
    synonyms: ["bake", "baking", "horno", "hornear", "oven"],
  },
  microwave: {
    group: "kitchen",
    icon: Microwave,
    synonyms: ["microondas", "microwave"],
  },
  fridge: {
    group: "kitchen",
    icon: Refrigerator,
    synonyms: ["refrigerator", "nevera", "frigorifico", "refrigerador", "fridge"],
  },
  freezer: {
    group: "kitchen",
    icon: Snowflake,
    synonyms: ["frozen", "congelador", "congelar", "freezer"],
  },
  coffee: {
    group: "kitchen",
    icon: Coffee,
    synonyms: ["coffee maker", "espresso", "nespresso", "cafetera", "cafe"],
  },
  kettle: {
    group: "kitchen",
    synonyms: ["boil", "tea", "hervidor", "tetera", "te", "kettle"],
  },
  toaster: {
    group: "kitchen",
    synonyms: ["toast", "tostadora", "tostador", "toaster"],
  },
  cookware: {
    group: "kitchen",
    icon: Utensils,
    synonyms: ["pots", "pans", "crockery", "cutlery", "plates", "glasses", "ollas", "sartenes", "vajilla", "cubiertos", "menaje", "pots, pans and crockery", "ollas, sartenes y vajilla"],
  },
  "dining-table": {
    group: "kitchen",
    icon: Table,
    synonyms: ["dining", "eat", "table", "mesa", "comedor", "comer", "dining table", "mesa de comedor"],
  },

  // ---- 3 · Laundry ------------------------------------------------------
  dryer: {
    group: "laundry",
    icon: Fan,
    synonyms: ["tumble dryer", "secadora", "secar"],
  },
  iron: {
    group: "laundry",
    icon: Shirt,
    synonyms: ["ironing", "ironing board", "plancha", "planchar", "tabla de planchar", "iron and board", "plancha y tabla"],
  },
  "drying-rack": {
    group: "laundry",
    synonyms: ["airer", "clothes horse", "hang washing", "tendedero", "tender", "drying rack"],
  },
  vacuum: {
    group: "laundry",
    synonyms: ["hoover", "cleaning", "aspiradora", "aspirador", "limpiar", "vacuum cleaner"],
  },
  "shared-laundry": {
    group: "laundry",
    synonyms: ["laundry room", "launderette", "in building", "lavanderia", "cuarto de lavado", "laundry room in the building", "lavanderia en el edificio"],
  },

  // ---- 4 · Comfort ------------------------------------------------------
  tv: {
    group: "comfort",
    icon: Tv,
    synonyms: ["television", "televisor", "tele"],
  },
  streaming: {
    group: "comfort",
    icon: Monitor,
    synonyms: ["smart tv", "netflix", "chromecast", "apple tv", "television inteligente"],
  },
  "bed-linen": {
    group: "comfort",
    icon: BedDouble,
    synonyms: ["sheets", "bedding", "duvet", "pillows", "sabanas", "ropa de cama", "edredon", "almohadas", "bed linen"],
  },
  towels: {
    group: "comfort",
    icon: Bath,
    synonyms: ["bath towels", "toallas", "bano"],
  },
  wardrobe: {
    group: "comfort",
    icon: Archive,
    synonyms: ["closet", "hangers", "armario", "ropero", "perchas", "wardrobe"],
  },
  blackout: {
    group: "comfort",
    icon: MoonStar,
    synonyms: ["blinds", "shutters", "curtains", "dark", "persianas", "cortinas", "oscuridad", "blackout blinds", "persianas opacas"],
  },
  fan: {
    group: "comfort",
    icon: AirVent,
    synonyms: ["ventilator", "ventilador", "aire", "fan"],
  },
  soundproofing: {
    group: "comfort",
    icon: Volume2,
    synonyms: ["quiet", "double glazing", "silent", "insonorizado", "silencioso", "doble acristalamiento"],
  },

  // ---- 5 · Workspace ----------------------------------------------------
  "office-chair": {
    group: "workspace",
    icon: VectorSquare,
    synonyms: ["ergonomic chair", "desk chair", "silla de oficina", "silla ergonomica", "office chair"],
  },
  monitor: {
    group: "workspace",
    icon: Monitor,
    synonyms: ["external monitor", "screen", "second screen", "pantalla", "monitor externo"],
  },
  printer: {
    group: "workspace",
    icon: Printer,
    synonyms: ["scanner", "print", "impresora", "escaner", "imprimir", "printer"],
  },
  fibre: {
    group: "workspace",
    icon: Router,
    synonyms: ["fiber", "fibre optic", "fast internet", "gigabit", "fibra", "fibra optica", "internet rapido", "fibre internet"],
  },

  // ---- 6 · Building & access -------------------------------------------
  concierge: {
    group: "building",
    icon: BellRing,
    synonyms: ["porter", "doorman", "reception", "portero", "conserje", "porteria", "concierge"],
  },
  storage: {
    group: "building",
    icon: Package,
    synonyms: ["store room", "cellar", "loft", "trastero", "almacen", "buhardilla", "storage room"],
  },
  "bike-storage": {
    group: "building",
    icon: Bike,
    synonyms: ["bicycle", "bike room", "bicicleta", "bicis", "aparcabicis", "bike storage"],
  },
  intercom: {
    group: "building",
    icon: Bell,
    synonyms: ["video entry", "buzzer", "door phone", "portero automatico", "videoportero", "telefonillo", "video intercom"],
  },
  garage: {
    group: "building",
    icon: DoorOpen,
    synonyms: ["private garage", "underground parking", "garaje", "parking privado", "plaza de garaje", "garaje privado"],
  },
  "street-parking": {
    group: "building",
    icon: Car,
    synonyms: ["on street", "free parking", "resident permit", "zona azul", "aparcar en la calle", "parking gratuito", "street parking", "aparcamiento en la calle"],
  },
  "ev-charger": {
    group: "building",
    icon: Zap,
    synonyms: ["electric car", "ev charging", "tesla", "cargador electrico", "punto de recarga", "coche electrico", "ev charger"],
  },

  // ---- 7 · Outdoor ------------------------------------------------------
  terrace: {
    group: "outdoor",
    icon: Trees,
    synonyms: ["terraza", "terrace"],
  },
  balcony: {
    group: "outdoor",
    icon: Leaf,
    synonyms: ["balcon", "balconada", "balcony"],
  },
  garden: {
    group: "outdoor",
    icon: Sprout,
    synonyms: ["yard", "jardin", "cesped", "garden"],
  },
  patio: {
    group: "outdoor",
    icon: Flower2,
    synonyms: ["courtyard", "patio interior"],
  },
  "roof-terrace": {
    group: "outdoor",
    icon: Sun,
    synonyms: ["rooftop", "roof", "solarium", "azotea", "terraza comunitaria", "roof terrace"],
  },
  pool: {
    group: "outdoor",
    icon: WavesLadder,
    synonyms: ["swimming pool", "piscina", "alberca"],
  },
  bbq: {
    group: "outdoor",
    icon: FlameKindling,
    synonyms: ["barbecue", "grill", "barbacoa", "parrilla"],
  },

  // ---- 8 · Safety -------------------------------------------------------
  "smoke-alarm": {
    group: "safety",
    icon: AlarmSmoke,
    synonyms: ["smoke detector", "detector de humo", "alarma de humo", "smoke alarm"],
  },
  "co-alarm": {
    group: "safety",
    icon: AlarmSmoke,
    synonyms: ["carbon monoxide", "co detector", "monoxido de carbono", "detector de co", "carbon monoxide alarm", "detector de monoxido"],
  },
  extinguisher: {
    group: "safety",
    icon: FlameKindling,
    synonyms: ["fire extinguisher", "extintor", "incendio"],
  },
  "first-aid": {
    group: "safety",
    icon: BriefcaseMedical,
    synonyms: ["first aid kit", "medical", "botiquin", "primeros auxilios"],
  },
  "security-door": {
    group: "safety",
    icon: ShieldCheck,
    synonyms: ["reinforced door", "puerta blindada", "puerta acorazada", "seguridad", "security door"],
  },
  alarm: {
    group: "safety",
    synonyms: ["burglar alarm", "security system", "alarma", "sistema de seguridad", "alarm system"],
  },

  // ---- 9 · Step-free access --------------------------------------------
  "step-free": {
    group: "access",
    icon: Accessibility,
    synonyms: ["step free", "wheelchair", "no steps", "ramp", "sin escalones", "silla de ruedas", "rampa", "accesible", "step-free access", "acceso sin escalones"],
  },
  "wide-doors": {
    group: "access",
    synonyms: ["wide doorways", "wheelchair door", "puertas anchas"],
  },
  "ground-floor": {
    group: "access",
    synonyms: ["no stairs", "street level", "planta baja", "bajo", "a pie de calle", "ground floor"],
  },
  "accessible-bathroom": {
    group: "access",
    icon: Bath,
    synonyms: ["roll in shower", "grab rails", "bano adaptado", "ducha adaptada", "asideros", "accessible bathroom"],
  },
};

/** The nine an owner is asked outright, in the order the wizard asks them.
 *  These are the ONLY keys whose absence is stated on the public page, which
 *  is why the list is short: every entry here is a line of text on every
 *  listing that lacks it, and a page of stated absences reads as a warning
 *  rather than as candour. */
export const BASELINE_KEYS = [
  "wifi",
  "heating",
  "ac",
  "furnished",
  "kitchen",
  "washer",
  "desk",
  "lift",
  "parking",
] as const;

export type BaselineKey = (typeof BASELINE_KEYS)[number];

const BASELINE_SET: ReadonlySet<string> = new Set(BASELINE_KEYS);

export const isBaseline = (key: string): key is BaselineKey => BASELINE_SET.has(key);

/** Every key, in group order then catalogue order. `Object.keys` on a record
 *  with only string keys preserves insertion order, so the groups already read
 *  in the order they are declared above — this re-sorts anyway rather than
 *  relying on that, since a key moved between groups would otherwise silently
 *  land in the wrong section of the picker. */
export const AMENITY_KEYS: readonly string[] = Object.keys(CATALOGUE).sort(
  (a, b) =>
    AMENITY_GROUPS.indexOf(CATALOGUE[a].group) -
    AMENITY_GROUPS.indexOf(CATALOGUE[b].group),
);

/** The keys in one group, in catalogue order. */
export const keysInGroup = (group: AmenityGroup): string[] =>
  AMENITY_KEYS.filter((key) => CATALOGUE[key].group === group);

/** The group a key belongs to, or null for a key from outside the catalogue —
 *  an older listing may carry one, and the property page still has to place it
 *  somewhere rather than drop it. */
export const groupOf = (key: string): AmenityGroup | null =>
  CATALOGUE[key]?.group ?? null;

export const AMENITY_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(CATALOGUE)
    .filter(([, def]) => def.icon)
    .map(([key, def]) => [key, def.icon!]),
);

export const isKnownAmenity = (key: string): boolean => key in CATALOGUE;

// ------------------------------------------------------------
// Search.
//
// The picker's whole job is to stop two owners inventing two words for one
// thing. That only works if the word each of them actually types finds the
// key — "elevator" and "ascensor" are both the lift, and neither is the label
// in the language the other is reading. So a key matches on its label in the
// CURRENT locale plus every synonym in both languages.
// ------------------------------------------------------------

/** Lowercase, strip accents, collapse whitespace. Applied to both sides of
 *  every comparison, so "climatización" is found by "climatizacion" and the
 *  synonym lists above can stay unaccented. */
export const foldSearch = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type AmenityMatch = {
  key: string;
  /** Lower sorts first: 0 = the label starts with the query, 1 = the label
   *  contains it, 2 = only a synonym matched. A prefix hit on the word an
   *  owner can see beats a substring hit on one they cannot. */
  rank: number;
};

/** Keys matching `query`, best first. `label` resolves a key to the string the
 *  owner is reading — the caller passes its translator, so this module never
 *  imports next-intl and stays testable without one.
 *
 *  An empty query matches nothing rather than everything: the caller shows its
 *  grouped list in that case, and a search box that "finds" all sixty keys the
 *  moment it is focused is noise. */
export function searchAmenities(
  query: string,
  label: (key: string) => string,
  options: { exclude?: ReadonlySet<string> } = {},
): AmenityMatch[] {
  const q = foldSearch(query);
  if (q === "") return [];

  const out: AmenityMatch[] = [];
  for (const key of AMENITY_KEYS) {
    if (options.exclude?.has(key)) continue;

    const folded = foldSearch(label(key));
    let rank: number;
    if (folded.startsWith(q)) rank = 0;
    else if (folded.includes(q)) rank = 1;
    else if (CATALOGUE[key].synonyms.some((s) => s.includes(q))) rank = 2;
    else continue;

    out.push({ key, rank });
  }

  // Stable within a rank: `AMENITY_KEYS` is already in group order, and
  // `sort` in V8 is stable, so equal-ranked results keep the catalogue's own
  // grouping rather than an arbitrary one.
  return out.sort((a, b) => a.rank - b.rank);
}

// ------------------------------------------------------------
// The tri-state.
//
// `amenities` says what a home HAS. `amenitiesAbsent` says what an owner has
// explicitly answered no to. A baseline key in neither has never been asked —
// which is a real third state, and the only one the owner is nagged about.
//
// The public page does NOT show that third state as a third thing. An
// unanswered baseline reads as absent there, because that is the safer of the
// two lies to tell a guest and because it is what we decided: an owner who
// skips the question does not get the benefit of the doubt. The distinction is
// kept anyway, so the editor can tell an owner which questions they still owe
// an answer to rather than accusing them of having no heating.
// ------------------------------------------------------------

export type AmenityState = "yes" | "no" | "unanswered";

export function amenityState(
  key: string,
  amenities: readonly string[],
  absent: readonly string[],
): AmenityState {
  if (amenities.includes(key)) return "yes";
  if (absent.includes(key)) return "no";
  return "unanswered";
}

/** The baseline questions with no answer yet. Empty means the owner has been
 *  through the whole checklist — which is the only thing the wizard's warning
 *  and the editor's ledger need to know. */
export const unansweredBaseline = (
  amenities: readonly string[],
  absent: readonly string[],
): BaselineKey[] =>
  BASELINE_KEYS.filter((key) => amenityState(key, amenities, absent) === "unanswered");

/** What the property page states as missing: every baseline key not claimed,
 *  whether the owner said no or said nothing (see the note above).
 *
 *  Reads `amenities` only, on purpose — it must give the same answer for a
 *  listing saved before `amenitiesAbsent` existed as for one saved after. */
export const statedAbsent = (amenities: readonly string[]): BaselineKey[] =>
  BASELINE_KEYS.filter((key) => !amenities.includes(key));

/** Group a listing's amenities for display, dropping empty groups. Unknown
 *  keys — an older listing, a key retired from the catalogue — are kept and
 *  land in `essentials` rather than vanishing from the page. */
export function groupAmenities(amenities: readonly string[]): {
  group: AmenityGroup;
  keys: string[];
}[] {
  return AMENITY_GROUPS.map((group) => ({
    group,
    keys: amenities.filter(
      (key) => (groupOf(key) ?? "essentials") === group,
    ),
  })).filter((g) => g.keys.length > 0);
}
