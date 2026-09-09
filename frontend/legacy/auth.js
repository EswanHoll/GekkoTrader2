/*! GekkoTrader auth — email + password session (JWT from /api/auth/login). */
(function (root) {
  "use strict";

  const LANDING_PATH = "/sim/a/";
  const TOKEN_KEY = "gekko_auth_token";
  const USER_KEY = "gekko_auth_user";

  function authApiBase() {
    if (root.GekkoControlConfig?.resolveControlBase) {
      return root.GekkoControlConfig.resolveControlBase({ allowMockLocal: false });
    }
    const fromWindow =
      root.GEKKO_API_URL != null ? String(root.GEKKO_API_URL).trim() : "";
    let fromStorage = "";
    try {
      fromStorage = String(localStorage.getItem("gekko_api_url") || "").trim();
    } catch (_) {
      /* private mode */
    }
    const raw = fromWindow || fromStorage;
    if (!raw) {
      const err = new Error(
        root.GekkoControlConfig?.MISSING_MSG ||
          "Control API URL is not configured. Set Cursor/GitHub secret CONTROL_API_URL__PROJ_GEKKOTRADER to the AWS Tokyo Control ALB HTTPS origin (operator-supplied; patches window.GEKKO_API_URL at deploy)."
      );
      err.code = "gekko_api_url_missing";
      throw err;
    }
    return raw.replace(/\/$/, "");
  }

  function readUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function tokenExpired(token, nowMs = Date.now()) {
    try {
      const part = String(token || "").split(".")[1];
      if (!part) return true;
      const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
      const payload = JSON.parse(json);
      const exp = Number(payload?.exp) || 0;
      if (!exp) return false;
      return exp * 1000 < nowMs + 5_000;
    } catch (_) {
      return true;
    }
  }

  function isLoginPath(pathname) {
    const path = String(pathname || "").replace(/\/+$/, "") || "/";
    return path === "/login" || path.endsWith("/login");
  }

  /** Soft-gate: missing and expired sessions both need /login/?next=… */
  function needsLoginRedirect({ pathname, token, nowMs = Date.now() } = {}) {
    if (isLoginPath(pathname)) return false;
    const t = token == null ? getToken() : String(token || "");
    if (!t) return true;
    return tokenExpired(t, nowMs);
  }

  function loginHrefWithNext(pathname, search = "", { force = false } = {}) {
    const path = String(pathname || "/");
    const q = search == null ? "" : String(search);
    const params = new URLSearchParams();
    params.set("next", path + q);
    if (force) params.set("force", "1");
    return `/login/?${params.toString()}`;
  }

  /** Break stale-session catch-22 — always clear before showing the form. */
  function forceLoginHref(pathname, search = "") {
    return loginHrefWithNext(pathname, search, { force: true });
  }

  function wantsForceClear(search) {
    try {
      const params =
        typeof search === "string"
          ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
          : search instanceof URLSearchParams
            ? search
            : new URLSearchParams();
      return params.get("force") === "1" || params.get("clear") === "1";
    } catch (_) {
      return false;
    }
  }

  /**
   * /login/?force=1 or ?clear=1 — wipe local session and strip the flags.
   * Returns true when a force/clear was applied (caller must NOT redirect-away).
   */
  function applyForceClear(search, { replaceUrl } = {}) {
    if (!wantsForceClear(search)) return false;
    clearSession();
    if (typeof replaceUrl === "function") {
      try {
        const raw = typeof search === "string" ? search : String(search || "");
        const params = new URLSearchParams(
          raw.startsWith("?") ? raw.slice(1) : raw
        );
        params.delete("force");
        params.delete("clear");
        const q = params.toString();
        const path =
          typeof location !== "undefined" ? location.pathname : "/login/";
        const hash =
          typeof location !== "undefined" ? location.hash || "" : "";
        replaceUrl(path + (q ? `?${q}` : "") + hash);
      } catch (_) {
        /* ignore */
      }
    }
    return true;
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    root.dispatchEvent?.(new Event("gekko-auth-changed"));
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (_) {
      /* private mode */
    }
    root.dispatchEvent?.(new Event("gekko-auth-changed"));
  }

  async function getSession({ refresh = false } = {}) {
    const token = getToken();
    const cached = readUser();
    if (!token) return null;
    if (tokenExpired(token)) {
      clearSession();
      return null;
    }
    // Trust short-circuit only when caller does not need a live check.
    if (!refresh && cached?.email) {
      return { token, user: { email: cached.email, role: cached.role, id: cached.id } };
    }
    try {
      const res = await fetch(`${authApiBase()}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        clearSession();
        return null;
      }
      const data = await res.json();
      const user = { email: data.email, role: data.role, id: data.id };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return { token, user };
    } catch (_) {
      return null;
    }
  }

  async function login(email, password) {
    const res = await fetch(`${authApiBase()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(email || "").trim(), password: String(password || "") }),
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* ignore */
    }
    if (!res.ok) {
      const detail = data.detail || data.error || "Invalid email or password";
      return { ok: false, error: typeof detail === "string" ? detail : JSON.stringify(detail) };
    }
    const user = { email: data.email, role: data.role, id: data.id };
    setSession(data.token, user);
    return { ok: true, user, token: data.token };
  }

  async function googleConfig() {
    const res = await fetch(`${authApiBase()}/api/auth/google/config`);
    if (!res.ok) return { enabled: false, client_id: null };
    try {
      return await res.json();
    } catch (_) {
      return { enabled: false, client_id: null };
    }
  }

  async function loginWithGoogle(credential) {
    const res = await fetch(`${authApiBase()}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: String(credential || "") }),
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* ignore */
    }
    if (!res.ok) {
      const detail = data.detail || data.error || "Google sign-in failed";
      return { ok: false, error: typeof detail === "string" ? detail : JSON.stringify(detail) };
    }
    const user = { email: data.email, role: data.role, id: data.id };
    setSession(data.token, user);
    return { ok: true, user, token: data.token };
  }

  async function register(email, password) {
    const payload = JSON.stringify({
      email: String(email || "").trim(),
      password: String(password || ""),
    });
    const headers = { "Content-Type": "application/json" };
    const primary = await fetch(`${authApiBase()}/api/auth/register`, {
      method: "POST",
      headers,
      body: payload,
    });
    let data = {};
    try {
      data = await primary.json();
    } catch (_) {
      /* ignore */
    }
    if (!primary.ok) {
      const detail = data.detail || data.error || "Could not register";
      return { ok: false, error: typeof detail === "string" ? detail : JSON.stringify(detail) };
    }
    return {
      ok: true,
      status: data.status || "pending",
      message: data.message || "Registration submitted. An admin must approve before you can sign in.",
    };
  }

  async function authFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const res = await fetch(`${authApiBase()}${path}`, { ...options, headers });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      /* ignore */
    }
    if (!res.ok) {
      const detail = data?.detail || data?.error || res.statusText;
      const err = new Error(
        typeof detail === "string" ? detail : JSON.stringify(detail)
      );
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /** Plain-English errors for POST /api/auth/change-password. */
  function changePasswordErrorMessage(err) {
    const status = err?.status;
    const raw = String(err?.message || err || "");
    if (status === 404 || /not found/i.test(raw)) {
      return "Password change is not available on Control yet. Wait for the App route to deploy, then try again.";
    }
    if (status === 401 || /unauthorized|unauthenticated|invalid token/i.test(raw)) {
      return "Your session expired. Sign in again, then change your password.";
    }
    if (status === 403 || /forbidden|current.?password|incorrect|invalid.?password|wrong.?password/i.test(raw)) {
      return "Current password is incorrect.";
    }
    if (status === 422 || /too short|min(imum)?|at least 8|validation/i.test(raw)) {
      return "New password must be at least 8 characters.";
    }
    if (/failed to fetch|networkerror|network/i.test(raw)) {
      return "Could not reach Control. Check your connection and try again.";
    }
    if (raw && raw !== "Error" && raw.length < 180) return raw;
    return "Could not change password. Try again.";
  }

  /**
   * GST-47 — authenticated password change.
   * Body: { current_password, new_password }. Feature-detects App 404.
   */
  async function changePassword(currentPassword, newPassword) {
    const current = String(currentPassword || "");
    const next = String(newPassword || "");
    if (!current) {
      const err = new Error("Enter your current password.");
      err.status = 422;
      throw err;
    }
    if (!next || next.length < 8) {
      const err = new Error("New password must be at least 8 characters.");
      err.status = 422;
      throw err;
    }
    if (current === next) {
      const err = new Error("New password must be different from the current password.");
      err.status = 422;
      throw err;
    }
    try {
      return await authFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
    } catch (err) {
      const friendly = new Error(changePasswordErrorMessage(err));
      friendly.status = err?.status;
      friendly.code = err?.status === 404 ? "not_available" : err?.code;
      throw friendly;
    }
  }

  async function signOut() {
    const token = getToken();
    if (token) {
      try {
        await fetch(`${authApiBase()}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (_) {
        /* ignore */
      }
    }
    try {
      await root.GekkoOperator?.logoutSession?.();
    } catch (_) {
      /* ignore — write cookie clear is best-effort on sign-out */
    }
    clearSession();
  }

  /**
   * Soft-gate (sync): expired token → clear and treat as logged out.
   * Does NOT navigate away — shell must show pinned Sign in so operators
   * can reach /login/?force=1 without console workarounds.
   * Returns true when the session was cleared / missing (logged out).
   */
  function requireAuthOrRedirect() {
    if (typeof location === "undefined") return false;
    if (isLoginPath(location.pathname)) return false;
    const token = getToken();
    if (!needsLoginRedirect({ pathname: location.pathname, token })) {
      return false;
    }
    if (token) clearSession();
    return true; // logged out — caller paints Sign in chrome
  }

  /**
   * Async soft-gate: expired OR /me-invalid → clear; return null (logged out).
   * Network blips leave the token but still return null so chrome shows Sign in
   * (never trust cache-only). Does not auto-bounce to /login/ — pinned Sign in does.
   */
  async function validateSessionOrRedirect() {
    if (typeof location === "undefined") return null;
    if (isLoginPath(location.pathname)) return null;
    requireAuthOrRedirect();
    const session = await getSession({ refresh: true });
    if (session?.user) return session;
    // /me invalid already cleared; network failure → do not trust cache.
    return null;
  }

  const api = {
    isConfigured: () => true,
    getSession,
    getToken,
    clearSession,
    tokenExpired,
    isLoginPath,
    needsLoginRedirect,
    loginHrefWithNext,
    forceLoginHref,
    wantsForceClear,
    applyForceClear,
    login,
    loginWithGoogle,
    googleConfig,
    register,
    authFetch,
    changePassword,
    changePasswordErrorMessage,
    signOut,
    requireAuthOrRedirect,
    validateSessionOrRedirect,
    landingPath: LANDING_PATH,
    authApiBase,
  };

  root.GekkoAuth = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  // Soft gate every page except login (browser only).
  if (typeof location !== "undefined" && typeof document !== "undefined") {
    requireAuthOrRedirect();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
