/** Run Board matrix specs, normalize, and helpers (GST-97 / GST-118). */

export const PAGE_SIZE = 5;
/** @deprecated Display no longer caps columns — kept as PAGE_SIZE alias for tests. */
export const MAX_PREVIOUS = PAGE_SIZE;

export type BoardRun = Record<string, unknown> & {
  run_id: string;
  status?: string;
  total_pnl?: number | null;
  win_rate?: number | null;
  total_trades?: number | null;
  period_start?: string | null;
  period_end?: string | null;
  opening_balance?: number | null;
  closing_balance?: number | null;
  lookback_days?: number | null;
  run_label?: string | null;
  settings?: Record<string, unknown>;
};

export type ResultSpec = {
  key: string;
  label: string;
  format: string;
  derived?: string;
};

export type SettingSpec = {
  key: string;
  label: string;
  editable?: boolean;
  input?: "text" | "select" | "number";
  options?: "suite" | "lookback_months";
  step?: string;
  min?: string;
  max?: string;
  unit?: string;
  placeholder?: string;
  hint?: string;
  bandit?: boolean;
  arms?: boolean;
  concentrate?: boolean;
};

/** Lookback Months presets for Current Settings (single select; stored as days ×30). */
export const LOOKBACK_MONTH_OPTIONS = [
  "0.5",
  "1",
  "2",
  "3",
  "6",
  "9",
  "12",
  "18",
  "24",
  "36",
  "60",
  "120",
] as const;

/** Effect rows — outcomes of a finished run. */
export const RESULT_SPECS: ResultSpec[] = [
  {
    key: "lookback_months",
    label: "Lookback Months",
    format: "months",
    derived: "lookback_months",
  },
  { key: "period_start", label: "Start Time", format: "when" },
  { key: "period_end", label: "End Time", format: "when" },
  { key: "duration", label: "Duration", format: "duration_text" },
  { key: "total_pnl", label: "$ PnL", format: "money" },
  { key: "total_pnl_pct", label: "PnL %", format: "pct" },
  {
    key: "total_pnl_pct_year",
    label: "PnL % Year",
    format: "pct",
    derived: "pnl_pct_year",
  },
  {
    key: "pnl_delta",
    label: "$ PnL Δ",
    format: "money",
    derived: "pnl_delta",
  },
  { key: "win_rate", label: "Win Rate", format: "rate" },
  {
    key: "max_drawdown_pct",
    label: "Max DD (Observed)",
    format: "pct",
  },
  { key: "total_trades", label: "Trades", format: "int" },
  { key: "opening_balance", label: "Opening Balance", format: "money" },
  {
    key: "closing_balance",
    label: "Closing Balance",
    format: "money",
    derived: "closing",
  },
  { key: "status", label: "Status", format: "text" },
  { key: "bandit_pulls", label: "Bandit Pulls", format: "int" },
];

/** GST-121 — wire values are playbook families; labels are operator-facing. */
export const SUITE_OPTIONS = [
  { value: "playbook1", label: "Playbook 1" },
  { value: "playbook2", label: "Playbook 2" },
  { value: "playbook3", label: "Playbook 3" },
] as const;

