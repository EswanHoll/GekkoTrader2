/**
 * Typed Control API client — Scope Contract wire (snake_case JSON).
 * Runtime base URL from /config.js (patched at deploy — ADR-0006).
 */
import { authHeaders } from "@/lib/auth";
import { resolveControlBase, useMockApi } from "@/lib/config";
import { assertScopeEcho } from "@/lib/scope";
import type { DatasetScope, ExecutionEnv, Lane } from "@/types/scope";
import { OPERATIONAL_DESK_ORDER } from "@/lib/navigation";
import type { SettingsBundle } from "@/lib/startRun";
import type { StartRunBody } from "@/lib/startRun";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type ScopeQuery = {
  execution_env: ExecutionEnv;
  lane?: Lane | null;
};

function scopeSearch(scope: ScopeQuery | DatasetScope): string {
  const params = new URLSearchParams();
  params.set("execution_env", scope.execution_env);
  if (scope.execution_env !== "live") {
    const lane = scope.lane;
    if (!lane) throw new Error("lane required for non-live scope");
    params.set("lane", lane);
  }
  return params.toString();
}

/** Append query params; arrays become repeated keys (FastAPI list). */
export function withQuery(
  path: string,
  extra: Record<string, string | number | Array<string | number> | null | undefined>
): string {
  const u = new URL(path, "https://gekkotrader.local");
  Object.entries(extra || {}).forEach(([k, v]) => {
    if (v == null || v === "") return;
    if (Array.isArray(v)) {
      v.forEach((item) => u.searchParams.append(k, String(item)));
    } else {
      u.searchParams.set(k, String(v));
    }
  });
  return u.pathname + u.search;
}

export function scopedUrl(path: string, scope: ScopeQuery | DatasetScope): string {
  const base = resolveControlBase();
  const abs = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const u = new URL(abs);
  const qs = scopeSearch(scope);
  new URLSearchParams(qs).forEach((value, key) => {
    u.searchParams.set(key, value);
  });
  return u.toString();
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

function detailMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) =>
          typeof d === "object" && d && "msg" in d
            ? String((d as { msg: unknown }).msg)
            : String(d)
        )
        .join("; ");
    }
  }
  return fallback;
}

function demoDashboardPath(lane: Lane): string {
  const version = lane === "a" ? 1 : 2;
  return `/api/v${version}/demo/dashboard`;
}

export function dashboardPathFor(scope: DatasetScope): string {
  if (scope.execution_env === "demo" && scope.lane) {
    return demoDashboardPath(scope.lane);
  }
  return "/api/dashboard";
}

