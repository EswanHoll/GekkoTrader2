/**
 * Desk ledger helpers — positions / strategies / trades from dashboard payload.
 * GST-131 / GST-132 — React Trading Desk parity (do not edit frontend/legacy/).
 */
import { firstValue, formatMoney, formatRuntimePlain } from "@/lib/format";
import { deskLabel, formatScopeLabel } from "@/lib/scope";
import { fmtWhen } from "@/lib/runBoard";
import type { DeskFleetRow } from "@/api/client";
import type { DatasetScope } from "@/types/scope";

export type DeskRow = Record<string, unknown>;
export type PositionSideFilter = "all" | "long" | "short";

/** Rolling window for Recent Trades (matches worker RECENT_TRADES_WINDOW). */
export const RECENT_TRADES_WINDOW = 100;

export function asRows(...candidates: unknown[]): DeskRow[] {
  for (const value of candidates) {
    if (Array.isArray(value) && value.length) {
      return value.filter((r) => r && typeof r === "object") as DeskRow[];
    }
  }
  for (const value of candidates) {
    if (Array.isArray(value)) {
      return value.filter((r) => r && typeof r === "object") as DeskRow[];
    }
  }
  return [];
}

export function deskPositions(payload: Record<string, unknown> | null | undefined): DeskRow[] {
  if (!payload) return [];
  return asRows(payload.paper_positions, payload.positions);
}

export function deskStrategies(payload: Record<string, unknown> | null | undefined): DeskRow[] {
  if (!payload) return [];
  return asRows(payload.strategies, payload.top_variants);
}

export function deskTrades(payload: Record<string, unknown> | null | undefined): DeskRow[] {
  if (!payload) return [];
  const rows = asRows(payload.recent_trades, payload.trades);
  // DOM guardrail — never render more than the rolling window mid-flight.
  return rows.length > RECENT_TRADES_WINDOW
    ? rows.slice(-RECENT_TRADES_WINDOW)
    : rows;
}

/** YYYY-MM-DD from simulated candle / EOD timestamp (not wall clock). */
export function simDateKey(value: unknown): string {
  if (value == null || value === "") return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function simulatedAnchor(
  payload: Record<string, unknown> | null | undefined
): string {
  if (!payload) return "";
  const active = payload.active_run as { simulated_time?: string } | null | undefined;
  return (
    simDateKey(
      firstValue(
        payload.simulated_time,
        active?.simulated_time,
        payload.sim_day,
        payload.last_cycle_at
      )
    ) || ""
  );
}

export function positionSide(row: DeskRow | null | undefined): "long" | "short" | string {
  const raw = String(
    firstValue(row?.side, row?.position_side, row?.direction) || ""
  ).toLowerCase();
  if (raw.includes("short") || raw === "sell") return "short";
  if (raw.includes("long") || raw === "buy") return "long";
  return raw || "—";
}

export function filterPositions(
  rows: DeskRow[],
  side: PositionSideFilter,
  search: string
): DeskRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((p) => {
    const rowSide = positionSide(p);
    const sideOk = side === "all" || rowSide === side;
    if (!sideOk) return false;
    if (!q) return true;
    const text = [
      p.id,
      p.trade_id,
      p.book_trade_no,
      p.symbol,
      p.asset,
      p.strategy,
      p.strategy_name,
      p.strategy_id,
      rowSide,
    ]
      .map((v) => String(v ?? "").toLowerCase())
      .join(" ");
    return text.includes(q);
  });
}

function tradeInstant(row: DeskRow): unknown {
  return firstValue(row.closed_at, row.exit_time, row.opened_at, row.entry_time, row.created_at);
}

/**
 * Filter trades by From/To against **simulated** candle timestamps on the row
 * (`closed_at` / `opened_at`), not wall-clock time.
 */
export function filterTrades(
  rows: DeskRow[],
  fromValue: string,
  toValue: string,
  search: string
): DeskRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((t) => {
    const raw = tradeInstant(t);
    if (raw && (fromValue || toValue)) {
      // Compare calendar dates in UTC so sim candle days match the date inputs.
      const day = simDateKey(raw);
      if (day) {
        if (fromValue && day < fromValue) return false;
        if (toValue && day > toValue) return false;
      }
    }
    if (!q) return true;
    const text = [
      t.trade_id,
      t.id,
      t.book_trade_no,
      t.symbol,
      t.side,
      t.strategy,
      t.strategy_name,
      t.strategy_id,
      t.status,
      t.exit_reason,
    ]
      .map((v) => String(v ?? "").toLowerCase())
      .join(" ");
    return text.includes(q);
  });
}

