/*! GekkoTrader /login — email + password + optional Google (GIS). */
(function () {
  const $ = (id) => document.getElementById(id);
  let mode = "login";
  let googleEnabled = false;
  let googleClientId = "";
  let googleReady = false;

  function renderNote() {
    const note = $("loginNote");
    if (!note) return;
    if (mode === "register") {
      note.innerHTML =
        'Already have an account? <button type="button" class="login-note-link" id="loginModeSwitch">Login</button>';
    } else {
      note.innerHTML =
        'Need access? <button type="button" class="login-note-link" id="loginModeSwitch">Register</button> — an admin must approve new accounts.';
    }
    $("loginModeSwitch")?.addEventListener("click", () => {
      setStatus("");
      setMode(mode === "register" ? "login" : "register");
    });
  }

  function setGoogleVisible(visible) {
    const divider = $("loginDivider");
    const host = $("loginGoogleHost");
    const google = $("loginGoogle");
    const show = Boolean(visible) && mode !== "register";
    if (divider) divider.hidden = !show;
    if (host) host.hidden = !show;
    // Prefer GIS renderButton host; keep custom button as click fallback only.
    if (google) google.hidden = !show || Boolean(host && host.childElementCount);
  }

  function setMode(next) {
    mode = next === "register" ? "register" : "login";
    const copy = $("loginCopy");
    const submit = $("loginSubmit");
    const password = $("loginPassword");
    const panel = document.querySelector(".login-panel");
    if (panel) panel.setAttribute("aria-label", mode === "register" ? "Register" : "Login");
    if (copy) {
      copy.textContent =
        mode === "register"
          ? "Create an account with email and password. An admin must approve before you can log in."
          : "Sign in with your GekkoTrader email and password.";
    }
    if (submit) submit.textContent = mode === "register" ? "Register" : "Login";
    setGoogleVisible(googleEnabled);
    renderNote();
    if (password) {
      password.autocomplete = mode === "register" ? "new-password" : "current-password";
      password.minLength = 8;
    }
    const url = new URL(location.href);
    if (mode === "register") url.searchParams.set("mode", "register");
    else url.searchParams.delete("mode");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function setStatus(text, kind) {
    const el = $("loginStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-modal-status" + (kind ? ` ${kind}` : "");
  }

  function landingTarget() {
    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return window.GekkoAuth?.landingPath || "/sim/a/";
  }

  /**
   * Only leave /login/ when live /api/auth/me succeeds.
   * Never trust the localStorage cache short-circuit (catch-22 with stale sessions).
   * /login/?force=1|clear=1 must clear storage and skip this redirect.
   */
  async function redirectIfSignedIn({ allowForceSkip = true } = {}) {
    const Auth = window.GekkoAuth;
    if (!Auth) return false;
    if (allowForceSkip && Auth.wantsForceClear?.(location.search)) {
      return false;
    }
    const session = (await Auth.getSession?.({ refresh: true })) || null;
    if (session?.user) {
      location.replace(landingTarget());
      return true;
    }
    return false;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const email = ($("loginEmail")?.value || "").trim();
    const password = $("loginPassword")?.value || "";
    if (!email || !email.includes("@")) {
      setStatus("Enter a valid email address.", "error");
      return;
    }
    if (!password || password.length < 8) {
      setStatus("Password must be at least 8 characters.", "error");
      return;
    }
    const submit = $("loginSubmit");
    if (submit) submit.disabled = true;
    try {
      if (mode === "register") {
        setStatus("Submitting registration…");
        const result = await window.GekkoAuth.register(email, password);
        if (result.ok) {
          setStatus(result.message || "Registration submitted. Wait for admin approval.", "ok");
          setMode("login");
        } else {
          const err = result.error;
          setStatus(typeof err === "string" ? err : "Could not register.", "error");
        }
      } else {
        setStatus("Signing in…");
        const result = await window.GekkoAuth.login(email, password);
        if (result.ok) {
          setStatus("Signed in.", "ok");
          location.replace(landingTarget());
        } else {
          const err = result.error;
          setStatus(typeof err === "string" ? err : "Invalid email or password.", "error");
        }
      }
    } catch (err) {
      setStatus(err?.message || "Could not reach auth API.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function loadGisScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      const existing = document.querySelector("script[data-gekko-gis]");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("GIS load failed")));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.gekkoGis = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("GIS load failed"));
      document.head.appendChild(script);
    });
  }

  async function onGoogleCredential(response) {
    const credential = response?.credential;
    if (!credential) {
      setStatus("Google sign-in was cancelled.", "error");
      return;
    }
    setStatus("Signing in with Google…");
    try {
      const result = await window.GekkoAuth.loginWithGoogle(credential);
      if (result.ok) {
        setStatus("Signed in.", "ok");
        location.replace(landingTarget());
      } else {
        setStatus(result.error || "Google sign-in failed.", "error");
      }
    } catch (err) {
      setStatus(err?.message || "Google sign-in failed.", "error");
    }
  }

  async function ensureGoogleInitialized() {
    if (googleReady) return;
    await loadGisScript();
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: onGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    const host = $("loginGoogleHost");
    if (host) {
      host.innerHTML = "";
      window.google.accounts.id.renderButton(host, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: 320,
      });
    }
    googleReady = true;
  }

  async function setupGoogle() {
    const googleBtn = $("loginGoogle");
    try {
      const cfg = await window.GekkoAuth.googleConfig();
      googleEnabled = Boolean(cfg?.enabled && cfg?.client_id);
      googleClientId = cfg?.client_id || "";
    } catch (_) {
      googleEnabled = false;
      googleClientId = "";
    }
    setGoogleVisible(googleEnabled);
    if (!googleEnabled) return;

    try {
      await ensureGoogleInitialized();
      setGoogleVisible(true);
    } catch (_) {
      // GIS script blocked — keep custom button as last-resort prompt trigger.
      if (googleBtn) {
        googleBtn.hidden = mode === "register";
        googleBtn.addEventListener("click", async () => {
          setStatus("");
          try {
            await ensureGoogleInitialized();
            window.google.accounts.id.prompt();
          } catch (err) {
            setStatus(err?.message || "Google sign-in could not start.", "error");
          }
        });
      }
    }
  }

  async function boot() {
    const Auth = window.GekkoAuth;
    // HOTFIX catch-22: force/clear wipe stale token+user and never redirect-away.
    const forced = Auth?.applyForceClear?.(location.search, {
      replaceUrl: (href) => history.replaceState(null, "", href),
    });
    if (!forced) {
      const left = await redirectIfSignedIn({ allowForceSkip: false });
      if (left) return;
    } else {
      setStatus("Signed out of this browser. Enter email and password to continue.", "ok");
    }

    const params = new URLSearchParams(location.search);
    if (params.get("mode") === "register") setMode("register");
    else setMode("login");

    $("loginForm")?.addEventListener("submit", onSubmit);
    $("loginEmail")?.focus();
    setupGoogle();
    window.addEventListener("gekko-auth-changed", () => {
      // After a real login event, allow redirect; force flags already stripped.
      void redirectIfSignedIn({ allowForceSkip: false });
    });
  }

  void boot();
})();
