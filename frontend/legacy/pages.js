/**
 * Page bootstraps for greenfield read surfaces.
 * Skeleton only — contract-correct wiring, not a full feature port.
 */
(function () {
  "use strict";

  function escapeHtml(v) {
    return window.GekkoUi?.escapeHtml?.(v) ?? String(v ?? "");
  }

  function pageKind() {
    return document.body.dataset.page || "";
  }

  function orderedDesks(desks) {
    const sort = window.GekkoNavigationConfig?.sortDesksByOperationalOrder;
    return sort ? sort(desks || []) : [...(desks || [])];
  }

  async function bootOverview() {
    const grid = document.getElementById("overviewGrid");
    const errHost = document.getElementById("pageError");
    try {
      window.GekkoDeskSurface?.hideError?.(errHost);
      const data = await window.GekkoApi.fetchOverview();
      const desks = orderedDesks(data?.desks);
      if (!grid) return;
      grid.innerHTML = desks
        .map((d) => {
          const scope = {
            execution_env: d.execution_env,
            lane: d.lane,
            scope_key: d.scope_key,
          };
          const href = window.GekkoScope.pathForScope(scope);
          const label = window.GekkoScope.formatScopeLabel(scope, d.playbook_key);
          const pnl = window.GekkoUi.formatMoney(d.realized_pnl, { cents: true, signed: true });
          const equity = window.GekkoUi.formatMoney(d.equity, { cents: true });
          return `<article class="panel desk-tile" data-href="${escapeHtml(href)}">
            <h2>${escapeHtml(label)}</h2>
            <p class="muted-line">${escapeHtml(d.runtime_status || "—")}</p>
            <div class="metric-row">
              <div class="metric">
                <span class="metric-label">Equity</span>
                <strong class="metric-value">${escapeHtml(equity)}</strong>
                <span class="scope-chip" data-scope-chip>${escapeHtml(label)}</span>
              </div>
              <div class="metric">
                <span class="metric-label">$ PnL</span>
                <strong class="metric-value">${escapeHtml(pnl)}</strong>
                <span class="scope-chip" data-scope-chip>${escapeHtml(label)}</span>
              </div>
              <div class="metric">
                <span class="metric-label">Open</span>
                <strong class="metric-value">${escapeHtml(String(d.open_positions ?? "—"))}</strong>
                <span class="scope-chip" data-scope-chip>${escapeHtml(label)}</span>
              </div>
            </div>
            <p class="setup-links"><a href="${escapeHtml(href)}">Open desk →</a></p>
          </article>`;
        })
        .join("");
      window.GekkoShell?.wireClickableCards?.(grid);
    } catch (err) {
      window.GekkoDeskSurface?.showError?.(errHost, err);
    }
  }

  async function bootStatus() {
    const errHost = document.getElementById("pageError");
    const list = document.getElementById("statusList");
    try {
      window.GekkoDeskSurface?.hideError?.(errHost);
      const data = await window.GekkoApi.fetchOverview();
      const desks = orderedDesks(data?.desks);
      if (!list) return;
      list.innerHTML = `<table class="data-table"><thead><tr>
        <th>Scope</th><th>Playbook</th><th>Runtime</th><th>Equity</th><th>PnL</th><th>Open</th>
      </tr></thead><tbody>
      ${desks
        .map((d) => {
          const scope = {
            execution_env: d.execution_env,
            lane: d.lane,
            scope_key: d.scope_key,
          };
          const label = window.GekkoScope.formatScopeLabel(scope, d.playbook_key);
          return `<tr>
            <td><span class="scope-chip">${escapeHtml(label)}</span></td>
            <td>${escapeHtml(d.playbook_key || "—")}</td>
            <td>${escapeHtml(d.runtime_status || "—")}</td>
            <td>${escapeHtml(window.GekkoUi.formatMoney(d.equity, { cents: true }))}
              <span class="scope-chip">${escapeHtml(label)}</span></td>
            <td>${escapeHtml(window.GekkoUi.formatMoney(d.realized_pnl, { cents: true, signed: true }))}
              <span class="scope-chip">${escapeHtml(label)}</span></td>
            <td>${escapeHtml(String(d.open_positions ?? "—"))}
              <span class="scope-chip">${escapeHtml(label)}</span></td>
          </tr>`;
        })
        .join("")}
      </tbody></table>`;
    } catch (err) {
      window.GekkoDeskSurface?.showError?.(errHost, err);
    }
  }

  function renderGateBanner(scope) {
    window.GekkoSimCapability?.renderGateBanner?.("gateBanner", scope);
  }

  function emptyDeskPayload(scope, gate) {
    return {
      execution_env: scope?.execution_env,
      lane: scope?.lane,
      scope_key: scope?.scope_key,
      runtime_status: gate?.state || "unavailable",
      opening_balance: null,
      equity: null,
      balance: null,
      realized_pnl: null,
      lifetime_pnl: null,
      unrealized_pnl: null,
      open_positions: null,
      win_rate: null,
      closed_trades: null,
      playbook_key: null,
      paper_positions: [],
      strategies: [],
      recent_trades: [],
      symbols: [],
    };
  }

  function setRunStatus(message, ok) {
    const status = document.getElementById("deskRunStatus");
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || "";
    status.classList.toggle("is-ok", ok === true);
    status.classList.toggle("is-bad", ok === false);
  }

  async function wireDeskActions(scope, reloadDashboard) {
    const refresh = document.getElementById("deskDataRefresh");
    if (refresh && refresh.dataset.wired !== "1") {
      refresh.dataset.wired = "1";
      refresh.addEventListener("click", async () => {
        try {
          refresh.disabled = true;
          setRunStatus("Refreshing desk data...", true);
          await reloadDashboard();
          setRunStatus("Desk data refreshed.", true);
        } catch (err) {
          setRunStatus(err?.message || "Refresh failed", false);
        } finally {
          refresh.disabled = false;
        }
      });
    }

    let session = null;
    try {
      session = (await window.GekkoAuth?.getSession?.()) || null;
    } catch (_) {
      session = null;
    }
    const viewOnly = session?.user?.role === "view_only";
    const reset = document.getElementById("deskResetDesk");
    const start = document.getElementById("deskStartRun");
    const stop = document.getElementById("deskStopRun");
    const disable = (el, title) => {
      if (!el) return;
      el.disabled = true;
      el.title = title;
      el.setAttribute("aria-disabled", "true");
    };
    if (viewOnly) {
      [reset, start, stop].forEach((el) =>
        disable(el, "View-only session — command controls are disabled.")
      );
      return;
    }
    disable(reset, "Reset Desk is not available from this view yet.");
    disable(stop, "Stop Run is not available from this view yet.");
    if (!start) return;
    if (
      window.GekkoSimCapability?.hasSimRunLedger?.(scope) &&
      typeof window.GekkoSimExecution?.startRun === "function"
    ) {
      start.disabled = false;
      start.removeAttribute("aria-disabled");
      start.title =
        "Queue a research job from bound Current settings, then open the Desk.";
      if (start.dataset.wired !== "1") {
        start.dataset.wired = "1";
        start.addEventListener("click", async () => {
          try {
            start.disabled = true;
            setRunStatus("Starting run…", true);
            await window.GekkoSimExecution.startRun(scope, {
              confirm: true,
              navigateToDesk: true,
            });
            setRunStatus("Run accepted · opening Desk…", true);
          } catch (err) {
            if (err?.code === "cancelled") {
              setRunStatus("Cancelled.", false);
              return;
            }
            setRunStatus(err?.message || "Start run failed", false);
          } finally {
            start.disabled = false;
          }
        });
      }
    } else {
      const title = window.GekkoSimCapability?.isDemo?.(scope)
        ? "Demo desks do not use Sim Batch Start Run — trading is the Demo worker."
        : "This desk does not use retained Sim run controls.";
      disable(start, title);
    }
  }

  async function bootDesk() {
    const errHost = document.getElementById("pageError");
    const resolved = window.GekkoDeskSurface.requirePageScope();
    if (resolved.error) {
      window.GekkoDeskSurface.showError(errHost, resolved.error);
      return;
    }
    const { scope } = resolved;
    renderGateBanner(scope);
    let stream = null;
    const gate = window.GekkoSimCapability?.gateState?.(scope);
    const apply = (data) => {
      window.GekkoDeskSurface.hideError(errHost);
      window.GekkoDeskSurface.renderMetrics(document, data, scope);
      window.GekkoDeskSurface.renderDeskPanels?.(data, scope);
      const dormant = document.getElementById("dormantNote");
      if (dormant) {
        dormant.hidden = !data?.is_dormant;
      }
    };
    const loadAndApply = async () => {
      try {
        const data = await window.GekkoDeskSurface.loadDashboard(scope);
        apply(data);
        return data;
      } catch (err) {
        // Do not convert an unavailable Demo dashboard into empty metrics.
        // The error panel explains the state and preserves the failing scope.
        throw err;
      }
    };
    apply(emptyDeskPayload(scope, gate));
    void wireDeskActions(scope, loadAndApply);
    try {
      await loadAndApply();
      if (window.GekkoSimCapability?.isSimActive?.(scope)) {
        stream = window.GekkoDeskSurface.startDashboardStream(scope, {
          onData: apply,
          onError: (err) => {
            if (err?.code === "scope_echo_mismatch" || err?.http_status === 404) {
              window.GekkoDeskSurface.showError(errHost, err);
            }
          },
        });
        stream?.start?.();
      }
    } catch (err) {
      window.GekkoDeskSurface.showError(errHost, err);
    }
    window.addEventListener("beforeunload", () => stream?.stop?.());
  }

  async function bootResults() {
    if (window.GekkoSimExecution?.bootResultsPage) {
      await window.GekkoSimExecution.bootResultsPage();
      return;
    }
    await bootDesk();
  }

  async function bootRuns() {
    if (window.GekkoSimExecution?.bootRunsPage) {
      await window.GekkoSimExecution.bootRunsPage();
      return;
    }
    const errHost = document.getElementById("pageError");
    const resolved = window.GekkoDeskSurface.requirePageScope();
    if (resolved.error) {
      window.GekkoDeskSurface.showError(errHost, resolved.error);
      return;
    }
    const { scope } = resolved;
    renderGateBanner(scope);
    const host = document.getElementById("runsBoard");
    window.GekkoDeskSurface.hideError(errHost);
    if (
      window.GekkoSimCapability &&
      !window.GekkoSimCapability.hasSimRunLedger?.(scope)
    ) {
      if (host) {
        const label = window.GekkoScope.formatScopeLabel(scope);
        host.innerHTML = `<p class="muted-line" role="status">
          <strong>Run board not on this desk yet</strong> —
          Demo and Live do not use the Sim Batch run ledger (${escapeHtml(label)}).
        </p>`;
      }
      return;
    }
    try {
      const data = await window.GekkoApi.fetchRuns(scope);
      const label = window.GekkoScope.formatScopeLabel(scope, data.playbook_key);
      const banner = document.getElementById("scopeBanner");
      if (banner) {
        banner.textContent = label;
        banner.classList.add("scope-chip", "scope-banner");
      }
      if (!host) return;
      host.innerHTML = `<table class="data-table"><thead><tr>
        <th>Run</th><th>Scope</th><th>Playbook</th><th>Status</th><th>PnL</th><th>Trades</th>
      </tr></thead><tbody>
      ${(data.runs || [])
        .map(
          (r) => `<tr>
          <td>${escapeHtml(r.run_label || r.run_id)}</td>
          <td><span class="scope-chip">${escapeHtml(label)}</span></td>
          <td>${escapeHtml(r.playbook_key || "—")}</td>
          <td>${escapeHtml(r.status || "—")}</td>
          <td>${escapeHtml(window.GekkoUi.formatMoney(r.realized_pnl, { cents: true, signed: true }))}
            <span class="scope-chip">${escapeHtml(label)}</span></td>
          <td>${escapeHtml(String(r.trades_closed ?? "—"))}
            <span class="scope-chip">${escapeHtml(label)}</span></td>
        </tr>`
        )
        .join("")}
      </tbody></table>`;
    } catch (err) {
      window.GekkoDeskSurface.showError(errHost, err);
    }
  }

  async function bootSetup() {
    if (window.GekkoSimExecution?.bootSetup) {
      await window.GekkoSimExecution.bootSetup();
      return;
    }
    const errHost = document.getElementById("pageError");
    window.GekkoDeskSurface?.showError?.(errHost, {
      message: "Setup surface unavailable",
    });
  }

  async function bootCompare() {
    if (window.GekkoSimExecution?.bootComparePage) {
      await window.GekkoSimExecution.bootComparePage();
      return;
    }
    const errHost = document.getElementById("pageError");
    window.GekkoDeskSurface?.showError?.(errHost, {
      message: "Compare surface unavailable",
    });
  }

  async function bootLive() {
    // Live is lane-less and dormant under MVP. Do not call scoped `/api/dashboard`
    // (backend still requires lane for that route → UAT C-02 422).
    document.body.dataset.liveSingleton = "true";
    const errHost = document.getElementById("pageError");
    const resolved = window.GekkoDeskSurface.requirePageScope();
    if (resolved.error) {
      window.GekkoDeskSurface.showError(errHost, resolved.error);
      return;
    }
    const { scope } = resolved;
    renderGateBanner(scope);
    window.GekkoDeskSurface.hideError(errHost);
    const dormantPayload = {
      is_dormant: true,
      runtime_status: "dormant",
      opening_balance: null,
      equity: null,
      realized_pnl: null,
      unrealized_pnl: null,
      open_positions: null,
      win_rate: null,
      playbook_key: null,
    };
    window.GekkoDeskSurface.renderMetrics(document, dormantPayload, scope);
    const dormant = document.getElementById("dormantNote");
    if (dormant) dormant.hidden = false;
  }

  async function bootAudit() {
    const errHost = document.getElementById("pageError");
    const host = document.getElementById("auditList");
    try {
      window.GekkoDeskSurface?.hideError?.(errHost);
      const data = await window.GekkoApi.fetchAuditEvents();
      const events = data?.events || [];
      if (!host) return;
      if (!events.length) {
        host.innerHTML = `<p class="muted-line">No promotion events recorded yet.</p>`;
        return;
      }
      host.innerHTML = `<table class="data-table"><thead><tr>
        <th>When</th><th>Type</th><th>From</th><th>To</th><th>Playbook</th><th>Approver</th><th>Status</th>
      </tr></thead><tbody>
      ${events
        .map((e) => {
          const from = window.GekkoScope.formatScopeLabel(
            { execution_env: e.source_execution_env, lane: e.source_lane },
            e.playbook_key
          );
          const to = window.GekkoScope.formatScopeLabel(
            { execution_env: e.target_execution_env, lane: e.target_lane },
            e.playbook_key
          );
          return `<tr>
            <td>${escapeHtml(e.approved_at || "—")}</td>
            <td>${escapeHtml(e.event_type || "—")}</td>
            <td><span class="scope-chip">${escapeHtml(from)}</span></td>
            <td><span class="scope-chip">${escapeHtml(to)}</span></td>
            <td>${escapeHtml(e.playbook_key || "—")}</td>
            <td>${escapeHtml(e.approver || "—")}</td>
            <td>${escapeHtml(e.status || "—")}</td>
          </tr>`;
        })
        .join("")}
      </tbody></table>
      <p class="muted-line">Read-only audit of demo→live promotion events. No live activation from this UI.</p>`;
    } catch (err) {
      window.GekkoDeskSurface?.showError?.(errHost, err);
    }
  }

  async function boot() {
    const kind = pageKind();
    if (!kind) return;
    const map = {
      overview: bootOverview,
      status: bootStatus,
      desk: bootDesk,
      results: bootResults,
      runs: bootRuns,
      setup: bootSetup,
      compare: bootCompare,
      live: bootLive,
      audit: bootAudit,
    };
    const fn = map[kind];
    if (fn) await fn();
  }

  window.GekkoPages = { boot };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot());
  } else {
    void boot();
  }
})();

/** Minimal shell helper for clickable tiles (replaces retired shell.js). */
(function () {
  function normalizePath(path) {
    const raw = String(path || "/");
    if (raw.length > 1 && raw.endsWith("/")) return raw;
    return raw === "/" ? "/" : `${raw}/`;
  }

  function wireClickableCards(root = document) {
    root.querySelectorAll("[data-href]").forEach((card) => {
      if (card.dataset.clickWired === "1") return;
      const href = card.getAttribute("data-href");
      if (!href) return;
      card.dataset.clickWired = "1";
      card.classList.add("is-clickable");
      if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "0");
      const go = () => location.assign(href);
      card.addEventListener("click", (e) => {
        if (e.target.closest("a, button, input, select, textarea, label")) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go();
      });
      card.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        go();
      });
    });
  }

  window.GekkoShell = {
    wireClickableCards,
    normalizePath,
    highlightNav() {
      window.GekkoAppShell?.refreshShell?.();
    },
  };
  wireClickableCards();
})();
