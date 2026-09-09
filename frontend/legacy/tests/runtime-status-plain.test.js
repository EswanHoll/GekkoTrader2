/**
 * GST-109 — Runtime / pills use plain English; never stuck on bare "queued".
 * Run: node --test frontend/tests/runtime-status-plain.test.js
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Desk = require(path.join(__dirname, "..", "desk-surface.js"));
const apiSrc = fs.readFileSync(
  path.join(__dirname, "..", "api-client.js"),
  "utf8"
);

describe("GST-109 Runtime plain English", () => {
  let prevDocument;
  let prevGekkoScope;
  let prevGekkoUi;
  let prevGekkoTime;
  let nodes;

  function makeNode(id) {
    return {
      id,
      textContent: "",
      innerHTML: "",
      hidden: false,
      dataset: {},
      classList: {
        _set: new Set(),
        add(v) {
          this._set.add(v);
        },
        remove(v) {
          this._set.delete(v);
        },
        toggle(v, on) {
          if (on) this._set.add(v);
          else this._set.delete(v);
        },
        contains(v) {
          return this._set.has(v);
        },
      },
      parentElement: { querySelector: () => null },
      setAttribute() {},
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    };
  }

  beforeEach(() => {
    prevDocument = global.document;
    prevGekkoScope = global.GekkoScope;
    prevGekkoUi = global.GekkoUi;
    prevGekkoTime = global.GekkoTime;
    nodes = new Map();
    [
      "openingBalance",
      "equity",
      "realizedPnl",
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
    global.document = {
      getElementById: (id) => nodes.get(id) || null,
      querySelector: (selector) => {
        if (selector.startsWith("#") && !selector.includes(" ")) {
          return nodes.get(selector.slice(1)) || null;
        }
        return null;
      },
      querySelectorAll: () => [],
    };
    global.GekkoScope = {
      formatScopeLabel: () => "Sim A",
      resolvePlaybookKey: (k) => k || "playbook1.1",
    };
    global.GekkoUi = {
      escapeHtml: (v) => String(v ?? ""),
      formatMoney: (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`),
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

  it("queued active run → Starting worker (not bare queued)", () => {
    Desk.renderDeskPanels(
      {
        active_run: { status: "queued", event_cursor: 0 },
        runtime_status: "queued",
        playbook_key: "playbook1.1",
      },
      { execution_env: "sim", lane: "a" }
    );
    assert.match(nodes.get("runtimeStatus").textContent, /Starting worker/i);
    assert.doesNotMatch(nodes.get("runtimeStatus").textContent, /^queued$/i);
    assert.equal(nodes.get("powerPill").textContent, "Starting");
    assert.equal(nodes.get("activityPill").textContent, "Starting");
  });

  it("running with no progress → Loading market data", () => {
    Desk.renderDeskPanels(
      {
        active_run: {
          status: "running",
          event_cursor: 0,
          started_at: "2026-08-04T15:44:30Z",
        },
        runtime_status: "running",
      },
      { execution_env: "sim", lane: "a" }
    );
    assert.match(nodes.get("runtimeStatus").textContent, /Loading market data/i);
    assert.equal(nodes.get("powerPill").textContent, "Loading");
    assert.equal(nodes.get("activityPill").textContent, "Loading");
  });

  it("running with progress → Simulating", () => {
    Desk.renderDeskPanels(
      {
        active_run: {
          status: "running",
          event_cursor: 12,
          simulated_time: "2026-07-28T00:00:00Z",
        },
        runtime_status: "running",
      },
      { execution_env: "sim", lane: "a" }
    );
    assert.match(nodes.get("runtimeStatus").textContent, /Simulating/i);
    assert.equal(nodes.get("powerPill").textContent, "Simulating");
    assert.equal(nodes.get("activityPill").textContent, "Simulating");
  });
});

describe("GST-109 Sim dashboard uses REST poll (no dead SSE)", () => {
  it("api-client polls /api/dashboard for sim desks", () => {
    assert.match(apiSrc, /createDashboardRestPoller/);
    assert.match(apiSrc, /execution_env.*=== \"sim\"/);
    assert.match(apiSrc, /Greenfield Control has no \/api\/events\/dashboard/);
  });
});
