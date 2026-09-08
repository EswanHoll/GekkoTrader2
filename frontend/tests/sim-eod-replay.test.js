/**
 * GST-132 — Sim EOD replay: active poll + 100-trade window + sim date filters.
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
  return mod.default && typeof mod.default === "object" && !mod.deskTrades
    ? { ...mod.default, ...mod }
    : mod;
}

describe("GST-132 Sim EOD replay UI", () => {
  it("useDashboard polls faster while a run is active", () => {
    const hook = fs.readFileSync(src("hooks", "useDashboard.ts"), "utf8");
    assert.match(hook, /ACTIVE_POLL_MS\s*=\s*2_000/);
    assert.match(hook, /IDLE_POLL_MS\s*=\s*15_000/);
    assert.match(hook, /refetchInterval:\s*\(query\)/);
    assert.match(hook, /isActiveRun/);
  });

  it("caps Recent Trades at 100 and filters by simulated dates", async () => {
    const ledger = await loadTs(["lib", "deskLedger.ts"]);
    assert.equal(ledger.RECENT_TRADES_WINDOW, 100);
    const rows = Array.from({ length: 120 }, (_, i) => ({
      trade_id: `T-${i}`,
      closed_at: `2026-05-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
    }));
    const capped = ledger.deskTrades({ recent_trades: rows });
    assert.equal(capped.length, 100);
    assert.equal(capped[0].trade_id, "T-20");

    const filtered = ledger.filterTrades(
      [
        { trade_id: "A", closed_at: "2026-05-01T10:00:00Z" },
        { trade_id: "B", closed_at: "2026-05-05T10:00:00Z" },
      ],
      "2026-05-04",
      "2026-05-06",
      ""
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].trade_id, "B");

    assert.equal(
      ledger.simulatedAnchor({
        simulated_time: "2026-05-02T23:59:59+00:00",
        active_run: { status: "running" },
      }),
      "2026-05-02"
    );
  });

  it("DeskPage passes simAnchor into RecentTradesTable", () => {
    const page = fs.readFileSync(src("pages", "DeskPage.tsx"), "utf8");
    assert.match(page, /simulatedAnchor/);
    assert.match(page, /simAnchor=\{/);
  });
});