export function formatNumber(value: unknown, digits = 2): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(n);
}

export function formatPrice(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: n >= 100 ? 2 : 4,
    maximumFractionDigits: n >= 100 ? 2 : 6,
  }).format(n);
}

export function formatInstant(value: unknown): string {
  if (value == null || value === "") return "—";
  return fmtWhen(value);
}

export function formatDurationBetween(
  opened: unknown,
  closed: unknown,
  opts: { open?: boolean } = {}
): string {
  const start = opened ? new Date(String(opened)) : null;
  const end = closed
    ? new Date(String(closed))
    : opts.open
      ? new Date()
      : null;
  if (!start || Number.isNaN(start.getTime())) return "—";
  if (!end || Number.isNaN(end.getTime())) return "—";
  let secs = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
  const days = Math.floor(secs / 86400);
  secs %= 86400;
  const hours = Math.floor(secs / 3600);
  secs %= 3600;
  const mins = Math.floor(secs / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}

export function rowDuration(row: DeskRow, opts: { open?: boolean } = {}): string {
  const explicit = firstValue(row.duration, row.hold_time, row.duration_text);
  if (explicit != null && explicit !== "") {
    const n = Number(explicit);
    if (Number.isFinite(n) && String(explicit).trim() === String(n)) {
      return n >= 120 ? `${Math.round(n / 60)}h` : `${Math.round(n)}m`;
    }
    return String(explicit);
  }
  const holdMins = firstValue(row.hold_minutes, row.max_hold_minutes);
  if (holdMins != null && holdMins !== "" && !opts.open) {
    const n = Number(holdMins);
    if (Number.isFinite(n)) return `${Math.round(n)}m`;
  }
  return formatDurationBetween(
    firstValue(row.opened_at, row.entry_time, row.created_at),
    firstValue(row.closed_at, row.exit_time),
    opts
  );
}

export function rowCost(row: DeskRow): unknown {
  return firstValue(row.cost, row.margin, row.collateral);
}

export function rowValue(row: DeskRow): unknown {
  return firstValue(row.value, row.notional, row.notional_usd);
}

export function rowPctEq(
  row: DeskRow,
  equity: unknown
): string {
  const direct = firstValue(row.pct_eq, row.equity_pct, row.margin_pct, row.pct_equity);
  if (direct != null && direct !== "") {
    const n = Number(direct);
    if (Number.isFinite(n)) {
      const pct = Math.abs(n) <= 1 ? n * 100 : n;
      return `${pct.toFixed(2)}%`;
    }
    return String(direct);
  }
  const cost = Number(rowCost(row));
  const eq = Number(equity);
  if (!Number.isFinite(cost) || !Number.isFinite(eq) || eq === 0) return "—";
  return `${((cost / eq) * 100).toFixed(2)}%`;
}

export function pnlClass(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return n < 0 ? "text-red-300" : "text-gekko";
}

export function sideClass(side: string): string {
  if (side === "long") return "text-gekko";
  if (side === "short") return "text-red-300";
  return "";
}

export function formatPnl(value: unknown): string {
  return formatMoney(value, { signed: true });
}

export function latencyText(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return "—";
  const latency = firstValue(
    payload.binance_latency_ms,
    payload.latency_ms,
    payload.latency,
    payload.avg_ms
  );
  if (latency == null || latency === "") return "—";
  return `${formatNumber(latency, 0)}ms`;
}

export function egressIpText(
  payload: Record<string, unknown> | null | undefined,
  scope: DatasetScope | null
): string {
  const ip = payload?.egress_ip;
  if (ip) return `IP ${String(ip)}`;
  if (!scope) return "—";
  // Pass the raw claim through — formatScopeLabel deliberately resolves without
  // a scope so a lane default can never masquerade as a real binding. Resolving
  // here with `scope` first defeated that guard: an unbound Demo A desk rendered
  // "Demo A · playbook1.1" while Results correctly showed "Playbook —".
  return (
    formatScopeLabel(scope, payload?.playbook_key as string | null | undefined) ||
    deskLabel(scope)
  );
}

export function universeSymbols(
  payload: Record<string, unknown> | null | undefined
): string[] {
  if (!payload) return [];
  const raw = payload.symbols;
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s)).filter(Boolean);
}

export function universeLine(
  payload: Record<string, unknown> | null | undefined
): string {
  const symbols = universeSymbols(payload);
  return symbols.length ? symbols.join(", ") : "—";
}

