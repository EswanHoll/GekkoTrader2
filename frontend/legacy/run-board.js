/*! Shared Current + previous-run board — cause (settings) vs effect (results). */
(function () {
  "use strict";

  const MAX_PREVIOUS = 5;

  /**
   * Effect rows — outcomes of a finished run.
   * Keep these out of the settings board.
   */
  const RESULT_SPECS = [
    // Lookback context (view-only) sits above Start Time by request.
    { key: "lookback_months", label: "Lookback Months", format: "months", derived: "lookback_months" },
    { key: "period_start", label: "Start Time", format: "when" },
    { key: "period_end", label: "End Time", format: "when" },
    { key: "duration", label: "Duration", format: "duration_text" },
    { key: "total_pnl", label: "$ PnL", format: "money" },
    { key: "total_pnl_pct", label: "PnL %", format: "pct" },
    { key: "pnl_delta", label: "$ PnL Δ", format: "money", derived: "pnl_delta" },
    { key: "win_rate", label: "Win Rate", format: "rate" },
    { key: "max_drawdown_pct", label: "Max DD (Observed)", format: "pct" },
    { key: "total_trades", label: "Trades", format: "int" },
    { key: "opening_balance", label: "Opening Balance", format: "money" },
    { key: "closing_balance", label: "Closing Balance", format: "money", derived: "closing" },
    { key: "status", label: "Status", format: "text" },
    { key: "bandit_pulls", label: "Bandit Pulls", format: "int" },
  ];

  /** @deprecated use RESULT_SPECS */
  const METRIC_SPECS = RESULT_SPECS;

  /**
   * Cause rows — knobs / research settings that change trading behaviour.
   * Keep these out of the results board.
   *
   * editable:false = product identity or derived display (not a saveable knob).
   * input:"text" = free-text research fields (interval strings like 1m / 15m).
   */
  const SUITE_OPTIONS = [
    { value: "playbook1", label: "Playbook 1" },
    { value: "playbook2", label: "Playbook 2" },
    { value: "playbook3", label: "Playbook 3" },
  ];

  /** UI months ↔ stored lookback_days (30 calendar days per month). */
  function daysToMonths(days) {
    const n = Number(days);
    if (!Number.isFinite(n)) return null;
    const months = n / 30;
    const rounded = Math.round(months * 10) / 10;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function monthsToDays(months) {
    const n = Number(months);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 30 * 10) / 10;
  }

  const SETTING_SPECS = [
    {
      key: "lookback_days",
      label: "Lookback Months",
      editable: true,
      step: "0.1",
      min: "0.1",
      max: "120",
      unit: "months",
      hint: "Stored as days (×30). 3 months = 90 days",
    },
    {
      key: "strategy_suite",
      label: "Strategy Suite",
      editable: true,
      input: "select",
      options: "suite",
      hint: "Defaults: V1→baseline, V2→regime — arm count is a separate knob",
    },
    {
      key: "bandit_enabled_arms",
      label: "Enabled Strategies",
      editable: false,
      arms: true,
      hint: "Open to choose which suite arms the bandit may trade",
    },
    {
      key: "bandit_concentrate",
      label: "Bandit Concentrate",
      editable: false,
      concentrate: true,
      hint: "Select 1+ strategies with rank; #1 is concentrate",
    },
    {
      key: "bandit_tier_counts",
      label: "Allocation Tiers",
      editable: false,
      hint: "core / challenger / scout from profit ranks",
    },
    { key: "interval", label: "Entry Bar Interval", editable: true, input: "text", placeholder: "1m" },
    { key: "htf_interval", label: "Higher-Timeframe Confirm", editable: true, input: "text", placeholder: "15m" },
    { key: "lookback_bars", label: "Lookback Bars", editable: true, step: "1", min: "1", max: "500000" },
    {
      key: "opening_balance",
      label: "Opening Balance",
      editable: true,
      step: "1",
      min: "100",
      max: "10000000",
      placeholder: "5000",
    },
    { key: "default_leverage", label: "Default Leverage", editable: true, step: "1", min: "1", max: "3" },
    { key: "min_leverage", label: "Min Leverage", editable: true, step: "1", min: "1", max: "3" },
    { key: "max_leverage", label: "Max Leverage", editable: true, step: "1", min: "1", max: "3" },
    { key: "max_drawdown_pct", label: "Max Drawdown % (Cap)", editable: true, step: "0.1", min: "1", max: "100" },
    { key: "min_stop_distance_pct", label: "Min Stop Distance %", editable: true, step: "0.01", min: "0.01", max: "5" },
    { key: "max_portfolio_heat_pct", label: "Max Portfolio Heat %", editable: true, step: "0.1", min: "1", max: "100" },
    { key: "risk_per_trade_pct", label: "Risk Per Trade %", editable: true, step: "0.1", min: "0.1", max: "10" },
    { key: "max_trades_per_day", label: "Max Trades / Day", editable: true, step: "1", min: "0", max: "10000" },
    { key: "min_trades_per_day", label: "Min Trades / Day", editable: true, step: "1", min: "0", max: "50" },
    { key: "max_open_positions", label: "Max Open Positions", editable: true, step: "1", min: "0", max: "100" },
    { key: "max_hold_minutes", label: "Max Hold Minutes", editable: true, step: "1", min: "1", max: "1440" },
    {
      key: "bandit_exploration_rate",
      label: "Exploration Rate",
      editable: true,
      step: "0.01",
      min: "0",
      max: "1",
      bandit: true,
    },
    { key: "seed", label: "Seed", editable: true, step: "1", min: "0", max: "999999999" },
    {
      key: "symbol_count",
      label: "Symbol Count",
      editable: true,
      step: "1",
      min: "1",
      max: "100",
      hint: "On Save, seeds top N from market-cap ranked universe",
    },
    { key: "paper_confidence_threshold", label: "Paper Confidence", editable: true, step: "0.01", min: "0", max: "1" },
    { key: "max_daily_loss_pct", label: "Max Daily Loss %", editable: true, step: "0.1", min: "0", max: "100" },
    { key: "max_weekly_loss_pct", label: "Max Weekly Loss %", editable: true, step: "0.1", min: "0", max: "100" },
  ];

  /** Risk caps are 1–100. Tiny values are observed run drawdown, not the knob. */
  function normalizeRiskCapPct(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n > 0 && n < 1) return null;
    return n;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtWhen(iso) {
    if (window.GekkoTime?.formatCompact) return window.GekkoTime.formatCompact(iso);
    if (!iso) return "—";
    try {
      const d = window.GekkoTime?.parseUtc?.(iso) || new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      // Fallback SAST = UTC+2.
      const sast = new Date(d.getTime() + 2 * 60 * 60 * 1000);
      const y = sast.getUTCFullYear();
      const m = String(sast.getUTCMonth() + 1).padStart(2, "0");
      const day = String(sast.getUTCDate()).padStart(2, "0");
      const h = String(sast.getUTCHours()).padStart(2, "0");
      const min = String(sast.getUTCMinutes()).padStart(2, "0");
      return `${y}-${m}-${day} ${h}:${min} SAST`;
    } catch (_) {
      return String(iso);
    }
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function boardScope(scopeEl) {
    return (
      (scopeEl && scopeEl.closest && scopeEl.closest(".results-board-panel")) ||
      (scopeEl && scopeEl.closest && scopeEl.closest("main")) ||
      document.querySelector(".results-board-panel") ||
      document.querySelector("main") ||
      document
    );
  }

  function boardViewport(scope) {
    return (
      (scope && scope.querySelector && scope.querySelector(".results-unified-scroll")) ||
      (scope && scope.querySelector && scope.querySelector(".run-board-wrap")) ||
      (scope && scope.clientWidth ? scope : null) ||
      document.querySelector(".app-content-scroll") ||
      document.documentElement
    );
  }

  function measureLabelColumnPx(tables) {
    const canvas = measureLabelColumnPx._canvas || (measureLabelColumnPx._canvas = document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    if (!ctx) return 88;
    let maxText = 0;
    tables.forEach((table) => {
      const sample =
        table.querySelector("th[scope='row']") ||
        table.querySelector("thead .run-board-head-row > th:first-child");
      if (sample) {
        const style = window.getComputedStyle(sample);
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      }
      table
        .querySelectorAll("th[scope='row'], thead .run-board-head-row > th:first-child")
        .forEach((th) => {
          const text = String(th.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
          if (!text) return;
          const w = ctx.measureText(text).width;
          if (w > maxText) maxText = w;
        });
    });
    // Cell pad left+right (~0.65rem×2) + small breathing room.
    const padPx = 28;
    return clamp(Math.ceil(maxText + padPx), 64, 160);
  }

  /**
   * Size label column to content; data (run) columns equal width.
   * GST-100 — run columns at half the prior ×1.5 fit width (~0.75× fit)
   * so more runs show; label column stays sticky while runs scroll.
   */
  function alignBoardColumns(scopeEl) {
    const scope = boardScope(scopeEl);
    const tables = [...scope.querySelectorAll(".run-board-table")];
    if (!tables.length) return;

    let maxCols = 0;
    tables.forEach((table) => {
      const n = table.querySelectorAll("thead tr th").length;
      if (n > maxCols) maxCols = n;
    });
    if (maxCols < 2) return;
    const dataCols = maxCols - 1;

    const viewport = boardViewport(scope);
    const available = Math.max(260, (viewport.clientWidth || window.innerWidth || 360) - 4);

    const labelPx = measureLabelColumnPx(tables);
    const gapPx = 0;
    const fitData = Math.max(1, Math.floor((available - labelPx) / dataCols));
    // Half of prior ×1.5 data width (GST-100); horizontal scroll absorbs overflow.
    const dataPx = Math.max(Math.round(fitData * 0.75), Math.round(84 * 0.75));
    const totalPx = labelPx + dataCols * dataPx;

    const host = scope === document ? document.documentElement : scope;
    host.style.setProperty("--results-col-label", `${labelPx}px`);
    host.style.setProperty("--results-col-data", `${dataPx}px`);
    host.style.setProperty("--results-col-gap", `${gapPx}px`);
    // Keep :root in sync so any board outside the panel still matches.
    document.documentElement.style.setProperty("--results-col-label", `${labelPx}px`);
    document.documentElement.style.setProperty("--results-col-data", `${dataPx}px`);
    document.documentElement.style.setProperty("--results-col-gap", `${gapPx}px`);

    tables.forEach((table) => {
      table.style.width = `${totalPx}px`;
      table.style.minWidth = `${totalPx}px`;
      const headRow = table.querySelector("thead .run-board-head-row");
      if (headRow) {
        const h = Math.ceil(headRow.getBoundingClientRect().height || 0);
        if (h > 0) {
          table.style.setProperty("--run-board-sticky-actions-top", `${h}px`);
        }
      }
    });
  }

  function realignAllBoards() {
    const panels = document.querySelectorAll(".results-board-panel, main");
    if (!panels.length) {
      document.querySelectorAll(".run-board-table").forEach((table) => alignBoardColumns(table));
      return;
    }
    const seen = new Set();
    panels.forEach((panel) => {
      if (!panel.querySelector(".run-board-table") || seen.has(panel)) return;
      seen.add(panel);
      alignBoardColumns(panel);
    });
  }

  function wireAlignOnResize() {
    if (window.__gekkoRunBoardResizeWired) return;
    window.__gekkoRunBoardResizeWired = true;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(realignAllBoards, 50);
    };
    if (typeof window.addEventListener === "function") {
      window.addEventListener("resize", schedule);
    }
    // Sidebar collapse / content pane changes width without a window resize.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(schedule);
      const watch = () => {
        document
          .querySelectorAll(".results-unified-scroll, .results-board-panel, .app-content-scroll, .run-board-wrap")
          .forEach((el) => ro.observe(el));
      };
      watch();
      window.__gekkoRunBoardResizeWatch = watch;
    }
  }

  function shortId(value) {
    const s = String(value || "");
    return s.length > 10 ? `${s.slice(0, 8)}…` : s || "—";
  }

  function runLabel(run) {
    if (!run) return "—";
    return run.run_label || fmtWhen(run.finished_at || run.period_end) || shortId(run.run_id);
  }

  function settingValue(source, key) {
    if (!source || typeof source !== "object") return null;
    const settings = source.settings && typeof source.settings === "object" ? source.settings : source;
    const bandit = settings.bandit && typeof settings.bandit === "object" ? settings.bandit : {};
    if (key === "bandit_concentrate") {
      if (typeof window.GekkoSettingsArms?.concentrateDisplayText === "function") {
        const text = window.GekkoSettingsArms.concentrateDisplayText(settings);
        if (text) return text;
      }
      const order = Array.isArray(bandit.concentrate_order) ? bandit.concentrate_order : null;
      if (order && order.length) {
        return order.map((k, i) => `#${i + 1} ${k}`).join(", ");
      }
      return settings.bandit_concentrate ?? bandit.concentrate ?? null;
    }
    if (key === "bandit_disabled_arms" || key === "bandit_enabled_arms") {
      if (typeof window.GekkoSettingsArms?.enabledCountLabel === "function") {
        const label = window.GekkoSettingsArms.enabledCountLabel(settings);
        if (label) return label;
      }
      if (settings.bandit_enabled_arms != null) return settings.bandit_enabled_arms;
      if (settings.bandit_disabled_arms != null) {
        return key === "bandit_enabled_arms"
          ? null
          : settings.bandit_disabled_arms;
      }
      const disabled = bandit.disable_variants;
      if (Array.isArray(disabled)) {
        return key === "bandit_enabled_arms" ? null : disabled.length;
      }
      return null;
    }
    if (key === "bandit_tier_counts") {
      const counts = settings.bandit_tier_counts;
      if (counts && typeof counts === "object") {
        return `C${counts.core ?? 0} / H${counts.challenger ?? 0} / S${counts.scout ?? 0}`;
      }
      const tiers = bandit.allocation_tiers;
      if (tiers && typeof tiers === "object") {
        const vals = Object.values(tiers);
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
      return settings.default_leverage ?? settings.leverage ?? source.leverage ?? null;
    }
    if (key === "leverage") {
      return settings.leverage ?? settings.default_leverage ?? source.leverage ?? null;
    }
    // Risk cap must never fall back to run-level observed drawdown.
    if (key === "max_drawdown_pct") {
      return normalizeRiskCapPct(settings.max_drawdown_pct);
    }
    if (key in settings) return settings[key];
    // Avoid pulling result metrics off the raw run when settings omitted the knob.
    if (source.settings && key in source && key !== "max_drawdown_pct") {
      return source[key];
    }
    if (!source.settings && key in source) return source[key];
    return null;
  }

  function displayValue(value, format) {
    if (value == null || value === "") return "—";
    if (format === "when") return fmtWhen(value);
    if (format === "text") return String(value);
    if (format === "money") {
      if (window.GekkoUi?.formatMoney) {
        return window.GekkoUi.formatMoney(value, { signed: true });
      }
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
      return Number.isInteger(n) ? String(n) : String(n);
    }
    return String(value);
  }

  function previousRuns(results, maxPrev = MAX_PREVIOUS) {
    return (Array.isArray(results) ? results : []).filter((r) => r && r.run_id).slice(0, maxPrev);
  }

  function settingsBlobFromRun(run) {
    const base = run && typeof run.settings === "object" ? { ...run.settings } : {};
    // Research / identity aliases from the ledger column — never copy observed
    // result metrics (esp. max_drawdown_pct) into the settings blob.
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
    ]) {
      if ((base[key] == null || base[key] === "") && run && run[key] != null) {
        base[key] = run[key];
      }
    }
    // Cap only — reject observed DD leaked onto the run row (0.0028 etc.).
    const capFromSettings = normalizeRiskCapPct(base.max_drawdown_pct);
    if (capFromSettings != null) {
      base.max_drawdown_pct = capFromSettings;
    } else {
      delete base.max_drawdown_pct;
    }
    if (base.bandit_exploration_rate != null) {
      base.bandit = {
        ...(base.bandit || {}),
        exploration_rate: base.bandit_exploration_rate,
      };
    }
    if (base.default_leverage == null && base.leverage != null) {
      base.default_leverage = base.leverage;
    }
    return base;
  }

  function lookbackMonthsFromSource(source) {
    if (!source || typeof source !== "object") return null;
    const days =
      settingValue(source, "lookback_days") ??
      source.lookback_days ??
      (source.settings && source.settings.lookback_days);
    return daysToMonths(days);
  }

  function effectValue(run, spec, olderRun) {
    if (spec.derived === "lookback_months") {
      return lookbackMonthsFromSource(run);
    }
    if (!run) return null;
    if (spec.derived === "pnl_delta") {
      if (!olderRun || olderRun.total_pnl == null || run.total_pnl == null) return null;
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

  /**
   * Paint Current + up to 5 previous columns.
   *
   * mode:
   *  - "results"  → effect only (outcomes). Current = next run (empty effect).
   *  - "settings" → cause only (knobs). Current = editable desk settings.
   *
   * @param {HTMLElement} root
   * @param {object} opts
   */
  function paint(root, opts) {
    if (!root) return;
    const mode = opts.mode || "settings";
    const editable = !!opts.editable;
    const product = String(opts.product || "").toLowerCase();
    const currentSettings = opts.currentSettings || {};
    const prev = previousRuns(opts.results, MAX_PREVIOUS);

    function suiteSelectOptions(selected) {
      const preferred = product === "v2" ? "playbook3" : "playbook1";
      const ordered = [...SUITE_OPTIONS].sort((a, b) => {
        if (a.value === preferred) return -1;
        if (b.value === preferred) return 1;
        return 0;
      });
      const sel = String(selected || preferred);
      return ordered
        .map(
          (opt) =>
            `<option value="${escapeHtml(opt.value)}"${
              opt.value === sel ? " selected" : ""
            }>${escapeHtml(opt.label)}</option>`
        )
        .join("");
    }
    const onCopy = typeof opts.onCopy === "function" ? opts.onCopy : null;
    const onCopyKey = typeof opts.onCopyKey === "function" ? opts.onCopyKey : null;
    const onApply = typeof opts.onApplyRecommendations === "function" ? opts.onApplyRecommendations : null;
    const onHide = typeof opts.onHide === "function" ? opts.onHide : null;
    // Legacy alias — soft-hide from Results (does not delete artefacts).
    const onDiscard = onHide || (typeof opts.onDiscard === "function" ? opts.onDiscard : null);
    const onSaveCurrent = typeof opts.onSaveCurrent === "function" ? opts.onSaveCurrent : null;
    const onRevertCurrent = typeof opts.onRevertCurrent === "function" ? opts.onRevertCurrent : null;
    const onManageArms = typeof opts.onManageArms === "function" ? opts.onManageArms : null;
    const onManageConcentrate =
      typeof opts.onManageConcentrate === "function" ? opts.onManageConcentrate : null;

    function settingCopyable(spec, raw, col) {
      if (col.kind !== "previous" || !onCopyKey) return false;
      if (spec.key === "bandit_enabled_arms") {
        const src = col.settings || col.run || {};
        const settings = src.settings && typeof src.settings === "object" ? src.settings : src;
        const bandit = settings.bandit && typeof settings.bandit === "object" ? settings.bandit : {};
        return (
          Array.isArray(bandit.disable_variants) ||
          bandit.concentrate != null ||
          settings.bandit_concentrate != null ||
          (raw != null && raw !== "")
        );
      }
      if (spec.key === "bandit_concentrate") {
        return raw != null && raw !== "";
      }
      if (spec.key === "bandit_tier_counts") {
        return raw != null && raw !== "" && String(raw) !== "—";
      }
      return raw != null && raw !== "";
    }

    function copyButtonHtml(spec, col) {
      return `<button type="button" class="btn-cell-copy" data-copy-key="${escapeHtml(
        spec.key
      )}" data-copy-run="${escapeHtml(col.run?.run_id || "")}" title="Copy ${escapeHtml(
        spec.label
      )} to Current">Copy to Current</button>`;
    }
    // Optional: show a completed run under Current in results (legacy). Default: next-run empty.
    const currentRun = opts.currentRun || null;
    const unified = mode === "unified";
    const currentIsNext =
      mode === "results" || unified
        ? opts.currentIsNext !== false && !currentRun
        : false;

    const columns = [];
    if (mode === "results") {
      columns.push({
        id: "current",
        kind: "current",
        label: "Current",
        sub: currentIsNext
          ? "Next run · not started"
          : runLabel(currentRun) || "Latest outcome",
        run: currentIsNext ? null : currentRun,
        settings: null,
        editable: false,
      });
    } else {
      // settings + unified: editable Current (settings), empty Current for results rows
      columns.push({
        id: "current",
        kind: "current",
        label: "Current",
        sub: editable ? "Next run · editable" : "Next run · not started",
        run: null,
        settings: currentSettings,
        editable,
      });
    }
    prev.forEach((run, idx) => {
      columns.push({
        id: run.run_id,
        kind: "previous",
        label: `Run${idx + 1}`,
        sub: runLabel(run),
        run,
        settings: settingsBlobFromRun(run),
        editable: false,
      });
    });

    const headLabel = mode === "results" ? "Outcome" : "Backtest Runs";
    const head = columns
      .map((col) => {
        const pnlRaw = col.run?.total_pnl;
        const pnlNum = Number(pnlRaw);
        const hasPnl = col.kind === "previous" && pnlRaw != null && pnlRaw !== "" && Number.isFinite(pnlNum);
        const pnlCls = !hasPnl ? "" : pnlNum > 0 ? "pnl-pos" : pnlNum < 0 ? "pnl-neg" : "";
        const pnlHtml = hasPnl
          ? `<span class="run-board-col-pnl mono ${pnlCls}">${escapeHtml(
              displayValue(pnlRaw, "money")
            )}</span>`
          : "";
        return `<th scope="col" class="run-board-col ${
          col.kind === "current" ? "is-current" : ""
        }" data-col="${escapeHtml(col.id)}">
          <div class="run-board-col-head">
            <div class="run-board-col-title-row">
              <span class="run-board-col-title">${escapeHtml(col.label)}</span>
              ${pnlHtml}
            </div>
            <span class="run-board-col-sub muted-line">${escapeHtml(col.sub)}</span>
          </div>
        </th>`;
      })
      .join("");

    const showActions = !!(onCopy || onApply || onDiscard || onSaveCurrent || onRevertCurrent);
    const actionRow = showActions
      ? `<tr class="run-board-actions-row">
        <th scope="row">Actions</th>
        ${columns
          .map((col) => {
            if (col.kind === "current") {
              if (mode === "results") {
                return `<td class="run-board-actions is-current"><span class="muted-line">—</span></td>`;
              }
              const saveBtn = onSaveCurrent
                ? `<button type="button" class="btn btn-compact run-board-cell-cta" data-board-save-current title="Save Current knobs for the next window">Save</button>`
                : "";
              const revertBtn = onRevertCurrent
                ? `<button type="button" class="btn ghost btn-compact run-board-cell-cta" data-board-revert-current title="Discard unsaved Current edits">Revert</button>`
                : "";
              return `<td class="run-board-actions is-current">
                <div class="run-board-action-btns">
                  <span class="muted-line">Edit Below</span>
                  <div class="run-board-action-pair">${saveBtn}${revertBtn}</div>
                </div>
              </td>`;
            }
            const rid = escapeHtml(col.run?.run_id || "");
            const copyBtn = onCopy
              ? `<button type="button" class="btn ghost btn-compact run-board-cell-cta" data-board-copy="${rid}">Copy All</button>`
              : "";
            const hideBtn = onDiscard
              ? `<button type="button" class="btn ghost btn-compact run-board-cell-cta" data-board-hide="${rid}" title="Hide from Results only. Stays in DB/storage — manage Delete in Reports.">Hide</button>`
              : "";
            // Analyze = optional read. Apply is a separate step in the panel below.
            const analyzeBtn = onApply
              ? `<button type="button" class="btn ghost btn-compact run-board-cell-cta" data-board-apply="${rid}" title="Optional: review tips from this run. Nothing is written until you Apply.">Analyze</button>`
              : "";
            const row1 =
              copyBtn || hideBtn
                ? `<div class="run-board-action-pair">${copyBtn}${hideBtn}</div>`
                : "";
            return `<td class="run-board-actions">
              <div class="run-board-action-btns">
                ${row1}
                ${analyzeBtn}
              </div>
            </td>`;
          })
          .join("")}
      </tr>`
      : "";

    let body = "";
    const nCols = columns.length + 1;

    /** True when this column's value differs from the next-older column (to the right). */
    function differsFromOlder(values, idx) {
      if (idx >= values.length - 1) return false;
      const a = values[idx];
      const b = values[idx + 1];
      // Skip empty↔empty; highlight when either side has a real value that diverges.
      if ((a == null || a === "") && (b == null || b === "")) return false;
      return String(a ?? "") !== String(b ?? "");
    }

    function sectionRow(label) {
      // One cell per column so vertical grid rails stay continuous through section headers.
      const cells = columns.map(() => `<td class="run-board-section-cell"></td>`).join("");
      return `<tr class="run-board-section"><th scope="row">${escapeHtml(label)}</th>${cells}</tr>`;
    }

    function renderResultRows() {
      return RESULT_SPECS.map((spec) => {
        const values = columns.map((col, colIdx) => {
          if (spec.derived === "lookback_months") {
            if (col.kind === "current") {
              return lookbackMonthsFromSource(col.settings || currentSettings);
            }
            return lookbackMonthsFromSource(col.run || col.settings);
          }
          if (col.kind === "current" && !col.run) return null;
          const older = columns[colIdx + 1]?.run || null;
          return effectValue(col.run, spec, older);
        });
        const cells = values
          .map((raw, idx) => {
            const col = columns[idx];
            const pnlCls =
              Number(raw) > 0 && (spec.key === "total_pnl" || spec.key === "pnl_delta")
                ? "pnl-pos"
                : Number(raw) < 0 && (spec.key === "total_pnl" || spec.key === "pnl_delta")
                  ? "pnl-neg"
                  : "";
            return `<td class="mono ${col.kind === "current" ? "is-current" : ""} ${pnlCls}">${escapeHtml(
              displayValue(raw, spec.format)
            )}</td>`;
          })
          .join("");
        return `<tr><th scope="row">${escapeHtml(spec.label)}</th>${cells}</tr>`;
      }).join("");
    }

    function renderSettingRows() {
      return SETTING_SPECS.map((spec) => {
        const values = columns.map((col) => settingValue(col.settings || col.run, spec.key));
        const present = values.some((v) => v != null && v !== "");
        if (!present && !spec.editable && !spec.arms && !spec.concentrate) return "";
        const anyDiff = values.some((_, idx) => differsFromOlder(values, idx));
        const cells = columns
          .map((col, idx) => {
            const raw = values[idx];
            const changedCls = differsFromOlder(values, idx) ? "is-changed-from-prev" : "";
            const title = changedCls
              ? ` title="Changed vs ${escapeHtml(columns[idx + 1]?.label || "previous")}"`
              : spec.hint && col.kind === "current"
                ? ` title="${escapeHtml(spec.hint)}"`
                : "";
            const canCopyCell = settingCopyable(spec, raw, col);
            const copyBtn = canCopyCell ? copyButtonHtml(spec, col) : "";
            if (col.editable && spec.editable) {
              const id = `board_knob_${spec.key}`;
              const bandit = spec.bandit ? ` data-bandit="1"` : "";
              if (spec.input === "select" && spec.options === "suite") {
                return `<td class="is-current run-board-edit ${changedCls}"${title}>
              <select class="mono run-board-input run-board-select" id="${id}" name="${escapeHtml(
                  spec.key
                )}" data-kind="text">
                ${suiteSelectOptions(raw)}
              </select>
              <span class="run-board-readonly-hint muted-line">${escapeHtml(
                spec.hint || ""
              )}</span>
            </td>`;
              }
              if (spec.input === "text") {
                return `<td class="is-current run-board-edit ${changedCls}"${title}>
              <input class="mono run-board-input" id="${id}" name="${escapeHtml(spec.key)}" type="text"
                data-kind="text" placeholder="${escapeHtml(spec.placeholder || "")}"
                value="${raw != null && raw !== "" ? escapeHtml(String(raw)) : ""}" />
            </td>`;
              }
              let inputValue = raw;
              if (spec.unit === "months") {
                const months = daysToMonths(raw);
                inputValue = months != null ? months : "";
              }
              if (
                spec.key === "opening_balance" &&
                (inputValue == null || inputValue === "") &&
                Number.isFinite(Number(window.GEKKO_OPENING_BALANCE))
              ) {
                inputValue = Number(window.GEKKO_OPENING_BALANCE);
              }
              const countHint =
                spec.key === "symbol_count"
                  ? `<span class="run-board-readonly-hint muted-line">${escapeHtml(
                      spec.hint || ""
                    )}</span>`
                  : "";
              return `<td class="is-current run-board-edit ${changedCls}"${title}>
              <input class="mono run-board-input" id="${id}" name="${escapeHtml(spec.key)}" type="number"
                inputmode="decimal" step="${spec.step || "any"}" min="${spec.min ?? ""}" max="${spec.max ?? ""}"
                data-unit="${escapeHtml(spec.unit || "")}"
                placeholder="${escapeHtml(spec.placeholder || "")}"
                value="${inputValue != null && inputValue !== "" ? escapeHtml(String(inputValue)) : ""}"${bandit} />
              ${countHint}
            </td>`;
            }
            if (spec.concentrate && onManageConcentrate) {
              const settingsSrc = col.settings || col.run || {};
              const settingsBlob =
                settingsSrc.settings && typeof settingsSrc.settings === "object"
                  ? settingsSrc.settings
                  : settingsSrc;
              const summary =
                typeof window.GekkoSettingsArms?.concentrateSummaryHtml === "function"
                  ? window.GekkoSettingsArms.concentrateSummaryHtml(settingsBlob)
                  : `<span class="run-board-cell-value">${escapeHtml(displayValue(raw, null))}</span>`;
              const colId = escapeHtml(col.id);
              const manageLabel = col.kind === "current" ? "Edit ranks…" : "View ranks…";
              return `<td class="mono ${col.kind === "current" ? "is-current" : ""} ${changedCls}${
                canCopyCell ? " has-cell-copy" : ""
              } has-concentrate-open"${title}>
                ${summary}
                <button type="button" class="btn ghost btn-compact btn-concentrate-open run-board-cell-cta" data-board-concentrate="${colId}" title="${escapeHtml(
                spec.hint || "Bandit concentrate"
              )}">${escapeHtml(manageLabel)}</button>
                ${copyBtn}
              </td>`;
            }
            if (spec.arms && onManageArms) {
              const settingsSrc = col.settings || col.run || {};
              const settingsBlob =
                settingsSrc.settings && typeof settingsSrc.settings === "object"
                  ? settingsSrc.settings
                  : settingsSrc;
              const summary =
                typeof window.GekkoSettingsArms?.enabledSummaryHtml === "function"
                  ? window.GekkoSettingsArms.enabledSummaryHtml(settingsBlob)
                  : `<span class="run-board-cell-value mono">${escapeHtml(
                      raw != null && raw !== "" ? String(raw) : "—"
                    )}</span>`;
              const colId = escapeHtml(col.id);
              const manageLabel = col.kind === "current" ? "Manage…" : "View…";
              return `<td class="mono ${col.kind === "current" ? "is-current" : ""} ${changedCls}${
                canCopyCell ? " has-cell-copy" : ""
              } has-arms-open"${title}>
                ${summary}
                <button type="button" class="btn ghost btn-compact btn-arms-open run-board-cell-cta" data-board-arms="${colId}" title="${escapeHtml(
                spec.hint || "Enabled strategies"
              )}">${escapeHtml(manageLabel)}</button>
                ${copyBtn}
              </td>`;
            }
            const readonlyHint =
              !spec.editable && col.kind === "current" && spec.hint && !spec.arms && !spec.concentrate
                ? `<span class="run-board-readonly-hint muted-line">${escapeHtml(spec.hint)}</span>`
                : "";
            let shown = raw;
            if (spec.unit === "months") {
              shown = daysToMonths(raw);
            }
            return `<td class="mono ${col.kind === "current" ? "is-current" : ""} ${changedCls}${
              canCopyCell ? " has-cell-copy" : ""
            }"${title}><span class="run-board-cell-value">${escapeHtml(
              displayValue(shown, spec.unit === "months" ? "months" : null)
            )}</span>${copyBtn}${readonlyHint}</td>`;
          })
          .join("");
        return `<tr class="${anyDiff ? "compare-changed" : ""}" data-setting-key="${escapeHtml(
          spec.key
        )}"><th scope="row">${escapeHtml(spec.label)}</th>${cells}</tr>`;
      }).join("");
    }

    if (unified) {
      // Sticky Run + Actions at top; Results (effect), then Settings (cause).
      body += sectionRow("Results") + renderResultRows();
      body += sectionRow("Settings") + renderSettingRows();
    } else if (mode === "results") {
      body += renderResultRows();
    } else {
      body += renderSettingRows();
    }

    root.innerHTML = `
      <div class="compare-board run-board run-board-${escapeHtml(mode)}">
        <div class="table-wrap compare-table-wrap run-board-wrap">
          <table class="data-table compare-table run-board-table">
            <thead>
              <tr class="run-board-head-row"><th scope="col">${escapeHtml(headLabel)}</th>${head}</tr>
              ${actionRow}
            </thead>
            <tbody>
              ${body || `<tr><td colspan="${nCols}" class="muted-line">No rows.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div id="runBoardRecsPanel" class="run-board-recs" hidden></div>
      </div>`;

    root.querySelectorAll("[data-board-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-board-copy");
        const run = prev.find((r) => r.run_id === id);
        if (run && onCopy) onCopy(run);
      });
    });
    root.querySelector("[data-board-save-current]")?.addEventListener("click", () => {
      if (onSaveCurrent) onSaveCurrent();
    });
    root.querySelector("[data-board-revert-current]")?.addEventListener("click", () => {
      if (onRevertCurrent) onRevertCurrent();
    });
    root.querySelectorAll("[data-board-apply]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-board-apply");
        const run = prev.find((r) => r.run_id === id);
        if (run && onApply) onApply(run);
      });
    });
    root.querySelectorAll("[data-board-hide], [data-board-discard]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-board-hide") || btn.getAttribute("data-board-discard");
        const run = prev.find((r) => r.run_id === id);
        if (run && onDiscard) onDiscard(run);
      });
    });
    root.querySelectorAll("[data-board-arms]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-board-arms");
        const col = columns.find((c) => c.id === id);
        if (col && onManageArms) onManageArms(col);
      });
    });
    root.querySelectorAll("[data-board-concentrate]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-board-concentrate");
        const col = columns.find((c) => c.id === id);
        if (col && onManageConcentrate) onManageConcentrate(col);
      });
    });
    root.querySelectorAll("[data-copy-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-copy-key");
        const id = btn.getAttribute("data-copy-run");
        const run = prev.find((r) => r.run_id === id);
        if (run && key && onCopyKey) onCopyKey(run, key);
      });
    });

    wireAlignOnResize();
    alignBoardColumns(root);
    if (typeof window.__gekkoRunBoardResizeWatch === "function") {
      window.__gekkoRunBoardResizeWatch();
    }
  }

  function readEditableCurrent(root) {
    const patch = {};
    if (!root) return patch;
    root.querySelectorAll(".run-board-input").forEach((el) => {
      if (!el.name || el.value === "") return;
      if (el.dataset.kind === "text" || el.type === "text" || el.tagName === "SELECT") {
        patch[el.name] = String(el.value).trim();
        return;
      }
      const n = Number(el.value);
      if (!Number.isFinite(n)) return;
      if (el.dataset.bandit === "1") {
        patch.bandit = { ...(patch.bandit || {}), exploration_rate: n };
      } else if (el.name === "max_drawdown_pct") {
        const cap = normalizeRiskCapPct(n);
        if (cap != null) patch.max_drawdown_pct = cap;
      } else if (el.name === "symbol_count") {
        patch.symbol_count = Math.max(1, Math.min(100, Math.round(n)));
      } else if (el.name === "lookback_days" || el.dataset.unit === "months") {
        const days = monthsToDays(n);
        if (days != null) patch.lookback_days = days;
      } else {
        patch[el.name] = n;
      }
    });
    if (patch.default_leverage != null) patch.leverage = patch.default_leverage;
    return patch;
  }

  function fillEditableCurrent(root, settings) {
    if (!root || !settings) return;
    const bandit = settings.bandit && typeof settings.bandit === "object" ? settings.bandit : {};
    root.querySelectorAll(".run-board-input").forEach((el) => {
      const key = el.name;
      let value =
        el.dataset.bandit === "1"
          ? bandit.exploration_rate ?? settings.bandit_exploration_rate
          : settings[key];
      if (key === "default_leverage" && (value == null || value === "")) value = settings.leverage;
      if (key === "symbol_count" && (value == null || value === "") && Array.isArray(settings.symbols)) {
        value = settings.symbols.length;
      }
      if (key === "lookback_days" || el.dataset.unit === "months") {
        value = daysToMonths(value);
      }
      if (
        key === "opening_balance" &&
        (value == null || value === "") &&
        Number.isFinite(Number(window.GEKKO_OPENING_BALANCE))
      ) {
        value = Number(window.GEKKO_OPENING_BALANCE);
      }
      el.value = value != null && value !== "" ? String(value) : "";
    });
  }

  function ensureAnalyzeTipsModal() {
    let modal = $("analyzeTipsModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "analyzeTipsModal";
    modal.className = "auth-modal analyze-tips-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="auth-modal-card analyze-tips-modal-card" role="dialog" aria-modal="true" aria-labelledby="analyzeTipsModalTitle">
        <button type="button" class="auth-modal-close" id="analyzeTipsModalClose" aria-label="Close">×</button>
        <p class="run-board-recs-step">Analyze · optional</p>
        <h2 id="analyzeTipsModalTitle">Tips</h2>
        <p class="auth-modal-sub" id="analyzeTipsModalSub">Select tips to save/apply. Nothing is written until you Apply.</p>
        <div id="analyzeTipsBody" class="analyze-tips-body"></div>
        <div id="analyzeTipsActions" class="analyze-tips-actions"></div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => {
      modal.hidden = true;
    };
    modal.querySelector("#analyzeTipsModalClose")?.addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    if (!window.__gekkoAnalyzeTipsEscapeWired) {
      window.__gekkoAnalyzeTipsEscapeWired = true;
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          const open = $("analyzeTipsModal");
          if (open && !open.hidden) open.hidden = true;
        }
      });
    }
    return modal;
  }

  function tipKindLabel(kind) {
    if (kind === "ranked_seed") return "ranked seed";
    if (kind === "settings_patch") return "settings patch";
    if (kind === "disable_variants") return "disable arms";
    return kind || "advisory";
  }

  function syncAnalyzeApplyButton(modal) {
    const btn = modal?.querySelector("#boardApplySelectedRecs");
    if (!btn) return;
    const n = modal.querySelectorAll('input[data-rec-id]:checked').length;
    btn.disabled = n < 1;
    btn.textContent = n ? `Apply selected tips (${n})` : "Apply selected tips";
  }

  function showRecommendations(root, { run, tips, statusHtml }) {
    const modal = ensureAnalyzeTipsModal();
    const body = modal.querySelector("#analyzeTipsBody");
    const actions = modal.querySelector("#analyzeTipsActions");
    const title = modal.querySelector("#analyzeTipsModalTitle");
    const sub = modal.querySelector("#analyzeTipsModalSub");
    if (!body || !actions) return;

    const list = Array.isArray(tips) ? tips : [];
    const patchableCount = list.filter((t) => {
      const kind = t?.apply && typeof t.apply === "object" ? t.apply.kind : "advisory";
      return kind && kind !== "advisory";
    }).length;
    const advisoryCount = list.length - patchableCount;

    if (title) title.textContent = `Tips from ${runLabel(run)}`;
    if (sub) {
      sub.textContent =
        "Select tips to save on L1 and apply machine patches where available. Skip if you already copied settings or promoted.";
    }

    body.innerHTML = list.length
      ? `<ul class="run-board-recs-list analyze-tips-list">${list
          .map((t) => {
            const apply = t.apply && typeof t.apply === "object" ? t.apply : {};
            const kind = apply.kind || "advisory";
            const patchable = kind !== "advisory";
            const id = escapeHtml(t.id || "");
            const kindLabel = tipKindLabel(kind);
            const patchHint =
              patchable && apply.patch
                ? `<code class="rec-patch mono">${escapeHtml(JSON.stringify(apply.patch))}</code>`
                : patchable
                  ? `<code class="rec-patch mono">${escapeHtml(kindLabel)}</code>`
                  : `<span class="muted-line">Saves as advisory lineage on Apply</span>`;
            return `<li class="suggest-item ${escapeHtml(t.severity || "medium")}" data-rec-id="${id}">
              <label class="rec-apply-check rec-tip-select">
                <input type="checkbox" data-rec-id="${id}" checked />
                <span class="rec-tip-select-copy">
                  <span class="rec-item-head">
                    <strong>${escapeHtml(t.title || "Tip")}</strong>
                    <span class="muted-line rec-kind">${escapeHtml(kindLabel)}</span>
                  </span>
                  <span class="rec-tip-detail">${escapeHtml(t.detail || "")}</span>
                  ${patchHint}
                </span>
              </label>
            </li>`;
          })
          .join("")}</ul>
        <p class="muted-line run-board-recs-count">${list.length} selectable · ${patchableCount} can patch L1 · ${advisoryCount} advisory</p>`
      : `<p class="section-copy muted-line">No structured tips on this report. Close, or open the full report.</p>`;

    actions.innerHTML = statusHtml || "";
    modal.hidden = false;
    body.querySelectorAll('input[data-rec-id]').forEach((el) => {
      el.addEventListener("change", () => syncAnalyzeApplyButton(modal));
    });
    syncAnalyzeApplyButton(modal);

    // Hide legacy inline panel if present.
    const panel = root?.querySelector("#runBoardRecsPanel") || $("runBoardRecsPanel");
    if (panel) {
      panel.hidden = true;
      panel.innerHTML = "";
    }
  }

  function closeRecommendations() {
    const modal = $("analyzeTipsModal");
    if (modal) modal.hidden = true;
  }

  function selectedRecommendationIds(root) {
    const host =
      $("analyzeTipsModal") ||
      root?.querySelector("#runBoardRecsPanel") ||
      $("runBoardRecsPanel");
    if (!host || host.hidden) return [];
    return Array.from(host.querySelectorAll("input[data-rec-id]:checked")).map((el) =>
      el.getAttribute("data-rec-id")
    );
  }

  function $(id) {
    return document.getElementById(id);
  }

  window.GekkoRunBoard = {
    MAX_PREVIOUS,
    RESULT_SPECS,
    METRIC_SPECS,
    SETTING_SPECS,
    paint,
    alignBoardColumns,
    previousRuns,
    settingsBlobFromRun,
    readEditableCurrent,
    fillEditableCurrent,
    showRecommendations,
    closeRecommendations,
    selectedRecommendationIds,
    runLabel,
    settingValue,
    effectValue,
  };
})();
