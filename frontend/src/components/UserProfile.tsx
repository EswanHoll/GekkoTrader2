import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearAuthSession, type AuthUser } from "@/lib/auth";
import { uiVersion } from "@/lib/config";

type Props = {
  signedIn: boolean;
  user: AuthUser | null;
  onNavigate?: () => void;
};

/**
 * Bottom-left auth chrome (GST-123).
 * Signed out → Sign in. Signed in → avatar + click menu (password / sign out).
 * UI version tip sits beneath the profile.
 */
export function UserProfile({ signedIn, user, onNavigate }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      id="appAccountFooter"
      className="app-sidebar-footer shrink-0 border-t border-gekko-border bg-gekko-surface/95 px-3 py-3"
      data-testid="account-footer"
      data-auth-primary-host="1"
      ref={rootRef}
    >
      {signedIn ? (
        <div className="relative">
          <button
            type="button"
            id="shellAccountTrigger"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gekko-surface-hover"
            data-testid="shell-account-trigger"
            aria-expanded={open ? "true" : "false"}
            aria-controls={menuId}
            aria-haspopup="menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="shell-account-avatar flex h-7 w-7 items-center justify-center rounded-full bg-gekko/20 text-xs font-bold text-gekko">
              {(user?.email || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-gekko-muted">
              {user?.email || "Signed in"}
            </span>
            <span className="text-gekko-muted" aria-hidden="true">
              ▾
            </span>
          </button>
          {open ? (
            <div
              id={menuId}
              role="menu"
              className="shell-account-menu absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-md border border-gekko-border bg-gekko-bg shadow-lg"
              data-testid="shell-account-menu"
            >
              <Link
                to="/account/password/"
                id="shellChangePassword"
                role="menuitem"
                className="block px-3 py-2 text-sm text-gekko-muted hover:bg-gekko-surface-hover hover:text-white"
                data-testid="shell-change-password"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
              >
                Change password
              </Link>
              <Link
                to="/account/password/#alerts"
                id="shellAlerts"
                role="menuitem"
                className="block px-3 py-2 text-sm text-gekko-muted hover:bg-gekko-surface-hover hover:text-white"
                data-testid="shell-alerts"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
              >
                Alerts &amp; Notifications
              </Link>
              <button
                type="button"
                id="shellSignOut"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-gekko-muted hover:bg-gekko-surface-hover hover:text-white"
                data-testid="shell-sign-out"
                onClick={() => {
                  clearAuthSession();
                  setOpen(false);
                  navigate("/login/?force=1", { replace: true });
                }}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <Link
          className="shell-footer-signin flex w-full items-center justify-center gap-2 rounded-md border border-gekko-border px-2 py-2 text-sm font-semibold text-white hover:border-gekko hover:text-gekko"
          id="shellSignIn"
          to="/login/?force=1"
          data-auth-primary="1"
          data-testid="shell-sign-in"
          onClick={onNavigate}
        >
          Sign in
        </Link>
      )}
      <p
        className="mt-2 px-1 font-mono text-[10px] leading-tight text-gekko-muted/80"
        data-testid="shell-ui-version"
        title="Website tip version"
      >
        ui {uiVersion()}
      </p>
    </div>
  );
}
