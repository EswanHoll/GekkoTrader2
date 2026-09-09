/**
 * PnL % Year — annualised projection on the Run Board.
 *
 * Compounded (CAGR), from the *simulated* period rather than wall clock: a
 * 5-week replay finishes in minutes, so wall time would annualise from a number
 * three orders of magnitude wrong.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_PROJECTION_DAYS,
  projectedAnnualPnlPct,
  runPeriodDays,
} from "../src/lib/runBoard.ts";

function run(overrides = {}) {
  return {
    period_start: "2026-01-01T00:00:00Z",
    period_end: "2026-07-02T00:00:00Z", // ~182 days, half a year
    total_pnl_pct: 10,
    ...overrides,
  };
}

test("period days come from simulated period, not wall clock", () => {
  const days = runPeriodDays(run());
  assert.ok(Math.abs(days - 182) < 1.5, `expected ~182 days, got ${days}`);
});

test("compounds rather than extrapolating linearly", () => {
  // +10% over half a year is 21% a year compounded, not 20%.
  const annual = projectedAnnualPnlPct(run());
  assert.ok(annual > 20.5 && annual < 21.5, `expected ~21%, got ${annual}`);
});

test("a full year projects to itself", () => {
  const annual = projectedAnnualPnlPct(
    run({ period_end: "2027-01-01T00:00:00Z", total_pnl_pct: 42 })
  );
  assert.ok(Math.abs(annual - 42) < 0.5, `expected ~42%, got ${annual}`);
});

test("losses annualise too", () => {
  const annual = projectedAnnualPnlPct(run({ total_pnl_pct: -10 }));
  assert.ok(annual < -18 && annual > -20, `expected ~-19%, got ${annual}`);
});

test("short windows are suppressed rather than amplified", () => {
  // 3 days at +5% would "project" to a headline number that is pure noise.
  const annual = projectedAnnualPnlPct(
    run({ period_end: "2026-01-04T00:00:00Z", total_pnl_pct: 5 })
  );
  assert.equal(annual, null);
});

test("the minimum window is a week", () => {
  assert.equal(MIN_PROJECTION_DAYS, 7);
});

test("a wipeout has no meaningful annual rate", () => {
  assert.equal(projectedAnnualPnlPct(run({ total_pnl_pct: -100 })), null);
  assert.equal(projectedAnnualPnlPct(run({ total_pnl_pct: -140 })), null);
});

test("missing period or pnl yields null, never NaN", () => {
  assert.equal(projectedAnnualPnlPct(run({ period_end: null })), null);
  assert.equal(projectedAnnualPnlPct(run({ total_pnl_pct: null })), null);
  assert.equal(projectedAnnualPnlPct(null), null);
  assert.equal(runPeriodDays({ period_start: "x", period_end: "y" }), null);
});

test("a zero-length period is not annualised", () => {
  assert.equal(
    projectedAnnualPnlPct(run({ period_end: "2026-01-01T00:00:00Z" })),
    null
  );
});
