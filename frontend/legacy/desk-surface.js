/**
 * Shared read-surface helpers: metrics with mandatory scope chips,
 * error states for 422/404, SSE/poll wiring.
 */
(function (root) {
  "use strict";

  const panelState = {
    positions: [],
    trades: [],
    maxOpenPositions: null,
  };

  function money(v) {
    if (v == null || v === "") return "—";
    return root.GekkoUi?.formatMoney?.(v, { cents: true, signed: true }) ?? "—";
  }

  function moneyPlain(v) {
    if (v == null || v === "") return "—";
    return root.GekkoUi?.formatMoney?.(v, { cents: true }) ?? "—";
  }

  function escapeHtml(v) {
    if (root.GekkoUi?.escapeHtml) return root.GekkoUi.escapeHtml(v);
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function firstValue(...values) {
    return values.find((v) => v !== undefined && v !== null && v !== "");
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function firstArray(...values) {
    return values.find((v) => Array.isArray(v) && v.length) || values.find(Array.isArray) || [];
  }

  function setText(id, value, host) {
    const rootEl = host || document;
    const node = rootEl.querySelector?.(`#${id}`) || document.getElementById(id);
    if (!node) return;
    node.textContent = value == null || value === "" ? "—" : String(value);
  }

  /** Plain-English Runtime line (GST-109) — never leave operators on bare "queued". */
  function formatRuntimePlain(data) {
    const active = data?.active_run;
    const status = String(
      firstValue(active?.status, data?.runtime_status, data?.power_state, "")
    ).toLowerCase();
    if (active && (status === "queued" || status === "preparing" || status === "running" || status === "cancelling")) {
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
      // Claimed / heartbeating but no sim days yet → candle download.
      if (status === "running" || status === "preparing" || active.heartbeat_at || active.started_at) {
        return "Loading market data (candles)…";
      }
      return "Preparing run…";
    }
    if (status === "completed" || status === "succeeded") return "Finished — last run complete";
    if (status === "failed") return "Failed — see Runs for details";
    if (status === "cancelled") return "Cancelled";
    if (status === "idle" || status === "ready" || !status) return "Idle — no run in progress";
    return status;
  }

  function formatPowerPillPlain(data) {
    const active = data?.active_run;
    const status = String(
      firstValue(active?.status, data?.runtime_status, data?.power_state, "")
    ).toLowerCase();
    if (active && (status === "queued" || status === "preparing")) return "Starting";
    if (active && status === "running") {
      const events = Number(active.event_cursor) || 0;
      return events > 0 ? "Simulating" : "Loading";
    }
    if (active && status === "cancelling") return "Cancelling";
    if (status === "completed" || status === "succeeded") return "Finished";
    if (status === "failed") return "Failed";
    if (status === "cancelled") return "Cancelled";
    if (!status || status === "idle" || status === "ready" || status === "—") return "Idle";
    return status;
  }

  function formatActivityPillPlain(data, lastCycle) {
    const active = data?.active_run;
    const status = String(active?.status || "").toLowerCase();
    if (active && (status === "queued" || status === "preparing")) return "Starting";
    if (active && status === "running") {
      const events = Number(active.event_cursor) || 0;
      return events > 0 ? "Simulating" : "Loading";
    }
    if (active && status === "cancelling") return "Cancelling";
    if (lastCycle) return "Active";
    return "Idle";
  }

  function formatPct(value) {
    if (value == null || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const pct = Math.abs(n) <= 1 ? n * 100 : n;
    return `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
  }

  function formatNumber(value, digits = 2) {
    if (value == null || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    }).format(n);
  }

  function formatPrice(value) {
    if (value == null || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: n >= 100 ? 2 : 4,
      maximumFractionDigits: n >= 100 ? 2 : 6,
    }).format(n);
  }

  function formatInstant(value) {
    const Time = root.GekkoTime;
    if (Time?.formatCompact) return Time.formatCompact(value);
    return value == null || value === "" ? "—" : String(value);
  }

  function labelFor(scope, playbook_key) {
    return root.GekkoScope?.formatScopeLabel?.(scope, playbook_key) || "—";
  }

  function periodValue(data, key) {
    const period = data?.period_pnl || data?.period || {};
    const aliases = {
      today: ["today", "day", "today_pnl", "day_pnl"],
      week: ["week", "week_pnl"],
      month: ["month", "month_pnl"],
      year: ["year", "year_pnl", "all", "all_pnl"],
    };
    for (const k of aliases[key] || [key]) {
      const direct = data?.[k];
      if (direct !== undefined && direct !== null && direct !== "") return direct;
      const nested = period?.[k];
      if (nested !== undefined && nested !== null && nested !== "") return nested;
    }
    return null;
  }

  function growthValue(data) {
    const explicit = firstValue(data?.growth_pct, data?.growth_percent, data?.growth);
    if (explicit != null) return explicit;
    const opening = Number(data?.opening_balance);
    const equity = Number(firstValue(data?.equity, data?.balance));
    if (Number.isFinite(opening) && opening !== 0 && Number.isFinite(equity)) {
      return ((equity - opening) / opening) * 100;
    }
    return null;
  }

  function requirePageScope() {
    const Scope = root.GekkoScope;
    if (!Scope) throw new Error("GekkoScope missing");
    try {
      const scope = Scope.parseScopeFromPath(location.pathname);
      if (!scope) {
        return { error: { status: 422, message: "This page has no desk scope." } };
      }
      return { scope };
    } catch (err) {
      return {
        error: {
          status: err.http_status || 422,
          message: err.message || "Invalid scope",
        },
      };
    }
  }

  function errorHintFor(status, pathname) {
    if (status === 401) {
      return "Sign in to view this desk page. You will return here after login.";
    }
    if (status === 422) return "Missing or invalid scope — choose Sim A / Demo A desk.";
    if (status === 404) {
      const path = String(pathname || "");
      if (path.startsWith("/demo/")) {
        return "This Demo desk has no readable dashboard data yet. Check the desk connection or select another desk; values are not being shown as zeros.";
      }
      return "Scope not found or mismatched — check the selector.";
    }
    return "";
  }

  function isAuthRequiredError(err) {
    const status = Number(err?.status || err?.http_status || 0);
    if (status === 401) return true;
    const msg = String(err?.message || err?.detail || "");
    return /authentication required|unauthorized|not authenticated/i.test(msg);
  }

  function signInHrefForCurrent() {
    const Auth = root.GekkoAuth;
    const path =
      typeof location !== "undefined" ? location.pathname || "/" : "/";
    const search =
      typeof location !== "undefined" ? location.search || "" : "";
    if (Auth?.forceLoginHref) return Auth.forceLoginHref(path, search);
    if (Auth?.loginHrefWithNext) {
      return Auth.loginHrefWithNext(path, search, { force: true });
    }
    const params = new URLSearchParams();
    params.set("next", path + search);
    params.set("force", "1");
    return `/login/?${params.toString()}`;
  }

  /** Plain-language unauthenticated panel (UX-P0-04) — no raw 401 as primary copy. */
  function authRecoveryHtml(err, { pathname, search } = {}) {
    const path =
      pathname ||
      (typeof location !== "undefined" ? location.pathname : "/") ||
      "/";
    const q =
      search == null
        ? typeof location !== "undefined"
          ? location.search || ""
          : ""
        : String(search);
    const Auth = root.GekkoAuth;
    const href = escapeHtml(
      Auth?.forceLoginHref?.(path, q) ||
        Auth?.loginHrefWithNext?.(path, q, { force: true }) ||
        `/login/?next=${encodeURIComponent(path + q)}&force=1`
    );
    const status = err?.status || err?.http_status || 401;
    return `<div class="auth-recovery" data-auth-recovery="1" role="status">
      <strong>Sign in required</strong>
      <p>This page needs a signed-in operator. Desk data stays hidden until you sign in.</p>
      <p class="auth-recovery-actions"><a class="btn btn-primary" href="${href}" data-auth-recovery-signin="1">Sign in</a></p>
      <p class="muted-line auth-recovery-detail">Technical detail: HTTP ${escapeHtml(String(status))} — authentication required.</p>
    </div>`;
  }

  function showError(host, err) {
    const el = typeof host === "string" ? document.getElementById(host) : host;
    if (!el) return;
    const status = err?.status || err?.http_status || "";
    const msg = err?.message || err?.detail || String(err || "Error");
    const path = typeof location !== "undefined" ? location.pathname : "";
    el.hidden = false;
    if (isAuthRequiredError(err)) {
      el.classList.add("is-auth-recovery");
      el.innerHTML = authRecoveryHtml(err, {
        pathname: path,
        search: typeof location !== "undefined" ? location.search || "" : "",
      });
      return;
    }
    el.classList.remove("is-auth-recovery");
    const hint = errorHintFor(status, path);
    el.innerHTML = `<strong>Error${status ? ` ${status}` : ""}</strong>
      <p>${escapeHtml(msg)}</p>
      ${hint ? `<p class="muted-line">${escapeHtml(hint)}</p>` : ""}`;
  }

  function hideError(host) {
    const el = typeof host === "string" ? document.getElementById(host) : host;
    if (!el) return;
    el.hidden = true;
    el.classList.remove("is-auth-recovery");
    el.innerHTML = "";
  }

  /**
   * Fill metric nodes. Every PnL / positions / balance host MUST have a
   * sibling or child .scope-chip updated with the exact scope label.
   */
  function renderMetrics(host, data, scope) {
    const el = host || document;
    const playbook_key =
      root.GekkoScope?.resolvePlaybookKey?.(
        data?.playbook_key,
        data?.strategy_suite,
        scope
      ) || "";
    const label = labelFor(scope, playbook_key);

    const set = (id, value, { signed = false } = {}) => {
      const node = el.querySelector?.(`#${id}`) || document.getElementById(id);
      if (!node) return;
      node.textContent = signed ? money(value) : moneyPlain(value);
      if (Number.isFinite(Number(value))) {
        node.classList.toggle("is-pos", Number(value) > 0);
        node.classList.toggle("is-neg", Number(value) < 0);
      }
      const chip =
        node.parentElement?.querySelector(".scope-chip") ||
        document.querySelector(`[data-scope-for="${id}"]`);
      if (chip) {
        chip.textContent = label;
        chip.title = label;
      }
    };

    set("openingBalance", data?.opening_balance);
    set("equity", firstValue(data?.equity, data?.balance));
    set("realizedPnl", firstValue(data?.realized_pnl, data?.lifetime_pnl), { signed: true });
    set("unrealizedPnl", data?.unrealized_pnl, { signed: true });
    set("todayPnl", periodValue(data, "today"), { signed: true });
    set("weekPnl", periodValue(data, "week"), { signed: true });
    set("monthPnl", periodValue(data, "month"), { signed: true });
    set("yearPnl", periodValue(data, "year"), { signed: true });

    const openNode = document.getElementById("openPositions");
    if (openNode) {
      openNode.textContent =
        data?.open_positions == null ? "—" : String(data.open_positions);
      const chip =
        openNode.parentElement?.querySelector(".scope-chip") ||
        document.querySelector('[data-scope-for="openPositions"]');
      if (chip) {
        chip.textContent = label;
        chip.title = label;
      }
    }

    const wr = document.getElementById("winRate");
    if (wr) {
      wr.textContent =
        data?.win_rate == null ? "—" : `${Math.round(Number(data.win_rate) * 100)}%`;
    }

    const growth = document.getElementById("growthPct");
    if (growth) {
      const value = growthValue(data);
      growth.textContent = formatPct(value);
      if (Number.isFinite(Number(value))) {
        growth.classList.toggle("is-pos", Number(value) > 0);
        growth.classList.toggle("is-neg", Number(value) < 0);
      }
      const chip =
        growth.parentElement?.querySelector(".scope-chip") ||
        document.querySelector('[data-scope-for="growthPct"]');
      if (chip) {
        chip.textContent = label;
        chip.title = label;
      }
    }

    const closed = document.getElementById("closedTrades");
    if (closed) {
      closed.textContent = String(firstValue(data?.closed_trades, data?.trades_closed, "—"));
    }

    const playbook = document.getElementById("playbookKey");
    if (playbook) {
      // GST-107 — Naming Standard §2.4: show playbookN.M, never suite names.
      const resolved =
        root.GekkoScope?.resolvePlaybookKey?.(
          playbook_key || data?.playbook_key,
          firstValue(data?.strategy_suite, data?.settings?.strategy_suite),
          scope
        ) || "";
      playbook.textContent = resolved || "—";
    }

    const runtime = document.getElementById("runtimeStatus");
    if (runtime) {
      runtime.textContent = formatRuntimePlain(data);
    }

    const scopeBanner = document.getElementById("scopeBanner");
    if (scopeBanner) {
      scopeBanner.textContent = label;
      scopeBanner.classList.add("scope-chip", "scope-banner");
    }

    document.querySelectorAll("[data-scope-chip]").forEach((chip) => {
      chip.textContent = label;
      chip.title = label;
    });
  }

  function positionSide(row) {
    const raw = String(firstValue(row?.side, row?.position_side, row?.direction) || "").toLowerCase();
    if (raw.includes("short") || raw === "sell") return "short";
    if (raw.includes("long") || raw === "buy") return "long";
    return raw || "—";
  }

  function renderPositionsTable() {
    const body = document.getElementById("positionsBody");
    if (!body) return;
    const side = document.querySelector("#positionsSideFilter .active")?.dataset.positionSide || "all";
    const search = String(document.getElementById("positionsSearch")?.value || "").trim().toLowerCase();
    const rows = panelState.positions.filter((p) => {
      const rowSide = positionSide(p);
      const sideOk = side === "all" || rowSide === side;
      const text = [p?.symbol, p?.asset, p?.strategy, rowSide].map((v) => String(v || "").toLowerCase()).join(" ");
      return sideOk && (!search || text.includes(search));
    });
    setText("positionsOpenValue", panelState.positions.length);
    setText("positionsMaxOpenValue", panelState.maxOpenPositions);
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="9" class="empty">No open positions</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((p) => {
        const sideValue = positionSide(p);
        const pnl = firstValue(p.unrealized_pnl, p.pnl, p.realized_pnl);
        return `<tr>
          <td>${escapeHtml(firstValue(p.symbol, p.asset, "—"))}</td>
          <td class="${sideValue === "short" ? "side-short" : sideValue === "long" ? "side-long" : ""}">${escapeHtml(sideValue.toUpperCase())}</td>
          <td class="meta">${escapeHtml(formatNumber(firstValue(p.qty, p.quantity, p.contracts, p.size), 4))}</td>
          <td class="col-eq">${escapeHtml(formatPrice(firstValue(p.entry_price, p.entry, p.avg_entry_price)))}</td>
          <td class="col-eq">${escapeHtml(formatPrice(firstValue(p.mark_price, p.mark, p.current_price)))}</td>
          <td class="col-eq ${Number(pnl) < 0 ? "pnl-neg" : Number(pnl) > 0 ? "pnl-pos" : ""}">${escapeHtml(money(pnl))}</td>
          <td class="col-eq">${escapeHtml(formatPrice(firstValue(p.stop_loss, p.stop, p.sl)))}</td>
          <td class="col-eq">${escapeHtml(formatPrice(firstValue(p.take_profit, p.target, p.tp)))}</td>
          <td class="mono">${escapeHtml(formatInstant(firstValue(p.opened_at, p.entry_time, p.created_at, p.duration)))}</td>
        </tr>`;
      })
      .join("");
  }

  function renderStrategiesTable(strategies) {
    const body = document.getElementById("strategyRank");
    setText("strategiesTotalValue", strategies.length);
    if (!body) return;
    if (!strategies.length) {
      body.innerHTML = `<tr><td colspan="8" class="empty">No strategies ranked yet</td></tr>`;
      return;
    }
    body.innerHTML = strategies
      .map((s) => {
        const pnl = firstValue(s.pnl, s.realized_pnl, s.total_pnl);
        return `<tr>
          <td>${escapeHtml(firstValue(s.name, s.strategy, s.strategy_name, s.key, "—"))}</td>
          <td>${escapeHtml(firstValue(s.tier, s.rank, "—"))}</td>
          <td class="meta">${escapeHtml(formatNumber(firstValue(s.exp, s.expected_value, s.expectancy), 3))}</td>
          <td>${escapeHtml(firstValue(s.act, s.action, s.status, "—"))}</td>
          <td class="col-eq ${Number(pnl) < 0 ? "pnl-neg" : Number(pnl) > 0 ? "pnl-pos" : ""}">${escapeHtml(money(pnl))}</td>
          <td class="meta">${escapeHtml(formatNumber(firstValue(s.rr, s.r_multiple, s.reward_risk), 2))}</td>
          <td class="meta">${escapeHtml(formatNumber(s.adx, 1))}</td>
          <td class="meta">${escapeHtml(firstValue(s.pulls, s.pull_count, s.trades, "—"))}</td>
        </tr>`;
      })
      .join("");
  }

  function tradeInstant(row) {
    return firstValue(row.closed_at, row.exit_time, row.opened_at, row.entry_time, row.created_at);
  }

  function inRange(row, range, fromValue, toValue) {
    const raw = tradeInstant(row);
    if (!raw) return true;
    const d = root.GekkoTime?.parseUtc?.(raw) || new Date(raw);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return true;
    const now = new Date();
    if (range === "day" && now - d > 24 * 60 * 60 * 1000) return false;
    if (range === "week" && now - d > 7 * 24 * 60 * 60 * 1000) return false;
    if (range === "month" && now - d > 31 * 24 * 60 * 60 * 1000) return false;
    if (fromValue) {
      const from = new Date(`${fromValue}T00:00:00Z`);
      if (d < from) return false;
    }
    if (toValue) {
      const to = new Date(`${toValue}T23:59:59Z`);
      if (d > to) return false;
    }
    return true;
  }

  function renderTradesTable() {
    const body = document.getElementById("tradesBody");
    if (!body) return;
    const range = document.querySelector("#tradesRange .active")?.dataset.tradeRange || "all";
    const fromValue = document.getElementById("tradesFrom")?.value || "";
    const toValue = document.getElementById("tradesTo")?.value || "";
    const search = String(document.getElementById("tradesSearch")?.value || "").trim().toLowerCase();
    const rows = panelState.trades.filter((t) => {
      const text = [
        t?.trade_id,
        t?.id,
        t?.symbol,
        t?.side,
        t?.strategy,
        t?.strategy_name,
        t?.status,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return inRange(t, range, fromValue, toValue) && (!search || text.includes(search));
    });
    setText("tradesTotalValue", rows.length === panelState.trades.length ? rows.length : `${rows.length}/${panelState.trades.length}`);
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="10" class="empty">No recent trades</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((t) => {
        const pnl = firstValue(t.pnl, t.realized_pnl, t.total_pnl);
        const side = positionSide(t);
        return `<tr>
          <td class="mono">${escapeHtml(firstValue(t.trade_id, t.id, "—"))}</td>
          <td>${escapeHtml(firstValue(t.symbol, t.asset, "—"))}</td>
          <td class="${side === "short" ? "side-short" : side === "long" ? "side-long" : ""}">${escapeHtml(side.toUpperCase())}</td>
          <td>${escapeHtml(firstValue(t.strategy, t.strategy_name, t.playbook_key, "—"))}</td>
          <td class="col-eq ${Number(pnl) < 0 ? "pnl-neg" : Number(pnl) > 0 ? "pnl-pos" : ""}">${escapeHtml(money(pnl))}</td>
          <td class="meta">${escapeHtml(formatNumber(firstValue(t.rr, t.r, t.r_multiple), 2))}</td>
          <td>${escapeHtml(firstValue(t.status, "closed"))}</td>
          <td class="mono">${escapeHtml(formatInstant(firstValue(t.opened_at, t.entry_time, t.created_at)))}</td>
          <td class="mono">${escapeHtml(formatInstant(firstValue(t.closed_at, t.exit_time)))}</td>
          <td class="mono">${escapeHtml(firstValue(t.duration, t.hold_time, t.hold_minutes, "—"))}</td>
        </tr>`;
      })
      .join("");
  }

  function wirePositionFilters() {
    const host = document.getElementById("positionsSideFilter");
    if (host && host.dataset.wired !== "1") {
      host.dataset.wired = "1";
      host.addEventListener("click", (e) => {
        const btn = e.target.closest?.("[data-position-side]");
        if (!btn) return;
        host.querySelectorAll("[data-position-side]").forEach((node) => node.classList.remove("active"));
        btn.classList.add("active");
        renderPositionsTable();
      });
    }
    const search = document.getElementById("positionsSearch");
    if (search && search.dataset.wired !== "1") {
      search.dataset.wired = "1";
      search.addEventListener("input", renderPositionsTable);
    }
  }

  function wireTradeFilters() {
    const host = document.getElementById("tradesRange");
    if (host && host.dataset.wired !== "1") {
      host.dataset.wired = "1";
      host.addEventListener("click", (e) => {
        const btn = e.target.closest?.("[data-trade-range]");
        if (!btn) return;
        host.querySelectorAll("[data-trade-range]").forEach((node) => node.classList.remove("active"));
        btn.classList.add("active");
        renderTradesTable();
      });
    }
    ["tradesFrom", "tradesTo", "tradesSearch"].forEach((id) => {
      const node = document.getElementById(id);
      if (!node || node.dataset.wired === "1") return;
      node.dataset.wired = "1";
      node.addEventListener(id === "tradesSearch" ? "input" : "change", renderTradesTable);
    });
  }

  function renderDeskPanels(data, scope) {
    const payload = data || {};
    renderMetrics(document, payload, scope);
    const playbook_key =
      root.GekkoScope?.resolvePlaybookKey?.(
        payload.playbook_key,
        payload.strategy_suite,
        scope
      ) || "";
    const scopeLabel = labelFor(scope, playbook_key);
    panelState.positions = firstArray(payload.paper_positions, payload.positions);
    panelState.trades = firstArray(payload.recent_trades, payload.trades);
    panelState.maxOpenPositions = firstValue(
      payload.max_open_positions,
      payload.risk_limits?.max_open_positions,
      payload.settings?.max_open_positions,
      payload.open_position_cap
    );
    wirePositionFilters();
    wireTradeFilters();
    renderPositionsTable();
    renderStrategiesTable(asArray(payload.strategies));
    renderTradesTable();

    const symbols = asArray(payload.symbols);
    setText("symbolsLine", symbols.length ? `Universe: ${symbols.join(" · ")}` : "Universe: —");
    const latency = firstValue(payload.binance_latency_ms, payload.latency_ms, payload.latency);
    const latencyText = latency == null ? "—" : `${formatNumber(latency, 0)}ms`;
    setText("latency", latencyText);
    setText("deskPing", latencyText);
    setText("deskEgressIp", payload.egress_ip ? `IP ${payload.egress_ip}` : scopeLabel);
    setText("powerPill", formatPowerPillPlain(payload));
    const cycle = payload.cycle_meta || {};
    const lastCycle = firstValue(cycle.last_cycle_at, payload.last_cycle_at, payload.updated_at);
    setText("activityPill", formatActivityPillPlain(payload, lastCycle));
    setText("cycleMeta", lastCycle ? `Last cycle: ${formatInstant(lastCycle)}` : "Last cycle: —");
    const cycleBits = [
      firstValue(cycle.interval, payload.signal_interval) ? `Signal ${firstValue(cycle.interval, payload.signal_interval)}` : "",
      firstValue(cycle.htf_interval, payload.htf_interval) ? `HTF ${firstValue(cycle.htf_interval, payload.htf_interval)}` : "",
      lastCycle ? `Updated ${formatInstant(lastCycle)}` : "",
    ].filter(Boolean);
    const active = payload.active_run;
    const activeStatus = String(active?.status || "").toLowerCase();
    if (active && ["queued", "preparing", "running", "cancelling"].includes(activeStatus)) {
      setText("autopilotMeta", formatRuntimePlain(payload));
    } else {
      setText("autopilotMeta", cycleBits.join(" · ") || "Waiting for dashboard data.");
    }
  }

  async function loadDashboard(scope) {
    return root.GekkoApi.fetchDashboard(scope);
  }

  function startDashboardStream(scope, { onData, onError } = {}) {
    return root.GekkoApi.subscribeDashboard(scope, {
      onSnapshot: (data) => onData?.(data),
      onError: (err) => onError?.(err),
    });
  }

  const api = {
    requirePageScope,
    showError,
    hideError,
    errorHintFor,
    isAuthRequiredError,
    authRecoveryHtml,
    signInHrefForCurrent,
    renderMetrics,
    renderDeskPanels,
    loadDashboard,
    startDashboardStream,
    money,
  };
  if (root) root.GekkoDeskSurface = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
