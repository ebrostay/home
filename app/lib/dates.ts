// Dates in the abbreviated ledger voice: "3 sept", "sept 2026", "3 sept 2026".
//
// Why this exists instead of `new Intl.DateTimeFormat(intl, { month: "short" })`,
// which is what all thirteen of these call sites used to do:
//
// CLDR 42 renamed en-GB's September abbreviation from "Sep" to "Sept". Node,
// Chrome and Firefox carry the new name; Safari's ICU still says "Sep". This
// site is a static export, so every page's HTML is formatted by Node at build
// time and then hydrated by whatever the visitor is running — and wherever an
// abbreviated September was printed, Safari read "Sept" in the HTML, rendered
// "Sep", and React threw that subtree away and re-rendered it with a hydration
// error in the console. The search hero prints one for a third of the year:
// its default stay is today + 3 months, which lands in September all June.
//
// Everything else Intl gives us is identical across Node, Chrome, Firefox and
// Safari — long month names, weekdays, all of es-ES, and the order and
// punctuation of every pattern (checked, all twelve months, both locales). So
// Intl still lays the date out. Only the month word, the one piece proven to
// drift between runtimes, comes from the app's own messages: `date.monthsShort`
// in messages/es.json and en.json, January first.

/** The twelve abbreviations, January first, from `date.monthsShort`. */
export type ShortMonths = readonly string[];

export function shortDate(
  date: Date,
  months: ShortMonths,
  {
    locale,
    day = false,
    year = false,
  }: { locale: string; day?: boolean; year?: boolean },
): string {
  const intl = locale.startsWith("es") ? "es-ES" : "en-GB";

  return new Intl.DateTimeFormat(intl, {
    ...(day && { day: "numeric" as const }),
    month: "short",
    ...(year && { year: "numeric" as const }),
  })
    .formatToParts(date)
    // `getMonth()` is the local month, and Intl formats in the local zone
    // here — no `timeZone` option is passed anywhere — so the two agree.
    .map((p) => (p.type === "month" ? (months[date.getMonth()] ?? p.value) : p.value))
    .join("");
}
