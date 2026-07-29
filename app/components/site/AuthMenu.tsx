"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "./AuthProvider";
import { loginUrl, logoutUrl, currentPath, type Provider } from "@/lib/auth";

export function AuthMenu() {
  const t = useTranslations("auth");
  const tn = useTranslations("nav");
  const { me, loading } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="skeleton h-9 w-9 shrink-0 rounded-(--radius-control) sm:w-20" />;
  }

  const go = (href: string) => {
    window.location.href = href;
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          me.authenticated
            ? "flex h-9 items-center gap-2 rounded-(--radius-control) border border-line px-3 text-sm font-medium text-ink transition-colors hover:border-line-strong"
            : "h-9 rounded-(--radius-control) bg-brand px-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
        }
      >
        {me.authenticated ? (
          <>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-soft text-[0.625rem] font-bold text-brand-strong">
              {(me.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            {/* Avatar only below sm. The name costs up to 120px of a 343px
                bar, and it is the one thing there that the person reading it
                already knows. */}
            <span className="hidden max-w-28 truncate sm:inline">{me.name}</span>
          </>
        ) : (
          tn("signIn")
        )}
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
            {me.authenticated ? (
              <>
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
                <button
                  role="menuitem"
                  onClick={() => go(logoutUrl(currentPath()))}
                  className="block w-full rounded-(--radius-control) px-2.5 py-2 text-left text-sm text-body transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {t("signOut")}
                </button>
              </>
            ) : (
              <>
                <p className="px-2.5 pb-1 pt-2 text-xs text-muted">{t("signInWith")}</p>
                <ProviderButton provider="github" label={t("github")} onClick={go} />
                <ProviderButton provider="aad" label={t("microsoft")} onClick={go} />
              </>
            )}
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

function ProviderButton({
  provider,
  label,
  onClick,
}: {
  provider: Provider;
  label: string;
  onClick: (href: string) => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={() => onClick(loginUrl(provider, currentPath()))}
      className="flex w-full items-center gap-2.5 rounded-(--radius-control) px-2.5 py-2 text-left text-sm text-body transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {provider === "github" ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <rect x="1" y="1" width="6.5" height="6.5" fill="#f25022" />
          <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7fba00" />
          <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00a4ef" />
          <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#ffb900" />
        </svg>
      )}
      {label}
    </button>
  );
}
