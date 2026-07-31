"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "./AuthProvider";
import { logoutUrl, currentPath, localeHome, signInPath } from "@/lib/auth";

export function AuthMenu() {
  const t = useTranslations("auth");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const { me, loading } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="skeleton h-9 w-9 shrink-0 rounded-(--radius-control)" />;
  }

  const go = (href: string) => {
    window.location.href = href;
  };

  // Signed out this goes to our own /sign-in, not straight to /.auth/login.
  // Since the Microsoft provider was taken out of the Entra user flow, that
  // hosted page offers email and password only — the Microsoft option now
  // exists solely as a button we draw ourselves. Sending anyone directly to
  // /.auth/login would strand a Microsoft user on a page with no way in.
  if (!me.authenticated) {
    return (
      <Link
        href={signInPath(currentPath())}
        className="flex h-9 shrink-0 items-center rounded-(--radius-control) bg-brand px-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
      >
        {tn("signIn")}
      </Link>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-(--radius-control) border border-line text-ink transition-colors hover:border-line-strong"
      >
        {/* The initial, never the name. The name cost up to 120px of the bar
            and was the one thing in it that the person reading it already
            knew — so it moved into the menu, where it answers a question
            someone might actually have (which account is this?) instead of
            occupying the width the nav needs. */}
        <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-soft text-[0.625rem] font-bold text-brand-strong">
          {(me.name ?? "?").slice(0, 1).toUpperCase()}
        </span>
      </button>

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-(--radius-card) border border-line bg-surface p-1 shadow-(--shadow-pop)"
          >
            <p className="truncate border-b border-line px-2.5 pb-2 pt-1.5 text-sm font-semibold text-ink">
              {me.name}
            </p>
            {me.isDeactivated && (
              <p className="m-1 rounded-(--radius-control) bg-danger-soft px-2.5 py-2 text-xs text-danger">
                {t("deactivated")}
              </p>
            )}
            <MenuLink href="/account" onClick={() => setOpen(false)}>
              {t("account")}
            </MenuLink>
            {me.isAdmin && (
              <MenuLink href="/admin" onClick={() => setOpen(false)}>
                {t("adminPanel")}
              </MenuLink>
            )}
            {/* Sign-out lands on the locale home, never the page you left:
                that page is often /account or /host/*, and the browser is
                anonymous by the time the redirect is followed — so the very
                rule the user had just satisfied would answer 403. */}
            <button
              role="menuitem"
              onClick={() => go(logoutUrl(localeHome(locale)))}
              className="block w-full rounded-(--radius-control) px-2.5 py-2 text-left text-sm text-body transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {t("signOut")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      onClick={onClick}
      className="block rounded-(--radius-control) px-2.5 py-2 text-sm text-body transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </Link>
  );
}