export async function apiGet<T>(
  path: string,
  scope?: ScopeQuery | DatasetScope,
  opts: { assertEcho?: boolean } = {}
): Promise<T> {
  if (useMockApi()) {
    throw new ApiError("Mock API not wired in React client yet", 503, null);
  }
  const url = scope
    ? scopedUrl(path, scope)
    : `${resolveControlBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders(),
    credentials: "include",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(detailMessage(body, `HTTP ${res.status}`), res.status, body);
  }
  if (scope && opts.assertEcho !== false) {
    assertScopeEcho(scope as DatasetScope, body);
  }
  return body as T;
}

export async function apiPost<T>(
  path: string,
  scope: ScopeQuery | DatasetScope,
  payload: unknown,
  opts: { privileged?: boolean; assertEcho?: boolean } = {}
): Promise<T> {
  if (useMockApi()) {
    throw new ApiError("Mock API not wired in React client yet", 503, null);
  }
  const privileged = opts.privileged !== false;
  const url = scopedUrl(path, scope);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders({ privileged }),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload ?? {}),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(detailMessage(body, `HTTP ${res.status}`), res.status, body);
  }
  if (opts.assertEcho !== false) {
    assertScopeEcho(scope as DatasetScope, body);
  }
  return body as T;
}

/** Unscoped Control health (no DatasetScope). */
export type ControlHealth = {
  status?: string;
  detail?: string;
  service?: string;
  [key: string]: unknown;
};

export async function fetchControlHealth(): Promise<ControlHealth> {
  const base = resolveControlBase();
  const candidates = ["/api/health", "/health", "/healthz"];
  let last: ApiError | null = null;
  for (const path of candidates) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const body = await parseJson(res);
      if (res.ok) return (body || { status: "ok" }) as ControlHealth;
      last = new ApiError(
        detailMessage(body, `HTTP ${res.status}`),
        res.status,
        body
      );
    } catch (err) {
      last =
        err instanceof ApiError
          ? err
          : new ApiError(err instanceof Error ? err.message : String(err), 0, null);
    }
  }
  throw last || new ApiError("Control health unreachable", 0, null);
}

export type DashboardSnapshot = {
  execution_env: ExecutionEnv;
  lane: Lane | null;
  scope_key: string;
  equity?: number | null;
  balance?: number | null;
  realized_pnl?: number | null;
  lifetime_pnl?: number | null;
  unrealized_pnl?: number | null;
  opening_balance?: number | null;
  open_positions?: number | null;
  closed_trades?: number | null;
  trades_closed?: number | null;
  win_rate?: number | null;
  runtime_status?: string;
  power_state?: string;
  playbook_key?: string | null;
  /** GST-121 — canonical wire values: playbook1 | playbook2 | playbook3 */
  strategy_suite?: "playbook1" | "playbook2" | "playbook3" | string | null;
  is_dormant?: boolean;
  gate_state?: string;
  active_run?: {
    run_id?: string;
    status?: string;
    event_cursor?: number;
    simulated_time?: string;
    heartbeat_at?: string;
    started_at?: string;
  } | null;
  /** GST-131 — full desk ledger arrays (alias-aware on the client). */
  paper_positions?: unknown[];
  positions?: unknown[];
  strategies?: unknown[];
  top_variants?: unknown[];
  recent_trades?: unknown[];
  trades?: unknown[];
  period_pnl?: Record<string, number | null>;
  symbols?: string[];
  binance_latency_ms?: number | null;
  latency_ms?: number | null;
  egress_ip?: string | null;
  last_cycle_at?: string | null;
  cycle_meta?: Record<string, unknown> | null;
  max_open_positions?: number | null;
  signal_interval?: string | null;
  htf_interval?: string | null;
  [key: string]: unknown;
};

export function fetchDashboard(scope: DatasetScope): Promise<DashboardSnapshot> {
  return apiGet<DashboardSnapshot>(dashboardPathFor(scope), scope);
}

export type RunsList = {
  execution_env: ExecutionEnv;
  lane: Lane | null;
  scope_key: string;
  runs: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  total: number;
  limit?: number;
  offset: number;
  has_more: boolean;
  playbook_key?: string | null;
};

export async function fetchRuns(
  scope: DatasetScope,
  opts: { limit?: number; offset?: number } = {}
): Promise<RunsList> {
  const extra: Record<string, number> = {};
  if (opts.limit != null) extra.limit = opts.limit;
  if (opts.offset != null) extra.offset = opts.offset;
  // GST-139 — Demo window ledger lives on product demo/runs, not Sim /api/runs.
  let path: string;
  if (scope.execution_env === "demo" && scope.lane) {
    const product = scope.lane === "b" ? "v2" : "v1";
    const base = `/api/${product}/demo/runs`;
    path = Object.keys(extra).length > 0 ? withQuery(base, extra) : base;
  } else {
    path =
      Object.keys(extra).length > 0
        ? withQuery("/api/runs", extra)
        : "/api/runs";
  }
  const body = await apiGet<RunsList & { items?: Record<string, unknown>[] }>(
    path,
    scope
  );
  const runs = body.items || body.runs || [];
  return {
    ...body,
    runs,
    total:
      body.total != null
        ? Number(body.total)
        : runs.length,
    limit: body.limit,
    offset: body.offset != null ? Number(body.offset) : 0,
    has_more: !!body.has_more,
  };
}

/** GST-139 — Stop (graceful) or Kill (hard) for Sim / Demo desks. */
export function terminateEngine(
  scope: DatasetScope,
  mode: "graceful" | "hard" | "resume"
): Promise<Record<string, unknown>> {
  return apiPost("/api/engine/terminate", scope, { mode });
}

export function cancelRun(
  scope: DatasetScope,
  runId: string
): Promise<Record<string, unknown>> {
  return apiPost(
    `/api/runs/${encodeURIComponent(runId)}/cancel`,
    scope,
    {}
  );
}

/** Single-run detail (metrics/evidence). Settings come via compareRuns. */
export function fetchRun(
  scope: DatasetScope,
  runId: string
): Promise<Record<string, unknown>> {
  return apiGet(`/api/runs/${encodeURIComponent(runId)}`, scope);
}

/**
 * Hydrated compare rows — each row includes settings payload
 * (legacy matrix “full hydrate” equivalent; requires 2–10 succeeded runs).
 */
export async function compareRuns(
  scope: DatasetScope,
  runIds: string[]
): Promise<{ rows: Record<string, unknown>[]; [key: string]: unknown }> {
  const path = withQuery("/api/runs/compare", { run_ids: runIds });
  return apiGet(path, scope);
}

export async function fetchRunLearning(
  scope: DatasetScope,
  runId: string
): Promise<{ items?: Record<string, unknown>[]; learning?: Record<string, unknown>[] }> {
  return apiGet(`/api/runs/${encodeURIComponent(runId)}/learning`, scope);
}

export async function fetchSettingsVersions(
  scope: DatasetScope
): Promise<SettingsBundle & Record<string, unknown>> {
  const body = await apiGet<{
    items?: SettingsBundle["versions"];
    versions?: SettingsBundle["versions"];
    active_binding?: SettingsBundle["active_binding"];
    [key: string]: unknown;
  }>("/api/settings-versions", scope);
  const versions = body.items || body.versions || [];
  let active_binding = body.active_binding || null;
  if (active_binding && active_binding.settings_version_id != null) {
    active_binding = {
      ...active_binding,
      settings_version_id: String(active_binding.settings_version_id),
    };
  }
  return { ...body, versions, active_binding };
}

export function startRun(
  scope: DatasetScope,
  body: StartRunBody
): Promise<Record<string, unknown>> {
  return apiPost("/api/runs", scope, body, { privileged: true });
}

export type RunDeleteMode = "data" | "data_and_results";

export type DeleteRunsBody = {
  mode: RunDeleteMode;
  run_ids: string[];
};

/** POST /api/runs/delete — Sim run ledger discard (privileged). */
export function deleteRuns(
  scope: DatasetScope,
  body: DeleteRunsBody
): Promise<Record<string, unknown>> {
  return apiPost("/api/runs/delete", scope, body, { privileged: true });
}

export function saveSettingsVersion(
  scope: DatasetScope,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return apiPost(
    "/api/settings-versions",
    scope,
    { payload },
    { privileged: true }
  );
}

export function bindSettingsVersion(
  scope: DatasetScope,
  body: { settings_version_id: string }
): Promise<Record<string, unknown>> {
  return apiPost("/api/settings-bindings", scope, body, { privileged: true });
}

/** Product desk path — Demo L1 settings (not greenfield /api/settings-versions). */
export type DemoDeskSettings = {
  product?: string;
  environment?: string;
  desk_id?: string;
  settings?: Record<string, unknown>;
  settings_version_id?: string | number;
  [key: string]: unknown;
};

function demoProductPath(lane: Lane, suffix: string): string {
  const product = lane === "b" ? "v2" : "v1";
  return `/api/${product}/demo/${suffix.replace(/^\/+/, "")}`;
}

/** GET /api/v{1|2}/demo/settings — read-only Demo knobs. */
export function fetchDemoDeskSettings(lane: Lane): Promise<DemoDeskSettings> {
  return controlGet<DemoDeskSettings>(demoProductPath(lane, "settings"));
}

/**
 * POST /api/v{1|2}/demo/settings/save — mutate Demo desk L1 binding.
 * Prefer {@link copySettingsToDemo} for Sim → Demo promote (greenfield Control
 * does not mount desk product save routes — those 404).
 */
export function saveDemoDeskSettings(
  lane: Lane,
  settings: Record<string, unknown>,
  opts: { reseed_analytics?: boolean } = {}
): Promise<DemoDeskSettings> {
  return controlPost<DemoDeskSettings>(demoProductPath(lane, "settings/save"), {
    settings,
    reseed_analytics: !!opts.reseed_analytics,
  });
}

export type CopySettingsToDemoResult = {
  settings_version_id?: string | number;
  version_id?: string | number;
  desk_id?: string;
  target_scope_key?: string;
  target_execution_env?: string;
  target_lane?: string;
  scope_key?: string;
  execution_env?: string;
  lane?: string;
  [key: string]: unknown;
};

/**
 * GST-113 / GST-124 — Copy Sim knobs onto Demo A/B L1 bindings.
 * Call with the **Sim** scope (source). Response echoes Sim and carries Demo
 * identity in ``target_scope_key`` / ``desk_id``.
 */
export function copySettingsToDemo(
  scope: DatasetScope,
  payload: Record<string, unknown>,
  opts: { source_run_id?: string | null } = {}
): Promise<CopySettingsToDemoResult> {
  return apiPost<CopySettingsToDemoResult>(
    "/api/settings-versions/copy-to-demo",
    scope,
    {
      payload: payload || {},
      source_run_id: opts.source_run_id ?? null,
    }
  );
}

export type ClearDemoJournalResult = {
  product?: string;
  environment?: string;
  published?: boolean;
  trades_deleted?: number;
  note?: string;
  [key: string]: unknown;
};

export type EndDemoPublishResult = {
  product?: string;
  run_id?: string;
  status?: string;
  execution_env?: string;
  note?: string;
  [key: string]: unknown;
};

export type PromoteLiveResult = {
  from_desk_id?: string;
  desk_id?: string;
  active_product?: string;
  settings_version_id?: string | number;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
};

/** GST-128 — Clear Demo journal window without publishing. */
export function clearDemoJournal(
  product: "v1" | "v2"
): Promise<ClearDemoJournalResult> {
  return controlPost<ClearDemoJournalResult>(
    "/api/backtests/desk/journal/clear",
    { product, environment: "demo" }
  );
}

/** GST-128 — End Demo window and publish archive row. */
export function endAndPublishDemo(
  product: "v1" | "v2",
  notes?: string | null
): Promise<EndDemoPublishResult> {
  return controlPost<EndDemoPublishResult>("/api/backtests/desk/demo/end", {
    product,
    notes: notes || null,
  });
}

/**
 * GST-128 — Promote bound Demo L1 settings onto singleton Live.
 * Passes current Demo knobs so Control refreshes the Demo binding first.
 */
export function promoteDemoToLive(
  product: "v1" | "v2",
  opts: {
    settings?: Record<string, unknown> | null;
    approved_by?: string;
    notes?: string | null;
  } = {}
): Promise<PromoteLiveResult> {
  return controlPost<PromoteLiveResult>("/api/live/settings/promote", {
    from: `${product}/demo`,
    approved_by: opts.approved_by || "ui:demo_results_promote_live",
    notes: opts.notes || null,
    settings: opts.settings || undefined,
  });
}

/** GET /api/live/settings — Live singleton knobs (for cache refresh). */
export function fetchLiveSettings(): Promise<{
  desk_id?: string;
  active_product?: string;
  settings?: Record<string, unknown>;
  settings_version_id?: string | number;
  [key: string]: unknown;
}> {
  return controlGet("/api/live/settings");
}

export type OverviewDeskTile = {
  execution_env: ExecutionEnv;
  lane: Lane | null;
  scope_key: string;
  label: string;
  playbook_key: string | null;
  runtime_status: string;
  is_dormant: boolean;
  /** Cash balance: opening + realised. Differs from equity only while open. */
  balance: number | null;
  equity: number | null;
  realized_pnl: number | null;
  open_positions: number | null;
  opening_balance: number | null;
  unavailable?: boolean;
};

export type OverviewPayload = { desks: OverviewDeskTile[] };

/**
 * Portfolio overview — composed from operational desks + scoped dashboard reads.
 * Greenfield Control has no unscoped `/api/overview`.
 */
export async function fetchOverview(): Promise<OverviewPayload> {
  const desks = await Promise.all(
    OPERATIONAL_DESK_ORDER.map(async (desk) => {
      const scope =
        desk.execution_env === "live"
          ? ({
              execution_env: "live" as const,
              lane: null,
              scope_key: "live" as const,
            } satisfies DatasetScope)
          : ({
              execution_env: desk.execution_env,
              lane: desk.lane!,
              scope_key: desk.scope_key as `${"sim" | "demo"}|${Lane}`,
            } satisfies DatasetScope);

      const base: OverviewDeskTile = {
        execution_env: desk.execution_env,
        lane: desk.lane,
        scope_key: desk.scope_key,
        label: desk.label,
        playbook_key: null,
        runtime_status:
          desk.execution_env === "live" ? "Dormant until manual activation" : "Loading…",
        is_dormant: desk.execution_env === "live",
        balance: null,
        equity: null,
        realized_pnl: null,
        open_positions: null,
        opening_balance: null,
      };

      if (desk.execution_env === "live") {
        return base;
      }

      try {
        const dash = await fetchDashboard(scope);
        return {
          ...base,
          playbook_key: (dash.playbook_key as string | null) ?? null,
          runtime_status: String(
            dash.runtime_status || dash.gate_state || "ready"
          ),
          is_dormant: !!dash.is_dormant,
          balance: dash.balance ?? null,
          equity: dash.equity ?? null,
          realized_pnl: dash.realized_pnl ?? null,
          open_positions: dash.open_positions ?? null,
          opening_balance: dash.opening_balance ?? null,
        };
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        return {
          ...base,
          runtime_status:
            status === 401 || status === 403
              ? "Sign in required"
              : "unavailable",
          unavailable: true,
        };
      }
    })
  );
  return { desks };
}

export type LoginResult = {
  access_token?: string;
  token?: string;
  user?: Record<string, unknown>;
};

export async function loginWithPassword(
  email: string,
  password: string
): Promise<LoginResult> {
  const base = resolveControlBase();
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email: String(email || "").trim(),
      password: String(password || ""),
    }),
  });
  const body = (await parseJson(res)) as LoginResult & { detail?: string };
  if (!res.ok) {
    throw new ApiError(
      detailMessage(body, "Invalid email or password"),
      res.status,
      body
    );
  }
  return body;
}

/** Unauthenticated POST /api/auth/forgot-password — Control emails/Telegram reset link. */
export async function requestForgotPassword(
  email: string
): Promise<{ message?: string }> {
  const base = resolveControlBase();
  const res = await fetch(`${base}/api/auth/forgot-password`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email: String(email || "").trim(),
    }),
  });
  const body = (await parseJson(res)) as { message?: string; detail?: string };
  if (!res.ok) {
    throw new ApiError(
      detailMessage(body, "Could not start a password reset."),
      res.status,
      body
    );
  }
  return body;
}

/** Unauthenticated POST /api/auth/reset-password — token from Control reset link. */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ message?: string }> {
  const base = resolveControlBase();
  const res = await fetch(`${base}/api/auth/reset-password`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      token: String(token || "").trim(),
      new_password: String(newPassword || ""),
    }),
  });
  const body = (await parseJson(res)) as { message?: string; detail?: string };
  if (!res.ok) {
    throw new ApiError(
      detailMessage(body, "Could not reset the password."),
      res.status,
      body
    );
  }
  return body;
}

/** Unscoped GET (admin / fleet). */
export async function controlGet<T>(path: string): Promise<T> {
  if (useMockApi()) {
    throw new ApiError("Mock API not wired in React client yet", 503, null);
  }
  const base = resolveControlBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders({ privileged: true }),
    credentials: "include",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(detailMessage(body, `HTTP ${res.status}`), res.status, body);
  }
  return body as T;
}

/** Unscoped POST (admin / kill / power). */
export async function controlPost<T>(
  path: string,
  payload: unknown = {},
  opts: { method?: string } = {}
): Promise<T> {
  if (useMockApi()) {
    throw new ApiError("Mock API not wired in React client yet", 503, null);
  }
  const base = resolveControlBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const method = opts.method || "POST";
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders({ privileged: true }),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(detailMessage(body, `HTTP ${res.status}`), res.status, body);
  }
  return body as T;
}

export type DeskFleetRow = {
  desk_id: string;
  label?: string;
  environment?: string;
  power?: { state?: string };
  activity?: { state?: string };
  [key: string]: unknown;
};

export type DesksStatusPayload = {
  as_of?: string;
  desks: Record<string, DeskFleetRow>;
};

export function fetchDesksStatus(): Promise<DesksStatusPayload> {
  return controlGet<DesksStatusPayload>("/api/desks/status");
}

export function setDeskPower(
  deskId: string,
  action: "start" | "stop"
): Promise<Record<string, unknown>> {
  return controlPost(
    `/api/desks/${encodeURIComponent(deskId)}/power?action=${action}`,
    {}
  );
}

/** Freeze (active=true) or resume (active=false) trading on a desk. */
export function setDeskKill(
  deskId: string,
  active: boolean
): Promise<Record<string, unknown>> {
  return controlPost(
    withQuery("/api/desks/kill", {
      active: active ? "true" : "false",
      desk_id: deskId,
    }),
    {}
  );
}

/** Global panic / hold kill switch. */
export function setKillSwitch(
  active: boolean
): Promise<{ kill_switch?: boolean; [key: string]: unknown }> {
  return controlPost(
    withQuery("/api/kill", { active: active ? "true" : "false" }),
    {}
  );
}

export type AdminKeyTarget = {
  id: string;
  label?: string;
  execution_env?: string;
  is_demo?: boolean;
  configured?: boolean;
  has_api_key?: boolean;
  has_api_secret?: boolean;
  api_key_updated_at?: string;
  error?: string;
};

export function fetchAdminKeys(): Promise<{
  targets?: AdminKeyTarget[];
  actor?: string;
}> {
  return controlGet("/api/admin/keys");
}

export function saveAdminKey(
  targetId: string,
  body: { api_key: string; api_secret: string; confirm?: string }
): Promise<{ api_key_fingerprint?: string }> {
  return controlPost(`/api/admin/keys/${encodeURIComponent(targetId)}`, body);
}

export type AuthUserRow = {
  id: string | number;
  email: string;
  role?: string;
  status?: string;
  created_at?: string;
  is_super_admin?: boolean;
  telegram_chat_id?: string | null;
};

export type AuditEventRow = {
  event_id: string | number;
  event_type?: string;
  action?: string;
  approver?: string;
  user?: string;
  role?: string | null;
  resource?: string;
  target?: string | null;
  source_execution_env?: string | null;
  source_lane?: string | null;
  target_execution_env?: string | null;
  target_lane?: string | null;
  playbook_key?: string | null;
  approved_at?: string | null;
  occurred_at?: string | null;
  status?: string;
};

export type AuditEventsPayload = {
  events: AuditEventRow[];
  total?: number;
  limit?: number;
  offset?: number;
  has_more?: boolean;
};

/** GET /api/audit/scope-events — promotion / live-activation trail. */
export function fetchAuditEvents(opts?: {
  limit?: number;
  offset?: number;
}): Promise<AuditEventsPayload> {
  return authGet(
    withQuery("/api/audit/scope-events", {
      limit: opts?.limit ?? 50,
      offset: opts?.offset ?? 0,
    })
  ).then((body) => {
    const raw = body as AuditEventsPayload & { events?: AuditEventRow[] };
    return {
      events: Array.isArray(raw.events) ? raw.events : [],
      total: raw.total ?? (raw.events?.length || 0),
      limit: raw.limit,
      offset: raw.offset,
      has_more: !!raw.has_more,
    };
  });
}

/** PATCH /api/auth/me/profile — Telegram Chat ID etc. */
export async function updateAuthProfile(body: {
  telegram_chat_id?: string | null;
}): Promise<AuthUserRow> {
  return authPatch<AuthUserRow>("/api/auth/me/profile", body);
}

export type JournalTradeRow = Record<string, unknown> & {
  id?: string | number;
  symbol?: string;
  side?: string;
  pnl?: number;
  opened_at?: string;
  closed_at?: string;
};

/** Paginated journal — desk-scoped trades (no 100-row dashboard cap). */
export async function fetchDeskTradesPage(
  scope: DatasetScope,
  opts?: { limit?: number; offset?: number; status?: string }
): Promise<{
  trades: JournalTradeRow[];
  total: number;
  has_more: boolean;
  limit: number;
  offset: number;
}> {
  const product = scope.lane === "b" ? "v2" : "v1";
  const env = scope.execution_env;
  const path =
    env === "live"
      ? "/api/live/trades"
      : `/api/${product}/${env}/trades`;
  const body = await apiGet<{
    trades?: JournalTradeRow[];
    total?: number;
    has_more?: boolean;
    limit?: number;
    offset?: number;
  }>(
    withQuery(path, {
      limit: opts?.limit ?? 1000,
      offset: opts?.offset ?? 0,
      status: opts?.status ?? "closed",
      range: "all",
      ...(env !== "live" && scope.lane
        ? {}
        : {}),
    })
  );
  const trades = Array.isArray(body.trades) ? body.trades : [];
  return {
    trades,
    total: Number(body.total) || trades.length,
    has_more: !!body.has_more,
    limit: Number(body.limit) || trades.length,
    offset: Number(body.offset) || 0,
  };
}

/** Fetch every closed trade for CSV export (pages until exhausted). */
export async function fetchFullDeskLedger(
  scope: DatasetScope
): Promise<JournalTradeRow[]> {
  const out: JournalTradeRow[] = [];
  let offset = 0;
  const limit = 1000;
  for (let i = 0; i < 50; i += 1) {
    const page = await fetchDeskTradesPage(scope, { limit, offset, status: "closed" });
    out.push(...page.trades);
    if (!page.has_more || !page.trades.length) break;
    offset += page.trades.length;
  }
  return out;
}

async function authGet<T>(path: string): Promise<T> {
  if (useMockApi()) {
    throw new ApiError("Mock API not wired in React client yet", 503, null);
  }
  const base = resolveControlBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders({ privileged: false }),
    credentials: "include",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(detailMessage(body, `HTTP ${res.status}`), res.status, body);
  }
  return body as T;
}

/** GET /api/auth/me — refresh cached role/email from Control JWT. */
export async function fetchAuthMe(): Promise<AuthUserRow> {
  return authGet<AuthUserRow>("/api/auth/me");
}

export function fetchAuthUsers(): Promise<AuthUserRow[]> {
  return authGet<AuthUserRow[] | { users?: AuthUserRow[] }>("/api/auth/users").then(
    (body) => (Array.isArray(body) ? body : body.users || [])
  );
}

export function approveAuthUser(
  id: string | number,
  role: string
): Promise<unknown> {
  return authPost(`/api/auth/users/${encodeURIComponent(String(id))}/approve`, {
    role,
  });
}

export function rejectAuthUser(id: string | number): Promise<unknown> {
  return authPost(`/api/auth/users/${encodeURIComponent(String(id))}/reject`, {});
}

export function setAuthUserRole(
  id: string | number,
  role: string
): Promise<unknown> {
  return authPost(`/api/auth/users/${encodeURIComponent(String(id))}/role`, {
    role,
  });
}

export function changePasswordErrorMessage(err: {
  status?: number;
  message?: string;
}): string {
  const status = err?.status;
  const raw = String(err?.message || err || "");
  if (status === 404 || /not found/i.test(raw)) {
    return "Password change is not available on Control yet. Wait for the App route to deploy, then try again.";
  }
  if (
    status === 401 ||
    /unauthorized|unauthenticated|invalid token/i.test(raw)
  ) {
    return "Your session expired. Sign in again, then change your password.";
  }
  if (
    status === 403 ||
    /forbidden|current.?password|incorrect|invalid.?password|wrong.?password/i.test(
      raw
    )
  ) {
    return "Current password is incorrect.";
  }
  if (status === 422 || /too short|min(imum)?|at least 8|validation/i.test(raw)) {
    return "New password must be at least 8 characters.";
  }
  if (/failed to fetch|networkerror|network/i.test(raw)) {
    return "Could not reach Control. Check your connection and try again.";
  }
  if (raw && raw !== "Error" && raw.length < 180) return raw;
  return "Could not change password. Try again.";
}

/** JWT-only POST (auth account routes — no control write token required). */
async function authPost<T>(path: string, payload: unknown): Promise<T> {
  if (useMockApi()) {
    throw new ApiError("Mock API not wired in React client yet", 503, null);
  }
  const base = resolveControlBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders({ privileged: false }),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload ?? {}),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(detailMessage(body, `HTTP ${res.status}`), res.status, body);
  }
  return body as T;
}

/** JWT-only PATCH (profile / alert preferences). */
async function authPatch<T>(path: string, payload: unknown): Promise<T> {
  if (useMockApi()) {
    throw new ApiError("Mock API not wired in React client yet", 503, null);
  }
  const base = resolveControlBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...authHeaders({ privileged: false }),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload ?? {}),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(detailMessage(body, `HTTP ${res.status}`), res.status, body);
  }
  return body as T;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<unknown> {
  const current = String(currentPassword || "");
  const next = String(newPassword || "");
  if (!current) {
    throw new ApiError("Enter your current password.", 422, null);
  }
  if (!next || next.length < 8) {
    throw new ApiError("New password must be at least 8 characters.", 422, null);
  }
  if (current === next) {
    throw new ApiError(
      "New password must be different from the current password.",
      422,
      null
    );
  }
  try {
    return await authPost("/api/auth/change-password", {
      current_password: current,
      new_password: next,
    });
  } catch (err) {
    const apiErr = err instanceof ApiError ? err : new ApiError(String(err), 0, null);
    const friendly = new ApiError(
      changePasswordErrorMessage(apiErr),
      apiErr.status,
      apiErr.body
    );
    if (apiErr.status === 404) {
      (friendly as ApiError & { code?: string }).code = "not_available";
    }
    throw friendly;
  }
}
