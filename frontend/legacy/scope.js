/**
 * Canonical DatasetScope helpers (LOCKED Scope Contract).
 * execution_env ∈ {sim, demo, live}; lane ∈ {a, b}; live has no lane.
 * Order is always env-before-lane. No defaults, no sentinels.
 *
 * Works in browser (window.GekkoScope) and Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GekkoScope = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LANES = Object.freeze(["a", "b"]);
  const EXECUTION_ENVS = Object.freeze(["sim", "demo", "live"]);

  const ENV_LABELS = Object.freeze({
    sim: "Sim",
    demo: "Demo",
    live: "Live",
  });

  const LANE_LABELS = Object.freeze({
    a: "A",
    b: "B",
  });

  class ScopeError extends Error {
    constructor(message, httpStatus) {
      super(message);
      this.name = "ScopeError";
      this.http_status = httpStatus || 422;
    }
  }

  function normalizePath(pathname) {
    let path = String(pathname || "/");
    try {
      path = new URL(path, "https://gekkotrader.local").pathname;
    } catch (_) {
      /* keep raw */
    }
    if (!path.startsWith("/")) path = `/${path}`;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path || "/";
  }

  function pathParts(pathname) {
    const path = normalizePath(pathname);
    return path === "/" ? [] : path.slice(1).split("/").filter(Boolean);
  }

  /**
   * Parse scope from a UI path. Returns null for hubs without desk scope
   * (/overview, /status, /audit, /admin, /login, /).
   * Throws ScopeError (422) for structurally invalid scoped paths.
   */
  function parseScopeFromPath(pathname) {
    const parts = pathParts(pathname);
    if (!parts.length) return null;

    const head = parts[0];
    if (head === "overview" || head === "status" || head === "audit" || head === "admin" || head === "login") {
      return null;
    }

    if (head === "live") {
      return Object.freeze({
        execution_env: "live",
        lane: null,
        scope_key: "live",
      });
    }

    if (head === "sim" || head === "demo") {
      const lane = parts[1];
      if (!lane) {
        throw new ScopeError(`missing lane for execution_env=${head}`, 422);
      }
      if (!LANES.includes(lane)) {
        throw new ScopeError(`invalid lane=${lane}`, 422);
      }
      return Object.freeze({
        execution_env: head,
        lane,
        scope_key: `${head}|${lane}`,
      });
    }

    return null;
  }

  /** Build canonical path for a scope (+ optional surface suffix). */
  function pathForScope(scope, surface) {
    if (!scope || !scope.execution_env) {
      throw new ScopeError("execution_env required", 422);
    }
    const env = scope.execution_env;
    if (!EXECUTION_ENVS.includes(env)) {
      throw new ScopeError(`invalid execution_env=${env}`, 422);
    }
    let base;
    if (env === "live") {
      base = "/live";
    } else {
      if (!scope.lane || !LANES.includes(scope.lane)) {
        throw new ScopeError(`lane required for execution_env=${env}`, 422);
      }
      base = `/${env}/${scope.lane}`;
    }
    const suffix = String(surface || "").replace(/^\/+|\/+$/g, "");
    if (!suffix) return `${base}/`;
    return `${base}/${suffix}/`;
  }

  /** Query params for every scoped fetch / EventSource. Live omits lane. */
  function scopeQueryParams(scope) {
    if (!scope || !scope.execution_env) {
      throw new ScopeError("execution_env required", 422);
    }
    const params = new URLSearchParams();
    params.set("execution_env", scope.execution_env);
    if (scope.execution_env === "live") {
      return params;
    }
    if (!scope.lane) {
      throw new ScopeError("lane required for non-live scope", 422);
    }
    params.set("lane", scope.lane);
    return params;
  }

  function appendScopeParams(url, scope) {
    const u = new URL(url, "https://gekkotrader.local");
    const params = scopeQueryParams(scope);
    params.forEach((value, key) => {
      u.searchParams.set(key, value);
    });
    return u.pathname + u.search + u.hash;
  }

  function scopeKey(scope) {
    if (!scope) throw new ScopeError("scope required", 422);
    if (scope.execution_env === "live") return "live";
    if (!scope.lane) throw new ScopeError("lane required", 422);
    return `${scope.execution_env}|${scope.lane}`;
  }

  function envLabel(execution_env) {
    return ENV_LABELS[execution_env] || String(execution_env || "—");
  }

  function laneLabel(lane) {
    if (lane == null || lane === "") return "";
    return LANE_LABELS[lane] || String(lane).toUpperCase();
  }

  /** Desk name: "Sim A", "Demo B", "Live". */
  function deskLabel(scope) {
    if (!scope) return "—";
    if (scope.execution_env === "live" || !scope.lane) {
      return envLabel(scope.execution_env);
    }
    return `${envLabel(scope.execution_env)} ${laneLabel(scope.lane)}`;
  }

  /**
   * Naming Standard §2.4 — suite family → default runnable playbook version.
   * Never display suite names (baseline/classic/regime) as playbook_key.
   */
  const SUITE_TO_PLAYBOOK = {
    baseline: "playbook1.1",
    classic: "playbook2.1",
    regime: "playbook3.1",
    playbook1: "playbook1.1",
    playbook2: "playbook2.1",
    playbook3: "playbook3.1",
    playbook_1: "playbook1.1",
    playbook_2: "playbook2.1",
    playbook_3: "playbook3.1",
  };
  const PLAYBOOK_FAMILY_DEFAULT = {
    playbook1: "playbook1.1",
    playbook2: "playbook2.1",
    playbook3: "playbook3.1",
  };

  /**
   * GST-107 — resolve a display playbook label ``playbookN.M``.
   * Returns "" when nothing canonical can be derived.
   */
  function resolvePlaybookKey(playbook_key, strategy_suite, scope) {
    const raw = String(playbook_key || "")
      .trim()
      .toLowerCase();
    if (raw.startsWith("playbook") && raw.includes(".")) return raw;
    if (PLAYBOOK_FAMILY_DEFAULT[raw]) return PLAYBOOK_FAMILY_DEFAULT[raw];
    if (SUITE_TO_PLAYBOOK[raw]) return SUITE_TO_PLAYBOOK[raw];

    const suite = String(strategy_suite || "")
      .trim()
      .toLowerCase();
    if (SUITE_TO_PLAYBOOK[suite]) return SUITE_TO_PLAYBOOK[suite];
    if (suite.startsWith("playbook") && suite.includes(".")) return suite;

    const lane = String(scope?.lane || "").toLowerCase();
    if (lane === "b") return SUITE_TO_PLAYBOOK.regime;
    if (lane === "a") return SUITE_TO_PLAYBOOK.baseline;
    return "";
  }

  /**
   * Operator-facing scope line: "Demo A · playbook1.1"
   * Always used beside PnL / positions / balances.
   */
  function formatScopeLabel(scope, playbook_key) {
    if (!scope) return "—";
    const parts = [deskLabel(scope)];
    // Explicit playbook only — do not invent from lane defaults.
    const playbook = resolvePlaybookKey(playbook_key, null, null);
    if (playbook) parts.push(playbook);
    return parts.join(" · ");
  }

  /**
   * Fail-closed: reject payloads whose echoed scope ≠ requested scope.
   * Live responses must echo execution_env=live and omit/null lane.
   */
  function assertScopeEcho(requested, payload) {
    if (!requested) {
      throw new ScopeError("requested scope required", 422);
    }
    if (!payload || typeof payload !== "object") {
      throw new ScopeError("scoped payload missing", 404);
    }
    const echoed_env = payload.execution_env;
    if (echoed_env !== requested.execution_env) {
      const err = new ScopeError(
        `scope echo mismatch: requested execution_env=${requested.execution_env} got ${echoed_env}`,
        404
      );
      err.code = "scope_echo_mismatch";
      throw err;
    }
    if (requested.execution_env === "live") {
      if (payload.lane != null && payload.lane !== "") {
        const err = new ScopeError("live desk must not echo a lane", 404);
        err.code = "scope_echo_mismatch";
        throw err;
      }
      return true;
    }
    if (payload.lane !== requested.lane) {
      const err = new ScopeError(
        `scope echo mismatch: requested lane=${requested.lane} got ${payload.lane}`,
        404
      );
      err.code = "scope_echo_mismatch";
      throw err;
    }
    return true;
  }

  function scopesEqual(a, b) {
    if (!a || !b) return false;
    if (a.execution_env !== b.execution_env) return false;
    if (a.execution_env === "live") return true;
    return a.lane === b.lane;
  }

  /** Last-used scope persistence (never invents defaults for API calls). */
  const STORAGE_KEY = "gekko_last_scope";

  function readStoredScope() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !EXECUTION_ENVS.includes(parsed.execution_env)) return null;
      if (parsed.execution_env === "live") {
        return Object.freeze({ execution_env: "live", lane: null, scope_key: "live" });
      }
      if (!LANES.includes(parsed.lane)) return null;
      return Object.freeze({
        execution_env: parsed.execution_env,
        lane: parsed.lane,
        scope_key: `${parsed.execution_env}|${parsed.lane}`,
      });
    } catch (_) {
      return null;
    }
  }

  function storeScope(scope) {
    if (!scope) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          execution_env: scope.execution_env,
          lane: scope.execution_env === "live" ? null : scope.lane,
        })
      );
    } catch (_) {
      /* private mode */
    }
  }

  return {
    LANES,
    EXECUTION_ENVS,
    ENV_LABELS,
    LANE_LABELS,
    ScopeError,
    normalizePath,
    pathParts,
    parseScopeFromPath,
    pathForScope,
    scopeQueryParams,
    appendScopeParams,
    scopeKey,
    envLabel,
    laneLabel,
    deskLabel,
    resolvePlaybookKey,
    formatScopeLabel,
    assertScopeEcho,
    scopesEqual,
    readStoredScope,
    storeScope,
  };
});
