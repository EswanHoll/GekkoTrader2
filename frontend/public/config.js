/**
 * Runtime Pages config.
 *
 * Browser global window.GEKKO_API_URL is patched at deploy from the Cursor /
 * GitHub Actions secret CONTROL_API_URL__PROJ_GEKKOTRADER (ADR-0006) — AWS
 * Tokyo Control ALB HTTPS origin (operator-supplied). Empty in-repo on purpose
 * — there is no product default to *.fly.dev. Legacy Fly is opt-in only via
 * the scoped secret.
 */
(function (root) {
  "use strict";

  root.GEKKO_API_URL = "";
  root.GEKKO_OPENING_BALANCE = 5000;
  root.GEKKO_UI_VERSION = "202608061349";
  /* GST-12: real Control API by default. Opt-in mocks: GEKKO_USE_MOCK_API=true or localStorage gekko_use_mock_api=true */
  root.GEKKO_USE_MOCK_API = false;
  root.GEKKO_SUPABASE_URL = "";
  root.GEKKO_SUPABASE_ANON_KEY = "";

  const MISSING_MSG =
    "Control API URL is not configured. Set Cursor/GitHub secret CONTROL_API_URL__PROJ_GEKKOTRADER to the AWS Tokyo Control ALB HTTPS origin (operator-supplied; patches window.GEKKO_API_URL at deploy). There is no hard-coded Control host; legacy Fly requires an explicit scoped-secret opt-in.";

  function configuredUrl() {
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
    // Prefer shipped Pages config; localStorage is operator override / opt-in only.
    return fromRoot || fromStorage;
  }

  function mockEnabled() {
    if (root && typeof root.GEKKO_USE_MOCK_API === "boolean") {
      return root.GEKKO_USE_MOCK_API;
    }
    try {
      if (typeof localStorage !== "undefined") {
        const flag = localStorage.getItem("gekko_use_mock_api");
        if (flag === "1" || flag === "true") return true;
        if (flag === "0" || flag === "false") return false;
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function resolveControlBase({ allowMockLocal = false } = {}) {
    const raw = configuredUrl();
    if (raw) {
      if (!/^https:\/\//i.test(raw)) {
        const err = new Error(
          "window.GEKKO_API_URL must be an https:// Control origin (patched from CONTROL_API_URL__PROJ_GEKKOTRADER — AWS Tokyo Control ALB, or legacy Fly if explicitly set)."
        );
        err.code = "gekko_api_url_invalid";
        throw err;
      }
      return raw.replace(/\/$/, "");
    }
    if (allowMockLocal && mockEnabled()) {
      return "https://control.local";
    }
    const err = new Error(MISSING_MSG);
    err.code = "gekko_api_url_missing";
    throw err;
  }

  const api = {
    MISSING_MSG,
    configuredUrl,
    mockEnabled,
    resolveControlBase,
    isConfigured() {
      return !!configuredUrl();
    },
  };

  root.GekkoControlConfig = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
