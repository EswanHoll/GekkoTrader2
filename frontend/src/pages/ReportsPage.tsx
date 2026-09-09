import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, fetchRuns } from "@/api/client";
import { simScopeFor, useDeskScope } from "@/hooks/useDeskScope";
import { useStartRun } from "@/hooks/useStartRun";
import { formatMoney } from "@/lib/format";
import { deskLabel, pathForScope, resolvePlaybookKey } from "@/lib/scope";
import { getAuthToken } from "@/lib/auth";

const TERMINAL_OK = new Set(["succeeded", "completed"]);

function runPnl(run: Record<string, unknown>): unknown {
  const metrics =
    run.metrics && typeof run.metrics === "object"
      ? (run.metrics as Record<string, unknown>)
      : {};
  return (
    metrics.total_pnl ??
    metrics.realized_pnl ??
    run.total_pnl ??
    run.realized_pnl ??
    null
  );
}

function formatRunTime(run: Record<string, unknown>): string {
  const raw =
    run.started_at || run.created_at || run.finished_at || run.completed_at;
  if (!raw) return String(run.run_label || run.run_id || "—");
  try {
    return new Date(String(raw)).toLocaleString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(raw);
  }
}

/** Reports / run archive — Sim run ledger; Demo soft-gate. */
export function ReportsPage() {
  const scope = useDeskScope();
  const start = useStartRun(scope?.execution_env === "sim" ? scope : null);
  const signedIn = !!getAuthToken();
  const [picked, setPicked] = useState<string[]>([]);

  const runsQ = useQuery({
    queryKey: ["runs", scope?.scope_key, "reports"],
    queryFn: () => fetchRuns(scope!),
    enabled: !!scope && scope.execution_env === "sim",
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const runs = runsQ.data?.runs || [];
  const playbook = resolvePlaybookKey(
    runsQ.data?.playbook_key,
    null,
    scope
  );

  const compareHref = useMemo(() => {
    if (!scope || picked.length < 2 || picked.length > 10) return null;
    return `${pathForScope(scope, "compare")}?run_ids=${encodeURIComponent(picked.join(","))}`;
  }, [scope, picked]);

  if (!scope) {
    return <p className="text-gekko-muted">Unknown desk.</p>;
  }

  if (scope.execution_env !== "sim") {
    return (
      <section className="space-y-4" data-testid="reports-page" data-page="runs">
        <h1 className="text-3xl font-extrabold tracking-tight">Reports</h1>
        <p
          className="text-gekko-muted"
          id="simLedgerUnavailable"
          role="status"
          data-testid="reports-unavailable"
        >
          <strong>Reports not on this desk yet</strong> — Demo and Live desks do
          not use the Sim Batch run ledger. Open{" "}
          <Link
            className="text-gekko underline"
            to={pathForScope(simScopeFor(scope), "runs")}
          >
            Sim {String(scope.lane).toUpperCase()} Reports
          </Link>{" "}
          for archived Batch runs.
        </p>
      </section>
    );
  }

  function togglePick(runId: string, selectable: boolean) {
    if (!selectable) return;
    setPicked((prev) =>
      prev.includes(runId) ? prev.filter((id) => id !== runId) : [...prev, runId]
    );
  }

  return (
    <section className="space-y-6" data-testid="reports-page" data-page="runs">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
          {deskLabel(scope)}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Reports</h1>
        <p className="mt-2 max-w-2xl text-gekko-muted">
          Archived Sim Batch runs for this desk
          {playbook ? ` · ${playbook}` : ""}.
        </p>
        <p
          id="scopeBanner"
          className="mt-2 text-sm text-gekko-muted"
          data-testid="scope-banner"
        >
          {deskLabel(scope)}
          {playbook ? ` · ${playbook}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="reports-commands">
        {signedIn ? (
          <button
            type="button"
            className="rounded bg-gekko px-3 py-1.5 text-sm font-bold text-gekko-bg disabled:opacity-40"
            data-testid="reports-start-run"
            disabled={start.isPending}
            onClick={() => start.mutate({})}
          >
            {start.isPending ? "Starting…" : "Start run"}
          </button>
        ) : (
          <p className="text-sm text-gekko-muted">
            Sign in to start or cancel runs.
          </p>
        )}
        <Link
          className="rounded border border-gekko-border px-3 py-1.5 text-sm"
          to={pathForScope(scope, "results")}
        >
          Results
        </Link>
        <Link
          className={
            compareHref
              ? "rounded border border-gekko/50 bg-gekko/10 px-3 py-1.5 text-sm text-gekko"
              : "rounded border border-gekko-border px-3 py-1.5 text-sm opacity-40 pointer-events-none"
          }
          to={compareHref || pathForScope(scope, "compare")}
          aria-disabled={!compareHref}
          data-testid="reports-open-compare"
        >
          Compare selected (2–10)
        </Link>
      </div>

      {runsQ.isError ? (
        <p
          id="pageError"
          className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
          data-testid="reports-error"
        >
          {runsQ.error instanceof ApiError
            ? runsQ.error.message
            : runsQ.error instanceof Error
              ? runsQ.error.message
              : "Runs unavailable"}
        </p>
      ) : null}

      <div
        className="space-y-2"
        id="runsBoard"
        data-testid="runs-board"
        role="list"
      >
        {runsQ.isLoading ? (
          <p className="text-gekko-muted">Loading archive…</p>
        ) : !runs.length ? (
          <p className="text-gekko-muted">No archived runs for this desk yet.</p>
        ) : (
          runs.map((run) => {
            const id = String(run.run_id || "");
            const status = String(run.status || "unknown").toLowerCase();
            const selectable = TERMINAL_OK.has(status);
            const pnl = runPnl(run);
            const checked = picked.includes(id);
            return (
              <label
                key={id}
                className="flex flex-wrap items-center gap-3 rounded border border-gekko-border bg-gekko-surface/40 px-3 py-2 text-sm"
                role="listitem"
                data-run-id={id}
              >
                <input
                  type="checkbox"
                  className="runPick"
                  value={id}
                  disabled={!selectable}
                  checked={checked}
                  data-compare={selectable ? "1" : "0"}
                  onChange={() => togglePick(id, selectable)}
                />
                <span className="min-w-0 flex-1">
                  <strong>
                    <Link
                      className="text-gekko hover:underline"
                      to={`${pathForScope(scope, "results")}?run_id=${encodeURIComponent(id)}`}
                    >
                      {formatRunTime(run)}
                    </Link>
                  </strong>
                  <span className="ml-2 font-mono text-xs text-gekko-muted">
                    {String(run.run_label || id)}
                  </span>
                </span>
                <span className="font-mono text-xs uppercase">{status}</span>
                <span className="text-gekko-muted">
                  {String(run.playbook_key || playbook || "—")} ·{" "}
                  {formatMoney(pnl, { signed: true })}
                </span>
              </label>
            );
          })
        )}
      </div>
    </section>
  );
}