/** Cause rows — knobs that change trading behaviour. */
export const SETTING_SPECS: SettingSpec[] = [
  {
    key: "lookback_days",
    label: "Lookback Months",
    editable: true,
    input: "select",
    options: "lookback_months",
    step: "0.1",
    min: "0.1",
    max: "120",
    unit: "months",
    placeholder: "e.g. 3",
    hint: "Stored as days (×30). 3 months = 90 days",
  },
  {
    key: "strategy_suite",
    label: "Playbook",
    editable: true,
    input: "select",
    options: "suite",
    hint: "Defaults: V1→Playbook 1, V2→Playbook 3",
  },
  {
    key: "bandit_enabled_arms",
    label: "Enabled Strategies",
    editable: false,
    arms: true,
    hint: "Suite arms the bandit may trade",
  },
  {
    key: "bandit_concentrate",
    label: "Bandit Concentrate",
    editable: true,
    input: "text",
    concentrate: true,
    bandit: true,
    placeholder: "variant_key",
    hint: "Concentrate order / #1 rank arm key for the next run",
  },
  {
    key: "bandit_tier_counts",
    label: "Allocation Tiers",
    editable: false,
    hint: "core / challenger / scout",
  },
  {
    key: "interval",
    label: "Entry Bar Interval",
    editable: true,
    input: "text",
    placeholder: "1m",
  },
  {
    key: "htf_interval",
    label: "Higher-Timeframe Confirm",
    editable: true,
    input: "text",
    placeholder: "15m",
  },
  {
    key: "lookback_bars",
    label: "Lookback Bars",
    editable: true,
    step: "1",
    min: "1",
    max: "500000",
  },
  {
    key: "opening_balance",
    label: "Opening Balance",
    editable: true,
    step: "1",
    min: "100",
    max: "10000000",
    placeholder: "5000",
  },
  {
    key: "default_leverage",
    label: "Default Leverage",
    editable: true,
    step: "1",
    min: "1",
    max: "3",
  },
  {
    key: "min_leverage",
    label: "Min Leverage",
    editable: true,
    step: "1",
    min: "1",
    max: "3",
  },
  {
    key: "max_leverage",
    label: "Max Leverage",
    editable: true,
    step: "1",
    min: "1",
    max: "3",
  },
  {
    key: "max_drawdown_pct",
    label: "Max Drawdown % (Cap)",
    editable: true,
    step: "0.1",
    min: "1",
    max: "100",
  },
  {
    key: "min_stop_distance_pct",
    label: "Min Stop Distance %",
    editable: true,
    step: "0.01",
    min: "0.01",
    max: "5",
  },
  {
    key: "max_portfolio_heat_pct",
    label: "Max Portfolio Heat %",
    editable: true,
    step: "0.1",
    min: "1",
    max: "100",
  },
  {
    key: "risk_per_trade_pct",
    label: "Risk Per Trade %",
    editable: true,
    step: "0.1",
    min: "0.1",
    max: "10",
  },
  {
    key: "max_trades_per_day",
    label: "Max Trades / Day",
    editable: true,
    step: "1",
    min: "0",
    max: "10000",
  },
  {
    key: "min_trades_per_day",
    label: "Min Trades / Day",
    editable: true,
    step: "1",
    min: "0",
    max: "50",
  },
  {
    key: "max_open_positions",
    label: "Max Open Positions",
    editable: true,
    step: "1",
    min: "0",
    max: "100",
  },
  {
    key: "max_hold_minutes",
    label: "Max Hold Minutes",
    editable: true,
    step: "1",
    min: "1",
    max: "1440",
  },
  {
    key: "bandit_exploration_rate",
    label: "Exploration Rate",
    editable: true,
    step: "0.01",
    min: "0",
    max: "1",
    bandit: true,
  },
  {
    key: "seed",
    label: "Seed",
    editable: true,
    step: "1",
    min: "0",
    max: "999999999",
  },
  {
    key: "symbol_count",
    label: "Symbol Count",
    editable: true,
    step: "1",
    min: "1",
    max: "100",
    hint: "On Save, seeds top N from market-cap ranked universe",
  },
  {
    key: "paper_confidence_threshold",
    label: "Paper Confidence",
    editable: true,
    step: "0.01",
    min: "0",
    max: "1",
  },
  {
    key: "max_daily_loss_pct",
    label: "Max Daily Loss %",
    editable: true,
    step: "0.1",
    min: "0",
    max: "100",
  },
  {
    key: "max_weekly_loss_pct",
    label: "Max Weekly Loss %",
    editable: true,
    step: "0.1",
    min: "0",
    max: "100",
  },
];

