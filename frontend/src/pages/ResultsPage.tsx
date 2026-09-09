import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  bindSettingsVersion,
  copySettingsToDemo,
  fetchRunLearning,
  saveSettingsVersion,
} from "@/api/client";
import { RunBoard, type DraftKnobs } from "@/components/RunBoard";
import {
  demoScopeFor,
  simScopeFor,
  useDeskScope,
  type DeskRouteScope,
} from "@/hooks/useDeskScope";
import { useDemoHandoff } from "@/hooks/useDemoHandoff";
import { useDemoSettings } from "@/hooks/useDemoSettings";
import { deleteRunVars, useDeleteRuns } from "@/hooks/useDeleteRuns";
import { useRunsBoard } from "@/hooks/useRunsBoard";
import { useSettingsVersions } from "@/hooks/useSettingsVersions";
import { useStartRun } from "@/hooks/useStartRun";
import { getAuthToken } from "@/lib/auth";
import {
  loadHiddenRunIds,
  ANALYZE_UPLOAD_FAILED_TITLE,
  isAnalyzeUnavailable,
  monthsToDays,
  normalizeRiskCapPct,
  persistHiddenRunIds,
  previousRuns,
  runLabel,
  settingValue,
  settingsBlobFromRun,
  type BoardRun,
} from "@/lib/runBoard";
import { deskLabel, pathForScope, resolvePlaybookKey } from "@/lib/scope";

function payloadOf(
  versions: { settings_version_id?: string | number; payload?: Record<string, unknown> }[],
  activeId: string
): Record<string, unknown> {
  const bound =
    versions.find((v) => String(v.settings_version_id) === activeId) ||
    versions[0];
  return (bound?.payload as Record<string, unknown>) || bound || {};
}

function settingsToDraft(settings: Record<string, unknown>): DraftKnobs {
  const draft: DraftKnobs = {};
  const bandit =
    settings.bandit && typeof settings.bandit === "object"
      ? (settings.bandit as Record<string, unknown>)
      : {};
  const keys = [
    "lookback_days",
    "strategy_suite",
    "interval",
    "htf_interval",
    "lookback_bars",
    "opening_balance",
    "default_leverage",
    "min_leverage",
    "max_leverage",
    "max_drawdown_pct",
    "min_stop_distance_pct",
    "max_portfolio_heat_pct",
    "risk_per_trade_pct",
    "max_trades_per_day",
    "min_trades_per_day",
    "max_open_positions",
    "max_hold_minutes",
    "seed",
    "symbol_count",
    "paper_confidence_threshold",
    "max_daily_loss_pct",
    "max_weekly_loss_pct",
  ];
  for (const key of keys) {
    let v = settings[key];
    if (key === "default_leverage" && (v == null || v === "")) {
      v = settings.leverage;
    }
    if (key === "lookback_days" && v != null) {
      const months = Number(v) / 30;
      draft[key] = Number.isFinite(months)
        ? String(Math.round(months * 10) / 10)
        : "";
      continue;
    }
    if (key === "symbol_count" && (v == null || v === "") && Array.isArray(settings.symbols)) {
      draft[key] = String(settings.symbols.length);
      continue;
    }
    draft[key] = v != null && v !== "" ? String(v) : "";
  }
  const explor =
    settings.bandit_exploration_rate ?? bandit.exploration_rate;
  draft.bandit_exploration_rate =
    explor != null && explor !== "" ? String(explor) : "";
  // GST-148 — Bandit Concentrate (arm key) editable on Current.
  const concentrateRaw =
    settings.bandit_concentrate ??
    bandit.concentrate ??
    (Array.isArray(bandit.concentrate_order) && bandit.concentrate_order.length
      ? bandit.concentrate_order[0]
      : "");
  draft.bandit_concentrate =
    concentrateRaw != null && concentrateRaw !== ""
      ? String(concentrateRaw)
      : "";
  return draft;
}

