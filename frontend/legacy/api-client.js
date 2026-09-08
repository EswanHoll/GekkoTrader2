/**
 * Scoped API client — fail-closed Scope Contract wire to Control.
 * Default: real Control API (GST-12). Opt-in mocks via GEKKO_USE_MOCK_API=true.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GekkoApi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function scopeApi() {
    return root.GekkoScope || (typeof require === "function" ? require("./scope.js") : null);
  }

  function mockApi() {
    return root.GekkoMockApi || (typeof require === "function" ? require("./mock-api.js") : null);
  }

  function pollApi() {
    return root.GekkoPoll || null;
  }

  function controlBase() {
    const Config = root && root.GekkoControlConfig;
    if (Config && typeof Config.resolveControlBase === "function") {
      return Config.resolveControlBase({ allowMockLocal: true });
    }
    // Node harness / tests that inject GEKKO_API_URL without loading config.js
    const fromRoot =
      root && root.GEKKO_API_URL != null ? String(root.GEKKO_API_URL).trim() : "";
    let fromStorage = "";
    try {
      if (typeof localStorage !== "undefined") {
        fromStorage = String(localStorage.getItem("gekko_api_url") || "").trim();
      }
    } catch (_) {
      /* private mode */
    }
    const raw = fromRoot || fromStorage;
    if (raw) return raw.replace(/\/$/, "");
    if (useMock()) return "https://control.local";
    const err = new Error(
      "Control API URL is not configured. Set Cursor/GitHub secret CONTROL_API_URL__PROJ_GEKKOTRADER to the AWS Tokyo Control ALB HTTPS origin (operator-supplied; patches window.GEKKO_API_URL at deploy). There is no hard-coded Control host; legacy Fly requires an explicit scoped-secret opt-in."
    );
    err.code = "gekko_api_url_missing";
    throw err;
  }

  /** Real Control by default (GST-12). Mocks only when explicitly enabled. */
  function useMock() {
    if (root && typeof root.GEKKO_USE_MOCK_API === "boolean") {
      return root.GEKKO_USE_MOCK_API;
    }
    if (typeof localStorage !== "undefined") {
      const flag = localStorage.getItem("gekko_use_mock_api");
      if (flag === "1" || flag === "true") return true;
      if (flag === "0" || flag === "false") return false;
    }
    return false;
  }

  function authHeaders({ privileged = false } = {}) {
    const headers = { Accept: "application/json" };
    try {
      const token = localStorage.getItem("gekko_auth_token");
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (_) {
      /* private mode */
    }
    if (privileged) {
      try {
        // Only the parsed token — never the raw sessionStorage JSON blob.
        const control =
          (root && root.GekkoOperator && root.GekkoOperator.getSessionToken?.()) ||
          "";
        if (control) headers["X-Gekko-Control-Token"] = control;
      } catch (_) {
        /* ignore */
      }
    }
    return headers;
  }

  class ApiError extends Error {
    constructor(message, status, body) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
  }

  function withQuery(path, extra) {
    const u = new URL(path, "https://gekkotrader.local");
    Object.entries(extra || {}).forEach(([k, v]) => {
      if (v == null || v === "") return;
      if (Array.isArray(v)) {
        v.forEach((item) => u.searchParams.append(k, String(item)));
      } else {
        u.searchParams.set(k, String(v));
      }
    });
    return u.pathname + u.search;
  }

  function scopedUrl(path, scope) {
    const Scope = scopeApi();
    if (!Scope) throw new Error("GekkoScope not loaded");
    const base = controlBase();
    const abs = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    const u = new URL(abs);
    const params = Scope.scopeQueryParams(scope);
    const allowed = new Set([
      "execution_env",
      "lane",
      "run_id",
      "run_ids",
      "cursor",
      "limit",
      "offset",
    ]);
    [...u.searchParams.keys()].forEach((key) => {
      if (!allowed.has(key)) u.searchParams.delete(key);
    });
    params.forEach((value, key) => u.searchParams.set(key, value));
    return u.toString();
  }

  /**
   * Canonical dashboard endpoint by desk identity. Demo desks are product-bound
   * and cannot be read through the generic scoped dashboard route.
   */
  function demoDashboardPath(lane) {
    const version = lane === "a" ? 1 : 2;
    return `/api/${"v"}${version}/demo/dashboard`;
  }

  function dashboardPathFor(scope) {
    const env = String(scope?.execution_env || "").toLowerCase();
    const lane = String(scope?.lane || "").toLowerCase();
    if (env === "demo" && (lane === "a" || lane === "b")) {
      return demoDashboardPath(lane);
    }
    return "/api/dashboard";
  }

  async function parseJson(res) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return { detail: text };
    }
  }

  async function mockFetch(url, options = {}) {
    const mock = mockApi();
    if (!mock) throw new Error("GekkoMockApi not loaded");
    const result = await mock.handle(url, options);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      async json() {
        return result.body;
      },
      async text() {
        return JSON.stringify(result.body);
      },
    };
  }

  function throwHttp(body, status) {
    if (status === 401) {
      throw new ApiError(body?.detail || "authentication required (401)", 401, body);
    }
    if (status === 403) {
      throw new ApiError(body?.detail || "forbidden (403)", 403, body);
    }
    if (status === 409) {
      throw new ApiError(body?.detail || "conflict (409)", 409, body);
    }
    if (status === 422) {
      throw new ApiError(body?.detail || "scope required (422)", 422, body);
    }
    if (status === 404) {
      throw new ApiError(body?.detail || "scope not found (404)", 404, body);
    }
    if (status === 503) {
      throw new ApiError(body?.detail || "service unavailable (503)", 503, body);
    }
    throw new ApiError(body?.detail || `HTTP ${status}`, status, body);
  }

  async function scopedGet(path, scope, options = {}) {
    const Scope = scopeApi();
    if (!Scope) throw new Error("GekkoScope not loaded");
    if (!scope) throw new Scope.ScopeError("scope required for scopedGet", 422);

    const url = scopedUrl(path, scope);
    const Poll = pollApi();
    const headers = {
      ...authHeaders({ privileged: !!options.privileged }),
      ...(options.headers || {}),
    };
    let res;
    if (useMock()) {
      res = await mockFetch(url, { ...options, method: "GET", headers });
    } else if (Poll?.fetchWithRetry) {
      res = await Poll.fetchWithRetry(url, {
        ...options,
        headers,
        credentials: options.credentials || "include",
      });
    } else {
      res = await fetch(url, {
        ...options,
        headers,
        credentials: options.credentials || "include",
      });
    }

    const body = await parseJson(res);
    if (!res.ok) throwHttp(body, res.status);

    if (body && typeof body === "object" && ("execution_env" in body || "lane" in body || "scope_key" in body)) {
      Scope.assertScopeEcho(scope, body);
    }
    return body;
  }

  async function scopedPost(path, scope, body, options = {}) {
    const Scope = scopeApi();
    if (!Scope) throw new Error("GekkoScope not loaded");
    if (!scope) throw new Scope.ScopeError("scope required for scopedPost", 422);
    const privileged = options.privileged !== false;
    // GST-105 — best-effort control-token remint for legacy routes only.
    // Greenfield Start Run / Save authorize from super_admin Bearer alone.
    if (privileged && root?.GekkoOperator?.ensureWriteSession) {
      try {
        await root.GekkoOperator.ensureWriteSession();
      } catch (_) {
        /* server gates via super_admin session */
      }
    }
    const url = scopedUrl(path, scope);
    const headers = {
      "Content-Type": "application/json",
      ...authHeaders({ privileged }),
      ...(options.headers || {}),
    };
    const payload = JSON.stringify(body || {});
    let res;
    if (useMock()) {
      res = await mockFetch(url, { method: "POST", headers, body: payload });
    } else {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        credentials: options.credentials || "include",
      });
    }
    // One forced remint retry when a legacy control token expired mid-action.
    // GST-105 — retry from admin login (or legacy device secret), never Keys paste.
    if (
      !res.ok &&
      privileged &&
      (res.status === 401 || res.status === 403) &&
      root?.GekkoOperator?.ensureWriteSession
    ) {
      let authTok = "";
      try {
        authTok =
          (root.GekkoAuth && root.GekkoAuth.getToken?.()) ||
          localStorage.getItem("gekko_auth_token") ||
          "";
      } catch (_) {
        authTok = "";
      }
      if (authTok || root.GekkoOperator.hasDeviceSecret?.()) {
        try {
          root.GekkoOperator.clearSessionToken?.();
          const ensured = await root.GekkoOperator.ensureWriteSession({
            force: true,
          });
          if (ensured?.active) {
            const retryHeaders = {
              "Content-Type": "application/json",
              ...authHeaders({ privileged: true }),
              ...(options.headers || {}),
            };
            res = await fetch(url, {
              method: "POST",
              headers: retryHeaders,
              body: payload,
              credentials: options.credentials || "include",
            });
          }
        } catch (_) {
          /* fall through to original error */
        }
      }
    }
    const parsed = await parseJson(res);
    if (!res.ok) throwHttp(parsed, res.status);
    if (
      parsed &&
      typeof parsed === "object" &&
      ("execution_env" in parsed || "lane" in parsed || "scope_key" in parsed)
    ) {
      Scope.assertScopeEcho(scope, parsed);
    }
    return parsed;
  }

  async function get(path, options = {}) {
    const base = controlBase();
    const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    const headers = {
      ...authHeaders({ privileged: !!options.privileged }),
      ...(options.headers || {}),
    };
    let res;
    if (useMock()) {
      res = await mockFetch(url, { ...options, method: "GET", headers });
    } else {
      const Poll = pollApi();
      if (Poll?.fetchWithRetry) {
        res = await Poll.fetchWithRetry(url, {
          ...options,
          headers,
          credentials: options.credentials || "include",
        });
      } else {
        res = await fetch(url, {
          ...options,
          headers,
          credentials: options.credentials || "include",
        });
      }
    }
    const body = await parseJson(res);
    if (!res.ok) throwHttp(body, res.status);
    return body;
  }

  /**
   * Authenticated durable run monitor.
   * Prefers fetch-stream SSE (headers allowed); falls back to /api/runs/{id}/events poll.
   */
  function subscribeRunEvents(scope, run_id, handlers = {}) {
    const Scope = scopeApi();
    if (!Scope) throw new Error("GekkoScope not loaded");
    if (!scope) throw new Scope.ScopeError("scope required for SSE", 422);

    let stopped = false;
    let cursor = handlers.cursor || "";
    let timer = null;
    const onEvent = handlers.onEvent || handlers.onSnapshot || (() => {});
    const onError = handlers.onError || (() => {});
    const intervalMs = handlers.pollIntervalMs || handlers.mockIntervalMs || 4_000;

    function acceptRow(row) {
      if (!row) return;
      try {
        Scope.assertScopeEcho(scope, row);
        if (row.scope_key && row.scope_key !== Scope.scopeKey(scope)) {
          throw new Scope.ScopeError("foreign SSE scope_key rejected", 404);
        }
        if (row.cursor) cursor = row.cursor;
        onEvent(row);
      } catch (err) {
        onError(err);
      }
    }

    async function pollOnce() {
      const after = cursor && cursor.includes(":") ? cursor.split(":").pop() : cursor || "0";
      const path = withQuery(`/api/runs/${encodeURIComponent(run_id)}/events`, {
        cursor: after,
      });
      const body = await scopedGet(path, scope);
      (body.items || []).forEach(acceptRow);
    }

    async function streamOnce() {
      const path = withQuery("/api/events", { run_id, cursor: cursor || "" });
      const url = scopedUrl(path, scope);
      const res = await fetch(url, {
        headers: authHeaders({ privileged: false }),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await parseJson(res);
        throwHttp(body, res.status);
      }
      if (!res.body || !res.body.getReader) {
        await pollOnce();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        chunks.forEach((chunk) => {
          const dataLine = chunk
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (!dataLine) return;
          try {
            acceptRow(JSON.parse(dataLine.slice(5).trim()));
          } catch (err) {
            onError(err);
          }
        });
      }
    }

    const api = {
      start() {
        stopped = false;
        const tick = async () => {
          if (stopped) return;
          try {
            if (useMock()) await pollOnce();
            else await streamOnce();
          } catch (err) {
            onError(err);
            if (!stopped && !useMock()) {
              try {
                await pollOnce();
              } catch (pollErr) {
                onError(pollErr);
              }
            }
          }
          if (!stopped) timer = setTimeout(tick, intervalMs);
        };
        tick();
        return api;
      },
      stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = null;
      },
      get cursor() {
        return cursor;
      },
      get usingFallback() {
        return true;
      },
    };
    return api;
  }

  function createDashboardRestPoller(scope, handlers = {}) {
    // GST-109 — Greenfield Control has no /api/events/dashboard. Poll REST so
    // Runtime moves queued → loading → simulating → finished without a hard refresh.
    const Scope = scopeApi();
    const onSnapshot = handlers.onSnapshot || (() => {});
    const onError = handlers.onError || (() => {});
    const intervalMs = Number(handlers.pollIntervalMs) > 0
      ? Number(handlers.pollIntervalMs)
      : Number(handlers.mockIntervalMs) > 0
        ? Number(handlers.mockIntervalMs)
        : 5_000;
    let stopped = false;
    let timer = null;
    const api = {
      start() {
        stopped = false;
        const tick = async () => {
          if (stopped) return;
          try {
            const body = await scopedGet("/api/dashboard", scope);
            Scope?.assertScopeEcho?.(scope, body);
            onSnapshot(body);
          } catch (err) {
            onError(err);
          }
          if (!stopped) timer = setTimeout(tick, intervalMs);
        };
        tick();
        return api;
      },
      stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = null;
      },
      get usingFallback() {
        return true;
      },
    };
    return api;
  }

  function scopedEventSource(path, scope, handlers = {}) {
    // Dashboard SSE kept for desk chrome; run monitor uses subscribeRunEvents.
    if (path.indexOf("/api/events?") === 0 || path === "/api/events") {
      const u = new URL(path, "https://gekkotrader.local");
      return subscribeRunEvents(scope, u.searchParams.get("run_id") || "", handlers);
    }
    const Scope = scopeApi();
    const Poll = pollApi();
    if (!Scope) throw new Error("GekkoScope not loaded");
    if (!scope) throw new Scope.ScopeError("scope required for SSE", 422);
    const url = scopedUrl(path, scope);
    const onSnapshot = handlers.onSnapshot || (() => {});
    const onError = handlers.onError || (() => {});
    const isDashboardStream =
      path === "/api/events/dashboard" || path.indexOf("/api/events/dashboard?") === 0;

    if (useMock()) {
      let stopped = false;
      let timer = null;
      const api = {
        start() {
          stopped = false;
          const tick = async () => {
            if (stopped) return;
            try {
              const dashPath = path.replace(/^\/api\/events\//, "/api/");
              const body = await scopedGet(dashPath, scope);
              Scope.assertScopeEcho(scope, body);
              onSnapshot(body);
            } catch (err) {
              onError(err);
            }
            if (!stopped) timer = setTimeout(tick, handlers.mockIntervalMs || 15_000);
          };
          tick();
          return api;
        },
        stop() {
          stopped = true;
          if (timer) clearTimeout(timer);
          timer = null;
        },
        get usingFallback() {
          return true;
        },
      };
      return api;
    }

    // Sim (greenfield Control): SSE dashboard route is 404 — poll REST directly.
    if (isDashboardStream && String(scope.execution_env || "").toLowerCase() === "sim") {
      return createDashboardRestPoller(scope, handlers);
    }

    if (!Poll?.createEventSource) {
      return createDashboardRestPoller(scope, handlers);
    }

    const restFallback =
      handlers.fallbackPoller ||
      (isDashboardStream ? createDashboardRestPoller(scope, handlers) : null);

    return Poll.createEventSource(url, {
      withCredentials: true,
      onMessage: (msg) => {
        if (msg?.type === "snapshot") {
          try {
            Scope.assertScopeEcho(scope, msg.data);
            onSnapshot(msg.data);
          } catch (err) {
            onError(err);
          }
        }
      },
      onError,
      fallbackPoller: restFallback,
    });
  }

  return {
    ApiError,
    controlBase,
    useMock,
    scopedUrl,
    scopedGet,
    scopedPost,
    get,
    withQuery,
    scopedEventSource,
    dashboardPathFor,
    fetchDashboard: (scope) => scopedGet(dashboardPathFor(scope), scope),
    fetchStatus: (scope) => scopedGet("/api/status", scope),
    fetchRuns: async (scope, opts = {}) => {
      const extra = {};
      if (opts.limit != null && opts.limit !== "") {
        extra.limit = opts.limit;
      }
      if (opts.offset != null && opts.offset !== "") {
        extra.offset = opts.offset;
      }
      const path = Object.keys(extra).length
        ? withQuery("/api/runs", extra)
        : "/api/runs";
      const body = await scopedGet(path, scope);
      return {
        ...body,
        runs: body.items || body.runs || [],
        total: body.total != null ? Number(body.total) : (body.items || body.runs || []).length,
        limit: body.limit,
        offset: body.offset != null ? Number(body.offset) : 0,
        has_more: !!body.has_more,
      };
    },
    fetchRun: (scope, run_id) =>
      scopedGet(`/api/runs/${encodeURIComponent(run_id)}`, scope),
    fetchSettingsVersions: async (scope) => {
      const body = await scopedGet("/api/settings-versions", scope);
      const versions = body.items || body.versions || [];
      let active_binding = body.active_binding || null;
      // Normalise id to string so Start Run / Strategy find() matches.
      if (active_binding && active_binding.settings_version_id != null) {
        active_binding = {
          ...active_binding,
          settings_version_id: String(active_binding.settings_version_id),
        };
      }
      return {
        ...body,
        versions,
        active_binding,
      };
    },
    saveSettingsVersion: (scope, payload) =>
      scopedPost("/api/settings-versions", scope, { payload }),
    copySettingsVersion: (scope, body) =>
      scopedPost("/api/settings-versions/copy", scope, {
        source_run_id: body.source_run_id,
        mode: body.mode || "all",
        selected_keys: body.selected_keys || body.keys || [],
      }),
    /**
     * GST-113/124 — Copy Sim knobs onto Demo A/B L1 bindings.
     * Call with the **Sim** scope (source). Response echoes Sim and
     * carries Demo identity in target_scope_key / desk_id.
     */
    copySettingsToDemo: (scope, payload, options = {}) =>
      scopedPost(
        "/api/settings-versions/copy-to-demo",
        scope,
        {
          payload: payload || {},
          source_run_id: options.source_run_id || null,
        },
        options
      ),
    bindSettingsVersion: (scope, body) =>
      scopedPost("/api/settings-bindings", scope, {
        settings_version_id: body.settings_version_id,
      }),
    startRun: (scope, body) => scopedPost("/api/runs", scope, body),
    cancelRun: (scope, run_id) =>
      scopedPost(`/api/runs/${encodeURIComponent(run_id)}/cancel`, scope, {}),
    deleteRuns: (scope, body) => scopedPost("/api/runs/delete", scope, body),
    compareRuns: (scope, run_ids) => {
      const path = withQuery("/api/runs/compare", { run_ids: run_ids || [] });
      return scopedGet(path, scope);
    },
    fetchRunEvents: (scope, run_id, cursor) =>
      scopedGet(
        withQuery(`/api/runs/${encodeURIComponent(run_id)}/events`, {
          cursor: cursor || 0,
        }),
        scope
      ),
    fetchRunLearning: (scope, run_id) =>
      scopedGet(`/api/runs/${encodeURIComponent(run_id)}/learning`, scope),
    /**
     * Portfolio overview — composed from operational desks + scoped reads.
     * Greenfield Control has no unscoped `/api/overview`; calling it produced
     * UAT C-01 scope 404s after a valid login. Readable desks (Sim A today)
     * load `/api/dashboard`; gated/dormant desks render intentional status tiles.
     */
    fetchOverview: async () => {
      const Nav =
        root.GekkoNavigationConfig ||
        (typeof require === "function" ? require("./navigation-config.js") : null);
      const Cap =
        root.GekkoSimCapability ||
        (typeof require === "function" ? require("./sim-capability.js") : null);
      const desks = Nav?.OPERATIONAL_DESK_ORDER || [];
      const composed = [];
      for (const desk of desks) {
        const scope = {
          execution_env: desk.execution_env,
          lane: desk.lane,
          scope_key: desk.scope_key,
        };
        const gate = Cap?.gateState?.(scope) || {
          state: "unknown",
          title: "Scope not ready",
        };
        const base = {
          execution_env: desk.execution_env,
          lane: desk.lane,
          scope_key: desk.scope_key,
          playbook_key: null,
          // Human label for operators (UI Presentation — no raw gate tokens).
          runtime_status: gate.title || gate.state,
          gate_state: gate.state,
          is_dormant: gate.state === "dormant",
          equity: null,
          realized_pnl: null,
          open_positions: null,
        };
        // Sim desks use the scoped Control route; Demo desks use their canonical
        // product-bound dashboard routes. Both must return an echoed scope.
        if (
          scope.execution_env === "demo" ||
          Cap?.isSimActive?.(scope) ||
          Cap?.isSimLaneA?.(scope)
        ) {
          try {
            const dash = await scopedGet(dashboardPathFor(scope), scope);
            composed.push({
              ...base,
              playbook_key: dash.playbook_key ?? null,
              runtime_status: dash.runtime_status || dash.gate_state || gate.state,
              is_dormant: !!dash.is_dormant,
              equity: dash.equity ?? null,
              realized_pnl: dash.realized_pnl ?? null,
              open_positions: dash.open_positions ?? null,
              opening_balance: dash.opening_balance ?? null,
            });
          } catch (_) {
            composed.push({
              ...base,
              runtime_status: "unavailable",
            });
          }
        } else {
          composed.push(base);
        }
      }
      return { desks: Nav?.sortDesksByOperationalOrder?.(composed) || composed };
    },
    /** Soft-fail when the promotion-audit route is not mounted yet (UAT C-01). */
    fetchAuditEvents: async () => {
      try {
        return await get("/api/audit/scope-events");
      } catch (err) {
        if (err?.status === 404 || err?.http_status === 404) {
          return { events: [] };
        }
        throw err;
      }
    },
    subscribeDashboard: (scope, handlers) =>
      scopedEventSource("/api/events/dashboard", scope, handlers),
    subscribeRunEvents,
  };
});
