import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  changePassword,
  fetchAuthMe,
  updateAuthProfile,
} from "@/api/client";
import {
  clearAuthSession,
  getAuthToken,
  getAuthUser,
  setAuthSession,
} from "@/lib/auth";
import { mapChangePasswordError, validatePasswordChange } from "@/lib/password";

export function SettingsPage() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState<"ok" | "error" | "">("");
  const [busy, setBusy] = useState(false);

  const [telegramId, setTelegramId] = useState("");
  const [alertStatus, setAlertStatus] = useState("");
  const [alertKind, setAlertKind] = useState<"ok" | "error" | "">("");
  const [alertBusy, setAlertBusy] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      navigate(
        `/login/?next=${encodeURIComponent("/account/password/")}`,
        { replace: true }
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchAuthMe();
        if (cancelled) return;
        if (me.telegram_chat_id) setTelegramId(String(me.telegram_chat_id));
        setAuthSession(getAuthToken(), {
          ...(getAuthUser() || {}),
          email: me.email,
          role: me.role,
          telegram_chat_id: me.telegram_chat_id ?? null,
        });
      } catch {
        /* keep local cache */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local = validatePasswordChange(current, next, confirm);
    if (local) {
      setKind("error");
      setStatus(local);
      return;
    }
    setBusy(true);
    setStatus("Updating password…");
    setKind("");
    try {
      await changePassword(current, next);
      setKind("ok");
      setStatus(
        "Password updated. Signing you out so you can sign in with the new password…"
      );
      clearAuthSession();
      navigate("/login/?force=1", { replace: true });
    } catch (err) {
      setKind("error");
      setStatus(mapChangePasswordError(err));
      setBusy(false);
    }
  }

  async function onSaveAlerts(e: FormEvent) {
    e.preventDefault();
    setAlertBusy(true);
    setAlertStatus("Saving Telegram Chat ID…");
    setAlertKind("");
    try {
      const saved = await updateAuthProfile({
        telegram_chat_id: telegramId.trim() || null,
      });
      setTelegramId(saved.telegram_chat_id ? String(saved.telegram_chat_id) : "");
      setAuthSession(getAuthToken(), {
        ...(getAuthUser() || {}),
        email: saved.email,
        role: saved.role,
        telegram_chat_id: saved.telegram_chat_id ?? null,
      });
      setAlertKind("ok");
      setAlertStatus(
        saved.telegram_chat_id
          ? "Telegram Chat ID saved. Offline alerts will use this destination."
          : "Telegram Chat ID cleared."
      );
    } catch (err) {
      setAlertKind("error");
      setAlertStatus(
        err instanceof Error ? err.message : "Could not save Telegram Chat ID"
      );
    } finally {
      setAlertBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-lg space-y-10" data-testid="settings-page" data-page="change-password">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
          Account
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          Change password
        </h1>
        <p className="mt-2 text-gekko-muted">
          Update the password for{" "}
          <strong id="changePasswordEmail" data-testid="change-password-email">
            {user?.email || "your account"}
          </strong>
          . You will sign in again afterward.
        </p>
      </div>

      <form
        id="changePasswordForm"
        className="space-y-4"
        onSubmit={onSubmit}
        data-testid="change-password-form"
      >
        <label className="block text-sm">
          <span className="text-gekko-muted">Current password</span>
          <input
            id="currentPassword"
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="mt-1 w-full rounded border border-gekko-border bg-gekko-surface px-3 py-2"
            data-testid="current-password"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gekko-muted">New password</span>
          <input
            id="newPassword"
            name="new_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="mt-1 w-full rounded border border-gekko-border bg-gekko-surface px-3 py-2"
            data-testid="new-password"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gekko-muted">Confirm new password</span>
          <input
            id="confirmPassword"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded border border-gekko-border bg-gekko-surface px-3 py-2"
            data-testid="confirm-password"
          />
        </label>
        <button
          type="submit"
          id="changePasswordSubmit"
          disabled={busy}
          className="w-full rounded bg-gekko px-4 py-2 font-bold text-gekko-bg disabled:opacity-40"
          data-testid="change-password-submit"
        >
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>

      <p
        id="changePasswordStatus"
        className={
          kind === "error"
            ? "text-sm text-red-400"
            : kind === "ok"
              ? "text-sm text-gekko"
              : "text-sm text-gekko-muted"
        }
        aria-live="polite"
        data-testid="change-password-status"
      >
        {status}
      </p>

      <section
        className="space-y-4 border-t border-gekko-border pt-8"
        data-testid="alerts-notifications"
      >
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">
            Alerts &amp; Notifications
          </h2>
          <p className="mt-2 text-sm text-gekko-muted">
            Paste your Telegram Chat ID so Control can route execution and
            drawdown alerts when you are offline. Leave blank to clear.
          </p>
        </div>
        <form
          className="space-y-4"
          onSubmit={onSaveAlerts}
          data-testid="telegram-chat-form"
        >
          <label className="block text-sm">
            <span className="text-gekko-muted">Telegram Chat ID</span>
            <input
              id="telegramChatId"
              name="telegram_chat_id"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 123456789"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              className="mt-1 w-full rounded border border-gekko-border bg-gekko-surface px-3 py-2 font-mono"
              data-testid="telegram-chat-id"
            />
          </label>
          <button
            type="submit"
            disabled={alertBusy}
            className="w-full rounded border border-gekko/50 bg-gekko/10 px-4 py-2 font-semibold text-gekko disabled:opacity-40"
            data-testid="telegram-chat-save"
          >
            {alertBusy ? "Saving…" : "Save Telegram Chat ID"}
          </button>
        </form>
        <p
          className={
            alertKind === "error"
              ? "text-sm text-red-400"
              : alertKind === "ok"
                ? "text-sm text-gekko"
                : "text-sm text-gekko-muted"
          }
          aria-live="polite"
          data-testid="telegram-chat-status"
        >
          {alertStatus}
        </p>
      </section>

      <p className="text-sm text-gekko-muted">
        <Link to="/overview/" className="text-gekko underline">
          Back to Home
        </Link>
      </p>
    </section>
  );
}
