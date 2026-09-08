/*! GekkoTrader — GST-47 change password page. */
(function (root) {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function setStatus(text, kind) {
    const el = $("changePasswordStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-modal-status" + (kind ? ` ${kind}` : "");
  }

  async function requireSignedIn() {
    const Auth = root.GekkoAuth;
    if (!Auth) return null;
    const session = (await Auth.validateSessionOrRedirect?.()) || null;
    if (session?.user) return session;
    // Soft-gate leaves chrome; this page needs a live session for the form.
    location.replace(Auth.forceLoginHref?.(location.pathname, "") || "/login/?force=1");
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const Auth = root.GekkoAuth;
    if (!Auth?.changePassword) {
      setStatus("Password change is not available in this build.", "error");
      return;
    }
    const current = ($("currentPassword")?.value || "");
    const next = ($("newPassword")?.value || "");
    const confirm = ($("confirmPassword")?.value || "");
    if (next !== confirm) {
      setStatus("New password and confirmation do not match.", "error");
      return;
    }
    const submit = $("changePasswordSubmit");
    if (submit) submit.disabled = true;
    setStatus("Updating password…");
    try {
      await Auth.changePassword(current, next);
      setStatus("Password updated. Signing you out so you can sign in with the new password…", "ok");
      try {
        await Auth.signOut?.();
      } catch (_) {
        Auth.clearSession?.();
      }
      location.assign("/login/?force=1");
    } catch (err) {
      setStatus(err?.message || "Could not change password.", "error");
      if (submit) submit.disabled = false;
    }
  }

  async function boot() {
    if (document.body?.dataset?.page !== "change-password") return;
    const session = await requireSignedIn();
    if (!session) return;
    const email = $("changePasswordEmail");
    if (email) email.textContent = session.user.email || "operator";
    $("changePasswordForm")?.addEventListener("submit", onSubmit);
    $("currentPassword")?.focus();
  }

  const api = { setStatus, onSubmit, requireSignedIn };
  root.GekkoChangePassword = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => void boot());
    } else {
      void boot();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
