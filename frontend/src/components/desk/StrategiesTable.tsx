import {
  formatNumber,
  formatPnl,
  pnlClass,
  strategyId,
  strategyName,
  type DeskRow,
} from "@/lib/deskLedger";
import { firstValue } from "@/lib/format";

type Props = {
  rows: DeskRow[];
};

const COLS = 9;

export function StrategiesTable({ rows }: Props) {
  return (
    <section
      className="rounded-lg border border-gekko-border overflow-hidden"
      data-testid="desk-strategies"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gekko-border px-4 py-3">
        <div>
          <h2 className="text-lg font-bold">Strategies</h2>
          <p className="text-sm text-gekko-muted">
            Ranked playbook variants by current learning signal.
          </p>
        </div>
        <p className="text-sm font-mono" data-testid="strategies-total">
          <span className="text-gekko-muted">Total Strategies </span>
          <span id="strategiesTotalValue" data-testid="strategies-total-value">
            {rows.length}
          </span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-gekko-surface/80 text-[0.65rem] uppercase tracking-wide text-gekko-muted">
            <tr>
              <th className="px-2 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">ID</th>
              <th className="px-2 py-2 font-semibold">Strategy</th>
              <th className="px-2 py-2 font-semibold">Exp</th>
              <th className="px-2 py-2 font-semibold">Act</th>
              <th className="px-2 py-2 font-semibold">PnL</th>
              <th className="px-2 py-2 font-semibold">RR</th>
              <th className="px-2 py-2 font-semibold">ADX</th>
              <th className="px-2 py-2 font-semibold">Polls</th>
            </tr>
          </thead>
          <tbody id="strategyRank" data-testid="strategies-body">
            {!rows.length ? (
              <tr>
                <td
                  colSpan={COLS}
                  className="px-3 py-6 text-center text-gekko-muted"
                  data-testid="strategies-empty"
                >
                  No strategies ranked yet
                </td>
              </tr>
            ) : (
              rows.map((s, idx) => {
                const pnl = firstValue(s.pnl, s.realized_pnl, s.total_pnl);
                const rank = firstValue(s.rank, s.tier, idx + 1);
                return (
                  <tr
                    key={`${strategyId(s)}-${idx}`}
                    className="border-t border-gekko-border/70 hover:bg-gekko-surface/40"
                    data-testid="strategy-row"
                  >
                    <td className="px-2 py-1.5 font-mono">{String(rank)}</td>
                    <td className="px-2 py-1.5 font-mono">{strategyId(s)}</td>
                    <td className="px-2 py-1.5">{strategyName(s)}</td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatNumber(
                        firstValue(s.exp, s.expected_value, s.expectancy, s.exposure),
                        3
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {String(firstValue(s.act, s.action, s.status, s.activity, "—"))}
                    </td>
                    <td className={`px-2 py-1.5 font-mono ${pnlClass(pnl)}`}>
                      {formatPnl(pnl)}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatNumber(
                        firstValue(s.rr, s.r_multiple, s.reward_risk),
                        2
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {formatNumber(s.adx, 1)}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {String(
                        firstValue(s.polls, s.pulls, s.pull_count, s.trades, "—")
                      )}
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