export function daysToMonths(days: unknown): number | null {
  const n = Number(days);
  if (!Number.isFinite(n)) return null;
  const months = n / 30;
  const rounded = Math.round(months * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function monthsToDays(months: unknown): number | null {
  const n = Number(months);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 30 * 10) / 10;
}

/** Bars-per-calendar-day for a candle interval (default 1m). */
export function barsPerDayForInterval(interval: unknown): number {
  const raw = String(interval || "1m").trim().toLowerCase();
  const m = raw.match(/^(\d+)\s*m$/);
  if (m) {
    const minutes = Math.max(1, Number(m[1]) || 1);
    return (24 * 60) / minutes;
  }
  const h = raw.match(/^(\d+)\s*h$/);
  if (h) {
    const hours = Math.max(1, Number(h[1]) || 1);
    return 24 / hours;
  }
  if (raw === "1d" || raw === "d" || raw === "1day") return 1;
  return 1440;
}

/** Derive lookback days from lookback_bars + interval when days are absent. */
export function lookbackDaysFromBars(
  bars: unknown,
  interval: unknown
): number | null {
  const n = Number(bars);
  if (!Number.isFinite(n) || n <= 0) return null;
  const perDay = barsPerDayForInterval(interval);
  if (!Number.isFinite(perDay) || perDay <= 0) return null;
  return n / perDay;
}

export function normalizeRiskCapPct(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n < 1) return null;
  return n;
}

export function fmtWhen(iso: unknown): string {
  if (!iso) return "—";
  try {
    const d = new Date(String(iso));
    if (Number.isNaN(d.getTime())) return String(iso);
    // SAST = UTC+2
    const sast = new Date(d.getTime() + 2 * 60 * 60 * 1000);
    const y = sast.getUTCFullYear();
    const m = String(sast.getUTCMonth() + 1).padStart(2, "0");
    const day = String(sast.getUTCDate()).padStart(2, "0");
    const h = String(sast.getUTCHours()).padStart(2, "0");
    const min = String(sast.getUTCMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min} SAST`;
  } catch {
    return String(iso);
  }
}

export function displayBoardValue(value: unknown, format?: string | null): string {
  if (value == null || value === "") return "—";
  if (format === "when") return fmtWhen(value);
  if (format === "text") return String(value);
  if (format === "money") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const rounded = Math.round(n);
    const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
    return `${sign}$${Math.abs(rounded)}`;
  }
  if (format === "pct") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const digits = Math.abs(n) > 0 && Math.abs(n) < 0.05 ? 4 : 2;
    return `${n.toFixed(digits)}%`;
  }
  if (format === "rate") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${(n <= 1 ? n * 100 : n).toFixed(1)}%`;
  }
  if (format === "duration" || format === "duration_text") {
    if (typeof value === "string" && /[hms]/.test(value)) return value;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return String(value);
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }
  if (format === "int") {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : String(value);
  }
  if (format === "months") {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return String(n);
  }
  return String(value);
}

/**
 * Flatten greenfield run + metrics into the shape Run Board expects
 * (top-level total_pnl, win_rate, period_*, etc.).
 */
