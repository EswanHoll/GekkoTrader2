import { useMemo, useState, type ChangeEvent } from "react";
import {
  LOOKBACK_MONTH_OPTIONS,
  RESULT_SPECS,
  SETTING_SPECS,
  SUITE_OPTIONS,
  daysToMonths,
  ANALYZE_UPLOAD_FAILED_TITLE,
  displayBoardValue,
  effectValue,
  isAnalyzeUnavailable,
  lookbackMonthsFromSource,
  previousRuns,
  runLabel,
  settingValue,
  settingsBlobFromRun,
  type BoardRun,
} from "@/lib/runBoard";

export type DraftKnobs = Record<string, string>;

type Props = {
  runs: BoardRun[];
  total: number;
  hasMore: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  statusText?: string;
  editable?: boolean;
  draft: DraftKnobs;
  onDraftChange: (key: string, value: string) => void;
  onNext5: () => void;
  onFetchAll: () => void;
  onSaveCurrent: () => void;
  onRevertCurrent: () => void;
  onCopyAll: (run: BoardRun) => void;
  onCopyKey: (run: BoardRun, key: string) => void;
  onHide: (run: BoardRun) => void;
  onAnalyze: (run: BoardRun) => void;
  onDelete?: (run: BoardRun) => void;
  deleting?: boolean;
  product?: "v1" | "v2";
  hydrated?: boolean;
};

type Col =
  | {
      id: "current";
      kind: "current";
      label: string;
      sub: string;
      run: null;
      settings: Record<string, unknown>;
    }
  | {
      id: string;
      kind: "previous";
      label: string;
      sub: string;
      run: BoardRun;
      settings: Record<string, unknown>;
    };

function pnlClass(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "";
  return n > 0 ? "text-gekko" : "text-red-300";
}

