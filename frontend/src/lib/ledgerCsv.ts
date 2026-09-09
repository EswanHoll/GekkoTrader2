/** CSV helpers for full desk journal export (GST-148). */

export type LedgerCsvRow = Record<string, unknown>;

const CSV_COLS = [
  "id",
  "symbol",
  "side",
  "strategy_name",
  "strategy_id",
  "pnl",
  "opened_at",
  "closed_at",
  "exit_reason",
  "status",
] as const;

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function tradesToCsv(rows: LedgerCsvRow[]): string {
  const header = CSV_COLS.join(",");
  const lines = rows.map((row) =>
    CSV_COLS.map((key) => {
      if (key === "id") {
        return csvEscape(row.id ?? row.book_trade_no ?? row.trade_id);
      }
      if (key === "strategy_name") {
        return csvEscape(
          row.strategy_name ?? row.strategy ?? row.playbook_key ?? ""
        );
      }
      if (key === "pnl") {
        return csvEscape(row.pnl ?? row.realized_pnl ?? row.total_pnl ?? "");
      }
      if (key === "exit_reason") {
        return csvEscape(row.exit_reason ?? row.exit ?? "");
      }
      return csvEscape(row[key]);
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

export function downloadTextFile(
  filename: string,
  contents: string,
  mime = "text/csv;charset=utf-8"
): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.dataset.testid = "ledger-csv-download-link";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