function draftToPatch(
  draft: DraftKnobs,
  baseline: Record<string, unknown>
): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...baseline };
  for (const [key, raw] of Object.entries(draft)) {
    if (raw === "") continue;
    if (
      key === "strategy_suite" ||
      key === "interval" ||
      key === "htf_interval" ||
      key === "bandit_concentrate"
    ) {
      const text = String(raw).trim();
      if (key === "bandit_concentrate") {
        patch.bandit = {
          ...((patch.bandit as Record<string, unknown>) || {}),
          concentrate: text || null,
        };
        patch.bandit_concentrate = text || null;
        continue;
      }
      patch[key] = text;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (key === "bandit_exploration_rate") {
      patch.bandit = {
        ...((patch.bandit as Record<string, unknown>) || {}),
        exploration_rate: n,
      };
      patch.bandit_exploration_rate = n;
    } else if (key === "max_drawdown_pct") {
      const cap = normalizeRiskCapPct(n);
      if (cap != null) patch.max_drawdown_pct = cap;
    } else if (key === "lookback_days") {
      const days = monthsToDays(n);
      if (days != null) patch.lookback_days = days;
    } else if (key === "symbol_count") {
      patch.symbol_count = Math.max(1, Math.min(100, Math.round(n)));
    } else {
      patch[key] = n;
    }
  }
  if (patch.default_leverage != null) patch.leverage = patch.default_leverage;
  return patch;
}

type Tip = { id: string; title: string; detail: string };

/** GST-127 — true only when Demo actually has a bound settings payload. */
function hasBoundDemoSettings(data: {
  settings?: Record<string, unknown> | null;
  settings_version_id?: string | number | null;
} | null | undefined): boolean {
  if (data == null) return false;
  if (
    data.settings_version_id != null &&
    String(data.settings_version_id).trim() !== ""
  ) {
    return true;
  }
  const settings = data.settings;
  if (settings == null || typeof settings !== "object") return false;
  return Object.keys(settings).length > 0;
}

