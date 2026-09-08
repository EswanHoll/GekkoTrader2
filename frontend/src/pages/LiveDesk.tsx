import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Metric } from "@/components/Metric";
import { ApiError } from "@/api/client";
import { useFleetActions, useDesksStatus } from "@/hooks/useDesksStatus";
import { useLiveDashboard, LIVE_SCOPE } from "@/hooks/useLiveDashboard";
import {
  firstValue,
  formatRuntimePlain,
  formatWinRate,
} from "@/lib/format";
import { formatScopeLabel, resolvePlaybookKey } from "@/lib/scope";
import { getAuthUser } from "@/lib/auth";

function asPositions(data: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const raw = firstValue(data?.paper_positions, data?.positions);
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

export function LiveDesk() {
  const dash = useLiveDashboard();
  const fleet = useDesksStatus({ pollMs: 5_000 });
  const actions = useFleetActions();
  const user = getAuthUser();
  const isSuper = user?.role === "super_admin" || !!user?.is_super_admin;

  const data = dash.data;
  const playbook = resolvePlaybookKey(
    data?.playbook_key,
    data?.strategy_suite,
    LIVE_SCOPE
  );
  const chip = formatScopeLabel(LIVE_SCOPE, playbook);
  const runtimeHint = String(
    data?.runtime_status || data?.gate_state || "dormant"
  ).toLowerCase();
  const dormant =
    data == null ||
    data?.is_dormant === true ||
    runtimeHint.includes("dormant");

  const liveDesk = fleet.data?.desks?.live;
  const activity = String(liveDesk?.activity?.state || "").toLowerCase();
  const frozen = activity === "kill";
  const positions = useMemo(() => asPositions(data as Record<string, unknown>), [data]);

  const busy =
    actions.kill.isPending ||
    actions.globalKill.isPending ||
    actions.power.isPending;

  const statusMsg =
    actions.kill.error instanceof Error
      ? actions.kill.error.message
      : actions.globalKill.error instanceof Error
        ? actions.globalKill.error.message
        : actions.kill.isSuccess
          ? frozen
            ? "Freeze requested."
            : "Resume requested."
          : actions.globalKill.isSuccess
            ? "Global kill updated."
            : "";

  return (
    <section className="space-y-6" data-testid="live-desk-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
            Live · single desk
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            Live Status
          </h1>
          <p className="mt-2 max-w-2xl text-gekko-muted">
            Dormant-safe read view. Live capital activates only by operator
            decision. Metrics poll every 5 seconds (no WebSocket).
          </p>
          <p
            id="scopeBanner"
            className="mt-2 text-sm text-gekko-muted"
            data-testid="scope-banner"
          >
            {chip}
          </p>
          <p className="mt-1 text-sm text-gekko-muted">
            Playbook{" "}
            <strong data-testid="playbook-key">{playbook || "—"}</strong>
            {" · "}
            Runtime{" "}
            <strong data-testid="runtime-status" id="runtimeStatus">
              {dash.isLoading ? "…" : formatRuntimePlain(data || null)}
            </strong>
          </p>
        </div>

        {isSuper ? (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="live-emergency-controls"
            aria-label="Emergency controls"
          >
            <button
              type="button"
              data-testid="live-freeze-trading"
              data-operator-kill-on={!frozen ? "1" : undefined}
              className="rounded border border-red-400/50 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-200 disabled:opacity-40"
              disabled={busy || frozen}
              title="Panic / hold — freeze new Live trades"
              onClick={() => {
                if (
                  !window.confirm(
                    "Freeze trading on Live? Open positions stay; new trades stop."
                  )
                ) {
                  return;
                }
                actions.kill.mutate({ deskId: "live", active: true });
              }}
            >
              Freeze Trading
            </button>
            <button
              type="button"
              data-testid="live-resume-trading"
              data-operator-kill-off={frozen ? "1" : undefined}
              className="rounded border border-gekko/40 bg-gekko/10 px-3 py-2 text-sm font-semibold text-gekko disabled:opacity-40"
              disabled={busy || !frozen}
              title="Resume Live trading after a freeze"
              onClick={() => actions.kill.mutate({ deskId: "live", active: false })}
            >
              Resume Trading
            </button>
            <button
              type="button"
              data-testid="live-global-panic"
              className="rounded border border-red-500/60 px-3 py-2 text-sm font-bold text-red-300 disabled:opacity-40"
              disabled={busy}
              title="Global kill switch across trade workers"
              onClick={() => {
                if (
                  !window.confirm(
                    "Engage GLOBAL kill / hold? This freezes trading across workers."
                  )
                ) {
                  return;
                }
                actions.globalKill.mutate(true);
              }}
            >
              Global Panic
            </button>
            <Link
              to="/admin/operator/"
              className="rounded border border-gekko-border px-3 py-2 text-sm"
              data-testid="live-admin-operator-link"
            >
              Environments
            </Link>
          </div>
        ) : (
          <p className="text-sm text-gekko-muted" data-testid="live-emergency-locked">
            Emergency freeze controls require super admin.
          </p>
        )}
      </div>

      <p
        id="dormantNote"
        data-testid="dormant-note"
        className="rounded-lg border border-gekko-border bg-gekko-surface/50 px-4 py-3 text-sm text-gekko-muted"
        role="status"
      >
        {dormant
          ? "Live desk is dormant — reserved until explicit activation."
          : "Live desk is reporting telemetry. Capital activation remains a manual operator decision."}
      </p>

      {statusMsg ? (
        <p
          className="rounded border border-gekko-border px-3 py-2 text-sm"
          data-testid="live-control-status"
        >
          {statusMsg}
        </p>
      ) : null}

      {dash.isError ? (
        <p
          className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
          data-testid="live-dash-error"
          id="pageError"
        >
          Dashboard:{" "}
          {dash.error instanceof ApiError
            ? dash.error.message
            : dash.error instanceof Error
              ? dash.error.message
              : "unavailable"}
          {dash.error instanceof ApiError && dash.error.status === 401
            ? " — sign in required."
            : ""}
        </p>
      ) : null}

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Scoreboard"
        data-testid="live-account-metrics"
      >
        <Metric
          label="Opening"
          testId="metric-opening-balance"
          value={data?.opening_balance}
          money
          chip={chip}
        />
        {/* Cash: opening + realised, excluding open-position marks. */}
        <Metric
          label="Curr Bal"
          testId="metric-current-balance"
          value={data?.balance}
          money
          chip={chip}
        />
        <Metric
          label="Equity"
          testId="metric-equity"
          value={firstValue(data?.equity, data?.balance)}
          money
          chip={chip}
        />
        <Metric
          label="$ PnL"
          testId="metric-realized-pnl"
          value={firstValue(data?.realized_pnl, data?.lifetime_pnl)}
          money
          signed
          chip={chip}
        />
        <Metric
          label="Unrealized"
          testId="metric-unrealized-pnl"
          value={data?.unrealized_pnl}
          money
          signed
          chip={chip}
        />
        <Metric
          label="Open Positions"
          testId="metric-open-positions"
          value={
            data?.open_positions != null
              ? data.open_positions
              : positions.length || null
          }
          chip={chip}
        />
        <Metric
          label="Win Rate"
          testId="metric-win-rate"
          value={null}
          raw={formatWinRate(data?.win_rate)}
          chip={chip}
        />
      </section>

      <section
        className="rounded-lg border border-gekko-border overflow-x-auto"
        data-testid="live-positions"
      >
        <div className="border-b border-gekko-border px-4 py-3">
          <h2 className="text-lg font-bold">Open Positions</h2>
          <p className="text-sm text-gekko-muted">
            Polled from Control · {positions.length} open
          </p>
        </div>
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-gekko-surface/80 text-xs uppercase tracking-wide text-gekko-muted">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Entry</th>
              <th className="px-3 py-2">PnL</th>
            </tr>
          </thead>
          <tbody>
            {!positions.length ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-gekko-muted"
                  data-testid="live-positions-empty"
                >
                  No open positions
                </td>
              </tr>
            ) : (
              positions.map((p, idx) => (
                <tr
                  key={String(p.symbol || idx)}
                  className="border-t border-gekko-border/80"
                  data-testid="live-position-row"
                >
                  <td className="px-3 py-2">{String(p.symbol || p.asset || "—")}</td>
                  <td className="px-3 py-2">
                    {String(p.side || p.position_side || "—")}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {String(firstValue(p.qty, p.quantity, p.size, "—"))}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {String(firstValue(p.entry_price, p.entry, "—"))}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {String(firstValue(p.unrealized_pnl, p.pnl, "—"))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}