/** Per-run action cluster — Analyze gated for upload_failed (GST-129/130). */
function RunColumnActions({
  run,
  editable,
  deleting,
  onCopyAll,
  onHide,
  onAnalyze,
  onDelete,
}: {
  run: BoardRun;
  editable: boolean;
  deleting: boolean;
  onCopyAll: (run: BoardRun) => void;
  onHide: (run: BoardRun) => void;
  onAnalyze: (run: BoardRun) => void;
  onDelete?: (run: BoardRun) => void;
}) {
  const analyzeBlocked = isAnalyzeUnavailable(run);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          data-testid="run-board-copy-all"
          className="rounded border border-gekko-border px-2 py-1 text-xs hover:border-gekko/40"
          onClick={() => onCopyAll(run)}
        >
          Copy All
        </button>
        <button
          type="button"
          data-testid="run-board-hide"
          className="rounded border border-gekko-border px-2 py-1 text-xs hover:border-gekko/40"
          title="Hide from Results only — stays in storage"
          onClick={() => onHide(run)}
        >
          Hide
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          data-testid="run-board-analyze"
          className="rounded border border-gekko-border px-2 py-1 text-xs hover:border-gekko/40 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={analyzeBlocked}
          title={
            analyzeBlocked
              ? ANALYZE_UPLOAD_FAILED_TITLE
              : "Open learning tips for this run"
          }
          aria-disabled={analyzeBlocked ? "true" : undefined}
          onClick={() => {
            if (analyzeBlocked) return;
            onAnalyze(run);
          }}
        >
          Analyze
        </button>
        {editable && onDelete ? (
          <button
            type="button"
            data-testid="run-board-delete"
            className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:border-red-400/60 disabled:opacity-40"
            title="Delete data + results from this Sim desk"
            disabled={deleting}
            onClick={() => onDelete(run)}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function RunBoard({
  runs,
  total,
  hasMore,
  loading,
  loadingMore,
  statusText,
  editable = true,
  draft,
  onDraftChange,
  onNext5,
  onFetchAll,
  onSaveCurrent,
  onRevertCurrent,
  onCopyAll,
  onCopyKey,
  onHide,
  onAnalyze,
  onDelete,
  deleting = false,
  product = "v1",
  hydrated,
}: Props) {
  const [resultsOpen, setResultsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);

  const prev = useMemo(() => previousRuns(runs), [runs]);
  const shown = prev.length;
  const countLabel = total
    ? `Showing ${shown} of ${total} run${total === 1 ? "" : "s"}.`
    : "";

  const currentSettings = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v === "") continue;
      out[k] = v;
    }
    return out;
  }, [draft]);

  const columns: Col[] = useMemo(() => {
    const cols: Col[] = [
      {
        id: "current",
        kind: "current",
        label: "Current",
        sub: editable ? "Next run · editable" : "Next run · not started",
        run: null,
        settings: currentSettings,
      },
    ];
    prev.forEach((run, idx) => {
      cols.push({
        id: String(run.run_id),
        kind: "previous",
        label: `Run${idx + 1}`,
        sub: runLabel(run),
        run,
        settings: settingsBlobFromRun(run),
      });
    });
    return cols;
  }, [prev, editable, currentSettings]);

  const preferredSuite = product === "v2" ? "playbook3" : "playbook1";
  const suiteOpts = [...SUITE_OPTIONS].sort((a, b) => {
    if (a.value === preferredSuite) return -1;
    if (b.value === preferredSuite) return 1;
    return 0;
  });

  function draftValue(key: string): string {
    if (draft[key] != null) return draft[key];
    return "";
  }

  function onInput(
    key: string,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    onDraftChange(key, e.target.value);
  }

  return (
    <section className="space-y-3" data-testid="run-board" data-part="board">
      <div
        className="results-board-part-heading flex flex-wrap items-end justify-between gap-3"
        data-testid="run-board-heading"
      >
        <div className="panel-heading-copy">
          <h2 className="text-xl font-extrabold tracking-tight">Run Board</h2>
          <p className="text-sm text-gekko-muted">
            Current workbench + historical runs
            {hydrated ? " · settings hydrated via compare" : " · list metrics"}
            .
          </p>
          <div
            id="resultsBoardPager"
            className="mt-2 flex flex-wrap items-center gap-2"
            data-testid="results-board-pager"
            aria-label="Run board paging"
          >
            {countLabel ? (
              <span
                className="text-xs text-gekko-muted"
                data-testid="results-board-pager-count"
              >
                {countLabel}
              </span>
            ) : null}
            {hasMore ? (
              <>
                <button
                  type="button"
                  id="btnResultsNext5"
                  data-testid="btn-results-next-5"
                  className="rounded border border-gekko-border px-3 py-1 text-sm hover:border-gekko/40"
                  disabled={loadingMore}
                  onClick={onNext5}
                >
                  Next 5
                </button>
                <button
                  type="button"
                  id="btnResultsFetchAll"
                  data-testid="btn-results-fetch-all"
                  className="rounded border border-gekko-border px-3 py-1 text-sm hover:border-gekko/40"
                  disabled={loadingMore}
                  onClick={onFetchAll}
                >
                  Fetch all
                </button>
              </>
            ) : null}
          </div>
        </div>
        <p
          id="resultsStatus"
          data-testid="results-status"
          className="text-sm text-gekko-muted"
        >
          {statusText ||
            (loading
              ? "Loading runs…"
              : shown
                ? `${shown} run${shown === 1 ? "" : "s"} on board · ${total} total`
                : "No runs yet — start one from Current")}
        </p>
      </div>

      <div
        id="resultsBoardRoot"
        data-testid="results-board-root"
        className="run-board-wrap overflow-x-auto rounded-lg border border-gekko-border"
      >
        <table
          className="run-board-table compare-table border-collapse text-left text-sm"
          data-testid="run-board-matrix"
        >
          <thead>
            <tr className="run-board-head-row bg-gekko-surface/90">
              <th
                scope="col"
                className="run-board-label-col sticky left-0 z-10 bg-gekko-surface px-3 py-2 font-semibold"
              >
                Backtest Runs
              </th>
              {columns.map((col) => {
                const pnl =
                  col.kind === "previous" && col.run.total_pnl != null
                    ? Number(col.run.total_pnl)
                    : null;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    data-col={col.id}
                    data-testid={
                      col.kind === "current"
                        ? "run-board-col-current"
                        : "run-board-col-run"
                    }
                    className={[
                      "run-board-run-col px-3 py-2 align-top",
                      col.kind === "current" ? "is-current bg-gekko/5" : "",
                    ].join(" ")}
                  >
                    <div className="run-board-col-head space-y-0.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-bold">{col.label}</span>
                        {pnl != null && Number.isFinite(pnl) ? (
                          <span
                            className={`font-mono text-xs ${pnlClass(pnl)}`}
                          >
                            {displayBoardValue(pnl, "money")}
                          </span>
                        ) : null}
                      </div>
                      <span className="block text-xs font-normal text-gekko-muted">
                        {col.sub}
                      </span>
                      {col.kind === "previous" ? (
                        <span
                          className="block text-[11px] text-gekko-muted"
                          title={
                            col.run.status_reason
                              ? String(col.run.status_reason)
                              : undefined
                          }
                        >
                          {String(col.run.status || "—")}
                        </span>
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
            <tr className="run-board-actions-row border-t border-gekko-border/60 bg-gekko-surface/60">
              <th
                scope="row"
                className="run-board-label-col sticky left-0 z-10 bg-gekko-surface/95 px-3 py-2 text-xs uppercase tracking-wide text-gekko-muted"
              >
                Actions
              </th>
              {columns.map((col) =>
                col.kind === "current" ? (
                  <td
                    key={col.id}
                    className="is-current px-3 py-2 align-top"
                    data-testid="run-board-actions-current"
                  >
                    {editable ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-gekko-muted">
                          Edit Below
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            data-testid="run-board-save-current"
                            className="rounded bg-gekko px-2.5 py-1 text-xs font-bold text-gekko-bg"
                            onClick={onSaveCurrent}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            data-testid="run-board-revert-current"
                            className="rounded border border-gekko-border px-2.5 py-1 text-xs"
                            onClick={onRevertCurrent}
                          >
                            Revert
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gekko-muted">—</span>
                    )}
                  </td>
                ) : (
                  <td
                    key={col.id}
                    className="px-3 py-2 align-top"
                    data-testid="run-board-actions-run"
                    data-run-id={col.id}
                  >
                    <RunColumnActions
                      run={col.run}
                      editable={editable}
                      deleting={deleting}
                      onCopyAll={onCopyAll}
                      onHide={onHide}
                      onAnalyze={onAnalyze}
                      onDelete={onDelete}
                    />
                  </td>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {!loading && !prev.length ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-6 text-center text-gekko-muted"
                  data-testid="run-board-empty"
                >
                  No runs on this board yet — edit Current and Start Run.
                </td>
              </tr>
            ) : null}

            <tr className="run-board-section bg-gekko-surface/40">
              <th
                scope="row"
                colSpan={1}
                className="run-board-label-col sticky left-0 z-10 bg-gekko-surface/95 px-3 py-2"
              >
                <button
                  type="button"
                  className="font-bold"
                  data-testid="run-board-section-results"
                  aria-expanded={resultsOpen}
                  onClick={() => setResultsOpen((v) => !v)}
                >
                  {resultsOpen ? "▾" : "▸"} Results
                </button>
              </th>
              {columns.map((col) => (
                <td key={col.id} className="run-board-section-cell px-3 py-2" />
              ))}
            </tr>
            {resultsOpen
              ? RESULT_SPECS.map((spec) => (
                  <tr
                    key={`r-${spec.key}`}
                    data-testid={`run-board-result-${spec.key}`}
                    className="border-t border-gekko-border/40"
                  >
                    <th
                      scope="row"
                      className="run-board-label-col sticky left-0 z-10 bg-gekko-bg/95 px-3 py-1.5 text-xs font-medium text-gekko-muted"
                    >
                      {spec.label}
                    </th>
                    {columns.map((col, colIdx) => {
                      let raw: unknown = null;
                      if (spec.derived === "lookback_months") {
                        raw =
                          col.kind === "current"
                            ? lookbackMonthsFromSource(col.settings)
                            : lookbackMonthsFromSource(
                                col.run as Record<string, unknown>
                              );
                      } else if (col.kind === "previous") {
                        const older = columns[colIdx + 1];
                        raw = effectValue(
                          col.run,
                          spec,
                          older?.kind === "previous" ? older.run : null
                        );
                      }
                      const n = Number(raw);
                      const cls =
                        (spec.key === "total_pnl" ||
                          spec.key === "pnl_delta") &&
                        Number.isFinite(n)
                          ? pnlClass(n)
                          : "";
                      return (
                        <td
                          key={col.id}
                          className={[
                            "px-3 py-1.5 font-mono text-xs",
                            col.kind === "current" ? "is-current bg-gekko/5" : "",
                            cls,
                          ].join(" ")}
                        >
                          {displayBoardValue(raw, spec.format)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              : null}

            <tr className="run-board-section bg-gekko-surface/40">
              <th
                scope="row"
                className="run-board-label-col sticky left-0 z-10 bg-gekko-surface/95 px-3 py-2"
              >
                <button
                  type="button"
                  className="font-bold"
                  data-testid="run-board-section-settings"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen((v) => !v)}
                >
                  {settingsOpen ? "▾" : "▸"} Settings
                </button>
              </th>
              {columns.map((col) => (
                <td key={col.id} className="run-board-section-cell px-3 py-2" />
              ))}
            </tr>
            {settingsOpen
              ? SETTING_SPECS.map((spec) => {
                  const values = columns.map((col) =>
                    settingValue(
                      col.kind === "current" ? col.settings : col.settings,
                      spec.key
                    )
                  );
                  const present = values.some((v) => v != null && v !== "");
                  if (
                    !present &&
                    !spec.editable &&
                    !spec.arms &&
                    !spec.concentrate
                  ) {
                    return null;
                  }
                  return (
                    <tr
                      key={`s-${spec.key}`}
                      data-setting-key={spec.key}
                      data-testid={`run-board-setting-${spec.key}`}
                      className="border-t border-gekko-border/40"
                    >
                      <th
                        scope="row"
                        className="run-board-label-col sticky left-0 z-10 bg-gekko-bg/95 px-3 py-1.5 text-xs font-medium text-gekko-muted"
                        title={spec.hint || undefined}
                      >
                        {spec.label}
                      </th>
                      {columns.map((col, idx) => {
                        const raw = values[idx];
                        if (col.kind === "current" && editable && spec.editable) {
                          if (spec.input === "select" && spec.options === "suite") {
                            return (
                              <td
                                key={col.id}
                                className="is-current bg-gekko/5 px-2 py-1"
                              >
                                <select
                                  className="run-board-input w-full rounded border border-gekko-border bg-gekko-surface px-1.5 py-1 font-mono text-xs"
                                  name={spec.key}
                                  data-testid={`knob-${spec.key}`}
                                  value={draftValue(spec.key) || preferredSuite}
                                  onChange={(e) => onInput(spec.key, e)}
                                >
                                  {suiteOpts.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          }
                          // Lookback Months — single <select> (SETTING_SPECS input=select).
                          // Draft stores months; save path converts to lookback_days (×30).
                          if (
                            spec.key === "lookback_days" ||
                            spec.options === "lookback_months"
                          ) {
                            const shown = draftValue(spec.key);
                            const known = (
                              LOOKBACK_MONTH_OPTIONS as readonly string[]
                            ).includes(shown);
                            const options = known
                              ? LOOKBACK_MONTH_OPTIONS
                              : shown
                                ? ([shown, ...LOOKBACK_MONTH_OPTIONS] as string[])
                                : [...LOOKBACK_MONTH_OPTIONS];
                            return (
                              <td
                                key={col.id}
                                className="is-current bg-gekko/5 px-2 py-1"
                                data-testid="lookback-months-control"
                              >
                                <select
                                  className="run-board-input w-full rounded border border-gekko-border bg-gekko-surface px-1.5 py-1 font-mono text-xs"
                                  name={spec.key}
                                  aria-label="Lookback Months"
                                  data-testid="knob-lookback_days"
                                  data-unit="months"
                                  value={shown || "3"}
                                  onChange={(e) => onInput(spec.key, e)}
                                  title={spec.hint}
                                >
                                  {options.map((m) => (
                                    <option key={m} value={m}>
                                      {m} month{m === "1" ? "" : "s"}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          }
                          const isText = spec.input === "text";
                          let shown = draftValue(spec.key);
                          if (
                            !shown &&
                            spec.unit === "months" &&
                            raw != null
                          ) {
                            const m = daysToMonths(raw);
                            shown = m != null ? String(m) : "";
                          } else if (!shown && raw != null && raw !== "") {
                            shown = String(raw);
                          }
                          return (
                            <td
                              key={col.id}
                              className="is-current bg-gekko/5 px-2 py-1"
                            >
                              <input
                                className="run-board-input w-full rounded border border-gekko-border bg-gekko-surface px-1.5 py-1 font-mono text-xs"
                                name={spec.key}
                                data-testid={`knob-${spec.key}`}
                                data-unit={spec.unit || ""}
                                data-bandit={spec.bandit ? "1" : undefined}
                                type={isText ? "text" : "number"}
                                step={spec.step || "any"}
                                min={spec.min}
                                max={spec.max}
                                placeholder={spec.placeholder || ""}
                                value={shown}
                                onChange={(e) => onInput(spec.key, e)}
                              />
                            </td>
                          );
                        }
                        let shown = raw;
                        if (spec.unit === "months") {
                          shown = daysToMonths(raw);
                        }
                        const canCopy =
                          col.kind === "previous" &&
                          raw != null &&
                          raw !== "" &&
                          String(raw) !== "—";
                        return (
                          <td
                            key={col.id}
                            className={[
                              "px-3 py-1.5 font-mono text-xs",
                              col.kind === "current"
                                ? "is-current bg-gekko/5"
                                : "",
                            ].join(" ")}
                          >
                            <span>
                              {displayBoardValue(
                                shown,
                                spec.unit === "months" ? "months" : null
                              )}
                            </span>
                            {canCopy ? (
                              <button
                                type="button"
                                data-testid="run-board-copy-to-current"
                                data-copy-key={spec.key}
                                className="ml-1 rounded border border-gekko-border px-1 py-0.5 text-[10px] text-gekko-muted hover:border-gekko/40 hover:text-gekko"
                                title={`Copy ${spec.label} to Current`}
                                onClick={() => onCopyKey(col.run, spec.key)}
                              >
                                Copy to Current
                              </button>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
