import { Link } from "react-router-dom";
import { useControlHealth } from "@/hooks/useControlHealth";
import { useOverview } from "@/hooks/useOverview";
import { uiVersion } from "@/lib/config";
import { formatMoney } from "@/lib/format";
import { getAuthToken } from "@/lib/auth";
import { resolvePlaybookKey } from "@/lib/scope";
import type { OverviewDeskTile } from "@/api/client";
import type { DatasetScope } from "@/types/scope";

function deskHref(desk: OverviewDeskTile): string {
  if (desk.execution_env === "live") return "/live/";
  return `/${desk.execution_env}/${desk.lane}/`;
}

function deskScope(desk: OverviewDeskTile): DatasetScope | null {
  if (desk.execution_env === "live") {
    return { execution_env: "live", lane: null, scope_key: "live" };
  }
  if (desk.execution_env === "sim" && (desk.lane === "a" || desk.lane === "b")) {
    return {
      execution_env: "sim",
      lane: desk.lane,
      scope_key: `sim|${desk.lane}`,
    };
  }
  if (desk.execution_env === "demo" && (desk.lane === "a" || desk.lane === "b")) {
    return {
      execution_env: "demo",
      lane: desk.lane,
      scope_key: `demo|${desk.lane}`,
    };
  }
  return null;
}

export function OverviewPage() {
  const health = useControlHealth();
  const overview = useOverview();
  const signedIn = !!getAuthToken();

  return (
    <section className="space-y-6" data-testid="overview-page">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
          GekkoTrader
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Home</h1>
        <p className="mt-2 max-w-2xl text-gekko-muted">
          Fleet desks hydrated from AWS Control. Sign in so JWT-backed dashboard
          reads can fill equity and runtime.
        </p>
        <p
          className="mt-2 font-mono text-xs text-gekko-muted"
          data-testid="overview-control-status"
        >
          ui {uiVersion()} · Control{" "}
          {health.isLoading
            ? "checking…"
            : health.isError
              ? `unreachable (${health.error instanceof Error ? health.error.message : "error"})`
              : `ok${health.data?.status ? ` · ${String(health.data.status)}` : ""}`}
          {" · "}
          {signedIn ? "signed in" : (
            <Link to="/login/" className="text-gekko underline">
              sign in
            </Link>
          )}
        </p>
      </div>

      {overview.isError ? (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm" data-testid="overview-error">
          Could not load overview:{" "}
          {overview.error instanceof Error
            ? overview.error.message
            : "unknown error"}
        </p>
      ) : null}

      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="overview-desk-grid"
      >
        {(overview.data?.desks || []).map((desk) => {
          const scope = deskScope(desk);
          const playbook = resolvePlaybookKey(
            desk.playbook_key,
            null,
            scope
          );
          return (
            <Link
              key={desk.scope_key}
              to={deskHref(desk)}
              data-testid={`overview-desk-${desk.scope_key.replace("|", "-")}`}
              className="rounded-lg border border-gekko-border bg-gekko-surface/70 px-4 py-4 transition hover:border-gekko/40 hover:bg-gekko-surface-hover"
            >
              <div className="text-xs uppercase tracking-wide text-gekko-muted">
                {desk.scope_key}
              </div>
              <div className="mt-1 text-lg font-bold">{desk.label}</div>
              <div className="mt-2 font-mono text-xs text-gekko-muted">
                {playbook || "—"} · {desk.runtime_status}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-gekko-muted">Equity</div>
                  <div className="font-mono" data-testid="overview-desk-equity">
                    {formatMoney(desk.equity)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gekko-muted">$ PnL</div>
                  <div className="font-mono" data-testid="overview-desk-pnl">
                    {formatMoney(desk.realized_pnl, { signed: true })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gekko-muted">Open</div>
                  <div className="font-mono">
                    {desk.open_positions == null
                      ? "—"
                      : String(desk.open_positions)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gekko-muted">Opening</div>
                  <div className="font-mono">
                    {formatMoney(desk.opening_balance)}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-sm text-gekko">Open desk →</div>
            </Link>
          );
        })}
        {overview.isLoading && !overview.data ? (
          <p className="text-sm text-gekko-muted" data-testid="overview-loading">
            Loading desks from Control…
          </p>
        ) : null}
      </div>
    </section>
  );
}
