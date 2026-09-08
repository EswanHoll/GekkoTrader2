import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AutopilotCard,
  OpenPositionsTable,
  RecentTradesTable,
  StrategiesTable,
} from "@/components/desk";
import { Metric } from "@/components/Metric";
import { useDashboard } from "@/hooks/useDashboard";
import { useDemoSettings } from "@/hooks/useDemoSettings";
import { useDeskScope, simScopeFor } from "@/hooks/useDeskScope";
import { useSettingsVersions } from "@/hooks/useSettingsVersions";
import { useStartRun } from "@/hooks/useStartRun";
import { useTerminateEngine } from "@/hooks/useTerminateEngine";
import {
  deskPositions,
  deskStrategies,
  deskTrades,
  maxOpenPositions,
  simulatedAnchor,
} from "@/lib/deskLedger";
import {
  firstValue,
  formatPct,
  formatRuntimePlain,
  formatWinRate,
  periodValue,
} from "@/lib/format";
import {
  deskLabel,
  formatScopeLabel,
  pathForScope,
  resolvePlaybookKey,
} from "@/lib/scope";
import { ApiError } from "@/api/client";

function boundPayload(
  versions: {
    settings_version_id?: string | number;
    payload?: Record<string, unknown>;
  }[],
  activeId: string
): Record<string, unknown> {
  const bound =
    versions.find((v) => String(v.settings_version_id) === activeId) ||
    versions[0];
  return (bound?.payload as Record<string, unknown>) || bound || {};
}