export function autopilotMetaText(
  payload: Record<string, unknown> | null | undefined
): string {
  if (!payload) return "Waiting for dashboard data.";
  const active = payload.active_run as
    | { status?: string; event_cursor?: number; simulated_time?: string }
    | null
    | undefined;
  const activeStatus = String(active?.status || "").toLowerCase();
  if (
    active &&
    ["queued", "preparing", "running", "cancelling"].includes(activeStatus)
  ) {
    return formatRuntimePlain(
      payload as Parameters<typeof formatRuntimePlain>[0]
    );
  }
  const cycle = (payload.cycle_meta as Record<string, unknown>) || {};
  const lastCycle = firstValue(
    cycle.last_cycle_at,
    payload.last_cycle_at,
    payload.updated_at
  );
  const bits = [
    firstValue(cycle.interval, payload.signal_interval)
      ? `Signal ${firstValue(cycle.interval, payload.signal_interval)}`
      : "",
    firstValue(cycle.htf_interval, payload.htf_interval)
      ? `HTF ${firstValue(cycle.htf_interval, payload.htf_interval)}`
      : "",
    lastCycle ? `Updated ${formatInstant(lastCycle)}` : "",
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "Waiting for dashboard data.";
}

export function fleetDeskId(scope: DatasetScope | null | undefined): string | null {
  if (!scope) return null;
  if (scope.execution_env === "live") return "live";
  if (scope.lane === "a" || scope.lane === "b") {
    return `${scope.execution_env}-${scope.lane}`;
  }
  return null;
}

export function deskHealthLabel(
  fleetRow: DeskFleetRow | null | undefined,
  payload: Record<string, unknown> | null | undefined
): { label: "Healthy" | "Unhealthy"; tone: "ok" | "bad" | "warn" } {
  const power = String(fleetRow?.power?.state || payload?.power_state || "").toLowerCase();
  if (power === "unhealthy" || power === "failed" || power === "error") {
    return { label: "Unhealthy", tone: "bad" };
  }
  if (power === "off" || power === "unknown") {
    return { label: "Unhealthy", tone: "warn" };
  }
  if (power === "on" || power === "starting" || power === "healthy") {
    return { label: "Healthy", tone: "ok" };
  }
  // No fleet row — infer from dashboard reachability.
  if (payload) return { label: "Healthy", tone: "ok" };
  return { label: "Unhealthy", tone: "warn" };
}

export function deskRunLabel(
  fleetRow: DeskFleetRow | null | undefined,
  payload: Record<string, unknown> | null | undefined
): { label: "Running" | "Stopped"; tone: "ok" | "off" } {
  const active = payload?.active_run as { status?: string } | null | undefined;
  const status = String(
    firstValue(active?.status, payload?.runtime_status, payload?.power_state, "")
  ).toLowerCase();
  if (
    active &&
    ["queued", "preparing", "running", "cancelling"].includes(status)
  ) {
    return { label: "Running", tone: "ok" };
  }
  const activity = String(fleetRow?.activity?.state || "").toLowerCase();
  if (
    activity === "trading" ||
    activity === "running_job" ||
    activity === "queued"
  ) {
    return { label: "Running", tone: "ok" };
  }
  const power = String(fleetRow?.power?.state || "").toLowerCase();
  if (power === "starting") return { label: "Running", tone: "ok" };
  return { label: "Stopped", tone: "off" };
}

export function maxOpenPositions(
  payload: Record<string, unknown> | null | undefined
): unknown {
  if (!payload) return null;
  const risk = payload.risk_limits as Record<string, unknown> | undefined;
  const settings = payload.settings as Record<string, unknown> | undefined;
  return firstValue(
    payload.max_open_positions,
    risk?.max_open_positions,
    settings?.max_open_positions,
    payload.open_position_cap
  );
}

export function strategyId(row: DeskRow): string {
  return String(
    firstValue(row.id, row.strategy_id, row.key, row.variant_key, row.strategy, "—")
  );
}

export function strategyName(row: DeskRow): string {
  return String(
    firstValue(row.name, row.strategy_name, row.strategy, row.key, row.variant_key, "—")
  );
}

export function positionId(row: DeskRow): string {
  return String(firstValue(row.id, row.trade_id, row.book_trade_no, "—"));
}

export function tradeId(row: DeskRow): string {
  return String(firstValue(row.trade_id, row.id, row.book_trade_no, "—"));
}
