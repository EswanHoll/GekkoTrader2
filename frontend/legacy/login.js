/*! GekkoTrader2 /login — email + password only (no Google). */
(function () {
  const $ = (id) => document.getElementById(id);
  let mode = "login";

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
    const password = ($("loginPassword")?.value || "");
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
    setStatus(mode === "register" ? "Submitting…" : "Signing in…");
    try {
      const Auth = window.GekkoAuth;
      if (!Auth) throw new Error("Auth module missing");
      let result;
      if (mode === "register") {
        result = await Auth.register?.(email, password);
        if (result?.ok) {
          setStatus(
            result.message ||
              "Registered. An admin must approve before you can log in.",
            "ok"
          );
          setMode("login");
          return;
        }
        setStatus(result?.error || "Registration failed.", "error");
        return;
      }
      result = await Auth.login?.(email, password);
      if (result?.ok) {
        setStatus("Signed in.", "ok");
        location.replace(landingTarget());
        return;
      }
      setStatus(result?.error || "Login failed.", "error");
    } catch (err) {
      setStatus(err?.message || "Could not reach auth API.", "error");
    } finally {
      if (submit) submit.disabled = false;
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
    // GT2: do not call Google auth (Control returns google enabled false).
    window.addEventListener("gekko-auth-changed", () => {
      void redirectIfSignedIn({ allowForceSkip: false });
    });
  }

  void boot();
})();
