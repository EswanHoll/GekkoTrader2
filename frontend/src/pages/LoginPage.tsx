import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, loginWithPassword } from "@/api/client";
import { setAuthSession } from "@/lib/auth";

/**
 * GT2 archive login chrome lock:
 * - Wordmark: Gekko (green) + Trader2 (white)
 * - No OAuth button / divider — Control reports GIS disabled; password only
 * - Password email/password only
 */
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
      className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-8 px-4 py-10 text-center"
      data-testid="login-page"
      data-mode="login"
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

      <section className="login-panel w-full" aria-label="Login">
        <p
          className="mb-4 mt-0 text-left text-sm text-gekko-muted"
          data-testid="login-copy"
        >
          Sign in with your GekkoTrader email and password.
        </p>
        <form
          id="loginForm"
          className="space-y-3 text-left"
          onSubmit={onSubmit}
          data-testid="login-form"
        >
          <label className="block text-sm">
            <span className="text-white">Email</span>
            <input
              id="loginEmail"
              className="mt-1 w-full rounded border border-gekko-border bg-gekko-bg px-3 py-2"
              type="email"
              autoComplete="username"
              value={email}
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              data-testid="login-password"
            />
          </label>
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
        {status ? (
          <p
            id="loginStatus"
            className="mt-3 text-left text-sm text-red-400"
            data-testid="login-status"
            aria-live="polite"
          >
            {status}
          </p>
        ) : null}
        <p className="mt-4 text-left text-sm text-gekko-muted">
          <Link to="/overview/" className="text-gekko underline">
            Back to Home
          </Link>
        </p>
      </section>
    </div>
  );
}