export function normalizeRunForBoard(
  run: Record<string, unknown> | null | undefined
): BoardRun | null {
  if (!run) return null;
  const m =
    run.metrics && typeof run.metrics === "object"
      ? (run.metrics as Record<string, unknown>)
      : {};
  const total_pnl =
    (m.total_pnl as number | null | undefined) ??
    (m.realized_pnl as number | null | undefined) ??
    (m.pnl as number | null | undefined) ??
    (run.realized_pnl as number | null | undefined) ??
    null;
  const opening =
    (m.opening_balance as number | null | undefined) ??
    (run.opening_balance as number | null | undefined) ??
    (m.start_balance as number | null | undefined) ??
    null;
  const closing =
    (m.closing_balance as number | null | undefined) ??
    (m.equity as number | null | undefined) ??
    (opening != null && total_pnl != null
      ? Number(opening) + Number(total_pnl)
      : null);
  return {
    ...run,
    ...m,
    run_id: String(run.run_id),
    run_label: (run.run_label as string | null | undefined) ?? null,
    status: run.status as string | undefined,
    status_reason: run.status_reason,
    seed: run.seed ?? m.seed,
    dataset_id: run.dataset_id ?? m.dataset_id,
    settings_version_id: run.settings_version_id,
    manifest_sha256: run.manifest_sha256,
    checkpoint_digest: run.checkpoint_digest,
    total_pnl,
    total_pnl_pct:
      (m.total_pnl_pct as number | null | undefined) ??
      (m.growth_pct as number | null | undefined) ??
      (m.pnl_pct as number | null | undefined) ??
      null,
    win_rate: (m.win_rate as number | null | undefined) ?? null,
    max_drawdown_pct:
      (m.max_drawdown_pct as number | null | undefined) ??
      (m.max_dd_pct as number | null | undefined) ??
      null,
    total_trades:
      (m.total_trades as number | null | undefined) ??
      (m.trades_closed as number | null | undefined) ??
      (m.closed_trades as number | null | undefined) ??
      (m.trade_count as number | null | undefined) ??
      (run.trades_closed as number | null | undefined) ??
      null,
    opening_balance: opening,
    closing_balance: closing,
    bandit_pulls:
      (m.bandit_pulls as number | null | undefined) ??
      (m.pulls as number | null | undefined) ??
      null,
    period_start:
      (m.period_start as string | null | undefined) ??
      (run.started_at as string | null | undefined) ??
      (run.created_at as string | null | undefined) ??
      null,
    period_end:
      (m.period_end as string | null | undefined) ??
      (run.completed_at as string | null | undefined) ??
      (run.finished_at as string | null | undefined) ??
      null,
    started_at:
      (run.started_at as string | null | undefined) ??
      (run.created_at as string | null | undefined) ??
      null,
    finished_at:
      (run.completed_at as string | null | undefined) ??
      (run.finished_at as string | null | undefined) ??
      null,
    duration:
      (m.duration as number | null | undefined) ??
      (m.wall_seconds as number | null | undefined) ??
      null,
    wall_seconds: (m.wall_seconds as number | null | undefined) ?? null,
    lookback_days: (() => {
      const settingsObj =
        (run.settings as Record<string, unknown>) ||
        (m.settings as Record<string, unknown>) ||
        {};
      const direct =
        (m.lookback_days as number | null | undefined) ??
        (run.lookback_days as number | null | undefined) ??
        (settingsObj.lookback_days as number | null | undefined) ??
        null;
      if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
      const bars =
        (m.lookback_bars as number | null | undefined) ??
        (run.lookback_bars as number | null | undefined) ??
        (settingsObj.lookback_bars as number | null | undefined) ??
        null;
      const interval =
        (m.interval as string | null | undefined) ??
        (run.interval as string | null | undefined) ??
        (settingsObj.interval as string | null | undefined) ??
        "1m";
      return lookbackDaysFromBars(bars, interval);
    })(),
    settings:
      (run.settings as Record<string, unknown>) ||
      (m.settings as Record<string, unknown>) ||
      {},
    evidence: (run.evidence as Record<string, unknown>) || {},
  };
}

/** GST-129/130 — Analyze needs R2 trade/learning artefacts. */
export const ANALYZE_UPLOAD_FAILED_TITLE =
  "Detailed trade logs unavailable (archive upload failed).";

/** True when detailed ledger artefacts are unavailable for Analyze. */
export function isAnalyzeUnavailable(
  run: BoardRun | null | undefined
): boolean {
  return String(run?.status || "").trim().toLowerCase() === "upload_failed";
}

export function runLabel(run: BoardRun | null | undefined): string {
  if (!run) return "—";
  return String(
    run.run_label ||
      fmtWhen(run.finished_at || run.period_end) ||
      run.period_start ||
      run.run_id ||
      "—"
  );
}

/**
 * Historical run columns for the board.
 * GST-134 — show every loaded run (no hard 5-column cap). Pass ``maxPrev``
 * only when a caller intentionally wants a slice.
 */