function DemoResultsLanding({
  scope,
}: {
  scope: Extract<DeskRouteScope, { execution_env: "demo" }>;
}) {
  const [params] = useSearchParams();
  const hydrated = params.get("hydrated") === "1";
  const from = params.get("from") || "";
  const demoSettings = useDemoSettings(scope);
  const rawSettings = demoSettings.data?.settings;
  const knobs =
    rawSettings != null && typeof rawSettings === "object"
      ? (rawSettings as Record<string, unknown>)
      : {};
  // Bound only when Control returned a real settings object / version — not on
  // error/empty. Do not invent playbook from lane defaults while unbound
  // (that looked like "Playbook playbook1.1" next to the yellow warning).
  const bound =
    !demoSettings.isError && hasBoundDemoSettings(demoSettings.data);
  const playbook = bound
    ? resolvePlaybookKey(
        knobs.playbook_key as string | undefined,
        knobs.strategy_suite as string | undefined,
        scope
      )
    : "";
  const simHref = pathForScope(simScopeFor(scope), "results");
  const signedIn = !!getAuthToken();
  const handoff = useDemoHandoff(scope);
  const board = useRunsBoard(scope);
  const [opsStatus, setOpsStatus] = useState("");
  const [opsOk, setOpsOk] = useState(true);
  const [draft] = useState<DraftKnobs>({});

  function onClearWindow() {
    setOpsStatus("Clearing Demo window…");
    handoff.clearWindow.mutate(undefined, {
      onSuccess: (body) => {
        setOpsOk(true);
        setOpsStatus(
          body.note ||
            `Cleared Demo window (no publish)${
              body.trades_deleted != null
                ? ` · trades_deleted=${body.trades_deleted}`
                : ""
            }.`
        );
      },
      onError: (err) => {
        setOpsOk(false);
        setOpsStatus(err instanceof Error ? err.message : "Clear window failed");
      },
    });
  }

  function onEndPublish() {
    setOpsStatus("Ending Demo window & publishing…");
    handoff.endPublish.mutate(undefined, {
      onSuccess: (body) => {
        setOpsOk(true);
        setOpsStatus(
          body.note ||
            `End & publish ok${
              body.run_id ? ` · run=${String(body.run_id)}` : ""
            }.`
        );
      },
      onError: (err) => {
        setOpsOk(false);
        setOpsStatus(
          err instanceof Error ? err.message : "End & publish failed"
        );
      },
    });
  }

  function onPromoteLive() {
    setOpsStatus("Promoting Demo settings to Live…");
    handoff.promoteLive.mutate(bound ? knobs : null, {
      onSuccess: (body) => {
        setOpsOk(true);
        const ver =
          body.settings_version_id ??
          (body.version &&
          typeof body.version === "object" &&
          body.version !== null &&
          "version_id" in body.version
            ? (body.version as { version_id?: string }).version_id
            : null);
        setOpsStatus(
          `Promoted to Live · active_product=${
            body.active_product || handoff.product
          }${ver != null ? ` · version=${String(ver)}` : ""}. Live capital stays off until you activate it.`
        );
      },
      onError: (err) => {
        setOpsOk(false);
        setOpsStatus(
          err instanceof Error ? err.message : "Promote To Live failed"
        );
      },
    });
  }

  return (
    <section className="space-y-6" data-testid="results-page" data-desk-env="demo">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
          {deskLabel(scope)}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Results</h1>
        <p className="mt-2 max-w-2xl text-gekko-muted">
          Demo window history and bound knobs after Copy / Go To Demo. Use End
          &amp; publish to archive a window onto this board.
        </p>
      </div>

      {/*
        The banner used to render from the `hydrated=1` query param alone, so it
        claimed success even when Control had no readable binding for this desk —
        the page contradicted itself ("Hydrated from Sim" above "No Demo settings
        bound yet"). A success message that cannot fail hides the very failure it
        should surface. It now reconciles against what Control actually returns.
      */}
      {hydrated && !demoSettings.isLoading ? (
        bound ? (
          <p
            className="rounded border border-gekko/30 bg-gekko/10 px-3 py-2 text-sm"
            data-testid="demo-hydrated-banner"
            role="status"
          >
            Hydrated from Sim
            {from ? ` · source=${from}` : ""}. Restart the Demo worker if knobs
            do not appear on the desk yet.
          </p>
        ) : (
          <p
            className="rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
            data-testid="demo-hydrate-mismatch"
            role="alert"
          >
            Copy reported success{from ? ` · source=${from}` : ""}, but this desk
            has no readable bound settings. The promote did not land — do not
            treat this desk as configured. Check the Demo settings binding before
            starting a run.
          </p>
        )
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          className="rounded border border-gekko-border px-3 py-1.5 text-sm"
          to={pathForScope(scope, "")}
          data-testid="demo-results-desk-link"
        >
          Desk
        </Link>
        <Link
          className="rounded border border-gekko-border px-3 py-1.5 text-sm"
          to={pathForScope(scope, "setup")}
        >
          Strategy
        </Link>
        <Link
          className="rounded border border-gekko/50 bg-gekko/10 px-3 py-1.5 text-sm text-gekko"
          to={simHref}
          data-testid="demo-results-sim-link"
        >
          Sim Results
        </Link>
      </div>

      <div
        id="resultsRunControl"
        className="rounded-lg border border-gekko-border bg-gekko-surface/40 px-4 py-3"
        data-testid="demo-results-run-control"
        data-run-control="demo"
      >
        <div className="flex flex-wrap gap-6">
          <div className="space-y-2" role="group" aria-label="Desk Book">
            <p className="text-xs font-semibold uppercase tracking-wide text-gekko-muted">
              Desk Book
            </p>
            {signedIn ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-action="clear-journal"
                  data-testid="demo-clear-window"
                  className="rounded border border-gekko-border px-3 py-1.5 text-sm disabled:opacity-40"
                  disabled={handoff.busy}
                  onClick={onClearWindow}
                >
                  {handoff.clearWindow.isPending
                    ? "Clearing…"
                    : "Clear window (no publish)"}
                </button>
                <button
                  type="button"
                  data-action="end-demo"
                  data-testid="demo-end-publish"
                  className="rounded border border-gekko-border px-3 py-1.5 text-sm disabled:opacity-40"
                  disabled={handoff.busy}
                  onClick={onEndPublish}
                >
                  {handoff.endPublish.isPending
                    ? "Publishing…"
                    : "End & publish"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gekko-muted">
                Sign in required for Desk Book actions.
              </p>
            )}
          </div>

          <div className="space-y-2" role="group" aria-label="Handoff">
            <p className="text-xs font-semibold uppercase tracking-wide text-gekko-muted">
              Handoff
            </p>
            {signedIn ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-action="promote-live"
                  data-testid="demo-promote-live"
                  className="rounded border border-gekko/50 bg-gekko/10 px-3 py-1.5 text-sm font-semibold text-gekko disabled:opacity-40"
                  disabled={handoff.busy || !bound}
                  title={
                    bound
                      ? "Bind current Demo settings onto Live (does not activate capital)"
                      : "Bind Demo settings first (Copy to Demo from Sim Results)"
                  }
                  onClick={onPromoteLive}
                >
                  {handoff.promoteLive.isPending
                    ? "Promoting…"
                    : "Promote To Live"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gekko-muted">
                Sign in required to promote Demo settings to Live.
              </p>
            )}
          </div>
        </div>
        {opsStatus ? (
          <p
            className={`mt-3 text-sm ${opsOk ? "text-gekko-muted" : "text-red-300"}`}
            data-testid="demo-handoff-status"
            role="status"
          >
            {opsStatus}
          </p>
        ) : null}
      </div>

      <section
        className="rounded-lg border border-gekko-border bg-gekko-surface/40 px-4 py-4"
        data-testid="demo-results-settings"
      >
        <h2 className="text-lg font-bold">Demo bound settings</h2>
        <p
          className="mt-1 text-sm text-gekko-muted"
          data-testid="demo-results-playbook"
        >
          Playbook {bound ? playbook || "—" : "—"}
          {bound && demoSettings.data?.settings_version_id != null
            ? ` · version=${String(demoSettings.data.settings_version_id)}`
            : ""}
        </p>
        {demoSettings.isLoading ? (
          <p className="mt-3 text-sm text-gekko-muted">Loading…</p>
        ) : !bound ? (
          <p
            className="mt-3 text-sm text-amber-300"
            role="status"
            data-testid="demo-results-unbound"
          >
            No Demo settings bound yet — use Copy to Demo on{" "}
            <Link className="underline text-gekko" to={simHref}>
              Sim Results
            </Link>
            .
          </p>
        ) : (
          <dl
            className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm"
            data-testid="demo-results-knobs"
          >
            {(
              [
                ["Risk %", knobs.risk_per_trade_pct],
                ["Max open", knobs.max_open_positions],
                ["Opening", knobs.opening_balance],
                ["Signal", knobs.signal_interval || knobs.interval],
                ["HTF", knobs.htf_interval],
                ["Seed", knobs.seed ?? knobs.learning_seed],
              ] as Array<[string, unknown]>
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-gekko-muted">{label}</dt>
                <dd className="font-mono">
                  {value == null || value === "" ? "—" : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <RunBoard
        runs={board.runs}
        total={board.total}
        hasMore={board.hasMore}
        loading={board.isLoading}
        loadingMore={board.loadingMore}
        statusText={
          board.isError
            ? board.error instanceof Error
              ? board.error.message
              : "Demo runs unavailable"
            : `${board.runs.length} demo window${
                board.runs.length === 1 ? "" : "s"
              } on board`
        }
        editable={false}
        draft={draft}
        onDraftChange={() => undefined}
        onNext5={() => void board.loadNext5()}
        onFetchAll={() => void board.loadAll()}
        onSaveCurrent={() => undefined}
        onRevertCurrent={() => undefined}
        onCopyAll={() => undefined}
        onCopyKey={() => undefined}
        onHide={() => undefined}
        onAnalyze={() => undefined}
        product={scope.lane === "b" ? "v2" : "v1"}
        hydrated={board.hydrated}
      />

      {!signedIn ? (
        <p className="text-sm text-gekko-muted" data-testid="demo-board-sign-in">
          Sign in to refresh Demo window history.
        </p>
      ) : null}
    </section>
  );
}

export function ResultsPage() {
  const navigate = useNavigate();
  const scope = useDeskScope();
  const board = useRunsBoard(scope?.execution_env === "sim" ? scope : null);
  const settingsQ = useSettingsVersions(
    scope?.execution_env === "sim" ? scope : null
  );
  const start = useStartRun(scope?.execution_env === "sim" ? scope : null);
  const deleteRuns = useDeleteRuns(
    scope?.execution_env === "sim" ? scope : null
  );
  const signedIn = !!getAuthToken();
  const editable = signedIn && scope?.execution_env === "sim";

  const [hiddenTick, setHiddenTick] = useState(0);
  const [draft, setDraft] = useState<DraftKnobs>({});
  const [baseline, setBaseline] = useState<Record<string, unknown>>({});
  const [opsStatus, setOpsStatus] = useState("");
  const [opsOk, setOpsOk] = useState(true);
  const [promoteSource, setPromoteSource] = useState("current");
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [tipsRun, setTipsRun] = useState<BoardRun | null>(null);
  const [busy, setBusy] = useState(false);

  const activeId =
    settingsQ.data?.active_binding?.settings_version_id != null
      ? String(settingsQ.data.active_binding.settings_version_id)
      : "";

  useEffect(() => {
    if (!settingsQ.data) return;
    const payload = payloadOf(settingsQ.data.versions || [], activeId);
    setBaseline(payload);
    setDraft(settingsToDraft(payload));
  }, [settingsQ.data, activeId]);

  const hidden = useMemo(() => {
    if (!scope) return new Set<string>();
    void hiddenTick;
    return loadHiddenRunIds(scope.scope_key);
  }, [scope, hiddenTick]);

  const visibleRuns = useMemo(
    () => board.runs.filter((r) => !hidden.has(String(r.run_id))),
    [board.runs, hidden]
  );
  const boardPrev = previousRuns(visibleRuns);

  const onDraftChange = useCallback((key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  async function saveCurrent() {
    if (!scope || !editable) return;
    setBusy(true);
    setOpsStatus("Saving Current knobs…");
    try {
      const patch = draftToPatch(draft, baseline);
      const saved = await saveSettingsVersion(scope, patch);
      const vid = saved.settings_version_id;
      if (vid) {
        await bindSettingsVersion(scope, {
          settings_version_id: String(vid),
        });
      }
      setBaseline(patch);
      setDraft(settingsToDraft(patch));
      setOpsOk(true);
      setOpsStatus(`Saved and bound ${vid || "version"}.`);
      void settingsQ.refetch();
    } catch (err) {
      setOpsOk(false);
      setOpsStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function revertCurrent() {
    setDraft(settingsToDraft(baseline));
    setOpsOk(true);
    setOpsStatus("Reverted Current edits.");
  }

  function copyAll(run: BoardRun) {
    const blob = settingsBlobFromRun(run);
    const merged = { ...baseline, ...blob };
    setDraft(settingsToDraft(merged));
    setOpsOk(true);
    setOpsStatus(
      `Copied all settings from ${runLabel(run)} into Current. Review and Save.`
    );
  }

  function copyKey(run: BoardRun, key: string) {
    const blob = settingsBlobFromRun(run);
    const value = blob[key] ?? settingValue(blob, key);
    if (value == null || value === "") {
      setOpsOk(false);
      setOpsStatus(`No value for ${key} on that run.`);
      return;
    }
    if (key === "lookback_days") {
      const months = Number(value) / 30;
      setDraft((d) => ({
        ...d,
        [key]: Number.isFinite(months)
          ? String(Math.round(months * 10) / 10)
          : String(value),
      }));
    } else {
      setDraft((d) => ({ ...d, [key]: String(value) }));
    }
    setOpsOk(true);
    setOpsStatus(`Copied ${key} into Current. Review and Save.`);
  }

  function hideRun(run: BoardRun) {
    if (!scope) return;
    const label = runLabel(run);
    if (
      !window.confirm(
        `Hide ${label} from Results?\n\nSoft-hide only on this browser — artefacts stay in storage.`
      )
    ) {
      return;
    }
    const set = loadHiddenRunIds(scope.scope_key);
    set.add(String(run.run_id));
    persistHiddenRunIds(scope.scope_key, set);
    setHiddenTick((n) => n + 1);
    setOpsOk(true);
    setOpsStatus(`Hidden ${label} from the Results board.`);
  }

  function deleteRun(run: BoardRun) {
    if (!scope || !editable) return;
    const label = runLabel(run);
    setBusy(true);
    setOpsStatus(`Deleting ${label}…`);
    deleteRuns.mutate(deleteRunVars(run), {
      onSuccess: () => {
        setOpsOk(true);
        setOpsStatus(`Deleted ${label}.`);
        setBusy(false);
      },
      onError: (err) => {
        const cancelled =
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code?: string }).code === "cancelled";
        setOpsOk(cancelled);
        setOpsStatus(
          cancelled
            ? "Cancelled."
            : err instanceof Error
              ? err.message
              : "Delete failed"
        );
        setBusy(false);
      },
    });
  }

  async function analyze(run: BoardRun) {
    if (!scope) return;
    // Defense in depth — Run Board also disables Analyze for upload_failed.
    if (isAnalyzeUnavailable(run)) {
      setOpsOk(false);
      setOpsStatus(ANALYZE_UPLOAD_FAILED_TITLE);
      return;
    }
    setOpsStatus("Loading tips…");
    try {
      const lr = await fetchRunLearning(scope, String(run.run_id));
      const learning = lr.items || lr.learning || [];
      const mapped: Tip[] = (Array.isArray(learning) ? learning : [])
        .slice(0, 12)
        .map((row, i) => ({
          id: String(row.id || `learn-${i}`),
          title: String(row.event_type || row.kind || row.arm || "Learning"),
          detail: String(
            row.summary ||
              row.message ||
              row.note ||
              (row.payload ? JSON.stringify(row.payload) : "—")
          ),
        }));
      setTips(mapped);
      setTipsRun(run);
      setOpsOk(true);
      setOpsStatus(
        `Analyzed ${runLabel(run)} — ${mapped.length} tip(s).`
      );
    } catch (err) {
      setTips([]);
      setTipsRun(run);
      setOpsOk(false);
      setOpsStatus(err instanceof Error ? err.message : "Analyze failed");
    }
  }

  async function copyToDemo(navigateAway: boolean) {
    if (!scope || !editable) return;
    const source = promoteSource || "current";
    let patch: Record<string, unknown>;
    if (source === "current") {
      patch = draftToPatch(draft, baseline);
    } else {
      const run = boardPrev.find((r) => String(r.run_id) === source);
      if (!run) {
        setOpsOk(false);
        setOpsStatus("Pick a finished run first.");
        return;
      }
      patch = settingsBlobFromRun(run);
      if (!patch.dataset_id && baseline.dataset_id) {
        patch.dataset_id = baseline.dataset_id;
      }
      if (!patch.manifest_sha256 && baseline.manifest_sha256) {
        patch.manifest_sha256 = baseline.manifest_sha256;
      }
    }
    // GST-127 — no confirm dialog; promote + navigate immediately.
    setBusy(true);
    setOpsStatus(
      `${navigateAway ? "Hydrating Demo from" : "Copying"} ${source} → Demo…`
    );
    try {
      const demo = demoScopeFor(scope);
      // GST-113/124 — greenfield Control has no /api/v*/demo/settings/save.
      // Promote via Sim-scoped DEFINER path; response echoes Sim + target_*.
      const saved = await copySettingsToDemo(scope, patch, {
        source_run_id: source === "current" ? null : source,
      });
      const version_id = saved.settings_version_id ?? saved.version_id;
      const demoKey =
        saved.target_scope_key ||
        saved.desk_id ||
        `demo|${scope.lane || "a"}`;
      const note = `Demo bound · ${demoKey} · version=${version_id != null ? String(version_id) : "ok"}. Restart Demo worker if knobs do not hydrate.`;
      setOpsOk(true);
      if (navigateAway) {
        setOpsStatus(`${note} Opening Demo Results…`);
        navigate(
          `${pathForScope(demo, "results")}?hydrated=1&from=${encodeURIComponent(source)}`
        );
        return;
      }
      setOpsStatus(note);
    } catch (err) {
      setOpsOk(false);
      setOpsStatus(err instanceof Error ? err.message : "Copy to Demo failed");
    } finally {
      setBusy(false);
    }
  }

  if (!scope) {
    return <p className="text-gekko-muted">Unknown desk.</p>;
  }

  if (scope.execution_env === "demo") {
    return <DemoResultsLanding scope={scope} />;
  }

  if (scope.execution_env !== "sim") {
    return (
      <section className="space-y-4" data-testid="results-unavailable">
        <h1 className="text-3xl font-extrabold">{deskLabel(scope)} Results</h1>
        <p className="text-gekko-muted" id="simLedgerUnavailable" role="status">
          <strong>Results not on this desk yet</strong> — Live does not use the
          Sim Batch run ledger. Use Sim A / B for retained Batch runs.
        </p>
      </section>
    );
  }

  const product = scope.lane === "b" ? "v2" : "v1";
  const demoHref = pathForScope(demoScopeFor(scope), "results");

  return (
    <section className="space-y-6" data-testid="results-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
            {deskLabel(scope)}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            Results
          </h1>
          <p className="mt-2 max-w-2xl text-gekko-muted">
            Comparison matrix — Current workbench vs historical Sim runs.
          </p>
        </div>
      </div>

      <div
        id="resultsRunControl"
        className="rounded-lg border border-gekko-border bg-gekko-surface/40 px-4 py-3"
        data-testid="results-run-control"
      >
        <div className="flex flex-wrap gap-6">
          <div className="space-y-2" aria-label="Desk book">
            <p className="text-xs font-semibold uppercase tracking-wide text-gekko-muted">
              Desk book
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                id="btnResultsResetDesk"
                data-testid="results-reset-desk"
                className="rounded border border-gekko-border px-3 py-1.5 text-sm opacity-50"
                disabled
                title="Reset Desk is not available from this view yet"
              >
                Reset Desk
              </button>
              <button
                type="button"
                id="btnResultsStartRun"
                data-testid="results-start-run"
                className="rounded bg-gekko px-3 py-1.5 text-sm font-bold text-gekko-bg disabled:opacity-40"
                disabled={start.isPending || busy}
                onClick={() => start.mutate({})}
              >
                {start.isPending ? "Starting…" : "Start Run"}
              </button>
              <Link
                className="rounded border border-gekko-border px-3 py-1.5 text-sm"
                to={pathForScope(scope, "")}
              >
                Desk
              </Link>
              <Link
                className="rounded border border-gekko-border px-3 py-1.5 text-sm"
                to={pathForScope(scope, "setup")}
              >
                Strategy
              </Link>
              <Link
                className="rounded border border-gekko-border px-3 py-1.5 text-sm"
                to={pathForScope(scope, "runs")}
              >
                Reports
              </Link>
              <Link
                className="rounded border border-gekko-border px-3 py-1.5 text-sm"
                to={demoHref}
              >
                Demo Results
              </Link>
            </div>
          </div>

          <div className="space-y-2" aria-label="Promote to Demo">
            <p className="text-xs font-semibold uppercase tracking-wide text-gekko-muted">
              Promote to Demo
            </p>
            {editable ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="promoteSource"
                  data-testid="promote-source"
                  className="rounded border border-gekko-border bg-gekko-surface px-2 py-1.5 font-mono text-sm"
                  value={promoteSource}
                  onChange={(e) => setPromoteSource(e.target.value)}
                >
                  <option value="current">Current</option>
                  {boardPrev.map((run, idx) => (
                    <option key={String(run.run_id)} value={String(run.run_id)}>
                      Run{idx + 1} · {runLabel(run)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  id="btnCopyToDemo"
                  data-testid="results-copy-to-demo"
                  className="rounded border border-gekko-border px-3 py-1.5 text-sm"
                  disabled={busy}
                  onClick={() => void copyToDemo(false)}
                >
                  Copy to Demo
                </button>
                <button
                  type="button"
                  id="btnGoToDemo"
                  data-testid="results-go-to-demo"
                  className="rounded border border-gekko/50 bg-gekko/10 px-3 py-1.5 text-sm font-semibold text-gekko"
                  disabled={busy}
                  onClick={() => void copyToDemo(true)}
                >
                  Go To Demo
                </button>
              </div>
            ) : (
              <p className="text-sm text-gekko-muted">
                Sign in required to copy Sim settings onto Demo.
              </p>
            )}
          </div>
        </div>
        {opsStatus ? (
          <p
            className={`mt-3 text-sm ${opsOk ? "text-gekko-muted" : "text-red-300"}`}
            data-testid="results-ops-status"
            role="status"
          >
            {opsStatus}
          </p>
        ) : null}
      </div>

      <div className="results-board-part" data-part="board">
        <RunBoard
          runs={visibleRuns}
          total={board.total}
          hasMore={board.hasMore}
          loading={board.isLoading}
          loadingMore={board.loadingMore}
          editable={editable}
          draft={draft}
          onDraftChange={onDraftChange}
          onNext5={() => void board.loadNext5()}
          onFetchAll={() => void board.loadAll()}
          onSaveCurrent={() => void saveCurrent()}
          onRevertCurrent={revertCurrent}
          onCopyAll={copyAll}
          onCopyKey={copyKey}
          onHide={hideRun}
          onAnalyze={(run) => void analyze(run)}
          onDelete={editable ? deleteRun : undefined}
          deleting={deleteRuns.isPending}
          product={product}
          hydrated={board.hydrated}
          statusText={
            board.isLoading
              ? "Loading…"
              : boardPrev.length
                ? `${boardPrev.length} run${boardPrev.length === 1 ? "" : "s"} on board · ${board.total} total · Current = next${
                    editable ? " · Save / Copy / Hide / Analyze / Delete wired" : ""
                  }`
                : "No finished runs yet — start one from Current"
          }
        />
      </div>

      {tips && tipsRun ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          data-testid="analyze-tips-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="analyzeTipsModalTitle"
          onClick={() => {
            setTips(null);
            setTipsRun(null);
          }}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gekko-border bg-gekko-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-wide text-gekko-muted">
              Analyze · optional
            </p>
            <h2
              id="analyzeTipsModalTitle"
              className="mt-1 text-xl font-extrabold"
            >
              Tips — {runLabel(tipsRun)}
            </h2>
            <p className="mt-2 text-sm text-gekko-muted">
              Read-only on greenfield — use Copy All into Current, then Save.
            </p>
            <ul className="mt-4 space-y-3">
              {!tips.length ? (
                <li className="text-sm text-gekko-muted">No tips for this run.</li>
              ) : (
                tips.map((t) => (
                  <li
                    key={t.id}
                    className="rounded border border-gekko-border px-3 py-2 text-sm"
                  >
                    <div className="font-semibold">{t.title}</div>
                    <div className="mt-1 text-gekko-muted">{t.detail}</div>
                  </li>
                ))
              )}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-gekko px-3 py-1.5 text-sm font-bold text-gekko-bg"
                data-testid="analyze-copy-to-current"
                onClick={() => {
                  copyAll(tipsRun);
                  setTips(null);
                  setTipsRun(null);
                }}
              >
                Copy to Current
              </button>
              <button
                type="button"
                className="rounded border border-gekko-border px-3 py-1.5 text-sm"
                onClick={() => {
                  setTips(null);
                  setTipsRun(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
