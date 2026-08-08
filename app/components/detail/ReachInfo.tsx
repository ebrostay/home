"use client";

import { useTranslations } from "next-intl";
import { InfoPopover } from "@/components/ui/InfoPopover";

// "Why is that a range?" — the one explanation behind every travel figure on
// this page.
//
// Both lists need it and both must say the same thing: "What's nearby" and
// "Your places" measure the same way (ADR-041 point 3 — the door plus the two
// street samples, merged), so a reader who learns it on one list must not
// meet a different story on the other. One component, one set of strings.
//
// A popover, not a title attribute: the answer is three sentences, a `title`
// never appears on touch, and the page already owns this pattern.

export function ReachInfo({ align = "start" }: { align?: "start" | "end" }) {
  const t = useTranslations("detail.reachInfo");
  return (
    <InfoPopover label={t("label")} title={t("title")} align={align}>
      <p>{t("origin")}</p>
      <p>{t("range")}</p>
      <p>{t("rounding")}</p>
    </InfoPopover>
  );
}
