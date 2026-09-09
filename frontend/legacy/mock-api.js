/**
 * Contract-shaped stub for DevSpec-01 UI bootstrap.
 * snake_case payloads that echo execution_env + lane.
 * Swap off via GEKKO_USE_MOCK_API=false / config when App control API is ready.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GekkoMockApi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PLAYBOOK_BY_LANE = Object.freeze({
    a: "playbook1.1",
    b: "playbook3.1",
  });

  function parseUrl(url) {
    try {
      return new URL(url, "https://gekkotrader.local");
    } catch (_) {
      return null;
    }
  }

  function scopeFromSearch(searchParams) {
    const execution_env = searchParams.get("execution_env");
    const lane = searchParams.get("lane");
    if (!execution_env) {
      return { error: { status: 422, detail: "execution_env required" } };
    }
    if (!["sim", "demo", "live"].includes(execution_env)) {
      return { error: { status: 422, detail: `invalid execution_env=${execution_env}` } };
    }
    if (execution_env === "live") {
      if (lane != null && lane !== "") {
        return { error: { status: 422, detail: "live desk does not accept lane" } };
      }
      return {
        scope: { execution_env: "live", lane: null, scope_key: "live" },
      };
    }
    if (!lane) {
      return { error: { status: 422, detail: "lane required" } };
    }
    if (!["a", "b"].includes(lane)) {
      return { error: { status: 422, detail: `invalid lane=${lane}` } };
    }
    return {
      scope: {
        execution_env,
        lane,
        scope_key: `${execution_env}|${lane}`,
      },
    };
  }

  function baseDashboard(scope) {
    const playbook_key =
      scope.execution_env === "live" ? "playbook1.1" : PLAYBOOK_BY_LANE[scope.lane];
    const dormant = scope.execution_env === "live";
    const laneBoost = scope.lane === "b" ? 1.35 : 1;
    const now = new Date();
    const isoMinutesAgo = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();
    const symbols = [
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
      "BNBUSDT",
      "XRPUSDT",
      "ADAUSDT",
    ];
    const paper_positions = dormant
      ? []
      : [
          {
            symbol: "BTCUSDT",
            side: "long",
            qty: 0.018,
            entry_price: 118420.5,
            mark_price: 119034.2,
            unrealized_pnl: 11.05 * laneBoost,
            stop_loss: 117650,
            take_profit: 121200,
            opened_at: isoMinutesAgo(42),
          },
          {
            symbol: "SOLUSDT",
            side: "short",
            qty: 12.5,
            entry_price: 184.42,
            mark_price: 182.88,
            unrealized_pnl: 19.25 * laneBoost,
            stop_loss: 188.1,
            take_profit: 178.9,
            opened_at: isoMinutesAgo(18),
          },
        ];
    const strategies = dormant
      ? []
      : [
          {
            name: "trend_pullback",
            tier: "A",
            exp: 0.42,
            act: "trade",
            pnl: 78.2 * laneBoost,
            rr: 1.8,
            adx: 27.4,
            pulls: 61,
          },
          {
            name: "breakout_retest",
            tier: "A",
            exp: 0.31,
            act: "watch",
            pnl: 42.9 * laneBoost,
            rr: 1.5,
            adx: 23.1,
            pulls: 44,
          },
          {
            name: "mean_reversion",
            tier: "B",
            exp: 0.12,
            act: "cooldown",
            pnl: -6.4 * laneBoost,
            rr: 1.1,
            adx: 16.8,
            pulls: 29,
          },
          {
            name: "volatility_squeeze",
            tier: "B",
            exp: 0.08,
            act: "watch",
            pnl: 13.75 * laneBoost,
            rr: 1.3,
            adx: 19.6,
            pulls: 17,
          },
        ];
    const recent_trades = dormant
      ? []
      : [
          {
            trade_id: "T-1048",
            symbol: "ETHUSDT",
            side: "long",
            strategy: "trend_pullback",
            pnl: 32.6 * laneBoost,
            rr: 1.7,
            status: "closed",
            opened_at: isoMinutesAgo(240),
            closed_at: isoMinutesAgo(190),
            duration: "50m",
          },
          {
            trade_id: "T-1047",
            symbol: "BNBUSDT",
            side: "short",
            strategy: "breakout_retest",
            pnl: -8.9 * laneBoost,
            rr: -0.6,
            status: "stopped",
            opened_at: isoMinutesAgo(360),
            closed_at: isoMinutesAgo(318),
            duration: "42m",
          },
          {
            trade_id: "T-1046",
            symbol: "XRPUSDT",
            side: "long",
            strategy: "mean_reversion",
            pnl: 18.15 * laneBoost,
            rr: 1.2,
            status: "closed",
            opened_at: isoMinutesAgo(650),
            closed_at: isoMinutesAgo(602),
            duration: "48m",
          },
        ];
    return {
      execution_env: scope.execution_env,
      lane: scope.lane,
      scope_key: scope.scope_key,
      playbook_key,
      opening_balance: 5000,
      equity: dormant ? 5000 : 5120.5 + 34 * laneBoost,
      balance: dormant ? 5000 : 5120.5 + 34 * laneBoost,
      realized_pnl: dormant ? 0 : 120.5 * laneBoost,
      lifetime_pnl: dormant ? 0 : 120.5 * laneBoost,
      unrealized_pnl: dormant ? 0 : -4.25,
      open_positions: paper_positions.length,
      max_open_positions: 10,
      win_rate: dormant ? null : 0.54,
      trades_closed: dormant ? 0 : 18,
      closed_trades: dormant ? 0 : 18,
      day_pnl: dormant ? 0 : 26.8 * laneBoost,
      week_pnl: dormant ? 0 : 94.35 * laneBoost,
      month_pnl: dormant ? 0 : 231.1 * laneBoost,
      year_pnl: dormant ? 0 : 120.5 * laneBoost,
      all_pnl: dormant ? 0 : 120.5 * laneBoost,
      period_pnl: {
        day: dormant ? 0 : 26.8 * laneBoost,
        week: dormant ? 0 : 94.35 * laneBoost,
        month: dormant ? 0 : 231.1 * laneBoost,
        year: dormant ? 0 : 120.5 * laneBoost,
      },
      growth_pct: dormant ? 0 : 2.41 * laneBoost,
      paper_positions,
      positions: paper_positions,
      strategies,
      recent_trades,
      trades: recent_trades,
      symbols,
      binance_latency_ms: dormant ? null : 42,
      cycle_meta: {
        interval: "1m",
        htf_interval: "15m",
        last_cycle_at: isoMinutesAgo(1),
      },
      last_cycle_at: isoMinutesAgo(1),
      egress_ip: dormant ? null : "203.0.113.42",
      is_dormant: dormant,
      is_live_activated: false,
      runtime_status: dormant ? "dormant" : "running",
      updated_at: new Date().toISOString(),
    };
  }

  function mockRun(scope, n) {
    const playbook_key = PLAYBOOK_BY_LANE[scope.lane] || "playbook1.1";
    const completed = n !== 1;
    const pnl = completed ? 80 - n * 10 : 12.5;
    const opening = 5000;
    return {
      run_id: `00000000-0000-4000-8000-00000000000${n}`,
      run_label: `2026071${n}-1200`,
      execution_env: scope.execution_env,
      lane: scope.lane,
      scope_key: scope.scope_key,
      playbook_key,
      status: completed ? "completed" : "running",
      realized_pnl: pnl,
      trades_closed: completed ? 20 - n : 3,
      started_at: `2026-07-1${n}T12:00:00Z`,
      completed_at: completed ? `2026-07-1${n}T14:30:00Z` : null,
      seed: 90 + n,
      dataset_id: n,
      settings_version_id: `settings-v${n}`,
      manifest_sha256: `${"ab".repeat(32)}`.slice(0, 64),
      checkpoint_digest: completed ? `ckpt-${n}` : null,
      metrics: {
        total_pnl: pnl,
        growth_pct: (pnl / opening) * 100,
        win_rate: 0.55,
        max_drawdown_pct: 2.4,
        total_trades: completed ? 20 - n : 3,
        opening_balance: opening,
        closing_balance: opening + pnl,
        bandit_pulls: completed ? 40 + n : 5,
        lookback_days: 90,
        period_start: `2026-04-1${n}T00:00:00Z`,
        period_end: `2026-07-1${n}T00:00:00Z`,
        wall_seconds: completed ? 9000 : 600,
        strategy_suite: scope.lane === "b" ? "playbook3" : "playbook1",
        symbols: ["BTCUSDT", "ETHUSDT"],
        interval: "1m",
        htf_interval: "15m",
      },
      evidence: completed
        ? {
            result_uri: `r2://backtests/run-${n}/result.json`,
            trades_uri: `r2://backtests/run-${n}/trades.json`,
            manifest_uri: `r2://backtests/run-${n}/manifest.json`,
          }
        : {},
    };
  }

  function runsPayload(scope) {
    const playbook_key = PLAYBOOK_BY_LANE[scope.lane] || "playbook1.1";
    const runs = [2, 3, 1].map((n) => mockRun(scope, n));
    return {
      execution_env: scope.execution_env,
      lane: scope.lane,
      scope_key: scope.scope_key,
      playbook_key,
      runs,
      items: runs,
      total: runs.length,
      limit: runs.length,
      offset: 0,
      has_more: false,
      retention_count: 5,
    };
  }

  function statusPayload(scope) {
    const dash = baseDashboard(scope);
    return {
      execution_env: dash.execution_env,
      lane: dash.lane,
      scope_key: dash.scope_key,
      playbook_key: dash.playbook_key,
      health: "ok",
      runtime_status: dash.runtime_status,
      is_dormant: dash.is_dormant,
      is_live_activated: dash.is_live_activated,
      open_positions: dash.open_positions,
      equity: dash.equity,
      realized_pnl: dash.realized_pnl,
      updated_at: dash.updated_at,
    };
  }

  function auditPayload() {
    return {
      events: [
        {
          event_id: "audit-001",
          event_type: "promotion",
          source_execution_env: "demo",
          source_lane: "a",
          target_execution_env: "live",
          target_lane: null,
          playbook_key: "playbook1.1",
          approved_at: "2026-07-18T15:00:00Z",
          approver: "operator",
          status: "recorded",
        },
      ],
    };
  }

  function operationalDeskSeeds() {
    // Prefer shared NAV order (Live → Demo A/B → Sim A/B); fallback if Nav unloaded.
    const Nav =
      (typeof globalThis !== "undefined" && globalThis.GekkoNavigationConfig) ||
      (typeof require === "function" ? require("./navigation-config.js") : null);
    if (Nav?.OPERATIONAL_DESK_ORDER) {
      return Nav.OPERATIONAL_DESK_ORDER.map((d) => ({
        execution_env: d.execution_env,
        lane: d.lane,
        scope_key: d.scope_key,
      }));
    }
    return [
      { execution_env: "live", lane: null, scope_key: "live" },
      { execution_env: "demo", lane: "a", scope_key: "demo|a" },
      { execution_env: "demo", lane: "b", scope_key: "demo|b" },
      { execution_env: "sim", lane: "a", scope_key: "sim|a" },
      { execution_env: "sim", lane: "b", scope_key: "sim|b" },
    ];
  }

  function overviewPayload() {
    const desks = operationalDeskSeeds().map((s) => {
      const dash = baseDashboard(s);
      return {
        execution_env: dash.execution_env,
        lane: dash.lane,
        scope_key: dash.scope_key,
        playbook_key: dash.playbook_key,
        equity: dash.equity,
        realized_pnl: dash.realized_pnl,
        open_positions: dash.open_positions,
        runtime_status: dash.runtime_status,
        is_dormant: dash.is_dormant,
      };
    });
    return { desks, updated_at: new Date().toISOString() };
  }

  async function handle(url) {
    const u = parseUrl(url);
    if (!u) {
      return { status: 400, body: { detail: "bad url" } };
    }
    const path = u.pathname.replace(/\/$/, "") || "/";

    if (path === "/health" || path === "/api/health") {
      return { status: 200, body: { status: "ok", mock: true } };
    }

    if (path === "/api/overview") {
      return { status: 200, body: overviewPayload() };
    }

    if (path === "/api/audit/scope-events") {
      return { status: 200, body: auditPayload() };
    }

    const scoped = scopeFromSearch(u.searchParams);
    if (scoped.error) {
      return { status: scoped.error.status, body: { detail: scoped.error.detail } };
    }
    const { scope } = scoped;

    const demoDashboardPaths = ["a", "b"].map((lane) => {
      const version = lane === "a" ? 1 : 2;
      return `/api/${"v"}${version}/demo/dashboard`;
    });
    if (
      path === "/api/dashboard" ||
      path === "/api/events/dashboard" ||
      demoDashboardPaths.includes(path)
    ) {
      return { status: 200, body: baseDashboard(scope) };
    }
    if (path === "/api/status" || path === "/api/project-status") {
      return { status: 200, body: statusPayload(scope) };
    }
    if (path === "/api/settings-versions") {
      const playbook_key = PLAYBOOK_BY_LANE[scope.lane] || "playbook1.1";
      const version = {
        settings_version_id: "6",
        content_hash:
          "ceda4a058717974b46c108df58f8108ba47d81be969fca93f5644c5f5a5f08ab",
        created_by: "operator",
        payload: {
          playbook_key,
          strategy_suite: scope.lane === "b" ? "playbook3" : "playbook1",
          signal_interval: "1m",
          htf_interval: "15m",
          opening_balance: 5000,
          risk_per_trade_pct: 0.5,
          max_open_positions: 10,
          max_trades_per_day: 48,
          seed: 99,
          dataset_id: 1,
          symbols: ["BTCUSDT", "ETHUSDT"],
          default_leverage: 2,
          manifest_sha256: "ab".repeat(32),
        },
      };
      return {
        status: 200,
        body: {
          execution_env: scope.execution_env,
          lane: scope.lane,
          scope_key: scope.scope_key,
          versions: [version],
          active_binding: { settings_version_id: version.settings_version_id },
        },
      };
    }

    if (path === "/api/sim/runs" || path === "/api/runs") {
      if (scope.execution_env === "live") {
        return { status: 404, body: { detail: "runs not available for live desk" } };
      }
      return { status: 200, body: runsPayload(scope) };
    }

    const runMatch = path.match(/^\/api\/(?:sim\/)?runs\/([^/]+)$/);
    if (runMatch) {
      if (scope.execution_env === "live") {
        return { status: 404, body: { detail: "runs not available for live desk" } };
      }
      const run_id = decodeURIComponent(runMatch[1]);
      const hit = runsPayload(scope).runs.find((r) => r.run_id === run_id);
      if (!hit) {
        return { status: 404, body: { detail: `run not found: ${run_id}` } };
      }
      return { status: 200, body: hit };
    }

    const learnMatch = path.match(/^\/api\/(?:sim\/)?runs\/([^/]+)\/learning$/);
    if (learnMatch) {
      if (scope.execution_env === "live") {
        return { status: 404, body: { detail: "runs not available for live desk" } };
      }
      return {
        status: 200,
        body: {
          ...scope,
          run_id: decodeURIComponent(learnMatch[1]),
          items: [
            {
              event_type: "bandit_pull",
              arm: "trend_pullback",
              observed_at: "2026-07-12T12:05:00Z",
              summary: "EXP pull · reward +0.12",
            },
            {
              event_type: "rank_update",
              arm: "mean_reversion",
              observed_at: "2026-07-12T12:20:00Z",
              summary: "rank → #2",
            },
          ],
        },
      };
    }

    return { status: 404, body: { detail: `mock route not found: ${path}` } };
  }

  return { handle, PLAYBOOK_BY_LANE };
});
