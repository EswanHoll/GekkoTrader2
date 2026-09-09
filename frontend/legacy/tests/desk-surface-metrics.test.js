/**
 * desk-surface renderMetrics — UMD root must not be shadowed by DOM host.
 * Run: node --test frontend/tests/desk-surface-metrics.test.js
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const Scope = require(path.join(__dirname, "..", "scope.js"));
const Desk = require(path.join(__dirname, "..", "desk-surface.js"));

describe("renderMetrics host vs UMD root", () => {
  let prevDocument;
  let prevGekkoScope;
  let prevGekkoUi;

  beforeEach(() => {
    prevDocument = global.document;
    prevGekkoScope = global.GekkoScope;
    prevGekkoUi = global.GekkoUi;
    global.GekkoScope = Scope;
    global.GekkoUi = {
      formatMoney: () => "—",
      escapeHtml: (v) => String(v ?? ""),
    };
    // Minimal document stand-in; pages.js passes document as host.
    global.document = {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      // Must NOT own GekkoScope — that lives on globalThis (UMD root).
    };
  });

  afterEach(() => {
    if (prevDocument === undefined) delete global.document;
    else global.document = prevDocument;
    if (prevGekkoScope === undefined) delete global.GekkoScope;
    else global.GekkoScope = prevGekkoScope;
    if (prevGekkoUi === undefined) delete global.GekkoUi;
    else global.GekkoUi = prevGekkoUi;
  });

  it("renderMetrics(document, …) does not throw when GekkoScope is on globalThis", () => {
    assert.doesNotThrow(() => {
      Desk.renderMetrics(
        document,
        {
          playbook_key: "fixture",
          opening_balance: 10000,
          equity: 10000,
          realized_pnl: 0,
          unrealized_pnl: 0,
          open_positions: 0,
          win_rate: 0.5,
          runtime_status: "idle",
        },
        { execution_env: "sim", lane: "a" }
      );
    });
  });
});

describe("renderDeskPanels", () => {
  let prevDocument;
  let prevGekkoScope;
  let prevGekkoUi;
  let prevGekkoTime;
  let nodes;

  function classList() {
    const set = new Set();
    return {
      add: (...names) => names.forEach((n) => set.add(n)),
      remove: (...names) => names.forEach((n) => set.delete(n)),
      toggle: (name, on) => (on ? set.add(name) : set.delete(name)),
      contains: (name) => set.has(name),
    };
  }

  function makeNode(id) {
    return {
      id,
      value: "",
      dataset: {},
      textContent: "",
      innerHTML: "",
      classList: classList(),
      parentElement: { querySelector: () => null },
      setAttribute() {},
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    };
  }

  function makeDocument() {
    nodes = new Map();
    [
      "openingBalance",
      "equity",
      "realizedPnl",
      "todayPnl",
      "weekPnl",
      "monthPnl",
      "yearPnl",
      "growthPct",
      "openPositions",
      "winRate",
      "closedTrades",
      "playbookKey",
      "runtimeStatus",
      "scopeBanner",
      "positionsBody",
      "positionsOpenValue",
      "positionsMaxOpenValue",
      "positionsSearch",
      "positionsSideFilter",
      "strategyRank",
      "strategiesTotalValue",
      "tradesBody",
      "tradesTotalValue",
      "tradesSearch",
      "tradesFrom",
      "tradesTo",
      "tradesRange",
      "symbolsLine",
      "latency",
      "deskPing",
      "deskEgressIp",
      "powerPill",
      "activityPill",
      "cycleMeta",
      "autopilotMeta",
    ].forEach((id) => nodes.set(id, makeNode(id)));
    const positionActive = makeNode("positionActive");
    positionActive.dataset.positionSide = "all";
    const tradeActive = makeNode("tradeActive");
    tradeActive.dataset.tradeRange = "all";
    return {
      getElementById: (id) => nodes.get(id) || null,
      querySelector: (selector) => {
        if (selector.startsWith("#") && !selector.includes(" ")) {
          return nodes.get(selector.slice(1)) || null;
        }
        if (selector === "#positionsSideFilter .active") return positionActive;
        if (selector === "#tradesRange .active") return tradeActive;
        return null;
      },
      querySelectorAll: () => [],
    };
  }

  beforeEach(() => {
    prevDocument = global.document;
    prevGekkoScope = global.GekkoScope;
    prevGekkoUi = global.GekkoUi;
    prevGekkoTime = global.GekkoTime;
    global.document = makeDocument();
    global.GekkoScope = Scope;
    global.GekkoUi = {
      escapeHtml: (v) =>
        String(v ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;"),
      formatMoney: (v, opts = {}) => {
        if (v == null || v === "") return "—";
        const n = Number(v);
        const sign = opts.signed && n > 0 ? "+" : "";
        return `${sign}$${n.toFixed(2)}`;
      },
    };
    global.GekkoTime = {
      parseUtc: (v) => new Date(v),
      formatCompact: (v) => String(v || "—"),
    };
  });

  afterEach(() => {
    if (prevDocument === undefined) delete global.document;
    else global.document = prevDocument;
    if (prevGekkoScope === undefined) delete global.GekkoScope;
    else global.GekkoScope = prevGekkoScope;
    if (prevGekkoUi === undefined) delete global.GekkoUi;
    else global.GekkoUi = prevGekkoUi;
    if (prevGekkoTime === undefined) delete global.GekkoTime;
    else global.GekkoTime = prevGekkoTime;
  });

  it("renders honest empty panel rows when dashboard arrays are missing", () => {
    Desk.renderDeskPanels(
      {
        opening_balance: 5000,
        equity: 5000,
        realized_pnl: 0,
        day_pnl: 0,
        runtime_status: "running",
      },
      { execution_env: "sim", lane: "a" }
    );
    assert.match(nodes.get("positionsBody").innerHTML, /No open positions/);
    assert.match(nodes.get("strategyRank").innerHTML, /No strategies ranked yet/);
    assert.match(nodes.get("tradesBody").innerHTML, /No recent trades/);
  });

  it("renders mock-like positions, strategies, trades, and autopilot metadata", () => {
    Desk.renderDeskPanels(
      {
        playbook_key: "playbook1.1",
        opening_balance: 5000,
        equity: 5125,
        realized_pnl: 125,
        day_pnl: 12,
        week_pnl: 34,
        month_pnl: 56,
        year_pnl: 125,
        closed_trades: 9,
        paper_positions: [{ symbol: "BTCUSDT", side: "long", qty: 0.1, entry_price: 100, mark_price: 110, unrealized_pnl: 10 }],
        strategies: [{ name: "trend_pullback", tier: "A", exp: 0.4, act: "trade", pnl: 42, rr: 1.7, adx: 25, pulls: 12 }],
        recent_trades: [{ trade_id: "T-1", symbol: "ETHUSDT", side: "short", strategy: "breakout", pnl: -2, rr: -0.3, status: "closed" }],
        symbols: ["BTCUSDT", "ETHUSDT"],
        binance_latency_ms: 41,
        cycle_meta: { interval: "1m", htf_interval: "15m", last_cycle_at: "2026-08-03T09:00:00Z" },
        runtime_status: "running",
      },
      { execution_env: "sim", lane: "a" }
    );
    assert.match(nodes.get("positionsBody").innerHTML, /BTCUSDT/);
    assert.match(nodes.get("strategyRank").innerHTML, /trend_pullback/);
    assert.match(nodes.get("tradesBody").innerHTML, /T-1/);
    assert.equal(nodes.get("symbolsLine").textContent, "Universe: BTCUSDT · ETHUSDT");
    assert.equal(nodes.get("latency").textContent, "41ms");
  });
});
