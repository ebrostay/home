"use client";

import { useEffect, useLayoutEffect } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ebrostay-theme";

// The header renders ThemeToggle twice — in the bar from 54rem up, inside
// CompactNav's popover below it — and only ever shows one. But both mount, and
// two copies of useState are two answers to the same question: toggle on a
// phone, widen past 54rem, and the bar's copy is still drawing yesterday's
// icon. So the document attribute is the truth and this event is how the
// copies hear about a change. dispatchEvent is synchronous, so the instance
// that was clicked updates through the same path as its sibling.
export const THEME_EVENT = "ebrostay-theme-change";

// Same resolution order as the pre-paint bootstrap script in
// [locale]/layout.tsx — explicit choice first, OS preference second. Keep the
// two in step; the script cannot import this, it has to be inline in <head>.
export function resolveTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // private mode: theme just won't persist
  }
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: next }));
}

// Layout effects run in the same commit as the DOM mutation and BEFORE the
// browser paints; passive effects (useEffect) run after it. Everything in this
// file that has to be true of the FIRST painted frame — the theme attribute,
// the toggle's icon — therefore hangs off this and not useEffect. The static
// export pre-renders these components at build time, where there is no paint
// to be before and React warns about useLayoutEffect, so fall back there.
export const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
