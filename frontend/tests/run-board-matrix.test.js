/**
 * GST-118 / GST-119 — Results Run Board comparison matrix (React).
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

describe("GST-118 Run Board comparison matrix", () => {
  async function loadRunBoard() {
    const raw = await import(pathToFileURL(src("lib", "runBoard.ts")).href);
    return raw.default && typeof raw.default === "object" && !raw.normalizeRunForBoard
      ? { ...raw.default, ...raw }
      : raw;
  }

  it("exports RESULT_SPECS and SETTING_SPECS with required rows", async () => {
    const mod = await loadRunBoard();
    assert.equal(mod.PAGE_SIZE, 5);
    assert.ok(mod.RESULT_SPECS.some((s) => s.key === "total_pnl"));
    assert.ok(mod.RESULT_SPECS.some((s) => s.label === "Max DD (Observed)"));
    assert.ok(mod.RESULT_SPECS.some((s) => s.key === "bandit_pulls"));
    assert.ok(mod.SETTING_SPECS.some((s) => s.key === "strategy_suite"));
    assert.ok(mod.SETTING_SPECS.some((s) => s.key === "lookback_days"));
    assert.ok(mod.SETTING_SPECS.some((s) => s.label === "Risk Per Trade %"));
  });

  it("settingsBlobFromRun / effectValue / mergeHydratedSettings work", async () => {
    const mod = await loadRunBoard();
    const run = mod.normalizeRunForBoard({
      run_id: "r1",
      status: "succeeded",
      metrics: { total_pnl: 100, win_rate: 0.5 },
      settings: { risk_per_trade_pct: 0.5, lookback_days: 90 },
    });
    const blob = mod.settingsBlobFromRun(run);
    assert.equal(blob.risk_per_trade_pct, 0.5);
    assert.equal(blob.lookback_days, 90);
    assert.equal(mod.lookbackMonthsFromSource(run), 3);
    const older = mod.normalizeRunForBoard({
      run_id: "r0",
      metrics: { total_pnl: 40 },
    });
    assert.equal(
      mod.effectValue(run, { key: "pnl_delta", derived: "pnl_delta", format: "money", label: "" }, older),
      60
    );
    const merged = mod.mergeHydratedSettings([run], [
      { run_id: "r1", settings: { interval: "1m", risk_per_trade_pct: 0.7 } },
    ]);
    assert.equal(merged[0].settings.interval, "1m");
    assert.equal(merged[0].settings.risk_per_trade_pct, 0.7);
    // GST-134 — hydrate must not wipe lookback_days (flash-then-dash).
    assert.equal(merged[0].settings.lookback_days, 90);
    assert.equal(mod.lookbackMonthsFromSource(merged[0]), 3);

    // Explicit null from compare must not clear lookback (Number(null)===0 trap).
    const nulled = mod.mergeHydratedSettings([run], [
      {
        run_id: "r1",
        lookback_days: null,
        settings: { lookback_days: null, lookback_bars: null, interval: "1m" },
      },
    ]);
    assert.equal(nulled[0].settings.lookback_days, 90);
    assert.equal(nulled[0].lookback_days, 90);
    assert.equal(mod.lookbackMonthsFromSource(nulled[0]), 3);
    assert.equal(mod.finiteLookback(null), null);
    assert.equal(mod.finiteLookback(""), null);
    assert.equal(mod.finiteLookback(90), 90);
  });

  it("GST-134 previousRuns shows all loaded columns; lookback from bars", async () => {
    const mod = await loadRunBoard();
    const many = Array.from({ length: 7 }, (_, i) =>
      mod.normalizeRunForBoard({
        run_id: `r${i}`,
        status: "completed",
        metrics: { total_pnl: i, lookback_bars: 4320, interval: "1m" },
      })
    );
    const all = mod.previousRuns(many);
    assert.equal(all.length, 7);
    const capped = mod.previousRuns(many, 5);
    assert.equal(capped.length, 5);
    // 4320 bars @ 1m = 3 days → 0.1 months
    assert.equal(mod.lookbackMonthsFromSource(many[0]), 0.1);
  });

  it("RunBoard matrix exposes Current + actions + accordion sections", () => {
    const board = fs.readFileSync(src("components", "RunBoard.tsx"), "utf8");
    assert.match(board, /data-testid="run-board-matrix"/);
    assert.match(board, /run-board-col-current/);
    assert.match(board, /data-testid="run-board-save-current"/);
    assert.match(board, /data-testid="run-board-revert-current"/);
    assert.match(board, /data-testid="run-board-copy-all"/);
    assert.match(board, /data-testid="run-board-hide"/);
    assert.match(board, /data-testid="run-board-analyze"/);
    assert.match(board, /isAnalyzeUnavailable/);
    assert.match(board, /data-testid="run-board-delete"/);
    assert.match(board, /onDelete/);
    assert.match(board, /data-testid="run-board-copy-to-current"/);
    assert.match(board, /data-testid="run-board-section-results"/);
    assert.match(board, /data-testid="run-board-section-settings"/);
    assert.match(board, /RESULT_SPECS/);
    assert.match(board, /SETTING_SPECS/);
    // Pager still before table root.
    const pagerIdx = board.indexOf('data-testid="results-board-pager"');
    const tableIdx = board.indexOf('data-testid="results-board-root"');
    assert.ok(pagerIdx > 0 && tableIdx > pagerIdx);
  });

  it("Lookback Months Settings control is a single select (no dual input)", () => {
    const board = fs.readFileSync(src("components", "RunBoard.tsx"), "utf8");
    const lib = fs.readFileSync(src("lib", "runBoard.ts"), "utf8");
    assert.match(lib, /LOOKBACK_MONTH_OPTIONS/);
    assert.match(lib, /options:\s*"lookback_months"/);
    assert.match(board, /data-testid="lookback-months-control"/);
    assert.match(board, /data-testid="knob-lookback_days"/);
    assert.doesNotMatch(board, /data-testid="knob-lookback_days-select"/);
    // Single select — not select+number stacked.
    const lookbackBlock = board.slice(
      board.indexOf("Lookback Months"),
      board.indexOf("Lookback Months") + 1200
    );
    assert.match(lookbackBlock, /<select/);
    assert.doesNotMatch(lookbackBlock, /type="number"/);
  });

  it("Playbook dropdown uses playbook1/2/3 wire values with Playbook labels", () => {
    const lib = fs.readFileSync(src("lib", "runBoard.ts"), "utf8");
    assert.match(lib, /value:\s*"playbook1"/);
    assert.match(lib, /label:\s*"Playbook 1"/);
    assert.match(lib, /value:\s*"playbook3"/);
    assert.match(lib, /label:\s*"Playbook 3"/);
    assert.doesNotMatch(lib, /value:\s*"baseline"/);
    assert.doesNotMatch(lib, /value:\s*"regime"/);
  });

  it("ResultsPage wires top desk actions Copy/Go To Demo + Reset Desk", () => {
    const page = fs.readFileSync(src("pages", "ResultsPage.tsx"), "utf8");
    assert.match(page, /data-testid="results-reset-desk"/);
    assert.match(page, /data-testid="results-start-run"/);
    assert.match(page, /data-testid="results-copy-to-demo"/);
    assert.match(page, /data-testid="results-go-to-demo"/);
    assert.match(page, /id="btnResultsResetDesk"/);
    assert.match(page, /id="btnCopyToDemo"/);
    assert.match(page, /id="btnGoToDemo"/);
    assert.match(page, /fetchRunLearning/);
    assert.match(page, /hydrated=\{board\.hydrated\}/);
    assert.match(page, /useDeleteRuns/);
    assert.match(page, /onDelete=\{editable \? deleteRun/);
  });

  it("useRunsBoard hydrates via compareRuns after list paint (no fetchRun loop)", () => {
    const hook = fs.readFileSync(src("hooks", "useRunsBoard.ts"), "utf8");
    assert.match(hook, /compareRuns/);
    assert.match(hook, /refetchInterval:\s*fetchedAll\s*\?\s*false\s*:\s*15_000/);
    assert.match(
      hook,
      /fetchRuns\(scope!,\s*\{\s*limit:\s*PAGE_SIZE,\s*offset:\s*0/
    );
    assert.doesNotMatch(
      hook,
      /for\s*\(\s*const\s+row\s+of\s+.*\.slice[\s\S]*fetchRun\(/
    );
    // GST-134 — Fetch-all must not be wiped by background refetch resets.
    assert.match(hook, /scope\?\.scope_key/);
    assert.match(hook, /refetchInterval:\s*fetchedAll\s*\?\s*false/);
    // Resets belong in the scope-change effect, not inside queryFn.
    const qFn = hook.slice(hook.indexOf("queryFn:"), hook.indexOf("enabled:"));
    assert.doesNotMatch(qFn, /setHydratedMap/);
    assert.doesNotMatch(qFn, /setExtraRuns/);
    assert.doesNotMatch(qFn, /setFetchedAll/);
  });

  it("GST-134 Run Board uses content-sized columns + horizontal scroll", () => {
    const board = fs.readFileSync(src("components", "RunBoard.tsx"), "utf8");
    const css = fs.readFileSync(src("index.css"), "utf8");
    assert.match(board, /run-board-wrap overflow-x-auto/);
    assert.doesNotMatch(board, /min-w-full/);
    assert.doesNotMatch(board, /min-w-\[9\.5rem\]/);
    assert.match(css, /width:\s*max-content/);
    assert.match(css, /min-width:\s*max-content/);
  });

  it("api client exposes compareRuns + fetchRunLearning + deleteRuns", () => {
    const api = fs.readFileSync(src("api", "client.ts"), "utf8");
    assert.match(api, /export async function compareRuns/);
    assert.match(api, /\/api\/runs\/compare/);
    assert.match(api, /export async function fetchRunLearning/);
    assert.match(api, /export function fetchRun/);
    assert.match(api, /export function deleteRuns/);
    assert.match(api, /\/api\/runs\/delete/);
  });

  it("useDeleteRuns confirms then posts delete and invalidates runs", () => {
    const hook = fs.readFileSync(src("hooks", "useDeleteRuns.ts"), "utf8");
    assert.match(hook, /deleteRuns/);
    assert.match(hook, /window\.confirm/);
    assert.match(hook, /data_and_results/);
    assert.match(hook, /invalidateQueries/);
    assert.match(hook, /queryKey:\s*\[\s*"runs"/);
    assert.match(hook, /code\s*=\s*"cancelled"/);
  });
});
