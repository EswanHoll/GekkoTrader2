/**
 * GST-12 Sim A execution surfaces — real Control API wire.
 * setup · runs (start/cancel/delete/monitor) · results · compare (2–10)
 */
(function (root) {
  "use strict";

  const ACTIVE = new Set(["queued", "preparing", "running", "cancelling"]);
  const TERMINAL_OK = new Set(["succeeded", "completed"]);
  const TERMINAL_BAD = new Set(["failed", "cancelled"]);
  const COPY_ALLOWLIST = [
    "opening_balance",
    "symbols",
    "signal_interval",
    "htf_interval",
    "fee_model_version",
    "slippage_model_version",
    "risk_per_trade_pct",
    "max_open_positions",
    "learning_policy",
    "adaptive_knob_bounds",
    "risk_limits",
  ];

  function escapeHtml(v) {
    return window.GekkoUi?.escapeHtml?.(v) ?? String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(v, signed) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return (
      window.GekkoUi?.formatMoney?.(v, { cents: true, signed: !!signed }) ??
      String(v)
    );
  }

  function Cap() {
    return window.GekkoSimCapability;
  }

  function requireScope() {
    return window.GekkoDeskSurface.requirePageScope();
  }

  function setBanner(scope, playbook_key) {
    const banner = document.getElementById("scopeBanner");
    if (!banner || !window.GekkoScope) return;
    const resolved =
      window.GekkoScope.resolvePlaybookKey?.(playbook_key, null, scope) ||
      playbook_key;
    banner.textContent = window.GekkoScope.formatScopeLabel(scope, resolved);
    banner.classList.add("scope-chip", "scope-banner");
  }

  function renderGate(scope) {
    Cap()?.renderGateBanner?.("gateBanner", scope);
  }

  function statusLine(el, msg, ok) {
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-ok", !!ok);
    el.classList.toggle("is-bad", ok === false);
  }

  function payloadOf(version) {
    return version?.payload || version || {};
  }

  /**
   * Build Start-run body from the *bound* settings version only.
   * Fail closed when binding / dataset_id / manifest_sha256 are missing —
   * never invent dataset_id or a placeholder 64-hex manifest.
   */
  function buildStartRunBody(settings, { idempotency_key } = {}) {
    const versions = settings?.versions || [];
    // Coerce to string — greenfield ids may arrive as numbers.
    const settings_version_id = settings?.active_binding?.settings_version_id != null
      ? String(settings.active_binding.settings_version_id)
      : "";
    if (!settings_version_id) {
      const err = new Error(
        "No bound settings version. Bind a settings version before Start run."
      );
      err.code = "settings_binding_missing";
      throw err;
    }
    const bound = versions.find(
      (v) => String(v.settings_version_id) === settings_version_id
    );
    if (!bound) {
      const err = new Error(
        `Bound settings version ${settings_version_id} not found in versions list.`
      );
      err.code = "settings_version_missing";
      throw err;
    }
    const p = payloadOf(bound);
    if (p.dataset_id == null || p.dataset_id === "" || !Number.isFinite(Number(p.dataset_id))) {
      const err = new Error(
        "Bound settings version is missing dataset_id. Save and bind a version that includes it — do not invent one."
      );
      err.code = "dataset_id_missing";
      throw err;
    }
    const manifest = String(p.manifest_sha256 || "").trim();
    if (!/^[0-9a-fA-F]{64}$/.test(manifest)) {
      const err = new Error(
        "Bound settings version is missing a valid 64-hex manifest_sha256. Save and bind a version that includes it — do not invent one."
      );
      err.code = "manifest_sha256_missing";
      throw err;
    }
    const seedRaw = p.seed ?? p.learning_seed;
    if (seedRaw == null || seedRaw === "" || !Number.isFinite(Number(seedRaw))) {
      const err = new Error(
        "Bound settings version is missing seed (or learning_seed)."
      );
      err.code = "seed_missing";
      throw err;
    }
    const key =
      idempotency_key ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `ui-${Date.now()}`);
    return {
      idempotency_key: key,
      settings_version_id,
      dataset_id: Number(p.dataset_id),
      seed: Number(seedRaw),
      manifest_sha256: manifest.toLowerCase(),
    };
  }

  function pnlFromRun(run) {
    if (run?.metrics && typeof run.metrics === "object") {
      if (run.metrics.total_pnl != null) return run.metrics.total_pnl;
      if (run.metrics.realized_pnl != null) return run.metrics.realized_pnl;
    }
    if (TERMINAL_BAD.has(run?.status)) return null;
    return run?.realized_pnl ?? null;
  }

  function formatRunTime(run) {
    const raw = run?.started_at || run?.run_label || run?.created_at || run?.updated_at;
    return window.GekkoTime?.formatCompact?.(raw) || raw || run?.run_id || "—";
  }

  function renderSimLedgerUnavailable(host, scope, kind) {
    const label = window.GekkoScope.formatScopeLabel(scope);
    const title =
      kind === "results"
        ? "Results not on this desk yet"
        : "Run board not on this desk yet";
    host.innerHTML = `
      <p class="scope-chip scope-banner">${escapeHtml(label)}</p>
      <p class="muted-line" id="simLedgerUnavailable" role="status">
        <strong>${escapeHtml(title)}</strong> —
        Demo and Live desks do not use the Sim Batch run ledger.
        This page stays empty on purpose (not a login error).
        Use Sim A / B for retained Batch runs and results.
      </p>`;
  }

  function fmtKnob(value) {
    if (value == null || value === "") return "—";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function renderBoundKnobs(payload) {
    const p = payload || {};
    const rows = [
      ["Playbook", p.playbook_key],
      ["Suite", p.strategy_suite || p.suite],
      ["Signal interval", p.signal_interval || p.interval],
      ["HTF interval", p.htf_interval],
      ["Opening balance", p.opening_balance],
      ["Risk per trade %", p.risk_per_trade_pct],
      ["Max open positions", p.max_open_positions],
      ["Max trades / day", p.max_trades_per_day],
      ["Seed", p.seed ?? p.learning_seed],
      ["Dataset", p.dataset_id],
      ["Symbols", p.symbols],
      ["Leverage (default)", p.default_leverage ?? p.leverage],
    ];
    return `<dl class="kv-list">${rows
      .map(
        ([label, value]) =>
          `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(
            fmtKnob(value)
          )}</dd></div>`
      )
      .join("")}</dl>`;
  }

  async function bootSetup() {
    const errHost = document.getElementById("pageError");
    const resolved = requireScope();
    if (resolved.error) {
      window.GekkoDeskSurface.showError(errHost, resolved.error);
      return;
    }
    const { scope } = resolved;
    renderGate(scope);
    const host = document.getElementById("setupRoot");
    if (!host) return;

    // Strategy cards come from strategy.js (static hosts on the page).
    window.GekkoStrategySummaries?.paint?.();

    // Demo Strategy is a Parity Plus floor page: playbook cards always paint.
    // Bound-settings editor stays Sim-only until Demo settings APIs are proven.
    if (!Cap()?.commandsEnabled(scope) && !Cap()?.isSimActive?.(scope)) {
      if (Cap()?.isDemo?.(scope)) {
        host.innerHTML = `<section class="panel" aria-label="Demo strategy note">
          <h2>Demo settings</h2>
          <p class="muted-line">
            Promote proven Sim knobs with <strong>Copy to Demo</strong> on
            <a href="${escapeHtml(window.GekkoScope.pathForScope({ execution_env: "sim", lane: scope.lane }, "results"))}">Sim ${escapeHtml(String(scope.lane || "").toUpperCase())} Results</a>.
            This page explains the playbook; it does not start Batch runs.
          </p>
        </section>`;
        return;
      }
      host.innerHTML = `<p class="muted-line">Bound settings are not available on this desk.</p>`;
      return;
    }

    // Always GET settings-versions for Sim desks (including View-only) so
    // signed-in smoke S5 observes the read path. Mutation controls stay gated.
    try {
      window.GekkoDeskSurface.hideError(errHost);
      const data = await window.GekkoApi.fetchSettingsVersions(scope);
      const versions = data.versions || [];
      const activeId =
        data.active_binding?.settings_version_id != null
          ? String(data.active_binding.settings_version_id)
          : "";
      const current =
        versions.find((v) => String(v.settings_version_id) === activeId) ||
        versions[0];
      const p = payloadOf(current);
      setBanner(scope, p.playbook_key);
      const mutateOk = await Cap()?.canMutate?.(scope);

      const boundPanel = `
        <section class="panel" aria-label="Bound settings">
          <h2>Bound settings</h2>
          <p class="muted-line">What the next Sim run will use.
            ${
              mutateOk
                ? "Edit with Save / Bind in the sections below."
                : "Write access is required to change knobs."
            }
          </p>
          ${renderBoundKnobs(p)}
          <h3>Version identity</h3>
          <dl class="kv-list">
            <div><dt>Version</dt><dd id="svId">${escapeHtml(
              current?.settings_version_id || "—"
            )}</dd></div>
            <div><dt>Hash</dt><dd class="mono">${escapeHtml(
              current?.content_hash || current?.settings_hash || "—"
            )}</dd></div>
            <div><dt>Versions listed</dt><dd>${escapeHtml(
              String(versions.length)
            )}</dd></div>
          </dl>
        </section>`;

      if (!mutateOk) {
        host.innerHTML = boundPanel;
        return;
      }

      let runs = [];
      try {
        runs = (await window.GekkoApi.fetchRuns(scope)).runs || [];
      } catch (_) {
        runs = [];
      }

      host.innerHTML = `
        ${boundPanel}
        <section class="panel" aria-label="Draft editor">
          <h2>Edit draft</h2>
          <p class="muted-line">Saving creates a new immutable version; binding is a separate command.</p>
          <form id="settingsDraftForm" class="settings-draft-form">
            <label>Opening balance <input name="opening_balance" type="number" value="${escapeHtml(String(p.opening_balance ?? 5000))}" /></label>
            <label>Risk % <input name="risk_per_trade_pct" type="number" step="0.1" value="${escapeHtml(String(p.risk_per_trade_pct ?? 0.5))}" /></label>
            <label>Max open <input name="max_open_positions" type="number" value="${escapeHtml(String(p.max_open_positions ?? 10))}" /></label>
            <label>Seed <input name="seed" type="number" value="${escapeHtml(String(p.seed ?? p.learning_seed ?? 42))}" /></label>
            <label>Symbols <input name="symbols" type="text" value="${escapeHtml((p.symbols || []).join(","))}" /></label>
            <label>Playbook <input name="playbook_key" type="text" value="${escapeHtml(p.playbook_key || "playbook1.1")}" /></label>
            <div class="btn-row">
              <button type="submit" class="btn" id="btnSaveSettings">Save new version</button>
              <button type="button" class="btn ghost" id="btnBindSettings">Bind version</button>
            </div>
          </form>
          <p id="setupStatus" class="muted-line" role="status"></p>
        </section>
        <section class="panel" aria-label="Copy prior settings">
          <h2>Copy prior Sim settings</h2>
          <label>Source run
            <select id="copySourceRun">
              ${runs
                .map(
                  (r) =>
                    `<option value="${escapeHtml(r.run_id)}">${escapeHtml(r.run_label || r.run_id)} · ${escapeHtml(r.status)}</option>`
                )
                .join("")}
            </select>
          </label>
          <fieldset class="copy-keys">
            <legend>Copy selected keys</legend>
            ${COPY_ALLOWLIST.map(
              (k) =>
                `<label><input type="checkbox" name="copyKey" value="${escapeHtml(k)}" checked /> ${escapeHtml(k)}</label>`
            ).join("")}
          </fieldset>
          <div class="btn-row">
            <button type="button" class="btn ghost" id="btnCopyAll">Copy all</button>
            <button type="button" class="btn ghost" id="btnCopySelected">Copy selected</button>
          </div>
        </section>`;

      wireSetupActions(scope, current, document.getElementById("setupStatus"));
    } catch (err) {
      window.GekkoDeskSurface.showError(errHost, err);
    }
  }

  function wireSetupActions(scope, current, statusEl) {
    document.getElementById("settingsDraftForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        ...payloadOf(current),
        opening_balance: Number(fd.get("opening_balance")),
        risk_per_trade_pct: Number(fd.get("risk_per_trade_pct")),
        max_open_positions: Number(fd.get("max_open_positions")),
        seed: Number(fd.get("seed")),
        learning_seed: Number(fd.get("seed")),
        symbols: String(fd.get("symbols") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        playbook_key: String(fd.get("playbook_key") || "playbook1.1"),
      };
      try {
        const id = await Cap().assertCommandIdentity();
        if (!id.ok) {
          statusLine(statusEl, id.detail, false);
          return;
        }
        const saved = await window.GekkoApi.saveSettingsVersion(scope, payload);
        statusLine(
          statusEl,
          `Saved ${saved.settings_version_id} · ${saved.content_hash || ""}`,
          true
        );
        const sv = document.getElementById("svId");
        if (sv) sv.textContent = saved.settings_version_id;
      } catch (err) {
        statusLine(statusEl, err.message || String(err), false);
      }
    });

    document.getElementById("btnBindSettings")?.addEventListener("click", async () => {
      try {
        const id = await Cap().assertCommandIdentity();
        if (!id.ok) {
          statusLine(statusEl, id.detail, false);
          return;
        }
        const version_id = document.getElementById("svId")?.textContent;
        const bound = await window.GekkoApi.bindSettingsVersion(scope, {
          settings_version_id: version_id,
        });
        statusLine(statusEl, `Bound ${bound.settings_version_id}`, true);
      } catch (err) {
        statusLine(statusEl, err.message || String(err), false);
      }
    });

    async function copy(mode) {
      try {
        const id = await Cap().assertCommandIdentity();
        if (!id.ok) {
          statusLine(statusEl, id.detail, false);
          return;
        }
        const source_run_id = document.getElementById("copySourceRun")?.value;
        const keys = [...document.querySelectorAll('input[name="copyKey"]:checked')].map(
          (el) => el.value
        );
        const saved = await window.GekkoApi.copySettingsVersion(scope, {
          mode,
          source_run_id,
          selected_keys: keys,
        });
        statusLine(
          statusEl,
          `Copied → ${saved.settings_version_id} (${(saved.copied_keys || []).length} keys)`,
          true
        );
        const sv = document.getElementById("svId");
        if (sv) sv.textContent = saved.settings_version_id;
      } catch (err) {
        statusLine(statusEl, err.message || String(err), false);
      }
    }
    document.getElementById("btnCopyAll")?.addEventListener("click", () => copy("all"));
    document
      .getElementById("btnCopySelected")
      ?.addEventListener("click", () => copy("selected"));
  }

  async function bootRunsPage() {
    const errHost = document.getElementById("pageError");
    const resolved = requireScope();
    if (resolved.error) {
      window.GekkoDeskSurface.showError(errHost, resolved.error);
      return;
    }
    const { scope } = resolved;
    renderGate(scope);
    const host = document.getElementById("runsBoard");
    const monitor = document.getElementById("runMonitor");
    const statusEl = document.getElementById("runsStatus");
    window.GekkoDeskSurface.hideError(errHost);
    setBanner(scope);
    // Demo/Live: do not call Sim-only /api/runs (hard 404 → #pageError).
    if (!Cap()?.hasSimRunLedger?.(scope)) {
      if (host) renderSimLedgerUnavailable(host, scope, "runs");
      if (monitor) monitor.hidden = true;
      return;
    }
    try {
      const data = await window.GekkoApi.fetchRuns(scope);
      setBanner(scope, data.playbook_key);
      const enabled = Cap()?.commandsEnabled(scope);
      const mutateOk = enabled && (await Cap()?.canMutate?.(scope));
      if (!host) return;
      const runs = data.runs || [];
      const resultsBase = window.GekkoScope.pathForScope(scope, "results");
      const compareBase = window.GekkoScope.pathForScope(scope, "compare");

      host.innerHTML = `
        ${
          mutateOk
            ? `<div class="btn-row run-commands">
          <button type="button" class="btn" id="btnStartRun">Start run</button>
          <button type="button" class="btn ghost" id="btnCancelRun">Cancel active</button>
          <button type="button" class="btn ghost" id="btnDeleteData">Delete data</button>
          <button type="button" class="btn ghost" id="btnDeleteHard">Delete data+results</button>
          <span class="muted-line">Idempotent start/cancel · delete modes · Super admin + control session</span>
        </div>`
            : enabled
              ? `<p class="muted-line">View only — start/cancel/delete controls are hidden.</p>`
              : `<p class="muted-line">Start/cancel/delete inert on this desk.</p>`
        }
        <div class="run-archive" id="runsArchive" role="list">
        ${
          runs.length
            ? runs
                .map((r) => {
                  const pnl = pnlFromRun(r);
                  const pnlDisplay =
                    pnl == null && TERMINAL_BAD.has(r.status) ? "—" : money(pnl, true);
                  const selectable = TERMINAL_OK.has(r.status);
                  const status = String(r.status || "unknown").toLowerCase();
                  return `<label class="run-archive-row status-${escapeHtml(status)}" role="listitem" data-run-id="${escapeHtml(r.run_id)}">
                    <input type="checkbox" class="runPick" value="${escapeHtml(r.run_id)}" data-compare="${selectable ? "1" : "0"}" ${selectable ? "" : "disabled"} />
                    <span class="run-archive-main">
                      <strong><a href="${escapeHtml(resultsBase)}?run_id=${encodeURIComponent(r.run_id)}">${escapeHtml(formatRunTime(r))}</a></strong>
                      <span class="muted-line mono">${escapeHtml(r.run_label || r.run_id)}</span>
                    </span>
                    <span class="status-badge status-${escapeHtml(status)}">${escapeHtml(r.status || "—")}</span>
                    <span class="run-archive-summary">${escapeHtml(r.playbook_key || data.playbook_key || "—")} · ${escapeHtml(pnlDisplay)}</span>
                    ${
                      r.status_reason
                        ? `<span class="is-bad run-archive-reason">${escapeHtml(r.status_reason)}</span>`
                        : ""
                    }
                  </label>`;
                })
                .join("")
            : `<p class="muted-line">No archived runs for this desk yet.</p>`
        }
        </div>
        <div class="btn-row">
          <a class="btn ghost is-disabled" id="btnOpenCompare" href="${escapeHtml(compareBase)}" aria-disabled="true">Compare selected (2–10)</a>
        </div>`;

      wireRunsCommands(scope, data, statusEl, monitor);
    } catch (err) {
      window.GekkoDeskSurface.showError(errHost, err);
    }
  }

  function selectedRunIds() {
    return [...document.querySelectorAll(".runPick:checked")].map((el) => el.value);
  }

  function wireRunsCommands(scope, data, statusEl, monitor) {
    const runs = data.runs || [];
    const active = runs.find((r) => ACTIVE.has(r.status));

    document.getElementById("btnStartRun")?.addEventListener("click", async () => {
      try {
        const run = await startRun(scope, {
          confirm: true,
          navigateToDesk: false,
          saveCurrentBoard: false,
        });
        statusLine(
          statusEl,
          `Accepted ${run.run_id} (${run.status}${run.created === false ? ", idempotent" : ""})`,
          true
        );
        startMonitor(scope, run.run_id, monitor);
      } catch (err) {
        if (err?.code === "cancelled") {
          statusLine(statusEl, "Cancelled.", false);
          return;
        }
        statusLine(statusEl, err.message || String(err), false);
      }
    });

    document.getElementById("btnCancelRun")?.addEventListener("click", async () => {
      try {
        const id = await Cap().assertCommandIdentity();
        if (!id.ok) {
          statusLine(statusEl, id.detail, false);
          return;
        }
        if (!active) {
          statusLine(statusEl, "No active run to cancel", false);
          return;
        }
        const run = await window.GekkoApi.cancelRun(scope, active.run_id);
        statusLine(
          statusEl,
          `Cancel → ${run.status}${run.changed === false ? " (idempotent)" : ""}`,
          true
        );
      } catch (err) {
        statusLine(statusEl, err.message || String(err), false);
      }
    });

    async function deleteSelected(mode) {
      try {
        const id = await Cap().assertCommandIdentity();
        if (!id.ok) {
          statusLine(statusEl, id.detail, false);
          return;
        }
        const run_ids = selectedRunIds();
        if (!run_ids.length) {
          statusLine(statusEl, "Select one or more runs to delete", false);
          return;
        }
        const result = await window.GekkoApi.deleteRuns(scope, { mode, run_ids });
        const n = (result.items || []).length;
        statusLine(statusEl, `Delete ${mode}: ${n} item(s)`, true);
        await bootRunsPage();
      } catch (err) {
        statusLine(statusEl, err.message || String(err), false);
      }
    }
    document
      .getElementById("btnDeleteData")
      ?.addEventListener("click", () => deleteSelected("data"));
    document
      .getElementById("btnDeleteHard")
      ?.addEventListener("click", () => deleteSelected("data_and_results"));

    const compareBase = window.GekkoScope.pathForScope(scope, "compare");
    const compareLink = document.getElementById("btnOpenCompare");
    const updateCompareLink = () => {
      const ids = [...document.querySelectorAll('.runPick:checked[data-compare="1"]')].map(
        (el) => el.value
      );
      if (!compareLink) return ids;
      const valid = ids.length >= 2 && ids.length <= 10;
      compareLink.classList.toggle("is-disabled", !valid);
      compareLink.setAttribute("aria-disabled", valid ? "false" : "true");
      compareLink.href = valid
        ? `${compareBase}?run_ids=${encodeURIComponent(ids.join(","))}`
        : compareBase;
      return ids;
    };
    document.querySelectorAll(".runPick").forEach((el) => {
      if (el.dataset.compareWired === "1") return;
      el.dataset.compareWired = "1";
      el.addEventListener("change", updateCompareLink);
    });
    updateCompareLink();

    compareLink?.addEventListener("click", (e) => {
      const ids = updateCompareLink();
      if (ids.length < 2 || ids.length > 10) {
        e.preventDefault();
        statusLine(statusEl, "Select 2–10 succeeded runs to compare", false);
        return;
      }
      e.preventDefault();
      location.assign(`${compareBase}?run_ids=${encodeURIComponent(ids.join(","))}`);
    });

    if (active) startMonitor(scope, active.run_id, monitor);
  }

  let _monitorStream = null;

  function startMonitor(scope, run_id, host) {
    if (!host) return;
    _monitorStream?.stop?.();
    host.hidden = false;
    host.innerHTML = `<h2>Durable monitor</h2>
      <p class="muted-line">run <span class="mono">${escapeHtml(run_id)}</span> · scope echoed on every event</p>
      <div class="metric-row" id="monitorMetrics"></div>
      <p id="monitorCursor" class="mono muted-line"></p>`;

    const apply = (row) => {
      if (!row) return;
      try {
        window.GekkoScope.assertScopeEcho(scope, row);
      } catch (err) {
        statusLine(document.getElementById("runsStatus"), err.message, false);
        return;
      }
      const label = window.GekkoScope.formatScopeLabel(scope);
      const payload = row.payload || {};
      document.getElementById("monitorMetrics").innerHTML = `
        <div class="metric"><span class="metric-label">Event</span><strong>${escapeHtml(
          row.event_type || "—"
        )}</strong><span class="scope-chip">${escapeHtml(label)}</span></div>
        <div class="metric"><span class="metric-label">Status</span><strong>${escapeHtml(
          payload.status || row.event_type || "—"
        )}</strong></div>
        <div class="metric"><span class="metric-label">Event time</span><strong class="mono">${escapeHtml(
          row.event_time || "—"
        )}</strong></div>
        <div class="metric"><span class="metric-label">Observed</span><strong class="mono">${escapeHtml(
          row.observed_at || "—"
        )}</strong></div>`;
      document.getElementById("monitorCursor").textContent =
        `cursor=${row.cursor || "—"} · event_id=${row.event_id ?? "—"}`;
    };

    _monitorStream = window.GekkoApi.subscribeRunEvents(scope, run_id, {
      pollIntervalMs: 4000,
      onEvent: apply,
      onError: (err) => {
        if (err?.code === "scope_echo_mismatch" || err?.http_status === 404) {
          statusLine(document.getElementById("runsStatus"), err.message, false);
        }
      },
    });
    _monitorStream?.start?.();
  }

  /**
   * Flatten greenfield run + metrics into the shape old Run Board expects
   * (top-level total_pnl, win_rate, period_*, etc.).
   */
  function normalizeRunForBoard(run) {
    if (!run) return null;
    const m = run.metrics && typeof run.metrics === "object" ? run.metrics : {};
    const total_pnl =
      m.total_pnl ?? m.realized_pnl ?? m.pnl ?? run.realized_pnl ?? null;
    const opening =
      m.opening_balance ?? run.opening_balance ?? m.start_balance ?? null;
    const closing =
      m.closing_balance ??
      m.equity ??
      (opening != null && total_pnl != null
        ? Number(opening) + Number(total_pnl)
        : null);
    return {
      ...run,
      ...m,
      run_id: run.run_id,
      run_label: run.run_label,
      status: run.status,
      status_reason: run.status_reason,
      seed: run.seed ?? m.seed,
      dataset_id: run.dataset_id ?? m.dataset_id,
      settings_version_id: run.settings_version_id,
      manifest_sha256: run.manifest_sha256,
      checkpoint_digest: run.checkpoint_digest,
      total_pnl,
      total_pnl_pct: m.total_pnl_pct ?? m.growth_pct ?? m.pnl_pct ?? null,
      win_rate: m.win_rate ?? null,
      max_drawdown_pct: m.max_drawdown_pct ?? m.max_dd_pct ?? null,
      total_trades:
        m.total_trades ??
        m.trades_closed ??
        m.closed_trades ??
        m.trade_count ??
        run.trades_closed ??
        null,
      opening_balance: opening,
      closing_balance: closing,
      bandit_pulls: m.bandit_pulls ?? m.pulls ?? null,
      period_start: m.period_start ?? run.started_at ?? run.created_at ?? null,
      period_end: m.period_end ?? run.completed_at ?? run.finished_at ?? null,
      started_at: run.started_at ?? run.created_at ?? null,
      finished_at: run.completed_at ?? run.finished_at ?? null,
      duration: m.duration ?? m.wall_seconds ?? null,
      wall_seconds: m.wall_seconds ?? null,
      lookback_days: m.lookback_days ?? run.lookback_days ?? null,
      settings: run.settings || m.settings || {},
      evidence: run.evidence || {},
    };
  }

  function renderEvidenceList(evidence) {
    const entries = Object.entries(evidence || {}).filter(
      ([, v]) => v != null && String(v).trim() !== ""
    );
    if (!entries.length) {
      return `<p class="muted-line">No artefact URIs on this run.</p>`;
    }
    return `<ul class="kv-list results-evidence-list">${entries
      .map(
        ([k, v]) =>
          `<li><span class="muted-line">${escapeHtml(k)}</span>
            <code class="mono">${escapeHtml(String(v))}</code></li>`
      )
      .join("")}</ul>`;
  }

  function renderLearningTable(learning) {
    const rows = Array.isArray(learning) ? learning : [];
    if (!rows.length) {
      return `<p class="muted-line">No learning events for this run.</p>`;
    }
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>When</th><th>Kind</th><th>Summary</th></tr></thead>
      <tbody>${rows
        .slice(0, 40)
        .map((row) => {
          const when =
            row.observed_at || row.event_time || row.ts || row.created_at || "—";
          const kind = row.event_type || row.kind || row.arm || "—";
          const summary =
            row.summary ||
            row.message ||
            row.note ||
            (row.payload ? JSON.stringify(row.payload) : "—");
          return `<tr>
            <td class="mono">${escapeHtml(String(when))}</td>
            <td>${escapeHtml(String(kind))}</td>
            <td>${escapeHtml(String(summary))}</td>
          </tr>`;
        })
        .join("")}</tbody></table></div>`;
  }

  function setOpsStatus(msg, ok) {
    const el = document.getElementById("resultsOpsStatus");
    if (!el) return;
    el.hidden = !msg;
    el.classList.toggle("is-ok", !!ok);
    el.classList.toggle("is-bad", ok === false);
    // GST-102 — turn Admin → Keys unlock lines into a clickable link.
    if (
      msg &&
      window.GekkoOperator?.applyStatusMessage &&
      window.GekkoOperator.looksLikeOperatorSessionMessage?.(msg)
    ) {
      window.GekkoOperator.applyStatusMessage(el, msg);
      return;
    }
    el.textContent = msg || "";
  }

  function hiddenRunsStorageKey(scope) {
    const key = scope?.scope_key || `${scope?.execution_env || ""}|${scope?.lane || ""}`;
    return `gekko.results.hidden.${key}`;
  }

  function loadHiddenRunIds(scope) {
    try {
      const raw = localStorage.getItem(hiddenRunsStorageKey(scope));
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function persistHiddenRunIds(scope, set) {
    try {
      localStorage.setItem(
        hiddenRunsStorageKey(scope),
        JSON.stringify([...set])
      );
    } catch (_) {
      /* ignore quota */
    }
  }

  function demoScopeFor(scope) {
    return {
      execution_env: "demo",
      lane: scope.lane,
      scope_key: `demo|${scope.lane}`,
    };
  }

  function settingsBlobFromRun(run) {
    const Board = window.GekkoRunBoard;
    if (Board?.settingsBlobFromRun) return Board.settingsBlobFromRun(run) || {};
    const s = run?.settings;
    if (s && typeof s === "object") return { ...s };
    return { ...(run || {}) };
  }

  /**
   * Parity Plus Start Run (old Backtest Results).
   * Queues a retained Sim research job from the bound Current settings,
   * then opens the Desk. Demo/Live do not use the Sim Batch ledger.
   *
   * @param {object} scope
   * @param {{
   *   confirm?: boolean,
   *   navigateToDesk?: boolean,
   *   saveCurrentBoard?: boolean,
   *   currentSettings?: object,
   *   idempotency_key?: string,
   * }} [opts]
   */
  async function startRun(scope, opts = {}) {
    if (!scope || !Cap()?.hasSimRunLedger?.(scope)) {
      const err = new Error(
        "Start Run queues a Sim research job on this desk. Demo/Live trading is not started from this control."
      );
      err.code = "sim_ledger_required";
      throw err;
    }
    const id = await Cap().assertCommandIdentity();
    if (!id.ok) {
      const err = new Error(id.detail || "Not authorised to start a run");
      err.code = "identity";
      err.status = id.status;
      throw err;
    }

    const label =
      window.GekkoScope?.formatScopeLabel?.(scope) ||
      `Sim ${String(scope.lane || "").toUpperCase()}`;
    if (opts.confirm !== false) {
      const ok = confirm(
        `Start Run for ${label}?\n\nQueues a research job from the bound Current settings, then opens the Desk.`
      );
      if (!ok) {
        const err = new Error("Cancelled.");
        err.code = "cancelled";
        throw err;
      }
    }

    let justBoundId = null;
    if (opts.saveCurrentBoard) {
      const Board = window.GekkoRunBoard;
      const boardRoot =
        document.getElementById("resultsBoardRoot") ||
        document.getElementById("resultsSummary");
      if (Board?.readEditableCurrent && boardRoot) {
        const patch = {
          ...(opts.currentSettings || {}),
          ...Board.readEditableCurrent(boardRoot),
        };
        if (Object.keys(patch).length) {
          const saved = await window.GekkoApi.saveSettingsVersion(scope, patch);
          if (saved?.settings_version_id) {
            const bound = await window.GekkoApi.bindSettingsVersion(scope, {
              settings_version_id: saved.settings_version_id,
            });
            justBoundId = String(
              bound?.settings_version_id || saved.settings_version_id
            );
          }
        }
      }
    }

    const settings = await window.GekkoApi.fetchSettingsVersions(scope);
    // GST-99 — if list omits active_binding (stale Control), use the bind we just did.
    if (!settings.active_binding?.settings_version_id && justBoundId) {
      settings.active_binding = { settings_version_id: justBoundId };
    }
    const body = buildStartRunBody(settings, {
      idempotency_key: opts.idempotency_key,
    });
    let run;
    try {
      run = await window.GekkoApi.startRun(scope, body);
    } catch (err) {
      // GST-106 — one-active-writer: send the operator to Cancel, not Keys.
      if (err?.status === 409 || /active run|active writer/i.test(err?.message || "")) {
        const runsHref = window.GekkoScope?.pathForScope?.(scope, "runs") || "./runs/";
        const detail =
          err?.message ||
          "This Sim desk already has a run in progress.";
        const wrapped = new Error(
          `${detail}\n\nOpen Runs and Cancel the active run, or wait for it to finish: ${runsHref}`
        );
        wrapped.status = 409;
        wrapped.code = "active_writer";
        wrapped.runsHref = runsHref;
        throw wrapped;
      }
      throw err;
    }

    if (opts.navigateToDesk !== false && typeof location !== "undefined") {
      const deskHref = window.GekkoScope.pathForScope(scope, "");
      const q = run?.run_id
        ? `?started=${encodeURIComponent(run.run_id)}`
        : "";
      location.assign(`${deskHref}${q}`);
    }
    return run;
  }

  function mountResultsActions(scope, ctx) {
    const host = document.getElementById("resultsRunControl");
    if (!host) return;
    const reportsHref = window.GekkoScope.pathForScope(scope, "runs");
    const deskHref = window.GekkoScope.pathForScope(scope, "");
    const strategyHref = window.GekkoScope.pathForScope(scope, "setup");
    const demoHref = window.GekkoScope.pathForScope(demoScopeFor(scope), "results");
    const mutateOk = !!ctx?.mutateOk;
    const canStart = Cap()?.hasSimRunLedger?.(scope);
    const runs = Array.isArray(ctx?.runs) ? ctx.runs : [];
    const runOptions = runs
      .map((run, idx) => {
        const when = formatRunTime(run);
        const label = `Run${idx + 1} · ${when}`;
        return `<option value="${escapeHtml(run.run_id)}">${escapeHtml(label)}</option>`;
      })
      .join("");

    const promoteHtml = mutateOk
      ? `<div class="run-control-group" role="group" aria-label="Promote to Demo">
          <span class="run-control-group-label">Current · Promote to Demo</span>
          <div class="run-control-actions run-control-promote-demo">
            <select class="mono run-control-select" id="promoteSource" aria-label="Source for Demo">
              <option value="current" selected>Current</option>
              ${runOptions}
            </select>
            <button type="button" class="btn ghost btn-compact" id="btnCopyToDemo" title="Save and bind the selected source onto Demo">Copy to Demo</button>
            <button type="button" class="btn btn-compact" id="btnGoToDemo" title="Save and bind, then open Demo Results">Go To Demo</button>
          </div>
        </div>`
      : `<div class="run-control-group" role="group" aria-label="Promote to Demo">
          <span class="run-control-group-label">Promote to Demo</span>
          <p class="muted-line">Super-admin + operator unlock required to copy Sim settings onto Demo.</p>
        </div>`;

    const startBtn = canStart
      ? `<button type="button" class="btn btn-compact" id="btnResultsStartRun" title="Queue a research job from bound Current settings, then open the Desk">Start Run</button>`
      : "";

    host.innerHTML = `
      <div class="run-control run-control-compact" data-run-control="sim">
        <div class="run-control-grid run-control-chain">
          <div class="run-control-group" role="group" aria-label="Desk book">
            <span class="run-control-group-label">Desk book</span>
            <div class="run-control-actions">
              <button type="button" class="btn ghost btn-compact" id="btnResultsResetDesk" disabled title="Reset Desk is not available from this view yet">Reset Desk</button>
              ${startBtn}
              <a class="btn ghost btn-compact" href="${escapeHtml(deskHref)}">Desk</a>
              <a class="btn ghost btn-compact" href="${escapeHtml(strategyHref)}">Strategy</a>
              <a class="btn ghost btn-compact" href="${escapeHtml(reportsHref)}">Reports</a>
              <a class="btn ghost btn-compact" href="${escapeHtml(demoHref)}">Demo Results</a>
            </div>
          </div>
          ${promoteHtml}
        </div>
      </div>`;

    document
      .getElementById("btnResultsStartRun")
      ?.addEventListener("click", async () => {
        try {
          setOpsStatus("Starting run from Current settings…");
          await startRun(scope, {
            saveCurrentBoard: !!mutateOk,
            currentSettings: ctx?.currentSettings || {},
            navigateToDesk: true,
            confirm: true,
          });
          setOpsStatus("Run accepted · opening Desk…", true);
        } catch (err) {
          if (err?.code === "cancelled") {
            setOpsStatus("Cancelled.", false);
            return;
          }
          setOpsStatus(err.message || "Start Run failed", false);
        }
      });

    if (!mutateOk) return;

    const copyToDemo = async (navigate) => {
      const source = String(
        document.getElementById("promoteSource")?.value || "current"
      ).trim() || "current";
      const Board = window.GekkoRunBoard;
      const boardRoot =
        document.getElementById("resultsBoardRoot") ||
        document.getElementById("resultsSummary");
      try {
        const id = await Cap().assertCommandIdentity();
        if (!id.ok) {
          setOpsStatus(id.detail, false);
          return;
        }
        let patch;
        if (source === "current") {
          patch = {
            ...(ctx.currentSettings || {}),
            ...(Board?.readEditableCurrent?.(boardRoot) || {}),
          };
        } else {
          const run = runs.find((r) => r.run_id === source);
          if (!run) {
            setOpsStatus("Pick a finished run first.", false);
            return;
          }
          patch = settingsBlobFromRun(run);
        }
        // Preserve identity fields required by greenfield bind when present.
        if (!patch.dataset_id && ctx.currentSettings?.dataset_id) {
          patch.dataset_id = ctx.currentSettings.dataset_id;
        }
        if (!patch.manifest_sha256 && ctx.currentSettings?.manifest_sha256) {
          patch.manifest_sha256 = ctx.currentSettings.manifest_sha256;
        }
        if (
          !confirm(
            `${navigate ? "Go To Demo" : "Copy to Demo"} from ${
              source === "current" ? "Current" : source
            }?\n\nSaves a new Demo settings version and binds it on Demo ${String(
              scope.lane || ""
            ).toUpperCase()}. Does not activate Live.`
          )
        ) {
          setOpsStatus("Cancelled.", false);
          return;
        }
        setOpsStatus(
          `${navigate ? "Hydrating Demo from" : "Copying"} ${source} → Demo…`
        );
        const demo = demoScopeFor(scope);
        // GST-113/124 — Sim-only /api/settings-versions rejects demo|a. Copy
        // through the dedicated Control DEFINER path that binds Demo L1.
        if (typeof window.GekkoApi?.copySettingsToDemo !== "function") {
          throw new Error(
            "Copy to Demo needs a fresh page load (missing API helper). Hard-refresh Sim Results and try again."
          );
        }
        const saved = await window.GekkoApi.copySettingsToDemo(scope, patch, {
          source_run_id: source === "current" ? null : source,
        });
        const version_id = saved.settings_version_id || saved.version_id;
        const demoKey =
          saved.target_scope_key ||
          saved.desk_id ||
          `demo|${scope.lane || "a"}`;
        const note = `Demo bound · ${demoKey} · version=${version_id || "—"}. Restart Demo worker if knobs do not hydrate.`;
        if (navigate) {
          setOpsStatus(`${note} Opening Demo Results…`, true);
          location.assign(
            `${window.GekkoScope.pathForScope(demo, "results")}?hydrated=1&from=${encodeURIComponent(source)}`
          );
          return;
        }
        setOpsStatus(note, true);
      } catch (err) {
        setOpsStatus(err.message || "Copy to Demo failed", false);
      }
    };

    document
      .getElementById("btnCopyToDemo")
      ?.addEventListener("click", () => void copyToDemo(false));
    document
      .getElementById("btnGoToDemo")
      ?.addEventListener("click", () => void copyToDemo(true));
  }

  async function bootResultsPage() {
    const errHost = document.getElementById("pageError");
    const resolved = requireScope();
    if (resolved.error) {
      window.GekkoDeskSurface.showError(errHost, resolved.error);
      return;
    }
    const { scope } = resolved;
    renderGate(scope);
    const boardRoot =
      document.getElementById("resultsBoardRoot") ||
      document.getElementById("resultsSummary");
    const detailHost = document.getElementById("resultsDetail");
    const statusEl = document.getElementById("resultsStatus");
    if (!boardRoot) return;
    window.GekkoDeskSurface.hideError(errHost);
    setBanner(scope);
    // Demo/Live: soft empty state — never hit Sim-only /api/runs.
    if (!Cap()?.hasSimRunLedger?.(scope)) {
      mountResultsActions(scope, { mutateOk: false, runs: [] });
      renderSimLedgerUnavailable(boardRoot, scope, "results");
      if (detailHost) detailHost.innerHTML = "";
      if (statusEl) statusEl.textContent = "Not on this desk";
      return;
    }
    const Board = window.GekkoRunBoard;
    if (!Board?.paint) {
      boardRoot.innerHTML =
        `<p class="is-bad">Run Board failed to load (run-board.js missing).</p>`;
      return;
    }

    let currentSettings = {};
    let baselineSettings = {};
    let hydrated = [];
    let mutateOk = false;
    const PAGE_SIZE = 5;
    let listOffset = 0;
    let listTotal = 0;
    let listHasMore = false;
    let listPlaybookKey = null;
    let fetchedAll = false;

    async function loadCurrentSettings() {
      try {
        const data = await window.GekkoApi.fetchSettingsVersions(scope);
        const versions = data.versions || [];
        const activeId =
          data.active_binding?.settings_version_id != null
            ? String(data.active_binding.settings_version_id)
            : "";
        const current =
          versions.find((v) => String(v.settings_version_id) === activeId) ||
          versions[0];
        return payloadOf(current);
      } catch (_) {
        return {};
      }
    }

    function visibleHydrated() {
      const hidden = loadHiddenRunIds(scope);
      return hydrated.filter((r) => r && !hidden.has(String(r.run_id)));
    }

    function ensurePagerHost() {
      let pager = document.getElementById("resultsBoardPager");
      if (pager) return pager;
      pager = document.createElement("div");
      pager.id = "resultsBoardPager";
      pager.className = "run-control-actions results-board-pager";
      pager.setAttribute("aria-label", "Run board paging");
      // Sit next to the "Run Board" heading (not under the table).
      const heading = document.querySelector(
        '.results-board-part[data-part="board"] .results-board-part-heading'
      );
      const titleCopy = heading?.querySelector(".panel-heading-copy");
      if (titleCopy) {
        titleCopy.appendChild(pager);
      } else if (heading) {
        const status = heading.querySelector("#resultsStatus");
        if (status) heading.insertBefore(pager, status);
        else heading.appendChild(pager);
      } else {
        boardRoot.insertAdjacentElement("beforebegin", pager);
      }
      return pager;
    }

    function renderPager() {
      const pager = ensurePagerHost();
      const shown = visibleHydrated().length;
      const countLabel = listTotal
        ? `Showing ${shown} of ${listTotal} run${listTotal === 1 ? "" : "s"}.`
        : "";
      if (fetchedAll || !listHasMore) {
        pager.innerHTML = countLabel
          ? `<span class="muted-line results-board-pager-count">${countLabel}</span>`
          : "";
        return;
      }
      pager.innerHTML = `
        <span class="muted-line results-board-pager-count">${countLabel}</span>
        <button type="button" class="btn ghost btn-compact" id="btnResultsNext5">Next 5</button>
        <button type="button" class="btn ghost btn-compact" id="btnResultsFetchAll">Fetch all</button>
      `;
      pager.querySelector("#btnResultsNext5")?.addEventListener("click", () => {
        void loadMoreRuns({ mode: "next" });
      });
      pager.querySelector("#btnResultsFetchAll")?.addEventListener("click", () => {
        void loadMoreRuns({ mode: "all" });
      });
    }

    async function ingestRunPage(list, { append }) {
      const rawRuns = Array.isArray(list.runs) ? list.runs : [];
      const pageLen = rawRuns.length;
      const reportedTotal = Number(list.total);
      if (Number.isFinite(reportedTotal) && reportedTotal >= 0) {
        listTotal = reportedTotal;
        listHasMore = !!list.has_more;
      } else {
        // Legacy Control (no limit/offset yet): one full list response.
        listTotal = append ? hydrated.length + pageLen : pageLen;
        listHasMore = false;
      }
      listPlaybookKey = list.playbook_key || listPlaybookKey;
      listOffset =
        Number.isFinite(Number(list.offset))
          ? Number(list.offset) + pageLen
          : listOffset + pageLen;
      // Paint from the list payload — no per-run re-fetch.
      const page = rawRuns.map((row) => normalizeRunForBoard(row));
      if (append) {
        const seen = new Set(hydrated.map((r) => String(r.run_id)));
        for (const row of page) {
          if (!seen.has(String(row.run_id))) hydrated.push(row);
        }
      } else {
        hydrated = page;
      }
    }

    async function loadMoreRuns({ mode }) {
      try {
        if (statusEl) statusEl.textContent = mode === "all" ? "Loading all runs…" : "Loading next 5…";
        if (mode === "all") {
          const list = await window.GekkoApi.fetchRuns(scope);
          await ingestRunPage(list, { append: false });
          fetchedAll = true;
          listHasMore = false;
        } else {
          const list = await window.GekkoApi.fetchRuns(scope, {
            limit: PAGE_SIZE,
            offset: listOffset,
          });
          await ingestRunPage(list, { append: true });
        }
        setBanner(scope, listPlaybookKey);
        mountResultsActions(scope, {
          mutateOk,
          runs: visibleHydrated(),
          currentSettings,
        });
        await paintBoard();
        renderPager();
        const shown = visibleHydrated();
        if (statusEl) {
          statusEl.textContent = shown.length
            ? `${shown.length} run${shown.length === 1 ? "" : "s"} on board · ${listTotal} total`
            : "No runs yet — start one from Reports";
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message || "Could not load more runs";
      }
    }

    async function paintBoard() {
      const product = scope.lane === "b" ? "v2" : "v1";
      const shown = visibleHydrated();
      const paintOpts = {
        mode: mutateOk ? "unified" : "results",
        editable: mutateOk,
        product,
        currentSettings,
        results: shown,
        currentIsNext: true,
        onHide: (run) => {
          if (!run?.run_id) return;
          const label = Board.runLabel?.(run) || run.run_id;
          if (
            !confirm(
              `Hide ${label} from Results?\n\nSoft-hide only on this browser — artefacts stay in storage.`
            )
          ) {
            return;
          }
          const set = loadHiddenRunIds(scope);
          set.add(String(run.run_id));
          persistHiddenRunIds(scope, set);
          setOpsStatus(`Hidden ${label} from the Results board.`, true);
          paintBoard();
        },
        onApplyRecommendations: async (run) => {
          if (!run?.run_id) return;
          setOpsStatus("Loading tips…");
          let learning = [];
          try {
            const lr = await window.GekkoApi.fetchRunLearning(scope, run.run_id);
            learning = lr.items || lr.learning || [];
          } catch (_) {
            learning = run.learning || [];
          }
          const tips = (Array.isArray(learning) ? learning : []).slice(0, 12).map(
            (row, i) => ({
              id: String(row.id || `learn-${i}`),
              title: String(row.event_type || row.kind || row.arm || "Learning"),
              detail: String(
                row.summary ||
                  row.message ||
                  row.note ||
                  (row.payload ? JSON.stringify(row.payload) : "—")
              ),
              severity: "medium",
              apply: { kind: "advisory" },
            })
          );
          Board.showRecommendations?.(boardRoot, {
            run,
            tips,
            statusHtml: `<div class="run-board-recs-actions">
              <p class="muted-line">Read-only Analyze on greenfield — use Copy All into Current, then Save. Apply-to-L1 tips remain on the legacy desk APIs only.</p>
              <p class="page-intro-actions">
                <button type="button" class="btn ghost" id="boardCopyFromRecs">Copy to Current</button>
              </p>
            </div>`,
          });
          document
            .getElementById("boardCopyFromRecs")
            ?.addEventListener("click", () => {
              const blob = settingsBlobFromRun(run);
              currentSettings = { ...currentSettings, ...blob };
              Board.fillEditableCurrent?.(boardRoot, currentSettings);
              setOpsStatus(
                `Copied settings from ${Board.runLabel?.(run) || run.run_id} into Current. Review and Save.`,
                true
              );
              Board.closeRecommendations?.();
            });
          setOpsStatus(
            `Analyzed ${Board.runLabel?.(run) || run.run_id} — ${tips.length} tip(s).`,
            true
          );
        },
      };

      if (mutateOk) {
        paintOpts.onCopy = (run) => {
          const blob = settingsBlobFromRun(run);
          currentSettings = { ...currentSettings, ...blob };
          Board.fillEditableCurrent?.(boardRoot, currentSettings);
          setOpsStatus(
            `Copied all settings from ${Board.runLabel?.(run) || run.run_id} into Current. Review and Save.`,
            true
          );
        };
        paintOpts.onCopyKey = (run, key) => {
          const blob = settingsBlobFromRun(run);
          const value =
            blob[key] ?? Board.settingValue?.(blob, key);
          if (value == null || value === "") {
            setOpsStatus(`No value for ${key} on that run.`, false);
            return;
          }
          const input = boardRoot.querySelector(
            `.run-board-input[name="${CSS.escape(key)}"]`
          );
          if (input) {
            input.value = String(value);
          } else {
            currentSettings = { ...currentSettings, [key]: value };
            Board.fillEditableCurrent?.(boardRoot, currentSettings);
          }
          setOpsStatus(
            `Copied ${key} into Current. Review and Save.`,
            true
          );
        };
        paintOpts.onSaveCurrent = async () => {
          try {
            const id = await Cap().assertCommandIdentity();
            if (!id.ok) {
              setOpsStatus(id.detail, false);
              return;
            }
            const patch = {
              ...currentSettings,
              ...(Board.readEditableCurrent?.(boardRoot) || {}),
            };
            setOpsStatus("Saving Current knobs…");
            const saved = await window.GekkoApi.saveSettingsVersion(scope, patch);
            if (saved.settings_version_id) {
              await window.GekkoApi.bindSettingsVersion(scope, {
                settings_version_id: saved.settings_version_id,
              });
            }
            currentSettings = patch;
            baselineSettings = { ...patch };
            setOpsStatus(
              `Saved and bound ${saved.settings_version_id || "version"}.`,
              true
            );
          } catch (err) {
            setOpsStatus(err.message || "Save failed", false);
          }
        };
        paintOpts.onRevertCurrent = () => {
          currentSettings = { ...baselineSettings };
          Board.fillEditableCurrent?.(boardRoot, currentSettings);
          setOpsStatus("Reverted Current edits.", true);
        };
      }

      Board.paint(boardRoot, paintOpts);
      Board.alignBoardColumns?.(boardRoot);
    }

    try {
      if (statusEl) statusEl.textContent = "Loading…";
      // GST-105 — greenfield writes use admin login alone. Best-effort remint
      // of a legacy control token must never paint a Keys / secret error.
      if (window.GekkoOperator?.ensureWriteSession) {
        try {
          await window.GekkoOperator.ensureWriteSession({
            force: !window.GekkoOperator.getSessionToken?.(),
          });
        } catch (_) {
          /* ignore — assertCommandIdentity / server authorize via admin login */
        }
      }
      mutateOk = !!(await Cap()?.canMutate?.(scope));
      currentSettings = await loadCurrentSettings();
      baselineSettings = { ...currentSettings };

      const list = await window.GekkoApi.fetchRuns(scope, {
        limit: PAGE_SIZE,
        offset: 0,
      });
      listOffset = 0;
      fetchedAll = false;
      await ingestRunPage(list, { append: false });

      setBanner(scope, listPlaybookKey);
      mountResultsActions(scope, {
        mutateOk,
        runs: visibleHydrated(),
        currentSettings,
      });
      await paintBoard();
      renderPager();

      const shown = visibleHydrated();
      const n = shown.length;
      if (statusEl) {
        statusEl.textContent = n
          ? `${n} run${n === 1 ? "" : "s"} on board · ${listTotal} total · Current = next${
              mutateOk ? " · Save / Copy / Hide / Analyze wired" : ""
            }`
          : "No finished runs yet — start one from Reports";
      }

      const focusId =
        new URLSearchParams(location.search).get("run_id") ||
        shown[0]?.run_id;
      const focus =
        shown.find((r) => r.run_id === focusId) || shown[0] || null;
      if (detailHost) {
        if (!focus) {
          detailHost.innerHTML = `<p class="muted-line">No run selected.</p>`;
        } else {
          let learning = [];
          try {
            const lr = await window.GekkoApi.fetchRunLearning(
              scope,
              focus.run_id
            );
            learning = lr.items || lr.learning || [];
          } catch (_) {
            learning = focus.learning || [];
          }
          const label = window.GekkoScope.formatScopeLabel(
            scope,
            listPlaybookKey
          );
          detailHost.innerHTML = `
            <div class="results-board-part-heading">
              <div class="panel-heading-copy">
                <h2>Selected run</h2>
              </div>
              <p class="section-copy muted-line">
                <span class="scope-chip">${escapeHtml(label)}</span>
                ${escapeHtml(focus.run_label || focus.run_id)} · ${escapeHtml(
                  focus.status || "—"
                )}
              </p>
            </div>
            <div class="results-selected-run-metrics">
              <div class="metric"><span class="metric-label">$ PnL</span><strong>${escapeHtml(
                money(focus.total_pnl, true)
              )}</strong></div>
              <div class="metric"><span class="metric-label">Seed</span><strong>${escapeHtml(
                String(focus.seed ?? "—")
              )}</strong></div>
              <div class="metric"><span class="metric-label">Dataset</span><strong>${escapeHtml(
                String(focus.dataset_id ?? "—")
              )}</strong></div>
              <div class="metric"><span class="metric-label">Trades</span><strong>${escapeHtml(
                String(focus.total_trades ?? "—")
              )}</strong></div>
            </div>
            <h3>Identities</h3>
            <dl class="kv-list">
              <div><dt>Settings</dt><dd class="mono">${escapeHtml(
                focus.settings_version_id || "—"
              )}</dd></div>
              <div><dt>Manifest</dt><dd class="mono">${escapeHtml(
                focus.manifest_sha256 || "—"
              )}</dd></div>
              <div><dt>Checkpoint</dt><dd class="mono">${escapeHtml(
                focus.checkpoint_digest || "—"
              )}</dd></div>
            </dl>
            <h3>Artefacts</h3>
            ${renderEvidenceList(focus.evidence)}
            ${
              TERMINAL_BAD.has(String(focus.status || "").toLowerCase()) &&
              focus.metrics == null
                ? `<p class="is-bad">No result metrics (failed/cancelled — never faked as zero PnL).</p>`
                : ""
            }
            <h3>Learning</h3>
            ${renderLearningTable(learning)}`;
        }
      }
    } catch (err) {
      window.GekkoDeskSurface.showError(errHost, err);
      if (statusEl) {
        statusEl.textContent = window.GekkoDeskSurface.isAuthRequiredError?.(err)
          ? "Sign in required"
          : "Failed";
      }
    }
  }

  async function bootComparePage() {
    const errHost = document.getElementById("pageError");
    const resolved = requireScope();
    if (resolved.error) {
      window.GekkoDeskSurface.showError(errHost, resolved.error);
      return;
    }
    const { scope } = resolved;
    renderGate(scope);
    const host = document.getElementById("compareRoot");
    if (!host) return;
    if (!Cap()?.isSimActive?.(scope) && !Cap()?.isSimLaneA(scope)) {
      host.innerHTML = `<p class="muted-line">Compare is available for Sim desk succeeded runs only.</p>`;
      return;
    }
    try {
      window.GekkoDeskSurface.hideError(errHost);
      const params = new URLSearchParams(location.search);
      let ids = (params.get("run_ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!ids.length) {
        const list = await window.GekkoApi.fetchRuns(scope);
        ids = (list.runs || [])
          .filter((r) => TERMINAL_OK.has(r.status))
          .slice(0, 3)
          .map((r) => r.run_id);
      }
      setBanner(scope);
      if (ids.length < 2 || ids.length > 10) {
        host.innerHTML = `<p class="muted-line">Select 2–10 succeeded Sim A runs (got ${ids.length}).</p>`;
        return;
      }
      const data = await window.GekkoApi.compareRuns(scope, ids);
      const label = window.GekkoScope.formatScopeLabel(scope);
      const rows = data.rows || data.runs || [];
      host.innerHTML = `
        <p class="scope-chip scope-banner">${escapeHtml(label)}</p>
        <p class="muted-line">Changed settings keys: ${escapeHtml(
          (data.changed_settings_keys || []).join(", ") || "—"
        )}</p>
        <table class="data-table"><thead><tr>
          <th>Run</th><th>Status</th><th>PnL</th><th>Settings</th><th>Evidence</th><th>Warnings</th>
        </tr></thead><tbody>
        ${rows
          .map((r) => {
            const pnl =
              r.metrics?.total_pnl ?? r.metrics?.realized_pnl ?? r.realized_pnl;
            return `<tr>
            <td>${escapeHtml(r.run_label || r.run_id)}</td>
            <td>${escapeHtml(r.status || "—")}</td>
            <td>${escapeHtml(money(pnl, true))} <span class="scope-chip">${escapeHtml(
              label
            )}</span></td>
            <td class="mono">${escapeHtml((r.settings_version_id || "").slice(0, 18))}</td>
            <td class="mono">${escapeHtml(
              r.trade_timeline_uri || r.equity_uri || "—"
            )}</td>
            <td>${escapeHtml((r.evidence_warnings || r.artefact_warnings || []).join(", ") || "—")}</td>
          </tr>`;
          })
          .join("")}
        </tbody></table>`;
    } catch (err) {
      window.GekkoDeskSurface.showError(errHost, err);
    }
  }

  const api = {
    bootSetup,
    bootRunsPage,
    bootResultsPage,
    bootComparePage,
    startRun,
    startMonitor,
    buildStartRunBody,
    payloadOf,
  };

  if (root) root.GekkoSimExecution = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
