import { useMemo, useState } from "react";
import { fetchFullDeskLedger } from "@/api/client";
import {
  RECENT_TRADES_WINDOW,
  filterTrades,
  formatInstant,
  formatNumber,
  formatPnl,
  pnlClass,
  rowCost,
  rowDuration,
  rowPctEq,
  rowValue,
  sideClass,
  positionSide,
  tradeId,
  type DeskRow,
} from "@/lib/deskLedger";
import { downloadTextFile, tradesToCsv } from "@/lib/ledgerCsv";
import { firstValue, formatMoney } from "@/lib/format";
import type { DatasetScope } from "@/types/scope";

type Props = {
  rows: DeskRow[];
  equity?: unknown;
  /** Simulated calendar day (YYYY-MM-DD) for filter hints — not wall clock. */
  simAnchor?: string;
  /** Desk scope for full-ledger CSV export (GST-148). */
  scope?: DatasetScope | null;
};

const COLS = 13;

export function RecentTradesTable({
  rows,
  equity,
  simAnchor = "",
  scope = null,
}: Props) {
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");
  const [search, setSearch] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

  const filtered = useMemo(
    () => filterTrades(rows, fromValue, toValue, search),
    [rows, fromValue, toValue, search]
  );

  const totalLabel =
    filtered.length === rows.length
      ? String(filtered.length)
      : `${filtered.length}/${rows.length}`;

  async function onExportCsv() {
    if (!scope) {
      setExportStatus("Export needs an active desk scope.");
      return;
    }
    setExportBusy(true);
    setExportStatus("Fetching full ledger…");
    try {
      const trades = await fetchFullDeskLedger(scope);
      const csv = tradesToCsv(trades);
      const stamp = new Date().toISOString().slice(0, 10);
      const name = `gekko-ledger-${scope.execution_env}${
        scope.lane ? `-${scope.lane}` : ""
      }-${stamp}.csv`;
      downloadTextFile(name, csv);
      setExportStatus(`Downloaded ${trades.length} trade${trades.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setExportStatus(
        err instanceof Error ? err.message : "Export failed"
      );
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <section
      className="rounded-lg border border-gekko-border overflow-hidden"
      data-testid="desk-trades"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gekko-border px-4 py-3">
        <div>
          <h2 className="text-lg font-bold">Recent Trades</h2>
          <p className="text-sm text-gekko-muted">
            Last {RECENT_TRADES_WINDOW} closed rows
            {simAnchor ? ` · sim day ${simAnchor}` : ""} (candle timestamps).
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-sm font-mono">
            <span className="text-gekko-muted">Total </span>
            <span id="tradesTotalValue" data-testid="trades-total-value">
              {totalLabel}
            </span>
          </p>
          {scope ? (
            <button
              type="button"
              className="rounded border border-gekko/50 bg-gekko/10 px-3 py-1.5 text-xs font-semibold text-gekko disabled:opacity-40"
              data-testid="export-full-ledger"
              disabled={exportBusy}
              onClick={() => void onExportCsv()}
            >
              {exportBusy ? "Exporting…" : "Export Full Ledger (CSV)"}
            </button>
          ) : null}
          {exportStatus ? (
            <p
              className="max-w-xs text-right text-xs text-gekko-muted"
              data-testid="export-ledger-status"
              role="status"
            >
              {exportStatus}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-3 border-b border-gekko-border px-4 py-2"
        aria-label="Recent trade filters"
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gekko-muted">
            <span>From</span>
            <input
              id="tradesFrom"
              data-testid="trades-from"
              type="date"
              value={fromValue}
              max={simAnchor || undefined}
              title="Filter by simulated trade date (candle time), not wall clock"
              onChange={(e) => setFromValue(e.target.value)}
              className="rounded border border-gekko-border bg-gekko-bg/60 px-2 py-1 text-sm text-white outline-none focus:border-gekko/50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gekko-muted">
            <span>To</span>
            <input
              id="tradesTo"
              data-testid="trades-to"
              type="date"
              value={toValue}
              max={simAnchor || undefined}
              title="Filter by simulated trade date (candle time), not wall clock"
              onChange={(e) => setToValue(e.target.value)}
              className="rounded border border-gekko-border bg-gekko-bg/60 px-2 py-1 text-sm text-white outline-none focus:border-gekko/50"
            />
          </label>
        </div>
        <label className="ml-auto min-w-[10rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search recent trades</span>
          <input
            id="tradesSearch"
            data-testid="trades-search"
            type="search"
            placeholder="Search trades"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-gekko-border bg-gekko-bg/60 px-3 py-1.5 text-sm outline-none focus:border-gekko/50"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="bg-gekko-surface/80 text-[0.65rem] uppercase tracking-wide text-gekko-muted">
            <tr>
              <th className="px-2 py-2 font-semibold">ID</th>
              <th className="px-2 py-2 font-semibold">Symbol</th>
              <th className="px-2 py-2 font-semibold">Side</th>
              <th className="px-2 py-2 font-semibold">Strategy</th>
              <th className="px-2 py-2 font-semibold">Cost</th>
              <th className="px-2 py-2 font-semibold">% Eq</th>
              <th className="px-2 py-2 font-semibold">Value</th>
              <th className="px-2 py-2 font-semibold">PnL</th>
              <th className="px-2 py-2 font-semibold">R</th>
              <th className="px-2 py-2 font-semibold">Exit</th>
              <th className="px-2 py-2 font-semibold">Opened</th>
              <th className="px-2 py-2 font-semibold">Closed</th>
              <th className="px-2 py-2 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody id="tradesBody" data-testid="trades-body">
            {!filtered.length ? (
              <tr>
                <td
                  colSpan={COLS}
                  className="px-3 py-6 text-center text-gekko-muted"
                  data-testid="trades-empty"
                >
                  No recent trades
                </td>
              </tr>
            ) : (
              filtered.map((t, idx) => {
                const pnl = firstValue(t.pnl, t.realized_pnl, t.total_pnl);
                const side = positionSide(t);
                return (
                  <tr
                    key={`${tradeId(t)}-${idx}`}
                    className="border-t border-gekko-border/70 hover:bg-gekko-surface/40"
                    data-testid="trade-row"
                  >
                    <td className="px-2 py-1.5 font-mono">{tradeId(t)}</td>
                    <td className="px-2 py-1.5">
                      {String(firstValue(t.symbol, t.asset, "—"))}
                    </td>
                    <td className={`px-2 py-1.5 font-semibold uppercase ${sideClass(side)}`}>
                      {side}
                    </td>
                    <td className="px-2 py-1.5">
                      {String(
                        firstValue(
                          t.strategy_name,
                          t.strategy,
                          t.playbook_key,
                          "—"
                        )
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatMoney(rowCost(t))}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{rowPctEq(t, equity)}</td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatMoney(rowValue(t))}
                    </td>
                    <td className={`px-2 py-1.5 font-mono ${pnlClass(pnl)}`}>
                      {formatPnl(pnl)}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatNumber(firstValue(t.rr, t.r, t.r_multiple), 2)}
                    </td>
                    <td className="px-2 py-1.5">
                      {String(
                        firstValue(t.exit_reason, t.exit, t.status, "closed")
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                      {formatInstant(
                        firstValue(t.opened_at, t.entry_time, t.created_at)
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                      {formatInstant(firstValue(t.closed_at, t.exit_time))}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{rowDuration(t)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
