/**
 * Scope selector — execution_env first, then lane.
 * Live hides the lane picker (single desk).
 *
 * Pure helpers export for Node tests; DOM mount stays browser-only.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GekkoScopeSelector = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function scopeApi() {
    return (root && root.GekkoScope) || (typeof require === "function" ? require("./scope.js") : null);
  }

  function navApi() {
    return (
      (root && root.GekkoNavigationConfig) ||
      (typeof require === "function" ? require("./navigation-config.js") : null)
    );
  }

  /** Lane picker is only for sim/demo; live is a single desk. */
  function showsLanePicker(execution_env) {
    return execution_env === "sim" || execution_env === "demo";
  }

  /** Env options in operator priority: Live → Demo → Sim. */
  function executionEnvUiOrder() {
    const Nav = navApi();
    return Nav?.EXECUTION_ENV_UI_ORDER || ["live", "demo", "sim"];
  }

  function envOptionLabel(execution_env) {
    const Nav = navApi();
    return Nav?.ENV_OPTION_LABELS?.[execution_env] || String(execution_env || "");
  }

  function envOptionsHtml(selectedEnv, { includePlaceholder = true } = {}) {
    const options = [];
    if (includePlaceholder) {
      options.push(
        `<option value="" ${!selectedEnv ? "selected" : ""} disabled>Select env</option>`
      );
    }
    for (const value of executionEnvUiOrder()) {
      options.push(
        `<option value="${value}" ${selectedEnv === value ? "selected" : ""}>${envOptionLabel(value)}</option>`
      );
    }
    return options.join("");
  }

  /**
   * Build a canonical scope from selector values.
   * Returns null when the selection is incomplete (no invented defaults).
   */
  function buildScopeFromSelection(execution_env, lane) {
    if (!execution_env) return null;
    if (execution_env === "live") {
      return Object.freeze({
        execution_env: "live",
        lane: null,
        scope_key: "live",
      });
    }
    if (!showsLanePicker(execution_env)) return null;
    if (!lane || (lane !== "a" && lane !== "b")) return null;
    return Object.freeze({
      execution_env,
      lane,
      scope_key: `${execution_env}|${lane}`,
    });
  }

  function surfaceFromPath(pathname) {
    const parts = String(pathname || "/")
      .split("/")
      .filter(Boolean);
    if (parts[0] === "sim" || parts[0] === "demo") {
      if (
        parts[2] === "results" ||
        parts[2] === "runs" ||
        parts[2] === "setup" ||
        parts[2] === "compare"
      ) {
        return parts[2];
      }
    }
    return "";
  }

  function escapeHtml(value) {
    return root?.GekkoUi?.escapeHtml?.(value) ?? String(value ?? "");
  }

  function currentScope() {
    const Scope = scopeApi();
    if (!Scope) return null;
    const fromPath = Scope.parseScopeFromPath?.(
      typeof location !== "undefined" ? location.pathname : "/"
    );
    if (fromPath) return fromPath;
    return Scope.readStoredScope?.() || null;
  }

  function navigateTo(scope, surface) {
    const Scope = scopeApi();
    if (!Scope || !scope) return;
    Scope.storeScope?.(scope);
    const href = Scope.pathForScope(scope, surface || "");
    const Nav = navApi();
    if (
      typeof location !== "undefined" &&
      Nav?.normalizePath?.(href) === Nav?.normalizePath?.(location.pathname)
    ) {
      return;
    }
    if (typeof location !== "undefined") location.assign(href);
  }

  /**
   * Top Env/Lane pickers removed (operator directive): desk scope comes from
   * left-nav links and URL routes only. Helpers above stay for tests/navigation.
   */
  function unmountTopChrome(host) {
    const el =
      host ||
      (typeof document !== "undefined"
        ? document.getElementById("scopeSelector")
        : null);
    if (!el) return;
    el.innerHTML = "";
    el.hidden = true;
    if (typeof el.setAttribute === "function") {
      el.setAttribute("hidden", "");
      el.setAttribute("aria-hidden", "true");
    }
  }

  /** @deprecated Use left nav / URL scope. Kept as no-op clear for callers. */
  function mount(host) {
    unmountTopChrome(host);
  }

  function remountPending(el) {
    unmountTopChrome(el);
  }

  /** Render exact scope chip beside a metric figure. */
  function renderScopeChip(host, scope, playbook_key) {
    if (typeof document === "undefined") return;
    const el = typeof host === "string" ? document.getElementById(host) : host;
    if (!el) return;
    const Scope = scopeApi();
    const label = Scope?.formatScopeLabel?.(scope, playbook_key) || "—";
    el.classList.add("scope-chip");
    el.textContent = label;
    el.title = label;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => unmountTopChrome());
    } else {
      unmountTopChrome();
    }
  }

  return {
    showsLanePicker,
    buildScopeFromSelection,
    surfaceFromPath,
    executionEnvUiOrder,
    envOptionLabel,
    envOptionsHtml,
    mount,
    unmountTopChrome,
    currentScope,
    navigateTo,
    renderScopeChip,
    escapeHtml,
  };
});