/** Trading desk for Sim A/B and Demo A/B — scope from `/:env/:lane`. */
export function DeskPage() {
  const scope = useDeskScope();
  const isSim = scope?.execution_env === "sim";
  const isDemo = scope?.execution_env === "demo";
  const dash = useDashboard(scope);
  const settings = useSettingsVersions(isSim ? scope : null);
  const demoSettings = useDemoSettings(isDemo ? scope : null);
  const start = useStartRun(isSim ? scope : null);
  const terminate = useTerminateEngine(
    isSim || isDemo ? scope : null
  );
  const [termMsg, setTermMsg] = useState("");

  const data = dash.data;
  // GST-139 — Demo unbound desks used to 404; treat as empty idle desk.
  const demoEmpty =
    isDemo &&
    dash.isError &&
    dash.error instanceof ApiError &&
    (dash.error.status === 404 ||
      /not found/i.test(dash.error.message || ""));
  const dashError = dash.isError && !demoEmpty;
  const payload = (data || null) as Record<string, unknown> | null;
  const positions = useMemo(() => deskPositions(payload), [payload]);
  const strategies = useMemo(() => deskStrategies(payload), [payload]);
  const trades = useMemo(() => deskTrades(payload), [payload]);
  const equity = firstValue(data?.equity, data?.balance);
  const maxOpen = maxOpenPositions(payload);

  if (!scope) {
    return (
      <p className="text-gekko-muted" data-testid="desk-wrong-scope">
        Unknown desk.
      </p>
    );
  }

  const chip = formatScopeLabel(
    scope,
    resolvePlaybookKey(data?.playbook_key, data?.strategy_suite, scope)
  );

  let activeId = "";
  let knobs: Record<string, unknown> = {};
  if (isSim) {
    activeId =
      settings.data?.active_binding?.settings_version_id != null
        ? String(settings.data.active_binding.settings_version_id)
        : "";
    knobs = boundPayload(settings.data?.versions || [], activeId);
  } else if (isDemo) {
    knobs = (demoSettings.data?.settings as Record<string, unknown>) || {};
    activeId =
      demoSettings.data?.settings_version_id != null
        ? String(demoSettings.data.settings_version_id)
        : "";
  }

  const playbook = resolvePlaybookKey(
    (knobs.playbook_key as string) || data?.playbook_key,
    (knobs.strategy_suite as string) || data?.strategy_suite,
    scope
  );

  const startError =
    start.error instanceof Error
      ? start.error.message
      : start.error
        ? String(start.error)
        : "";
  const cancelled =
    start.error &&
    typeof start.error === "object" &&
    "code" in start.error &&
    (start.error as { code?: string }).code === "cancelled";

  const settingsLoading = isSim
    ? settings.isLoading
    : isDemo
      ? demoSettings.isLoading
      : false;
  const settingsMissing = isSim ? !activeId : isDemo && !Object.keys(knobs).length;

  return (
    <section
      className="space-y-6"
      data-testid="sim-desk-page"
      data-desk-env={scope.execution_env}
      data-desk-lane={scope.lane}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
            {deskLabel(scope)}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            Trading Desk
          </h1>
          <p
            id="scopeBanner"
            className="mt-2 text-sm text-gekko-muted"
            data-testid="scope-banner"
          >
            {chip}
          </p>
          <p className="mt-1 text-sm text-gekko-muted">
            Playbook <strong data-testid="playbook-key">{playbook || "—"}</strong>
            {" · "}
            Runtime{" "}
            <strong data-testid="runtime-status">
              {dash.isLoading ? "…" : formatRuntimePlain(data || null)}
            </strong>
          </p>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="desk-run-controls"
        >
          {isSim ? (
            <button
              type="button"
              id="deskStartRun"
              data-testid="desk-start-run"
              className="rounded bg-gekko px-4 py-2 text-sm font-bold text-gekko-bg disabled:opacity-40"
              disabled={start.isPending || !activeId}
              title="Queue a research job from bound Current settings"
              onClick={() => start.mutate({})}
            >
              {start.isPending ? "Starting…" : "Start Run"}
            </button>
          ) : (
            <Link
              className="rounded border border-gekko-border px-3 py-2 text-sm hover:border-gekko/40"
              to={pathForScope(simScopeFor(scope), "results")}
              data-testid="desk-sim-results-link"
              title="Promote knobs from Sim Results"
            >
              Sim Results
            </Link>
          )}
          {isDemo && (
            /* Resume is the inverse of Stop. Without it a stopped desk could
               only be recovered by restarting the worker, so an operator would
               hesitate to use Stop at all. Demo only: a cancelled Sim run is
               terminal and cannot be un-cancelled. */
            <button
              type="button"
              data-testid="desk-resume-run"
              className="rounded border border-gekko/60 bg-gekko/15 px-3 py-2 text-sm font-semibold text-gekko disabled:opacity-40"
              disabled={terminate.isPending}
              title="Resume — allow new entries again (does not reopen closed positions)"
              onClick={() => {
                setTermMsg("");
                terminate.mutate("resume", {
                  onSuccess: () => setTermMsg("Entries resumed."),
                  onError: (err) =>
                    setTermMsg(
                      err instanceof Error ? err.message : "Resume failed"
                    ),
                });
              }}
            >
              {terminate.isPending && terminate.variables === "resume"
                ? "Resuming…"
                : "Resume"}
            </button>
          )}
          {(isSim || isDemo) && (
            <>
              <button
                type="button"
                data-testid="desk-stop-run"
                className="rounded border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-200 disabled:opacity-40"
                disabled={terminate.isPending}
                title="Stop — no new entries; manage open exits until flat"
                onClick={() => {
                  setTermMsg("");
                  terminate.mutate("graceful", {
                    onSuccess: (body) => {
                      setTermMsg(
                        `Stop requested${
                          body.detail ? ` · ${String(body.detail)}` : ""
                        }.`
                      );
                    },
                    onError: (err) => {
                      setTermMsg(
                        err instanceof Error ? err.message : "Stop failed"
                      );
                    },
                  });
                }}
              >
                {terminate.isPending && terminate.variables === "graceful"
                  ? "Stopping…"
                  : "Stop"}
              </button>
              <button
                type="button"
                data-testid="desk-kill-run"
                className="rounded border border-red-500/60 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-200 disabled:opacity-40"
                disabled={terminate.isPending}
                title="Kill — halt now and flatten open positions"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Kill this desk now? Open positions will be closed immediately."
                    )
                  ) {
                    return;
                  }
                  setTermMsg("");
                  terminate.mutate("hard", {
                    onSuccess: (body) => {
                      setTermMsg(
                        `Kill requested${
                          body.detail ? ` · ${String(body.detail)}` : ""
                        }.`
                      );
                    },
                    onError: (err) => {
                      setTermMsg(
                        err instanceof Error ? err.message : "Kill failed"
                      );
                    },
                  });
                }}
              >
                {terminate.isPending && terminate.variables === "hard"
                  ? "Killing…"
                  : "Kill"}
              </button>
            </>
          )}
          <Link
            className="rounded border border-gekko-border px-3 py-2 text-sm hover:border-gekko/40"
            to={pathForScope(scope, "results")}
            data-testid="desk-results-link"
          >
            Results
          </Link>
          <Link
            className="rounded border border-gekko-border px-3 py-2 text-sm hover:border-gekko/40"
            to={pathForScope(scope, "runs")}
            data-testid="desk-runs-link"
          >
            Reports
          </Link>
        </div>
      </div>

      {isSim && start.isSuccess ? (
        <p
          className="rounded border border-gekko/30 bg-gekko/10 px-3 py-2 text-sm"
          data-testid="start-run-ok"
        >
          Run queued
          {start.data?.run_id ? ` · ${String(start.data.run_id)}` : ""}.
        </p>
      ) : null}
      {isSim && start.isError && !cancelled ? (
        <p
          className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm whitespace-pre-wrap"
          data-testid="start-run-error"
        >
          {startError}
          {start.error instanceof ApiError && start.error.status === 409
            ? `\nOpen Reports and Cancel the active run: ${pathForScope(scope, "runs")}`
            : ""}
        </p>
      ) : null}
      {termMsg ? (
        <p
          className="rounded border border-gekko-border/60 bg-gekko-surface/40 px-3 py-2 text-sm"
          data-testid="desk-terminate-status"
        >
          {termMsg}
        </p>
      ) : null}
      {demoEmpty ? (
        <p
          className="rounded border border-gekko-border/50 bg-gekko-surface/30 px-3 py-2 text-sm text-gekko-muted"
          data-testid="desk-dash-empty"
        >
          Demo desk is idle — promote knobs from Sim Results when settings are
          unbound, then wait for the Demo worker to publish live metrics.
        </p>
      ) : null}
      {dashError ? (
        <p
          className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
          data-testid="desk-dash-error"
        >
          Dashboard:{" "}
          {dash.error instanceof Error ? dash.error.message : "unavailable"}
          {dash.error instanceof ApiError && dash.error.status === 401
            ? " — sign in required."
            : ""}
        </p>
      ) : null}

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Period performance"
        data-testid="period-metrics"
      >
        <Metric
          label="Day"
          testId="metric-today-pnl"
          value={periodValue(data, "today")}
          money
          signed
          chip={chip}
        />
        <Metric
          label="Week"
          testId="metric-week-pnl"
          value={periodValue(data, "week")}
          money
          signed
          chip={chip}
        />
        <Metric
          label="Month"
          testId="metric-month-pnl"
          value={periodValue(data, "month")}
          money
          signed
          chip={chip}
        />
        <Metric
          label="Year"
          testId="metric-year-pnl"
          value={periodValue(data, "year")}
          money
          signed
          chip={chip}
        />
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Account scoreboard"
        data-testid="account-metrics"
      >
        <Metric
          label="Opening"
          testId="metric-opening-balance"
          value={data?.opening_balance}
          money
          chip={chip}
        />
        {/* Cash: opening + realised. Differs from Equity only while a position
            is open, which is exactly when the difference matters. */}
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
          label="% Growth"
          testId="metric-growth-pct"
          value={null}
          raw={formatPct(
            firstValue(
              data?.growth_pct,
              data?.total_pnl_pct,
              data?.opening_balance != null &&
                firstValue(data?.realized_pnl, data?.lifetime_pnl) != null
                ? Number(firstValue(data?.realized_pnl, data?.lifetime_pnl)) /
                    Number(data.opening_balance)
                : null
            )
          )}
          chip={chip}
        />
        <Metric
          label="Open Positions"
          testId="metric-open-positions"
          value={data?.open_positions}
          chip={chip}
        />
        <Metric
          label="Win Rate"
          testId="metric-win-rate"
          value={null}
          raw={formatWinRate(data?.win_rate)}
          chip={chip}
        />
        <Metric
          label="Closed Trades"
          testId="metric-closed-trades"
          value={firstValue(data?.closed_trades, data?.trades_closed)}
          chip={chip}
        />
      </section>

      <OpenPositionsTable
        rows={positions}
        equity={equity}
        maxOpen={firstValue(maxOpen, knobs.max_open_positions)}
      />
      <StrategiesTable rows={strategies} />
      <RecentTradesTable
        rows={trades}
        equity={equity}
        simAnchor={simulatedAnchor(payload)}
        scope={scope}
      />
      <AutopilotCard payload={payload} />

      <section
        className="rounded-lg border border-gekko-border bg-gekko-surface/40 p-4"
        data-testid="bound-settings"
      >
        <h2 className="text-lg font-bold">
          {isSim ? "Bound settings (Start Run source)" : "Demo settings"}
        </h2>
        <p className="mt-1 text-sm text-gekko-muted">
          {isSim
            ? "Start Run uses the active binding only — never the newest unbound version."
            : "Read-only. Promote proven Sim knobs with Copy to Demo / Go To Demo on Sim Results."}
        </p>
        {settingsLoading ? (
          <p className="mt-3 text-sm text-gekko-muted">Loading settings…</p>
        ) : settingsMissing ? (
          <p
            className="mt-3 text-sm text-amber-300"
            data-testid="settings-binding-missing"
          >
            {isSim
              ? "No bound settings version. Bind one on Strategy before Start Run."
              : "No Demo settings bound yet. Copy from Sim Results first."}
          </p>
        ) : (
          <dl
            className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="bound-knobs"
          >
            {(
              [
                ["Version", activeId || "—"],
                ["Dataset", knobs.dataset_id],
                ["Seed", knobs.seed ?? knobs.learning_seed],
                [
                  "Manifest",
                  knobs.manifest_sha256
                    ? `${String(knobs.manifest_sha256).slice(0, 12)}…`
                    : "—",
                ],
                ["Signal", knobs.signal_interval || knobs.interval],
                ["HTF", knobs.htf_interval],
                ["Risk %", knobs.risk_per_trade_pct],
                ["Max open", knobs.max_open_positions],
              ] as Array<[string, unknown]>
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-gekko-muted">{label}</dt>
                <dd className="font-mono text-sm">
                  {value == null || value === "" ? "—" : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </section>
  );
}

/** @deprecated Use DeskPage — kept for GST-116 wire tests. */
export { DeskPage as SimDeskPage };
