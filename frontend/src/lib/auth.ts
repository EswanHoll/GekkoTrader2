/** JWT + optional control write-session token (legacy operator session). */

const TOKEN_KEY = "gekko_auth_token";
const USER_KEY = "gekko_auth_user";
const SESSION_TOKEN_KEY = "gekko_ops_session_token";

export type AuthUser = {
  email?: string;
  role?: string;
  is_super_admin?: boolean;
  [key: string]: unknown;
};

/** Admin nav + `/admin/*` gate — super_admin only (legacy NAV-D04 / GekkoFlow). */
export function isAdminRole(user?: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === "super_admin" || !!user.is_super_admin;
}

export function getAuthToken(): string {
  try {
    return String(localStorage.getItem(TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setAuthSession(token: string, user?: AuthUser | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* private mode */
  }
}

export function clearAuthSession(): void {
  setAuthSession("", null);
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/** Parsed control write token — never the raw sessionStorage JSON blob. */
export function getControlSessionToken(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string; expires_at?: number };
    const token = String(parsed?.token || "").trim();
    const exp = Number(parsed?.expires_at) || 0;
    if (!token) return "";
    if (exp && exp * 1000 <= Date.now() + 5_000) return "";
    return token;
  } catch {
    return "";
  }
}

export function authHeaders(opts: { privileged?: boolean } = {}): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.privileged) {
    const control = getControlSessionToken();
    if (control) headers["X-Gekko-Control-Token"] = control;
  }
  return headers;
}
