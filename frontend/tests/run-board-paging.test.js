/**
 * GST-116 / GST-97 — Run Board paging on React DOM (data-testid).
 * Run: npx tsx --test frontend/tests/run-board-paging.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

describe("GST-116 Run Board paging (React)", () => {
  it("PAGE_SIZE=5 and first load uses limit/offset via useRunsBoard", () => {
    const boardLib = fs.readFileSync(src("lib", "runBoard.ts"), "utf8");
    const hook = fs.readFileSync(src("hooks", "useRunsBoard.ts"), "utf8");
    assert.match(boardLib, /export const PAGE_SIZE\s*=\s*5/);
    assert.match(hook, /normalizeRunForBoard/);
    assert.match(
      hook,
      /fetchRuns\(scope!,\s*\{\s*limit:\s*PAGE_SIZE,\s*offset:\s*0/
    );
    // Must not re-introduce sequential hydrate before first paint.
    assert.doesNotMatch(
      hook,
      /for\s*\(\s*const\s+row\s+of\s+.*\.slice[\s\S]*fetchRun\(/
    );
  });

  it("api client forwards limit/offset on fetchRuns", () => {
    const apiSrc = fs.readFileSync(src("api", "client.ts"), "utf8");
    assert.match(apiSrc, /export async function fetchRuns/);
    assert.match(apiSrc, /withQuery\("\/api\/runs"/);
    assert.match(apiSrc, /opts\.limit/);
    assert.match(apiSrc, /opts\.offset/);
  });

  it("pager mounts next to Run Board heading via data-testid (not under table)", () => {
    const board = fs.readFileSync(src("components", "RunBoard.tsx"), "utf8");
    assert.match(board, /data-testid="run-board"/);
    assert.match(board, /data-testid="run-board-heading"/);
    assert.match(board, /results-board-part-heading/);
    assert.match(board, /panel-heading-copy/);
    assert.match(board, /data-testid="results-board-pager"/);
    assert.match(board, /data-testid="btn-results-next-5"/);
    assert.match(board, /data-testid="btn-results-fetch-all"/);
    assert.match(board, /id="btnResultsNext5"/);
    assert.match(board, /id="btnResultsFetchAll"/);
    // Pager lives inside heading copy, before the table root.
    const pagerIdx = board.indexOf('data-testid="results-board-pager"');
    const tableIdx = board.indexOf('data-testid="results-board-root"');
    assert.ok(pagerIdx > 0 && tableIdx > pagerIdx);
  });

  it("normalizeRunForBoard flattens metrics.total_pnl", async () => {
    const raw = await import(pathToFileURL(src("lib", "runBoard.ts")).href);
    const mod =
      raw.default && typeof raw.default === "object" && !raw.normalizeRunForBoard
        ? { ...raw.default, ...raw }
        : raw;
    const row = mod.normalizeRunForBoard({
      run_id: "r1",
      status: "succeeded",
      metrics: { total_pnl: 12.5, win_rate: 0.55, total_trades: 3 },
    });
    assert.equal(row.total_pnl, 12.5);
    assert.equal(row.win_rate, 0.55);
    assert.equal(row.total_trades, 3);
    assert.equal(mod.PAGE_SIZE, 5);
  });
});
