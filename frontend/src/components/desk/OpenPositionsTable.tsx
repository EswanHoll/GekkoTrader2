import { useMemo, useState } from "react";
import {
  filterPositions,
  formatInstant,
  formatPnl,
  formatPrice,
  pnlClass,
  positionId,
  positionSide,
  rowCost,
  rowDuration,
  rowPctEq,
  rowValue,
  sideClass,
  type DeskRow,
  type PositionSideFilter,
} from "@/lib/deskLedger";
import { firstValue, formatMoney } from "@/lib/format";

type Props = {
  rows: DeskRow[];
  equity?: unknown;
  maxOpen?: unknown;
};

const SIDES: { id: PositionSideFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "long", label: "Long" },
  { id: "short", label: "Short" },
];

const COLS = 12;

export function OpenPositionsTable({ rows, equity, maxOpen }: Props) {
  const [side, setSide] = useState<PositionSideFilter>("all");
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => filterPositions(rows, side, search),
    [rows, side, search]
  );

  return (
    <section
      className="rounded-lg border border-gekko-border overflow-hidden"
      data-testid="desk-positions"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gekko-border px-4 py-3">
        <div>
          <h2 className="text-lg font-bold">Open Positions</h2>
          <p className="text-sm text-gekko-muted">
            Current book with entry, cost, stops, and age.
          </p>
        </div>
        <div
          className="flex flex-wrap gap-3 text-sm font-mono"
          aria-label="Open position capacity"
        >
          <p>
            <span className="text-gekko-muted">Open </span>
            <span data-testid="positions-open-value">{rows.length}</span>
          </p>
          <p>
            <span className="text-gekko-muted">Max </span>
            <span data-testid="positions-max-open-value">
              {maxOpen == null || maxOpen === "" ? "—" : String(maxOpen)}
            </span>
          </p>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-3 border-b border-gekko-border px-4 py-2"
        aria-label="Open position filters"
      >
        <div
          className="inline-flex rounded border border-gekko-border"
          id="positionsSideFilter"
          role="group"
          aria-label="Position side"
          data-testid="positions-side-filter"
        >
          {SIDES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-position-side={opt.id}
              data-testid={`positions-side-${opt.id}`}
              className={
                side === opt.id
                  ? "bg-gekko/15 px-3 py-1.5 text-xs font-semibold text-gekko"
                  : "px-3 py-1.5 text-xs text-gekko-muted hover:text-white"
              }
              onClick={() => setSide(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="ml-auto min-w-[10rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search open positions</span>
          <input
            id="positionsSearch"
            data-testid="positions-search"
            type="search"
            placeholder="Search symbol"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-gekko-border bg-gekko-bg/60 px-3 py-1.5 text-sm outline-none focus:border-gekko/50"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-xs">
          <thead className="bg-gekko-surface/80 text-[0.65rem] uppercase tracking-wide text-gekko-muted">
            <tr>
              <th className="px-2 py-2 font-semibold">ID</th>
              <th className="px-2 py-2 font-semibold">Symbol</th>
              <th className="px-2 py-2 font-semibold">Side</th>
              <th className="px-2 py-2 font-semibold">Strategy</th>
              <th className="px-2 py-2 font-semibold">Entry</th>
              <th className="px-2 py-2 font-semibold">Cost</th>
              <th className="px-2 py-2 font-semibold">% Eq</th>
              <th className="px-2 py-2 font-semibold">Value</th>
              <th className="px-2 py-2 font-semibold">SL</th>
              <th className="px-2 py-2 font-semibold">TP</th>
              <th className="px-2 py-2 font-semibold">Opened</th>
              <th className="px-2 py-2 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody id="positionsBody" data-testid="positions-body">
            {!filtered.length ? (
              <tr>
                <td
                  colSpan={COLS}
                  className="px-3 py-6 text-center text-gekko-muted"
                  data-testid="positions-empty"
                >
                  No open positions
                </td>
              </tr>
            ) : (
              filtered.map((p, idx) => {
                const sideValue = positionSide(p);
                const pnl = firstValue(p.unrealized_pnl, p.pnl, p.realized_pnl);
                return (
                  <tr
                    key={`${positionId(p)}-${idx}`}
                    className="border-t border-gekko-border/70 hover:bg-gekko-surface/40"
                    data-testid="position-row"
                  >
                    <td className="px-2 py-1.5 font-mono">{positionId(p)}</td>
                    <td className="px-2 py-1.5">
                      {String(firstValue(p.symbol, p.asset, "—"))}
                    </td>
                    <td className={`px-2 py-1.5 font-semibold uppercase ${sideClass(sideValue)}`}>
                      {sideValue}
                    </td>
                    <td className="px-2 py-1.5">
                      {String(
                        firstValue(p.strategy_name, p.strategy, p.strategy_id, "—")
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatPrice(
                        firstValue(p.entry_price, p.entry, p.avg_entry_price)
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatMoney(rowCost(p))}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{rowPctEq(p, equity)}</td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatMoney(rowValue(p))}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatPrice(firstValue(p.stop_loss, p.stop, p.sl))}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatPrice(firstValue(p.take_profit, p.target, p.tp))}
                    </td>
                    <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                      {formatInstant(
                        firstValue(p.opened_at, p.entry_time, p.created_at)
                      )}
                    </td>
                    <td
                      className={`px-2 py-1.5 font-mono ${pnlClass(pnl)}`}
                      title={pnl != null ? `PnL ${formatPnl(pnl)}` : undefined}
                    >
                      {rowDuration(p, { open: true })}
                    </td>
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
