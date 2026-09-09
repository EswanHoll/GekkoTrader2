import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ApiError,
  loginWithPassword,
  requestForgotPassword,
  resetPasswordWithToken,
} from "@/api/client";
import { setAuthSession } from "@/lib/auth";

type LoginMode = "login" | "forgot" | "reset";

/** Prefill for GT2 forgot/login — operator desk account (not a password). */
const PREFILL_EMAIL = "eswan@gekkotech.co.za"; // pragma: allowlist secret

function safeNextPath(raw: string | null): string {
  const next = (raw || "/sim/a/").trim();
  return next.startsWith("/") && !next.startsWith("//") ? next : "/sim/a/";
}

/**
 * GT2 archive login chrome lock:
 * - Wordmark: Gekko (green) + Trader2 (white)
 * - No OAuth button / divider — password + forgot/reset only
 * - Forgot password reachable before sign-in
 * - Login form is a real HTML form (method=post + named fields) so Chrome
 *   can offer to save; successful sign-in uses a real navigation
 */
export function LoginPage() {
  const [params, setParams] = useSearchParams();
  const resetToken = (params.get("reset") || "").trim();
  const initialMode: LoginMode = resetToken ? "reset" : "login";
  const nextPath = safeNextPath(params.get("next"));

  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [email, setEmail] = useState(PREFILL_EMAIL);
  const [status, setStatus] = useState("");
  const [statusOk, setStatusOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function clearStatus() {
    setStatus("");
    setStatusOk(false);
  }

  function goMode(next: LoginMode) {
    setMode(next);
    clearStatus();
    setNewPassword("");
    setConfirmPassword("");
    if (next !== "reset" && params.get("reset")) {
      const nextParams = new URLSearchParams(params);
      nextParams.delete("reset");
      setParams(nextParams, { replace: true });
    }
  }

  function errMessage(err: unknown, fallback: string): string {
    if (err instanceof ApiError) return err.message;
    if (err instanceof Error) return err.message;
    return fallback;
  }

  /**
   * Chrome password-save path:
   * 1) Real <form method="post"> with name=username / name=password
   * 2) Control auth via JSON (password never posted to Pages)
   * 3) On success, real document navigation (not React Router soft nav)
   */
  async function onLoginSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const username = String(data.get("username") || "").trim();
    const password = String(data.get("password") || "");
    if (username) setEmail(username);

    setBusy(true);
    clearStatus();
    try {
      const result = await loginWithPassword(username, password);
      const token = String(result.access_token || result.token || "");
      if (!token) throw new Error("Login response missing token");
      setAuthSession(token, result.user || null);
      // Real navigation so Chrome can offer to save the password.
      window.location.assign(nextPath);
      return;
    } catch (err) {
      setStatus(errMessage(err, "Login failed"));
      setStatusOk(false);
      setBusy(false);
    }
  }

  async function onForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    clearStatus();
    try {
      const result = await requestForgotPassword(email);
      setStatus(
        result.message ||
          "If that email has an account, a reset link was sent."
      );
      setStatusOk(true);
    } catch (err) {
      setStatus(errMessage(err, "Could not start a password reset."));
      setStatusOk(false);
    } finally {
      setBusy(false);
    }
  }

  async function onResetSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resetToken) {
      setStatus("This reset link is missing a token. Request a new one.");
      setStatusOk(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("New password and confirmation do not match.");
      setStatusOk(false);
      return;
    }
    setBusy(true);
    clearStatus();
    try {
      const result = await resetPasswordWithToken(resetToken, newPassword);
      setStatus(
        result.message || "Password updated. Sign in with your new password."
      );
      setStatusOk(true);
      setNewPassword("");
      setConfirmPassword("");
      setMode("login");
      const nextParams = new URLSearchParams(params);
      nextParams.delete("reset");
      setParams(nextParams, { replace: true });
    } catch (err) {
      setStatus(errMessage(err, "Could not reset the password."));
      setStatusOk(false);
    } finally {
      setBusy(false);
    }
  }

  const copy =
    mode === "forgot"
      ? "Enter your account email. Control will send a reset link if the account exists."
      : mode === "reset"
        ? "Choose a new password. This link expires; request another if it fails."
        : "Sign in with your GekkoTrader email and password.";

  const panelLabel =
    mode === "forgot"
      ? "Forgot password"
      : mode === "reset"
        ? "Reset password"
        : "Login";

  return (
    <div
      className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-8 px-4 py-10 text-center"
      data-testid="login-page"
      data-mode={mode}
    >
      <section
        className="flex flex-col items-center gap-2"
        aria-labelledby="loginBrand"
      >
        <img
          className="h-[72px] w-[72px] rounded-2xl shadow-lg"
          src="/gekko-logo.png"
          width={72}
          height={72}
          alt=""
          data-testid="login-logo"
        />
        <h1
          id="loginBrand"
          className="login-brand-wordmark text-[clamp(2.1rem,6vw,3.2rem)]"
          data-testid="login-wordmark"
        >
          <span className="login-brand-gekko">Gekko</span>
          <span className="login-brand-trader">Trader2</span>
        </h1>
        <p
          className="m-0 text-base font-semibold text-gekko-muted"
          data-testid="login-tagline"
        >
          Better. Faster. Smarter.
        </p>
      </section>

      <section className="login-panel w-full" aria-label={panelLabel}>
        <p
          className="mb-4 mt-0 text-left text-sm text-gekko-muted"
          data-testid="login-copy"
        >
          {copy}
        </p>

        {mode === "login" ? (
          <form
            id="loginForm"
            method="post"
            action={nextPath}
            className="space-y-3 text-left"
            onSubmit={onLoginSubmit}
            data-testid="login-form"
          >
            <label className="block text-sm">
              <span className="text-white">Email</span>
              <input
                id="loginEmail"
                className="mt-1 w-full rounded border border-gekko-border bg-gekko-bg px-3 py-2"
                type="email"
                name="username"
                autoComplete="username"
                defaultValue={PREFILL_EMAIL}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white">Password</span>
              <input
                id="loginPassword"
                className="mt-1 w-full rounded border border-gekko-border bg-gekko-bg px-3 py-2"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                minLength={8}
                data-testid="login-password"
              />
            </label>
            <button
              type="button"
              className="text-left text-sm text-gekko underline underline-offset-2"
              data-testid="login-forgot-link"
              onClick={() => goMode("forgot")}
            >
              Forgot password?
            </button>
            <button
              type="submit"
              id="loginSubmit"
              disabled={busy}
              className="w-full rounded bg-gekko px-4 py-2.5 font-bold text-gekko-bg disabled:opacity-40"
              data-testid="login-submit"
            >
              {busy ? "Signing in…" : "Login"}
            </button>
          </form>
        ) : null}

        {mode === "forgot" ? (
          <form
            id="forgotForm"
            method="post"
            action="/login/"
            className="space-y-3 text-left"
            onSubmit={onForgotSubmit}
            data-testid="forgot-form"
          >
            <label className="block text-sm">
              <span className="text-white">Email</span>
              <input
                id="forgotEmail"
                className="mt-1 w-full rounded border border-gekko-border bg-gekko-bg px-3 py-2"
                type="email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="forgot-email"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-gekko px-4 py-2.5 font-bold text-gekko-bg disabled:opacity-40"
              data-testid="forgot-submit"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        ) : null}

        {mode === "reset" ? (
          <form
            id="resetForm"
            method="post"
            action="/login/"
            className="space-y-3 text-left"
            onSubmit={onResetSubmit}
            data-testid="reset-form"
          >
            <label className="block text-sm">
              <span className="text-white">New password</span>
              <input
                id="resetPassword"
                className="mt-1 w-full rounded border border-gekko-border bg-gekko-bg px-3 py-2"
                type="password"
                name="new_password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                data-testid="reset-password"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white">Confirm new password</span>
              <input
                id="resetPasswordConfirm"
                className="mt-1 w-full rounded border border-gekko-border bg-gekko-bg px-3 py-2"
                type="password"
                name="new_password_confirm"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                data-testid="reset-password-confirm"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-gekko px-4 py-2.5 font-bold text-gekko-bg disabled:opacity-40"
              data-testid="reset-submit"
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        ) : null}

        {status ? (
          <p
            id="loginStatus"
            className={[
              "mt-3 text-left text-sm",
              statusOk ? "text-gekko" : "text-red-400",
            ].join(" ")}
            data-testid="login-status"
            aria-live="polite"
          >
            {status}
          </p>
        ) : null}

        <p className="mt-4 text-left text-sm text-gekko-muted">
          {mode === "login" ? (
            <Link to="/overview/" className="text-gekko underline">
              Back to Home
            </Link>
          ) : (
            <button
              type="button"
              className="font-extrabold text-gekko underline underline-offset-2"
              data-testid="login-mode-switch"
              onClick={() => goMode("login")}
            >
              Back to Login
            </button>
          )}
        </p>
      </section>
    </div>
  );
}