export function previousRuns(
  results: BoardRun[],
  maxPrev?: number
): BoardRun[] {
  const list = (Array.isArray(results) ? results : []).filter(
    (r) => r && r.run_id
  );
  if (maxPrev != null && maxPrev > 0) return list.slice(0, maxPrev);
  return list;
}

export function settingsBlobFromRun(
  run: BoardRun | null | undefined
): Record<string, unknown> {
  const base =
    run && typeof run.settings === "object" ? { ...run.settings } : {};
  for (const key of [
    "strategy_suite",
    "interval",
    "htf_interval",
    "lookback_bars",
    "lookback_days",
    "leverage",
    "seed",
    "opening_balance",
    "max_portfolio_heat_pct",
    "max_trades_per_day",
    "min_trades_per_day",
    "max_open_positions",
    "max_hold_minutes",
    "paper_confidence_threshold",
    "min_stop_distance_pct",
    "risk_per_trade_pct",
    "max_daily_loss_pct",
    "max_weekly_loss_pct",
    "min_leverage",
    "default_leverage",
    "max_leverage",
  ] as const) {
    if ((base[key] == null || base[key] === "") && run && run[key] != null) {
      base[key] = run[key];
    }
  }
  const capFromSettings = normalizeRiskCapPct(base.max_drawdown_pct);
  if (capFromSettings != null) {
    base.max_drawdown_pct = capFromSettings;
  } else {
    delete base.max_drawdown_pct;
  }
  if (base.bandit_exploration_rate != null) {
    base.bandit = {
      ...((base.bandit as Record<string, unknown>) || {}),
      exploration_rate: base.bandit_exploration_rate,
    };
  }
  if (base.default_leverage == null && base.leverage != null) {
    base.default_leverage = base.leverage;
  }
  return base;
}

export function settingValue(
  source: Record<string, unknown> | null | undefined,
  key: string
): unknown {
  if (!source || typeof source !== "object") return null;
  const settings =
    source.settings && typeof source.settings === "object"
      ? (source.settings as Record<string, unknown>)
      : source;
  const bandit =
    settings.bandit && typeof settings.bandit === "object"
      ? (settings.bandit as Record<string, unknown>)
      : {};
  if (key === "bandit_concentrate") {
    const order = Array.isArray(bandit.concentrate_order)
      ? bandit.concentrate_order
      : null;
    if (order && order.length) {
      return order.map((k, i) => `#${i + 1} ${k}`).join(", ");
    }
    return settings.bandit_concentrate ?? bandit.concentrate ?? null;
  }
  if (key === "bandit_enabled_arms") {
    if (settings.bandit_enabled_arms != null) return settings.bandit_enabled_arms;
    const disabled = bandit.disable_variants;
    if (Array.isArray(disabled)) {
      return `${Math.max(0, 7 - disabled.length)} enabled`;
    }
    return null;
  }
  if (key === "bandit_tier_counts") {
    const counts = settings.bandit_tier_counts;
    if (counts && typeof counts === "object") {
      const c = counts as Record<string, unknown>;
      return `C${c.core ?? 0} / H${c.challenger ?? 0} / S${c.scout ?? 0}`;
    }
    const tiers = bandit.allocation_tiers;
    if (tiers && typeof tiers === "object") {
      const vals = Object.values(tiers as Record<string, unknown>);
      const c = vals.filter((t) => t === "core").length;
      const h = vals.filter((t) => t === "challenger").length;
      const s = vals.filter((t) => t === "scout").length;
      return `C${c} / H${h} / S${s}`;
    }
    return null;
  }
  if (key === "bandit_exploration_rate") {
    return settings.bandit_exploration_rate ?? bandit.exploration_rate ?? null;
  }
  if (key === "symbol_count") {
    if (settings.symbol_count != null) return settings.symbol_count;
    if (Array.isArray(settings.symbols)) return settings.symbols.length;
    return null;
  }
  if (key === "default_leverage") {
    return (
      settings.default_leverage ??
      settings.leverage ??
      source.leverage ??
      null
    );
  }
  if (key === "max_drawdown_pct") {
    return normalizeRiskCapPct(settings.max_drawdown_pct);
  }
  if (key in settings) return settings[key];
  if (source.settings && key in source && key !== "max_drawdown_pct") {
    return source[key];
  }
  if (!source.settings && key in source) return source[key];
  return null;
}

