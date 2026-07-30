"use client";

import { useTranslations } from "next-intl";
import type { ShortMonths } from "@/lib/dates";

// The twelve abbreviations `shortDate` needs, read from the message files.
// They live in messages rather than in lib/dates.ts because they are words on
// the page like any other — and because the English one is a judgement call
// ("Sept", as CLDR spells it for en-GB, not "Sep") that belongs where a human
// can see and change it. See lib/dates.ts for why the runtime is not trusted
// to supply them.
export function useShortMonths(): ShortMonths {
  return useTranslations("date").raw("monthsShort") as ShortMonths;
}
