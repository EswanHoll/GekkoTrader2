/**
 * GST-131 — Trading Desk ledger tables + autopilot + header chrome.
 * Run: npm --prefix frontend test
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

async function loadTs(relParts) {
  const mod = await import(pathToFileURL(src(...relParts)).href);
  return mod.default && typeof mod.default === "object" && !mod.deskPositions
    ? { ...mod.default, ...mod }
    : mod;
}

describe("GST-131 Desk ledger accessors", () => {
  it("reads paper_positions / recent_trades aliases and filters sides", async () => {
    const ledger = await loadTs(["lib", "deskLedger.ts"]);
    const payload = {
      paper_positions: [
        { id: 1, symbol: "BTCUSDT", side: "LONG", strategy: "trend" },
        { id: 2, symbol: "ETHUSDT", side: "short", strategy: "mr" },
      ],
      strategies: [{ rank: 1, name: "trend_pullback", exp: 0.4, pulls: 12 }],
      recent_trades: [
        {
          trade_id: "T-1",
          symbol: "ETHUSDT",
          side: "sell",
          strategy: "breakout",
          closed_at: "2026-08-03T12:00:00Z",
          cost: 100,
          value: 300,
        },
      ],
      symbols: ["BTCUSDT", "ETHUSDT"],
      binance_latency_ms: 41,
      egress_ip: "1.2.3.4",
      equity: 5000,
    };
    const positions = ledger.deskPositions(payload);
    assert.equal(positions.length, 2);
    assert.equal(ledger.filterPositions(positions, "long", "").length, 1);
    assert.equal(ledger.filterPositions(positions, "all", "eth").length, 1);
    assert.equal(ledger.deskStrategies(payload).length, 1);
    assert.equal(ledger.deskTrades(payload).length, 1);
    assert.equal(ledger.universeLine(payload), "BTCUSDT, ETHUSDT");
    assert.equal(ledger.latencyText(payload), "41ms");
    assert.equal(
      ledger.egressIpText(payload, { execution_env: "sim", lane: "a", scope_key: "sim|a" }),
      "IP 1.2.3.4"
    );
    assert.equal(ledger.rowPctEq({ cost: 250 }, 5000), "5.00%");
    assert.equal(ledger.deskHealthLabel({ power: { state: "on" } }, payload).label, "Healthy");
    assert.equal(
      ledger.deskRunLabel(null, { active_run: { status: "running" } }).label,
      "Running"
    );
    assert.equal(ledger.deskRunLabel(null, { runtime_status: "idle" }).label, "Stopped");
  });

  it("filters trades by From/To date range", async () => {
    const ledger = await loadTs(["lib", "deskLedger.ts"]);
    const rows = [
      { trade_id: "A", closed_at: "2026-08-01T10:00:00Z", symbol: "BTCUSDT" },
      { trade_id: "B", closed_at: "2026-08-05T10:00:00Z", symbol: "ETHUSDT" },
    ];
    const filtered = ledger.filterTrades(rows, "2026-08-04", "2026-08-06", "");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].trade_id, "B");
  });
});

describe("GST-131 Desk UI wiring", () => {
  it("DeskPage mounts positions/strategies/trades/autopilot panels", () => {
    const page = fs.readFileSync(src("pages", "DeskPage.tsx"), "utf8");
    assert.match(page, /OpenPositionsTable/);
    assert.match(page, /StrategiesTable/);
    assert.match(page, /RecentTradesTable/);
    assert.match(page, /AutopilotCard/);
    assert.match(page, /deskPositions/);
    assert.match(page, /useDashboard/);
    assert.match(page, /useDeskScope/);
    assert.doesNotMatch(page, /frontend\/legacy/);
  });

  it("TopBar shows desk status chrome on desk routes", () => {
    const bar = fs.readFileSync(src("components", "TopBar.tsx"), "utf8");
    assert.match(bar, /DeskStatusChrome/);
    const chrome = fs.readFileSync(
      src("components", "desk", "DeskStatusChrome.tsx"),
      "utf8"
    );
    assert.match(chrome, /data-testid="desk-status-chrome"/);
    assert.match(chrome, /desk-egress-ip/);
    assert.match(chrome, /desk-ping/);
    assert.match(chrome, /desk-health-pill/);
    assert.match(chrome, /desk-run-pill/);
    assert.match(chrome, /Healthy|Unhealthy/);
    assert.match(chrome, /Running|Stopped/);
  });

  it("tables expose dense column headers from the operator brief", () => {
    const positions = fs.readFileSync(
      src("components", "desk", "OpenPositionsTable.tsx"),
      "utf8"
    );
    for (const col of [
      "ID",
      "Symbol",
      "Side",
      "Strategy",
      "Entry",
      "Cost",
      "% Eq",
      "Value",
      "SL",
      "TP",
      "Opened",
      "Duration",
    ]) {
      assert.match(positions, new RegExp(col.replace("%", "\\%")));
    }
    assert.match(positions, /positions-side-filter/);
    assert.match(positions, /positions-search/);

    const strategies = fs.readFileSync(
      src("components", "desk", "StrategiesTable.tsx"),
      "utf8"
    );
    assert.match(strategies, /Total Strategies/);
    for (const col of ["#", "ID", "Strategy", "Exp", "Act", "PnL", "RR", "ADX", "Polls"]) {
      assert.match(strategies, new RegExp(`>${col}<`));
    }

    const trades = fs.readFileSync(
      src("components", "desk", "RecentTradesTable.tsx"),
      "utf8"
    );
    for (const col of [
      "ID",
      "Symbol",
      "Side",
      "Strategy",
      "Cost",
      "% Eq",
      "Value",
      "PnL",
      "R",
      "Exit",
      "Opened",
      "Closed",
      "Duration",
    ]) {
      assert.match(trades, new RegExp(col.replace("%", "\\%")));
    }
    assert.match(trades, /trades-from/);
    assert.match(trades, /trades-to/);
    assert.match(trades, /trades-search/);

    const auto = fs.readFileSync(
      src("components", "desk", "AutopilotCard.tsx"),
      "utf8"
    );
    assert.match(auto, /autopilot-universe/);
    assert.match(auto, /autopilot-latency/);
  });

  it("DashboardSnapshot types include full ledger fields", () => {
    const api = fs.readFileSync(src("api", "client.ts"), "utf8");
    assert.match(api, /paper_positions\?:/);
    assert.match(api, /recent_trades\?:/);
    assert.match(api, /binance_latency_ms\?:/);
    assert.match(api, /egress_ip\?:/);
  });
});
