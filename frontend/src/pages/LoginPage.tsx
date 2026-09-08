import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, loginWithPassword } from "@/api/client";
import { setAuthSession } from "@/lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const result = await loginWithPassword(email, password);
      const token = String(result.access_token || result.token || "");
      if (!token) throw new Error("Login response missing token");
      setAuthSession(token, result.user || null);
      const next = params.get("next") || "/sim/a/";
      navigate(next.startsWith("/") ? next : "/sim/a/", { replace: true });
    } catch (err) {
      setStatus(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Login failed"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4"
      data-testid="login-page"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
        GekkoTrader
      </p>
      <h1 className="mt-1 text-3xl font-extrabold">Sign in</h1>
      <p className="mt-2 text-sm text-gekko-muted">
        JWT session for AWS Control reads and Sim writes.
      </p>
      <form
        id="loginForm"
        className="mt-6 space-y-4"
        onSubmit={onSubmit}
        data-testid="login-form"
      >
        <label className="block text-sm">
          <span className="text-gekko-muted">Email</span>
          <input
            id="loginEmail"
            className="mt-1 w-full rounded border border-gekko-border bg-gekko-surface px-3 py-2"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="login-email"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gekko-muted">Password</span>
          <input
            id="loginPassword"
            className="mt-1 w-full rounded border border-gekko-border bg-gekko-surface px-3 py-2"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            data-testid="login-password"
          />
        </label>
        <button
          type="submit"
          id="loginSubmit"
          disabled={busy}
          className="w-full rounded bg-gekko px-4 py-2 font-bold text-gekko-bg disabled:opacity-40"
          data-testid="login-submit"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {status ? (
        <p
          id="loginStatus"
          className="mt-3 text-sm text-red-400"
          data-testid="login-status"
        >
          {status}
        </p>
      ) : null}
      <p className="mt-6 text-sm text-gekko-muted">
        <Link to="/overview/" className="text-gekko underline">
          Back to Home
        </Link>
      </p>
    </div>
  );
}
