/**
 * Operator write-session helpers.
 *
 * GST-104 — preferred path: mint/remint the short write session from the
 * signed-in super_admin login (Bearer). OPERATOR_CONTROL_SECRET stays on the
 * Control host; operators must not re-paste it for day-to-day writes.
 *
 * Optional backward-compat: Admin → Keys may still save the shared secret on
 * this device. Sessions use an HttpOnly cookie when the browser allows it,
 * plus a short-lived header token in memory/sessionStorage when cross-site
 * cookies are blocked. The control *token* is never stored in localStorage.
 */
(function (root) {
  "use strict";

  const DEVICE_SECRET_KEY = "gekko_ops_device_secret";
  const SESSION_TOKEN_KEY = "gekko_ops_session_token";
  const AUTO_TTL_SECONDS = 900;
  const RENEW_BELOW_SECONDS = 120;
  const IDLE_LOCK_MS = 30 * 60 * 1000;
  const WATCH_INTERVAL_MS = 45 * 1000;

  let _memoryToken = "";
  let _memoryExpiresAt = 0;

  function controlApiBase() {
    // Prefer shipped Pages config (GekkoControlConfig) — no *.fly.dev product default.
    if (root.GekkoControlConfig?.resolveControlBase) {
      return root.GekkoControlConfig.resolveControlBase({ allowMockLocal: false });
    }
    const fromWindow =
      root.GEKKO_API_URL != null ? String(root.GEKKO_API_URL).trim() : "";
    const fromStorage = String(localStorage.getItem("gekko_api_url") || "").trim();
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

  function parseApiDetail(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
      if (parsed && typeof parsed.message === "string") return parsed.message;
    } catch (_) {
      /* plain text */
    }
    return text;
  }

  /** Where operators get the unlock secret (never the login password). */
  const SECRET_WHERE =
    "OPERATOR_CONTROL_SECRET on the Control host secrets — not your login password";

  const OPERATOR_PAGE_HREF = "/admin/keys/";
  const OPERATOR_SESSION_TEXT =
    "Writes need a signed-in admin session. Sign in, then retry — you do not need to paste the operator secret.";
  const OPERATOR_SESSION_HTML =
    'Writes need a signed-in admin session. <a href="/login/?force=1">Sign in</a>, then retry — you do not need to paste the operator secret.';
  const OPERATOR_SESSION_SAVED_TEXT =
    "Write session could not start from your admin login. Sign out and sign back in, then retry — do not paste the operator secret again.";
  const OPERATOR_SESSION_SAVED_HTML =
    'Write session could not start from your admin login. <a href="/login/?force=1">Sign in</a> again, then retry — do not paste the operator secret again.';
  const OPERATOR_SESSION_REJECTED_TEXT =
    "Legacy device-saved operator secret was rejected. Forget it under Admin → Keys if shown — writes unlock from your admin login instead.";
  const OPERATOR_SESSION_REJECTED_HTML =
    'Legacy device-saved operator secret was rejected. Forget it under <a href="/admin/keys/">Admin → Keys</a> if shown — writes unlock from your admin login instead.';

  const SECRET_REJECTED_KEY = "gekko_ops_secret_rejected";

  /** Remembers a just-rejected device secret so we do not look like amnesia. */
  let _secretRejected = false;
  try {
    _secretRejected = sessionStorage.getItem(SECRET_REJECTED_KEY) === "1";
  } catch (_) {
    /* private mode */
  }

  function markSecretRejected(on) {
    _secretRejected = !!on;
    try {
      if (_secretRejected) sessionStorage.setItem(SECRET_REJECTED_KEY, "1");
      else sessionStorage.removeItem(SECRET_REJECTED_KEY);
    } catch (_) {
      /* private mode */
    }
  }

  function isInvalidControlSecretDetail(detail) {
    const lower = String(detail || "").toLowerCase();
    return (
      lower.includes("invalid operator control secret") ||
      lower.includes("invalid control secret") ||
      (lower.includes("incorrect") && lower.includes("operator secret"))
    );
  }

  function friendlyMintError(status, rawText) {
    const detail = parseApiDetail(rawText);
    const lower = detail.toLowerCase();
    if (!detail && (status === 0 || status == null)) {
      return "Could not reach the control server. Check your connection and try again.";
    }
    if (status === 503 || lower.includes("not configured")) {
      return `Operator secret is not set on the server. Set ${SECRET_WHERE}, e.g. fly secrets set OPERATOR_CONTROL_SECRET=… -a gekkotrader-control`;
    }
    if (isInvalidControlSecretDetail(detail)) {
      return OPERATOR_SESSION_REJECTED_TEXT;
    }
    // Bare 401 from a wrong/proxy host must not be treated as "bad secret".
    if (status === 401) {
      return (
        detail ||
        "Could not unlock writes (401). Sign in as admin again — do not paste the operator secret."
      );
    }
    if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
      return "Could not reach the control server. Check your connection and try again.";
    }
    return detail || `Could not unlock writes (${status || "?"}).`;
  }

  function normalizeSecret(secret) {
    return String(secret || "")
      .trim()
      .replace(/^['"]+|['"]+$/g, "");
  }

  function getDeviceSecret() {
    try {
      return normalizeSecret(localStorage.getItem(DEVICE_SECRET_KEY) || "");
    } catch (_) {
      return "";
    }
  }

  function hasDeviceSecret() {
    return !!getDeviceSecret();
  }

  function saveDeviceSecret(secret) {
    const presented = normalizeSecret(secret);
    if (!presented) throw new Error("Enter the operator secret first.");
    localStorage.setItem(DEVICE_SECRET_KEY, presented);
    markSecretRejected(false);
    return presented;
  }

  function clearDeviceSecret() {
    try {
      localStorage.removeItem(DEVICE_SECRET_KEY);
    } catch (_) {
      /* private mode */
    }
    clearSessionToken();
  }

  function clearSessionToken() {
    _memoryToken = "";
    _memoryExpiresAt = 0;
    try {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch (_) {
      /* private mode */
    }
  }

  function rememberSessionToken(token, expiresAt) {
    const presented = normalizeSecret(token);
    const exp = Number(expiresAt) || 0;
    _memoryToken = presented;
    _memoryExpiresAt = presented ? exp : 0;
    try {
      if (presented) {
        sessionStorage.setItem(
          SESSION_TOKEN_KEY,
          JSON.stringify({ token: presented, expires_at: _memoryExpiresAt })
        );
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
      }
    } catch (_) {
      /* private mode — memory still holds the token for this page */
    }
  }

  function getSessionToken() {
    const skewMs = 5_000;
    const nowMs = Date.now();
    if (_memoryToken && (!_memoryExpiresAt || _memoryExpiresAt * 1000 > nowMs + skewMs)) {
      return _memoryToken;
    }
    try {
      const raw = sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      const token = normalizeSecret(parsed?.token);
      const exp = Number(parsed?.expires_at) || 0;
      if (token && (!exp || exp * 1000 > nowMs + skewMs)) {
        _memoryToken = token;
        _memoryExpiresAt = exp;
        return token;
      }
    } catch (_) {
      /* ignore */
    }
    _memoryToken = "";
    _memoryExpiresAt = 0;
    return "";
  }

  function authHeaders(extra = {}) {
    const headers = { Accept: "application/json", ...extra };
    const token = getSessionToken();
    if (token) headers["X-Gekko-Control-Token"] = token;
    return headers;
  }

  function appAuthToken() {
    try {
      return (
        normalizeSecret(root.GekkoAuth?.getToken?.() || "") ||
        normalizeSecret(
          typeof localStorage !== "undefined"
            ? localStorage.getItem("gekko_auth_token") || ""
            : ""
        )
      );
    } catch (_) {
      return "";
    }
  }

  /**
   * Mint a short write session.
   * GST-104 — prefer super_admin Bearer; shared secret header is optional.
   */
  async function mintSession(secret, { ttlSeconds = AUTO_TTL_SECONDS } = {}) {
    const presented = normalizeSecret(secret);
    const authToken = appAuthToken();
    if (!presented && !authToken) {
      throw new Error(
        "Sign in as admin to unlock writes (operator secret paste is no longer required)."
      );
    }
    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    if (presented) headers["X-Operator-Control-Secret"] = presented;
    let res;
    try {
      res = await fetch(`${controlApiBase()}/api/operator/session?ttl_seconds=${ttlSeconds}`, {
        method: "POST",
        credentials: "include",
        headers,
      });
    } catch (err) {
      throw new Error(friendlyMintError(0, err?.message || "failed to fetch"));
    }
    if (!res.ok) {
      const raw = await res.text();
      const err = new Error(friendlyMintError(res.status, raw));
      err.status = res.status;
      err.raw = raw;
      throw err;
    }
    const data = await res.json();
    if (data?.token) {
      rememberSessionToken(data.token, data.expires_at);
    }
    touchActivity();
    return data;
  }

  async function logoutSession() {
    clearSessionToken();
    let res;
    try {
      res = await fetch(`${controlApiBase()}/api/operator/session/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      throw new Error(friendlyMintError(0, err?.message || "failed to fetch"));
    }
    if (!res.ok) throw new Error(parseApiDetail(await res.text()) || res.statusText || "Lock failed");
    return res.json();
  }

  async function fetchSessionStatus() {
    try {
      const res = await fetch(`${controlApiBase()}/api/operator/session`, {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!res.ok) return { active: false, ttl_remaining: 0 };
      return res.json();
    } catch (_) {
      return { active: false, ttl_remaining: 0 };
    }
  }

  let _ensurePromise = null;
  let _ensureForce = false;

  /**
   * Start or renew the write session.
   * GST-104 — remint from super_admin login (no paste). Device secret optional.
   * GST-102 — a force remint must not join a non-force in-flight peek.
   */
  async function ensureWriteSession({ force = false } = {}) {
    if (_ensurePromise) {
      // Upgrade: if a force remint is requested while a soft peek is running,
      // wait for the peek, then run force so Start Run never inherits a stale miss.
      if (force && !_ensureForce) {
        try {
          await _ensurePromise;
        } catch (_) {
          /* continue to force */
        }
        if (getSessionToken()) {
          const st = await fetchSessionStatus();
          if (st.active) return { ...st, needs_secret: false };
        }
      } else {
        return _ensurePromise;
      }
    }
    _ensureForce = !!force;
    _ensurePromise = (async () => {
      try {
        // Cross-site Pages → Control often blocks third-party cookies. A cookie-only
        // "active" peek is not enough: privileged posts need the header token in
        // this tab's sessionStorage (new tabs start with an empty token store).
        if (!force) {
          const st = await fetchSessionStatus();
          const headerToken = getSessionToken();
          if (
            st.active &&
            headerToken &&
            (Number(st.ttl_remaining) || 0) > RENEW_BELOW_SECONDS
          ) {
            return { ...st, needs_secret: false };
          }
        }
        const secret = getDeviceSecret();
        const authToken = appAuthToken();
        if (!secret && !authToken) {
          const st = await fetchSessionStatus();
          if (st.active && getSessionToken()) {
            return { ...st, needs_secret: false };
          }
          return {
            active: false,
            ttl_remaining: 0,
            needs_secret: false,
            needs_login: true,
            rejected: !!_secretRejected,
            error: operatorSessionMessage(),
          };
        }
        try {
          // Prefer admin login mint; pass device secret only as optional fallback.
          const minted = await mintSession(secret, { ttlSeconds: AUTO_TTL_SECONDS });
          if (secret) markSecretRejected(false);
          return {
            active: true,
            needs_secret: false,
            expires_at: minted.expires_at,
            ttl_remaining: minted.ttl_seconds,
            ttl_seconds: minted.ttl_seconds,
            mint_via: minted.mint_via || (secret ? "operator_control_secret" : "super_admin_session"),
          };
        } catch (err) {
          // Legacy device secret rejected — drop it and retry once via admin login.
          if (
            secret &&
            (isInvalidControlSecretDetail(err?.raw) ||
              isInvalidControlSecretDetail(err?.message))
          ) {
            markSecretRejected(true);
            clearDeviceSecret();
            if (authToken) {
              try {
                const minted = await mintSession("", { ttlSeconds: AUTO_TTL_SECONDS });
                return {
                  active: true,
                  needs_secret: false,
                  expires_at: minted.expires_at,
                  ttl_remaining: minted.ttl_seconds,
                  ttl_seconds: minted.ttl_seconds,
                  mint_via: minted.mint_via || "super_admin_session",
                };
              } catch (err2) {
                return {
                  active: false,
                  ttl_remaining: 0,
                  needs_secret: false,
                  needs_login: true,
                  rejected: true,
                  error: err2?.message || OPERATOR_SESSION_SAVED_TEXT,
                };
              }
            }
            return {
              active: false,
              ttl_remaining: 0,
              needs_secret: false,
              needs_login: true,
              rejected: true,
              error: OPERATOR_SESSION_REJECTED_TEXT,
            };
          }
          return {
            active: false,
            ttl_remaining: 0,
            needs_secret: false,
            error:
              err?.message ||
              "Could not renew the write session automatically. Sign in again if needed — do not paste the operator secret.",
          };
        }
      } finally {
        _ensurePromise = null;
        _ensureForce = false;
      }
    })();
    return _ensurePromise;
  }

  function looksLikeOperatorSessionMessage(msg) {
    const lower = String(msg || "").toLowerCase();
    if (
      lower.includes("not configured") ||
      lower.includes("enter the operator secret") ||
      lower.includes("enter the control secret")
    ) {
      return false;
    }
    return (
      lower.includes("operator session") ||
      lower.includes("control session needed") ||
      lower.includes("writes are locked") ||
      lower.includes("writes need the operator secret") ||
      lower.includes("writes need a signed-in admin") ||
      lower.includes("missing control token") ||
      lower.includes("expired control token") ||
      lower.includes("mint an operator") ||
      lower.includes("mint a session") ||
      lower.includes("unlock below") ||
      lower.includes("unlock writes") ||
      lower.includes("admin → keys") ||
      lower.includes("/admin/keys") ||
      lower.includes("write session could not start") ||
      lower.includes("from your admin login") ||
      lower.includes("still saved") ||
      lower.includes("saved operator secret was rejected") ||
      lower.includes("browser-autofilled") ||
      lower.includes("operator secret is incorrect") ||
      lower.includes("invalid operator control secret") ||
      lower.includes("do not paste the operator secret")
    );
  }

  function operatorSessionMessage() {
    if (_secretRejected && !hasDeviceSecret() && !appAuthToken()) {
      return OPERATOR_SESSION_REJECTED_TEXT;
    }
    if (appAuthToken()) return OPERATOR_SESSION_SAVED_TEXT;
    return OPERATOR_SESSION_TEXT;
  }

  function operatorSessionHtml(msg) {
    if (!looksLikeOperatorSessionMessage(msg)) return null;
    const text = String(msg || "").toLowerCase();
    if (_secretRejected && !hasDeviceSecret() && !appAuthToken()) {
      return OPERATOR_SESSION_REJECTED_HTML;
    }
    if (text.includes("rejected") || text.includes("autofilled")) {
      return OPERATOR_SESSION_REJECTED_HTML;
    }
    if (appAuthToken() || hasDeviceSecret()) return OPERATOR_SESSION_SAVED_HTML;
    return OPERATOR_SESSION_HTML;
  }

  function applyStatusMessage(el, msg) {
    if (!el) return;
    const html = operatorSessionHtml(msg);
    if (html) {
      el.innerHTML = html;
      return;
    }
    el.textContent = msg || "";
  }

  function isLoginAuthFailure(rawText) {
    const lower = String(rawText || "").toLowerCase();
    return (
      lower.includes("authentication required") ||
      lower.includes("invalid or expired token") ||
      lower.includes("invalid token subject") ||
      lower.includes("user not found") ||
      lower.includes("super admin required")
    );
  }

  function friendlyControlError(status, rawText) {
    const detail = parseApiDetail(rawText);
    const lower = detail.toLowerCase();
    if (isInvalidControlSecretDetail(detail)) {
      return OPERATOR_SESSION_REJECTED_TEXT;
    }
    if (status === 503 || lower.includes("not configured")) {
      if (lower.includes("fly_api_token")) {
        return detail || "FLY_API_TOKEN is not configured on control.";
      }
      return `Operator secret is not set on the server. Set ${SECRET_WHERE}, e.g. fly secrets set OPERATOR_CONTROL_SECRET=… -a gekkotrader-control`;
    }
    // Login JWT failures must not be phrased as operator write-session problems.
    if (lower.includes("super admin required")) {
      return "Super admin access required. Sign in with a super admin account, then retry.";
    }
    if (
      lower.includes("authentication required") ||
      lower.includes("invalid or expired token") ||
      lower.includes("invalid token subject") ||
      lower.includes("user not found")
    ) {
      return "Sign in expired. Open Login, sign in again, then retry.";
    }
    if (
      lower.includes("missing control token") ||
      lower.includes("expired control token") ||
      lower.includes("invalid control token") ||
      lower.includes("operator session") ||
      lower.includes("control session")
    ) {
      return operatorSessionMessage();
    }
    // Bare 401/403 without a recognizable detail — keep the API text.
    if ((status === 401 || status === 403) && detail) {
      return detail;
    }
    return detail || `Request failed (${status || "?"})`;
  }

  function isControlAuthDenied(status, rawText) {
    if (isLoginAuthFailure(rawText)) return false;
    const lower = String(rawText || "").toLowerCase();
    return (
      lower.includes("missing control token") ||
      lower.includes("expired control token") ||
      lower.includes("invalid control token") ||
      lower.includes("operator session") ||
      lower.includes("control session") ||
      // Unknown 401/403 after login auth ruled out — retry control mint once.
      status === 401 ||
      status === 403
    );
  }

  async function privilegedFetch(path, options = {}) {
    const baseHeaders = { ...(options.headers || {}) };

    async function once() {
      const headers = { ...baseHeaders };
      const authToken = root.GekkoAuth?.getToken?.() || localStorage.getItem("gekko_auth_token");
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      const controlToken = getSessionToken();
      if (controlToken) headers["X-Gekko-Control-Token"] = controlToken;
      return fetch(`${controlApiBase()}${path}`, {
        ...options,
        credentials: "include",
        headers,
      });
    }

    touchActivity();
    // GST-104 — always try remint from admin login (device secret optional).
    if (appAuthToken() || hasDeviceSecret()) {
      const ensured = await ensureWriteSession();
      if (!ensured?.active) {
        const err = new Error(ensured?.error || operatorSessionMessage());
        err.status = 401;
        throw err;
      }
    }

    let res = await once();
    if (!res.ok) {
      const raw = await res.text();
      if (
        isControlAuthDenied(res.status, raw) &&
        (appAuthToken() || hasDeviceSecret())
      ) {
        clearSessionToken();
        const ensured = await ensureWriteSession({ force: true });
        if (!ensured?.active) {
          const err = new Error(ensured?.error || operatorSessionMessage());
          err.status = 401;
          throw err;
        }
        res = await once();
        if (res.ok) {
          const ctOk = res.headers.get("content-type") || "";
          if (ctOk.includes("application/json")) return res.json();
          return res.text();
        }
        const raw2 = await res.text();
        const err2 = new Error(friendlyControlError(res.status, raw2));
        err2.status = res.status;
        err2.raw = raw2;
        throw err2;
      }
      const err = new Error(friendlyControlError(res.status, raw));
      err.status = res.status;
      err.raw = raw;
      throw err;
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text();
  }

  async function setKillSwitch(active) {
    const q = active ? "true" : "false";
    return privilegedFetch(`/api/kill?active=${q}`, { method: "POST" });
  }

  function formatUnlockStatus(data, { saved } = {}) {
    const device = saved == null ? hasDeviceSecret() : !!saved;
    if (!data?.active) {
      if (appAuthToken()) {
        return "Signed in as admin · writes unlock automatically when you save or start a run (no secret paste).";
      }
      if (!device) {
        return "Sign in as admin to unlock writes. Pasting the operator secret is no longer required.";
      }
      return "Legacy secret still on this device · writes also unlock from your admin login.";
    }
    const secs = Number(data.ttl_remaining) || 0;
    const mins = Math.max(1, Math.round(secs / 60));
    return `Writes unlocked · about ${mins} minute${mins === 1 ? "" : "s"} left · auto-renews from your admin login.`;
  }

  function ensureSecretHint(rootEl, formRow) {
    if (!rootEl || rootEl.querySelector("[data-operator-secret-hint]")) return;
    const hint = document.createElement("p");
    hint.className = "muted-line operator-secret-hint";
    hint.setAttribute("data-operator-secret-hint", "");
    hint.textContent =
      "Writes unlock from your signed-in admin login. Pasting the shared operator secret is optional (workers/CLI only).";
    const anchor = formRow || rootEl.querySelector("[data-operator-status]");
    if (anchor?.parentNode) {
      anchor.insertAdjacentElement(formRow ? "afterend" : "beforebegin", hint);
    } else {
      rootEl.appendChild(hint);
    }
  }

  function wireOperatorPanel(rootEl, hooks = {}) {
    if (!rootEl || rootEl.dataset.wired === "1") return;
    rootEl.dataset.wired = "1";
    const secretInput = rootEl.querySelector("[data-operator-secret]");
    const statusEl = rootEl.querySelector("[data-operator-status]");
    const mintBtn = rootEl.querySelector("[data-operator-mint]");
    const logoutBtn = rootEl.querySelector("[data-operator-logout]");
    const forgetBtn = rootEl.querySelector("[data-operator-forget]");
    const killOnBtn = rootEl.querySelector("[data-operator-kill-on]");
    const killOffBtn = rootEl.querySelector("[data-operator-kill-off]");
    const formRow = rootEl.querySelector("[data-operator-form]");
    ensureSecretHint(rootEl, formRow);
    const onMinted = typeof hooks.onMinted === "function" ? hooks.onMinted : null;
    const onLocked = typeof hooks.onLocked === "function" ? hooks.onLocked : null;
    const onStatus = typeof hooks.onStatus === "function" ? hooks.onStatus : null;
    const onSaved = typeof hooks.onSaved === "function" ? hooks.onSaved : null;

    function setStatus(msg, ok) {
      if (statusEl) {
        applyStatusMessage(statusEl, msg);
        statusEl.className = `operator-status${ok === true ? " ok" : ok === false ? " error" : ""}`;
      }
      if (onStatus) onStatus(msg, ok);
    }

    function setFormMode() {
      const saved = hasDeviceSecret();
      rootEl.dataset.secretSaved = saved ? "1" : "0";
      if (secretInput) {
        secretInput.placeholder = saved
          ? "Optional legacy secret — leave blank (admin login unlocks writes)"
          : "Optional — leave blank; admin login unlocks writes";
        // Keep empty so browsers don't keep a stale autofilled login password visible.
        secretInput.value = "";
        secretInput.setAttribute("readonly", "readonly");
      }
      if (mintBtn) {
        mintBtn.textContent = "Unlock writes";
      }
      if (forgetBtn) forgetBtn.hidden = !saved;
    }

    async function refreshStatus() {
      const data = await fetchSessionStatus();
      rootEl.dataset.unlockActive = data.active ? "1" : "0";
      setFormMode();
      setStatus(formatUnlockStatus(data), data.active ? true : undefined);
      return data;
    }

    // Defeat password-manager autofill of the login password into this field.
    secretInput?.addEventListener("focus", () => {
      secretInput.removeAttribute("readonly");
    });
    secretInput?.addEventListener("pointerdown", () => {
      secretInput.removeAttribute("readonly");
    });

    mintBtn?.addEventListener("click", async () => {
      try {
        setStatus("Unlocking…");
        const typed = normalizeSecret(secretInput?.value);
        const secret = typed || getDeviceSecret();
        // GST-104 — unlock from admin login even when the secret field is empty.
        if (!secret && !appAuthToken()) {
          throw new Error("Sign in as admin first (operator secret paste is optional).");
        }
        const data = await mintSession(secret, { ttlSeconds: AUTO_TTL_SECONDS });
        if (typed) saveDeviceSecret(typed);
        if (secretInput) secretInput.value = "";
        setFormMode();
        setStatus(
          formatUnlockStatus(
            { active: true, ttl_remaining: data.ttl_seconds },
            { saved: hasDeviceSecret() }
          ),
          true
        );
        rootEl.dataset.unlockActive = "1";
        if (onSaved) onSaved();
        if (onMinted) onMinted(data);
      } catch (err) {
        if (secretInput) secretInput.value = "";
        setFormMode();
        setStatus(err.message || "Could not unlock writes", false);
      }
    });

    logoutBtn?.addEventListener("click", async () => {
      try {
        await logoutSession();
        setStatus(
          hasDeviceSecret()
            ? "Writes locked. Secret stays on this device — session will restart when you need it."
            : "Writes locked.",
          true
        );
        rootEl.dataset.unlockActive = "0";
        if (onLocked) onLocked();
      } catch (err) {
        setStatus(err.message || "Could not lock", false);
      }
    });

    forgetBtn?.addEventListener("click", async () => {
      try {
        markSecretRejected(false);
        clearDeviceSecret();
        await logoutSession().catch(() => null);
        setFormMode();
        setStatus("Forgot operator secret on this device. Paste it again to save.", true);
        rootEl.dataset.unlockActive = "0";
        if (onLocked) onLocked();
      } catch (err) {
        setStatus(err.message || "Could not forget secret", false);
      }
    });

    killOnBtn?.addEventListener("click", async () => {
      try {
        const data = await setKillSwitch(true);
        setStatus(`Kill switch ${data.kill_switch ? "ON" : "off"}`, !data.kill_switch ? true : false);
      } catch (err) {
        setStatus(err.message || "Kill failed", false);
      }
    });

    killOffBtn?.addEventListener("click", async () => {
      try {
        const data = await setKillSwitch(false);
        setStatus(`Kill switch ${data.kill_switch ? "ON" : "off"}`, true);
      } catch (err) {
        setStatus(err.message || "Clear kill failed", false);
      }
    });

    void refreshStatus().then(async (data) => {
      if (!data.active && (appAuthToken() || hasDeviceSecret())) {
        try {
          await ensureWriteSession();
          await refreshStatus();
          if (onMinted) onMinted();
        } catch (_) {
          /* status already shows guidance */
        }
      }
    });

    rootEl.GekkoUnlock = { refreshStatus, setStatus, setFormMode };
  }

  /** Remint writes; send to login only when there is no admin session. */
  function promptUnlock(rootEl) {
    if (appAuthToken() || hasDeviceSecret()) {
      void ensureWriteSession({ force: true }).then((st) => {
        if (st?.active) return;
        const panel = rootEl || document.getElementById("operatorPanel");
        if (panel) {
          panel.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
          panel.GekkoUnlock?.setStatus?.(operatorSessionMessage(), false);
          return;
        }
        if (typeof location !== "undefined" && !appAuthToken()) {
          location.assign("/login/?force=1");
        }
      });
      return;
    }
    if (typeof location !== "undefined") {
      location.assign("/login/?force=1");
    }
  }

  /* —— auto session lifecycle —— */
  let _lastActivity = Date.now();
  let _watchStarted = false;

  function touchActivity() {
    _lastActivity = Date.now();
  }

  async function maybeIdleLock() {
    // Soft idle only: pause auto-renew while away. Remint on the next write
    // from the admin login (GST-104) — never ask to re-paste the shared secret.
    if (!appAuthToken() && !hasDeviceSecret()) return;
    if (Date.now() - _lastActivity < IDLE_LOCK_MS) return;
  }

  function startAutoSessionWatch() {
    if (_watchStarted || typeof document === "undefined") return;
    _watchStarted = true;
    touchActivity();
    ["pointerdown", "keydown", "scroll", "touchstart"].forEach((evt) => {
      document.addEventListener(evt, touchActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        touchActivity();
        if (appAuthToken() || hasDeviceSecret()) void ensureWriteSession();
      }
    });
    setInterval(() => {
      void (async () => {
        await maybeIdleLock();
        if (document.visibilityState !== "visible") return;
        if (!appAuthToken() && !hasDeviceSecret()) return;
        if (Date.now() - _lastActivity >= IDLE_LOCK_MS) return;
        await ensureWriteSession();
      })();
    }, WATCH_INTERVAL_MS);
  }

  root.GekkoOperator = {
    controlApiBase,
    mintSession,
    logoutSession,
    fetchSessionStatus,
    ensureWriteSession,
    getDeviceSecret,
    hasDeviceSecret,
    saveDeviceSecret,
    clearDeviceSecret,
    getSessionToken,
    clearSessionToken,
    privilegedFetch,
    setKillSwitch,
    wireOperatorPanel,
    promptUnlock,
    formatUnlockStatus,
    operatorPageHref: OPERATOR_PAGE_HREF,
    operatorSessionMessage,
    operatorSessionHtml,
    applyStatusMessage,
    looksLikeOperatorSessionMessage,
    startAutoSessionWatch,
  };

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      startAutoSessionWatch();
      // GST-104 — remint from admin login on load (device secret optional).
      if (appAuthToken() || hasDeviceSecret()) void ensureWriteSession();
      // Pages with data-operator-wire="page" call wireOperatorPanel themselves (e.g. Keys).
      if (document.body?.dataset?.operatorWire === "page") return;
      const panel = document.getElementById("operatorPanel");
      if (panel) wireOperatorPanel(panel);
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
