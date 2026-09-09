/** Operator-facing display helpers (desk metrics / runtime). */

export function formatMoney(
  value: unknown,
  opts: { signed?: boolean } = {}
): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (opts.signed) {
    if (n > 0) return `+$${abs}`;
    if (n < 0) return `-$${abs}`;
  }
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

export function formatPct(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export function formatWinRate(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${Math.round(pct)}%`;
}

export function firstValue(...values: unknown[]): unknown {
  return values.find((v) => v !== undefined && v !== null && v !== "");
}

/** Plain-English Runtime line (GST-109). */
export function formatRuntimePlain(data: {
  active_run?: {
    status?: string;
    event_cursor?: number;
    simulated_time?: string;
    heartbeat_at?: string;
    started_at?: string;
  } | null;
  runtime_status?: string;
  power_state?: string;
} | null): string {
  const active = data?.active_run;
  const status = String(
    firstValue(active?.status, data?.runtime_status, data?.power_state, "")
  ).toLowerCase();
  if (
    active &&
    (status === "queued" ||
      status === "preparing" ||
      status === "running" ||
      status === "cancelling")
  ) {
    const events = Number(active.event_cursor) || 0;
    const day = active.simulated_time
      ? String(active.simulated_time).slice(0, 10)
      : "";
    if (status === "cancelling") return "Cancelling run…";
    if (status === "queued") return "Starting worker…";
    if (events > 0) {
      return day
        ? `Simulating · day ${day} · ${events} progress updates`
        : `Simulating · ${events} progress updates`;
    }
    if (
      status === "running" ||
      status === "preparing" ||
      active.heartbeat_at ||
      active.started_at
    ) {
      return "Loading market data (candles)…";
    }
    return "Preparing run…";
  }
  if (status === "completed" || status === "succeeded") {
    return "Finished — last run complete";
  }
  if (status === "upload_failed") {
    return "upload_failed — engine finished; archive upload failed";
  }
  if (status === "failed") return "Failed — see Runs for details";
  if (status === "cancelled") return "Cancelled";
  if (status === "halted" || status === "aborted" || status === "partial") {
    return status;
  }
  if (status === "idle" || status === "ready" || !status) {
    return "Idle — no run in progress";
  }
  // Never coerce unknown backend statuses to "Failed".
  return status;
}

export function periodValue(
  data: Record<string, unknown> | null | undefined,
  key: "today" | "week" | "month" | "year"
): unknown {
  if (!data) return null;
  const period = data.period_pnl as Record<string, unknown> | undefined;
  const alt = data.period as Record<string, unknown> | undefined;
  return firstValue(
    period?.[key],
    alt?.[key],
    data[`${key}_pnl`],
    data[`pnl_${key}`]
  );
}
