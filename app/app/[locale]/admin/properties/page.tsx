"use client";

// Every listing, in every status (spec §4.5).
//
// The queue answers "what is waiting"; this answers "where is that home I was
// told about". So it is a search box and a status strip over one table, with
// the whole set fetched once and filtered in the browser — the same choice
// the public search page makes.
//
// Editing goes through the OWNER'S editor. There is no admin-only form: a
// second form over the same fields would be a second validation of them, and
// two validations of one field is how they come to disagree. The API grants
// an admin the same write on anybody's listing, minus the re-review §2.2.1
// imposes on an owner.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ApiError,
  biText,
  fetchAdminProperties,
  setPropertyStatus,
  type AdminPropertyRow,
} from "@/lib/api";
import {
  STATUS_TABS,
  STATUS_TONE,
  filterProperties,
  statusCounts,
  tableDate,
  type StatusTab,
} from "@/lib/admin";
import { formatEuro } from "@/lib/pricing";
import { Badge } from "@/components/ui/Badge";
import { AdminShell, Empty, Ledger, Rows, Td, Th } from "@/components/admin/AdminShell";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; rows: AdminPropertyRow[] };

export default function AdminPropertiesPage() {
  const t = useTranslations("admin.properties");
  const te = useTranslations("admin.errors");
  const locale = useLocale();

  const [state, setState] = useState<State>({ kind: "loading" });
  const [tab, setTab] = useState<StatusTab>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchAdminProperties()
      .then((rows) => live && setState({ kind: "ready", rows }))
      .catch(() => live && setState({ kind: "error" }));
    return () => {
      live = false;
    };
  }, []);

  // The row that just changed is replaced in place rather than the list being
  // refetched: a reviewer who pauses the fourth of twenty rows should not
  // watch the table they are reading rebuild itself under the cursor.
  const flip = useCallback(
    async (row: AdminPropertyRow) => {
      const next = row.status === "published" ? "paused" : "published";
      setBusy(row.id);
      setError(null);
      try {
        const saved = await setPropertyStatus(row.id, next);
        setState((s) =>
          s.kind === "ready"
            ? { kind: "ready", rows: s.rows.map((r) => (r.id === row.id ? saved : r)) }
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

  // Memoised so the empty-array literal is not a new dependency on every
  // render, which would recompute the counts and the filter for nothing.
  const rows = useMemo(
    () => (state.kind === "ready" ? state.rows : []),
    [state],
  );
  const counts = useMemo(() => statusCounts(rows), [rows]);
  const shown = useMemo(
    () => filterProperties(rows, tab, query),
    [rows, tab, query],
  );

  return (
    <AdminShell
      section="properties"
      count={state.kind === "ready" ? shown.length : undefined}
    >
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex flex-wrap gap-1">
          {STATUS_TABS.map((key) => {
            const on = key === tab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors duration-(--dur-standard) ${
                  on
                    ? "bg-brand-soft font-semibold text-brand-strong"
                    : "font-medium text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {t(`tabs.${key}` as "tabs.all")}
                <span className="data text-[0.625rem] opacity-70">{counts[key]}</span>
              </button>
            );
          })}
        </div>

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

      {state.kind === "loading" && <Rows n={8} />}
      {state.kind === "error" && <Empty>{t("error")}</Empty>}

      {state.kind === "ready" && shown.length === 0 && (
        <Empty>{rows.length === 0 ? t("empty") : t("noMatch")}</Empty>
      )}

      {state.kind === "ready" && shown.length > 0 && (
        <Ledger>
          <thead>
            <tr>
              <Th className="w-28">{t("col.status")}</Th>
              <Th>{t("col.listing")}</Th>
              <Th className="hidden md:table-cell">{t("col.owner")}</Th>
              <Th align="right" className="hidden sm:table-cell">
                {t("col.price")}
              </Th>
              <Th align="right" className="hidden lg:table-cell">
                {t("col.photos")}
              </Th>
              <Th className="hidden lg:table-cell">{t("col.updated")}</Th>
              <Th align="right">{t("col.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <Badge tone={STATUS_TONE[row.status]}>
                    {t(`tabs.${row.status}` as "tabs.published")}
                  </Badge>
                </Td>

                <Td>
                  <span className="font-medium text-ink">
                    {row.name || t("untitled")}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {[row.reference, row.address, biText(row.area, locale)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Td>

                <Td className="hidden md:table-cell">
                  <span className="text-xs">{row.hostName ?? "—"}</span>
                </Td>

                <Td align="right" className="data hidden sm:table-cell">
                  {formatEuro(row.priceNumber, locale)}
                </Td>

                <Td align="right" className="data hidden lg:table-cell">
                  {row.photoCount}
                </Td>

                <Td className="data hidden lg:table-cell text-xs">
                  {tableDate(row.updatedAt, locale) ?? "—"}
                </Td>

                <Td align="right">
                  <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
                    {row.status === "pending_review" && (
                      <Link
                        href={`/admin/review?id=${encodeURIComponent(row.id)}`}
                        className="font-semibold text-brand-strong underline-offset-4 hover:underline"
                      >
                        {t("action.review")}
                      </Link>
                    )}
                    <Link
                      href={`/host/edit?id=${encodeURIComponent(row.id)}`}
                      className="text-body underline-offset-4 hover:text-ink hover:underline"
                    >
                      {t("action.edit")}
                    </Link>
                    <Link
                      href={`/host/manage?id=${encodeURIComponent(row.id)}`}
                      className="text-body underline-offset-4 hover:text-ink hover:underline"
                    >
                      {t("action.manage")}
                    </Link>
                    {(row.status === "published" || row.status === "paused") && (
                      <button
                        type="button"
                        onClick={() => flip(row)}
                        disabled={busy === row.id}
                        className="text-body underline-offset-4 hover:text-ink hover:underline disabled:opacity-45"
                      >
                        {row.status === "published"
                          ? t("action.pause")
                          : t("action.publish")}
                      </button>
                    )}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Ledger>
      )}
    </AdminShell>
  );
}

const KNOWN = ["not_reviewed", "not_published", "stale_write"];