export function lookbackMonthsFromSource(
  source: Record<string, unknown> | null | undefined
): number | null {
  if (!source) return null;
  const settings =
    source.settings && typeof source.settings === "object"
      ? (source.settings as Record<string, unknown>)
      : {};
  let days =
    settingValue(source, "lookback_days") ??
    source.lookback_days ??
    settings.lookback_days ??
    null;
  if (!Number.isFinite(Number(days))) {
    const bars =
      settingValue(source, "lookback_bars") ??
      source.lookback_bars ??
      settings.lookback_bars ??
      null;
    const interval =
      settingValue(source, "interval") ??
      source.interval ??
      settings.interval ??
      "1m";
    days = lookbackDaysFromBars(bars, interval);
  }
  return daysToMonths(days);
}

/** Shortest window we will annualise from. */
export const MIN_PROJECTION_DAYS = 7;

/**
 * Simulated days a run covered, from its replayed period — not wall clock.
 *
 * A 5-week replay finishes in minutes, so wall time would annualise from the
 * wrong number by three orders of magnitude.
 */
export function runPeriodDays(run: BoardRun | null | undefined): number | null {
  if (!run) return null;
  const start = run.period_start ? Date.parse(String(run.period_start)) : NaN;
  const end = run.period_end ? Date.parse(String(run.period_end)) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const days = (end - start) / 86_400_000;
  return days > 0 ? days : null;
}

/**
 * Annualised projection of a run's return (CAGR), as a percentage.
 *
 * Compounded rather than linear, because that is what "% year" means for a
 * return series: a 10% gain over six months is not 20% a year, it is 21%.
 *
 * Returns ``null`` — rendering as "—" — when it would be noise rather than
 * information:
 *  - windows under {@link MIN_PROJECTION_DAYS}, where the exponent amplifies a
 *    few trades into a headline number (a week at +5% "projects" to +1100%),
 *  - a total loss, where the compounding base is non-positive.
 *
 * This is a projection of past performance, not a forecast. It assumes the
 * observed rate repeats for a year, which no strategy is entitled to assume.
 */
export function projectedAnnualPnlPct(
  run: BoardRun | null | undefined
): number | null {
  if (!run) return null;
  const raw = run.total_pnl_pct;
  // Number(null) is 0, not NaN — without this an absent PnL would render as a
  // confident 0% projection instead of "—".
  if (raw == null || raw === "") return null;
  const pct = Number(raw);
  if (!Number.isFinite(pct)) return null;
  const days = runPeriodDays(run);
  if (days == null || days < MIN_PROJECTION_DAYS) return null;
  const growth = 1 + pct / 100;
  if (growth <= 0) return null; // wiped out — no meaningful annual rate
  const annual = Math.pow(growth, 365 / days) - 1;
  if (!Number.isFinite(annual)) return null;
  return annual * 100;
}

export function effectValue(
  run: BoardRun | null | undefined,
  spec: ResultSpec,
  olderRun?: BoardRun | null
): unknown {
  if (spec.derived === "pnl_pct_year") {
    return projectedAnnualPnlPct(run);
  }
  if (spec.derived === "lookback_months") {
    return lookbackMonthsFromSource(run as Record<string, unknown>);
  }
  if (!run) return null;
  if (spec.derived === "pnl_delta") {
    if (
      !olderRun ||
      olderRun.total_pnl == null ||
      run.total_pnl == null
    ) {
      return null;
    }
    const a = Number(run.total_pnl);
    const b = Number(olderRun.total_pnl);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a - b;
  }
  if (spec.derived === "closing") {
    if (run.closing_balance != null) return run.closing_balance;
    const open = Number(run.opening_balance);
    const pnl = Number(run.total_pnl);
    if (!Number.isFinite(open) || !Number.isFinite(pnl)) return null;
    return open + pnl;
  }
  if (spec.key === "period_start") {
    return run.period_start || run.started_at || null;
  }
  if (spec.key === "period_end") {
    return run.period_end || run.finished_at || null;
  }
  if (spec.key === "duration") {
    if (run.duration) return run.duration;
    return run.wall_seconds != null ? run.wall_seconds : null;
  }
  return run[spec.key] != null ? run[spec.key] : null;
}

