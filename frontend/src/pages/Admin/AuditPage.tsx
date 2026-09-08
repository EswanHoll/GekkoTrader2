import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { fetchAuditEvents, type AuditEventRow } from "@/api/client";
import { getAuthToken, isAdminRole, getAuthUser } from "@/lib/auth";

const PAGE = 50;

function formatWhen(raw?: string | null): string {
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  } catch {
    return String(raw);
  }
}

function userCell(e: AuditEventRow): string {
  const who = e.user || e.approver || "—";
  const role = e.role ? ` · ${e.role}` : "";
  return `${who}${role}`;
}

function resourceCell(e: AuditEventRow): string {
  if (e.resource) return String(e.resource);
  const from =
    e.source_execution_env != null
      ? `${e.source_execution_env}${e.source_lane ? `|${e.source_lane}` : ""}`
      : "";
  const to =
    e.target_execution_env != null
      ? `${e.target_execution_env}${e.target_lane ? `|${e.target_lane}` : ""}`
      : e.target || "";
  if (from && to) return `${from} → ${to}`;
  return e.playbook_key || to || "—";
}

export function AuditPage() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const isAdmin = isAdminRole(user);
  const [offset, setOffset] = useState(0);

  const q = useQuery({
    queryKey: ["audit", "scope-events", offset],
    queryFn: () => fetchAuditEvents({ limit: PAGE, offset }),
    enabled: !!getAuthToken(),
    staleTime: 15_000,
  });

  const events = q.data?.events || [];
  const total = q.data?.total ?? events.length;
  const hasMore = !!q.data?.has_more;
  const pageLabel = useMemo(() => {
    if (!total) return "0 events";
    const start = offset + 1;
    const end = offset + events.length;
    return `${start}–${end} of ${total}`;
  }, [offset, events.length, total]);

  if (!getAuthToken()) {
    navigate(`/login/?next=${encodeURIComponent("/admin/audit/")}`, {
      replace: true,
    });
    return null;
  }

  return (
    <section className="space-y-6" data-testid="audit-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
            {isAdmin ? "Admin" : "Compliance"}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            Audit Logs
          </h1>
          <p className="mt-2 max-w-2xl text-gekko-muted">
            Immutable promotion and live-activation events. Read-only — no live
            capital changes from this page.
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-gekko-border px-3 py-1.5 text-sm"
          data-testid="audit-refresh"
          onClick={() => void q.refetch()}
        >
          Refresh
        </button>
      </div>

      {q.isError ? (
        <p className="text-sm text-red-300" role="alert" data-testid="audit-error">
          {(q.error as Error)?.message || "Could not load audit events."}
        </p>
      ) : null}

      <div
        className="overflow-x-auto rounded-lg border border-gekko-border"
        data-testid="audit-table-wrap"
      >
        <table
          className="w-full min-w-[720px] text-left text-sm"
          data-testid="audit-table"
        >
          <thead className="bg-gekko-surface/80 text-xs uppercase tracking-wide text-gekko-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Timestamp</th>
              <th className="px-3 py-2 font-semibold">User / Role</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Resource / Target</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-gekko-muted"
                >
                  Loading…
                </td>
              </tr>
            ) : !events.length ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-gekko-muted"
                  data-testid="audit-empty"
                >
                  No promotion events recorded yet.
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr
                  key={String(e.event_id)}
                  className="border-t border-gekko-border/70"
                  data-testid="audit-row"
                >
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                    {formatWhen(e.occurred_at || e.approved_at)}
                  </td>
                  <td className="px-3 py-2">{userCell(e)}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {e.action || e.event_type || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {resourceCell(e)}
                    {e.playbook_key ? (
                      <span className="ml-2 text-gekko-muted">
                        {e.playbook_key}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3"
        data-testid="audit-pager"
      >
        <p className="text-sm text-gekko-muted">{pageLabel}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-gekko-border px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={offset <= 0 || q.isFetching}
            data-testid="audit-prev"
            onClick={() => setOffset((v) => Math.max(0, v - PAGE))}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded border border-gekko-border px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={!hasMore || q.isFetching}
            data-testid="audit-next"
            onClick={() => setOffset((v) => v + PAGE)}
          >
            Next
          </button>
        </div>
      </div>

      <p className="text-sm text-gekko-muted">
        Also available from Home →{" "}
        <Link className="text-gekko underline" to="/audit/">
          Promotion Audit
        </Link>
        .
      </p>
    </section>
  );
}
