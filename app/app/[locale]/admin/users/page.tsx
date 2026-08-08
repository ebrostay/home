"use client";

// The people (spec §3.7, §4.5).
//
// v1 let anyone deactivate themselves (a 100-year Supabase ban); SWA has no
// equivalent, so v2 inverts it into an admin control. Records are kept and
// never deleted — the v1 intent, preserved.
//
// There is no email column, and the panel says why rather than leaving a gap
// where one obviously belongs: the address arrives as a session claim and is
// never written to the profile document. What identifies a person here is
// their id and the door they came through — the same human using both doors
// is two accounts (§3.1), which is exactly what the door column is for.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ApiError,
  fetchAdminUsers,
  setUserDeactivation,
  type AdminUser,
} from "@/lib/api";
import { matchesUserQuery, providerLabel, tableDate } from "@/lib/admin";
import { useAuth } from "@/components/site/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { AdminShell, Empty, Ledger, Rows, Td, Th } from "@/components/admin/AdminShell";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; users: AdminUser[] };

export default function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const te = useTranslations("admin.errors");
  const locale = useLocale();
  const { me } = useAuth();

  const [state, setState] = useState<State>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchAdminUsers()
      .then((users) => live && setState({ kind: "ready", users }))
      .catch(() => live && setState({ kind: "error" }));
    return () => {
      live = false;
    };
  }, []);

  const flip = useCallback(
    async (user: AdminUser, isDeactivated: boolean) => {
      setAsking(null);
      setBusy(user.id);
      setError(null);
      try {
        await setUserDeactivation(user.id, isDeactivated);
        // The saved row is merged rather than swapped in: the deactivation
        // endpoint answers with the profile alone and has no listing counts
        // to give, and a row that lost its counts on a click would look like
        // the account had lost its homes.
        setState((s) =>
          s.kind === "ready"
            ? {
                kind: "ready",
                users: s.users.map((u) =>
                  u.id === user.id ? { ...u, isDeactivated } : u,
                ),
              }
            : s,
        );
      } catch (err: unknown) {
        const code = err instanceof ApiError ? err.code : undefined;
        setError(te(code && KNOWN.includes(code) ? code : "generic"));
      } finally {
        setBusy(null);
      }
    },
    [te],
  );

  const users = useMemo(
    () => (state.kind === "ready" ? state.users : []),
    [state],
  );
  const shown = useMemo(
    () => users.filter((u) => matchesUserQuery(u, query)),
    [users, query],
  );

  return (
    <AdminShell
      section="users"
      count={state.kind === "ready" ? shown.length : undefined}
    >
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs leading-relaxed text-muted">{t("noEmail")}</p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="w-full rounded-(--radius-control) border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted sm:w-72"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      {state.kind === "loading" && <Rows n={6} />}
      {state.kind === "error" && <Empty>{t("error")}</Empty>}

      {state.kind === "ready" && shown.length === 0 && (
        <Empty>{users.length === 0 ? t("empty") : t("noMatch")}</Empty>
      )}

      {state.kind === "ready" && shown.length > 0 && (
        <Ledger>
          <thead>
            <tr>
              <Th>{t("col.name")}</Th>
              <Th className="hidden sm:table-cell">{t("col.door")}</Th>
              <Th align="right">{t("col.listings")}</Th>
              <Th className="hidden lg:table-cell">{t("col.created")}</Th>
              <Th className="hidden lg:table-cell">{t("col.lastSeen")}</Th>
              <Th>{t("col.state")}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {shown.map((user) => (
              <tr key={user.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <span className="font-medium text-ink">{user.name || "—"}</span>
                  <span className="data mt-0.5 block truncate text-[0.6875rem] text-muted">
                    {user.id}
                  </span>
                </Td>

                <Td className="hidden sm:table-cell text-xs">
                  {providerLabel(user.provider)}
                </Td>

                <Td align="right" className="data">
                  {user.listingCount}
                  {user.publishedCount > 0 && (
                    <span className="ml-1 text-[0.6875rem] text-muted">
                      ({t("published", { n: user.publishedCount })})
                    </span>
                  )}
                </Td>

                <Td className="data hidden lg:table-cell text-xs">
                  {tableDate(user.createdAt, locale) ?? "—"}
                </Td>

                <Td className="data hidden lg:table-cell text-xs">
                  {tableDate(user.lastSeenAt, locale) ?? "—"}
                </Td>

                <Td>
                  <Badge tone={user.isDeactivated ? "danger" : "neutral"}>
                    {t(user.isDeactivated ? "state.deactivated" : "state.active")}
                  </Badge>
                </Td>

                <Td align="right">
                  {/* Your own row carries no button. Deactivating yourself
                      locks you out of every admin endpoint — the §3.7 check
                      runs before any role is read — and nothing in this page
                      could undo it. The API refuses it too; this is so the
                      button is never offered. */}
                  {user.id !== me.userId && (
                    <button
                      type="button"
                      disabled={busy === user.id}
                      onClick={() =>
                        user.isDeactivated ? flip(user, false) : setAsking(user)
                      }
                      className="text-xs text-body underline-offset-4 hover:text-ink hover:underline disabled:opacity-45"
                    >
                      {t(user.isDeactivated ? "reactivate" : "deactivate")}
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Ledger>
      )}

      {/* Reactivating is one press; deactivating asks. The two are not
          symmetrical: one restores what someone had, the other takes it
          away. */}
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={t("confirmTitle")}
      >
        <p className="text-sm leading-relaxed text-body">{t("confirmLead")}</p>
        <p className="data mt-3 text-xs text-muted">{asking?.name}</p>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setAsking(null)}>
            {t("cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => asking && flip(asking, true)}
          >
            {t("confirm")}
          </Button>
        </div>
      </Dialog>
    </AdminShell>
  );
}

const KNOWN = ["cannot_deactivate_self", "stale_write"];
