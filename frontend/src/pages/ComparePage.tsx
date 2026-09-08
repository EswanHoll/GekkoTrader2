import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, compareRuns, fetchRuns } from "@/api/client";
import { useDeskScope } from "@/hooks/useDeskScope";
import { formatMoney } from "@/lib/format";
import { deskLabel, formatScopeLabel, pathForScope } from "@/lib/scope";

const TERMINAL_OK = new Set(["succeeded", "completed"]);

/** Compare 2–10 succeeded Sim runs — port of legacy bootComparePage. */
export function ComparePage() {
  const scope = useDeskScope();
  const [params] = useSearchParams();

  const requestedIds = useMemo(
    () =>
      (params.get("run_ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [params]
  );

  const listQ = useQuery({
    queryKey: ["runs", scope?.scope_key, "compare-fallback"],
    queryFn: () => fetchRuns(scope!),
    enabled:
      !!scope &&
      scope.execution_env === "sim" &&
      requestedIds.length < 2,
    staleTime: 30_000,
  });

  const runIds = useMemo(() => {
    if (requestedIds.length >= 2) return requestedIds.slice(0, 10);
    const runs = listQ.data?.runs || [];
    return runs
      .filter((r) => TERMINAL_OK.has(String(r.status || "").toLowerCase()))
      .slice(0, 3)
      .map((r) => String(r.run_id));
  }, [requestedIds, listQ.data]);

  const compareQ = useQuery({
    queryKey: ["runs-compare", scope?.scope_key, runIds.join(",")],
    queryFn: () => compareRuns(scope!, runIds),
    enabled:
      !!scope &&
      scope.execution_env === "sim" &&
      runIds.length >= 2 &&
      runIds.length <= 10,
    staleTime: 30_000,
  });

  if (!scope) {
    return <p className="text-gekko-muted">Unknown desk.</p>;
  }

  if (scope.execution_env !== "sim") {
    return (
      <section className="space-y-4" data-testid="compare-page">
        <h1 className="text-3xl font-extrabold tracking-tight">Compare</h1>
        <p className="text-gekko-muted" data-testid="compare-unavailable">
          Compare is available for Sim desk succeeded runs only.
        </p>
      </section>
    );
  }

  const label = formatScopeLabel(scope);
  const rows = compareQ.data?.rows || [];
  const changed = Array.isArray(compareQ.data?.changed_settings_keys)
    ? (compareQ.data!.changed_settings_keys as string[])
    : [];

  return (
    <section className="space-y-6" data-testid="compare-page" data-page="compare">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
          {deskLabel(scope)}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Compare</h1>
        <p
          id="scopeBanner"
          className="mt-2 text-sm text-gekko-muted"
          data-testid="scope-banner"
        >
          {label}
        </p>
        <p className="mt-1 text-sm text-gekko-muted">
          Changed settings keys: {changed.join(", ") || "—"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            className="rounded border border-gekko-border px-3 py-1.5 text-sm"
            to={pathForScope(scope, "runs")}
          >
            Reports
          </Link>
          <Link
            className="rounded border border-gekko-border px-3 py-1.5 text-sm"
            to={pathForScope(scope, "results")}
          >
            Results
          </Link>
        </div>
      </div>

      {listQ.isLoading && requestedIds.length < 2 ? (
        <p className="text-gekko-muted">Loading runs…</p>
      ) : runIds.length < 2 || runIds.length > 10 ? (
        <p className="text-gekko-muted" data-testid="compare-need-runs">
          Select 2–10 succeeded Sim runs (got {runIds.length}). Pick them on{" "}
          <Link className="text-gekko underline" to={pathForScope(scope, "runs")}>
            Reports
          </Link>
          .
        </p>
      ) : compareQ.isError ? (
        <p
          id="pageError"
          className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
          data-testid="compare-error"
        >
          {compareQ.error instanceof ApiError
            ? compareQ.error.message
            : compareQ.error instanceof Error
              ? compareQ.error.message
              : "Compare failed"}
        </p>
      ) : compareQ.isLoading ? (
        <p className="text-gekko-muted">Comparing…</p>
      ) : (
        <div className="overflow-x-auto" id="compareRoot" data-testid="compare-root">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gekko-border text-gekko-muted">
                <th className="px-2 py-2 font-semibold">Run</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">PnL</th>
                <th className="px-2 py-2 font-semibold">Settings</th>
                <th className="px-2 py-2 font-semibold">Evidence</th>
                <th className="px-2 py-2 font-semibold">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const metrics =
                  r.metrics && typeof r.metrics === "object"
                    ? (r.metrics as Record<string, unknown>)
                    : {};
                const pnl =
                  metrics.total_pnl ?? metrics.realized_pnl ?? r.realized_pnl;
                const warnings = [
                  ...((r.evidence_warnings as string[]) || []),
                  ...((r.artefact_warnings as string[]) || []),
                ];
                return (
                  <tr
                    key={String(r.run_id)}
                    className="border-b border-gekko-border/60"
                  >
                    <td className="px-2 py-2 font-mono">
                      {String(r.run_label || r.run_id || "—")}
                    </td>
                    <td className="px-2 py-2">{String(r.status || "—")}</td>
                    <td className="px-2 py-2">
                      {formatMoney(pnl, { signed: true })}{" "}
                      <span className="text-xs text-gekko-muted">{label}</span>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {String(r.settings_version_id || "").slice(0, 18) || "—"}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {String(
                        r.trade_timeline_uri || r.equity_uri || "—"
                      ).slice(0, 40)}
                    </td>
                    <td className="px-2 py-2 text-xs text-gekko-muted">
                      {warnings.join(", ") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