export function hiddenRunsStorageKey(scopeKey: string): string {
  return `gekko.results.hidden.${scopeKey}`;
}

export function loadHiddenRunIds(scopeKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(hiddenRunsStorageKey(scopeKey));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

export function persistHiddenRunIds(scopeKey: string, ids: Set<string>): void {
  try {
    localStorage.setItem(
      hiddenRunsStorageKey(scopeKey),
      JSON.stringify([...ids])
    );
  } catch {
    /* private mode */
  }
}

/** Finite lookback helper — rejects null/"" (Number(null)===0 would falsely pass). */
export function finiteLookback(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function preferPriorLookback(
  settings: Record<string, unknown>,
  prior: Record<string, unknown>,
  hydrate: Record<string, unknown>
): void {
  for (const key of ["lookback_days", "lookback_bars"] as const) {
    if (finiteLookback(hydrate[key]) != null) continue;
    const priorVal = finiteLookback(prior[key]);
    if (priorVal != null) settings[key] = priorVal;
  }
}

/** Merge compare/hydrate settings into list-normalized runs. */
export function mergeHydratedSettings(
  runs: BoardRun[],
  hydratedRows: Record<string, unknown>[]
): BoardRun[] {
  const byId = new Map(
    hydratedRows.map((r) => [String(r.run_id), r] as const)
  );
  return runs.map((run) => {
    const h = byId.get(String(run.run_id));
    if (!h) return run;
    // GST-134 — deep-merge settings so compare rows cannot wipe lookback
    // (flash-then-dash on Lookback Months). Null hydrate values must not
    // overwrite a good prior (Number(null)===0 used to skip restore).
    const priorSettings =
      run.settings && typeof run.settings === "object"
        ? { ...run.settings }
        : {};
    const hydrateSettings =
      h.settings && typeof h.settings === "object"
        ? (h.settings as Record<string, unknown>)
        : {};
    const settings = { ...priorSettings, ...hydrateSettings };
    preferPriorLookback(settings, priorSettings, hydrateSettings);
    // Strip nullish lookback on the hydrate row so spread cannot null top-level.
    const hydrateSafe: Record<string, unknown> = { ...h };
    if (finiteLookback(hydrateSafe.lookback_days) == null) {
      delete hydrateSafe.lookback_days;
    }
    if (finiteLookback(hydrateSafe.lookback_bars) == null) {
      delete hydrateSafe.lookback_bars;
    }
    const merged =
      normalizeRunForBoard({ ...run, ...hydrateSafe, settings }) || run;
    const priorDays = finiteLookback(run.lookback_days);
    if (finiteLookback(merged.lookback_days) == null && priorDays != null) {
      merged.lookback_days = priorDays;
    }
    const priorSettingsDays = finiteLookback(priorSettings.lookback_days);
    if (
      merged.settings &&
      finiteLookback(merged.settings.lookback_days) == null &&
      priorSettingsDays != null
    ) {
      merged.settings = {
        ...merged.settings,
        lookback_days: priorSettingsDays,
      };
    }
    const priorBars = finiteLookback(
      priorSettings.lookback_bars ?? run.lookback_bars
    );
    if (
      merged.settings &&
      finiteLookback(merged.settings.lookback_bars) == null &&
      priorBars != null
    ) {
      merged.settings = {
        ...merged.settings,
        lookback_bars: priorBars,
      };
    }
    return merged;
  });
}
