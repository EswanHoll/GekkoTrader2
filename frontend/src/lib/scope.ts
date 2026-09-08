import type { DatasetScope, ExecutionEnv, Lane } from "@/types/scope";

export class ScopeError extends Error {
  http_status: number;
  code?: string;

  constructor(message: string, httpStatus = 422) {
    super(message);
    this.name = "ScopeError";
    this.http_status = httpStatus;
  }
}

/** GST-121 — suite / underscore aliases → runnable playbookN.M. */
const SUITE_TO_PLAYBOOK: Record<string, string> = {
  baseline: "playbook1.1",
  classic: "playbook2.1",
  regime: "playbook3.1",
  playbook1: "playbook1.1",
  playbook2: "playbook2.1",
  playbook3: "playbook3.1",
  playbook_1: "playbook1.1",
  playbook_2: "playbook2.1",
  playbook_3: "playbook3.1",
};

const PLAYBOOK_FAMILY_DEFAULT: Record<string, string> = {
  playbook1: "playbook1.1",
  playbook2: "playbook2.1",
  playbook3: "playbook3.1",
};

/** GST-107 / GST-121 — display playbookN.M, never suite names. */
export function resolvePlaybookKey(
  playbook_key?: string | null,
  strategy_suite?: string | null,
  scope?: DatasetScope | null
): string {
  const raw = String(playbook_key || "")
    .trim()
    .toLowerCase();
  if (raw.startsWith("playbook") && raw.includes(".")) return raw;
  if (PLAYBOOK_FAMILY_DEFAULT[raw]) return PLAYBOOK_FAMILY_DEFAULT[raw];
  if (SUITE_TO_PLAYBOOK[raw]) return SUITE_TO_PLAYBOOK[raw];

  const suite = String(strategy_suite || "")
    .trim()
    .toLowerCase();
  if (SUITE_TO_PLAYBOOK[suite]) return SUITE_TO_PLAYBOOK[suite];
  if (suite.startsWith("playbook") && suite.includes(".")) return suite;

  const lane = String(scope?.lane || "").toLowerCase();
  if (lane === "b") return SUITE_TO_PLAYBOOK.playbook3;
  if (lane === "a") return SUITE_TO_PLAYBOOK.playbook1;
  return "";
}

export function formatScopeLabel(
  scope: DatasetScope | null | undefined,
  playbook_key?: string | null
): string {
  if (!scope) return "—";
  const parts = [deskLabel(scope)];
  // Explicit playbook only — do not invent from lane defaults.
  const playbook = resolvePlaybookKey(playbook_key, null, null);
  if (playbook) parts.push(playbook);
  return parts.join(" · ");
}

export function assertScopeEcho(
  requested: DatasetScope,
  payload: unknown
): true {
  if (!requested) throw new ScopeError("requested scope required", 422);
  if (!payload || typeof payload !== "object") {
    throw new ScopeError("scoped payload missing", 404);
  }
  const body = payload as { execution_env?: string; lane?: string | null };
  if (body.execution_env !== requested.execution_env) {
    const err = new ScopeError(
      `scope echo mismatch: requested execution_env=${requested.execution_env} got ${body.execution_env}`,
      404
    );
    err.code = "scope_echo_mismatch";
    throw err;
  }
  if (requested.execution_env === "live") {
    if (body.lane != null && body.lane !== "") {
      const err = new ScopeError("live desk must not echo a lane", 404);
      err.code = "scope_echo_mismatch";
      throw err;
    }
    return true;
  }
  if (body.lane !== requested.lane) {
    const err = new ScopeError(
      `scope echo mismatch: requested lane=${requested.lane} got ${body.lane}`,
      404
    );
    err.code = "scope_echo_mismatch";
    throw err;
  }
  return true;
}

export function parseScopeFromPath(pathname: string): DatasetScope | null {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (!parts.length) return null;
  const head = parts[0];
  if (
    head === "overview" ||
    head === "status" ||
    head === "audit" ||
    head === "admin" ||
    head === "login" ||
    head === "account"
  ) {
    return null;
  }
  if (head === "live") {
    return { execution_env: "live", lane: null, scope_key: "live" };
  }
  if (head === "sim" || head === "demo") {
    const lane = parts[1];
    if (lane !== "a" && lane !== "b") {
      throw new Error(`invalid lane=${lane ?? ""}`);
    }
    return {
      execution_env: head,
      lane,
      scope_key: `${head}|${lane}`,
    };
  }
  return null;
}

export function pathForScope(
  scope: DatasetScope,
  surface: string = ""
): string {
  let base: string;
  if (scope.execution_env === "live") {
    base = "/live";
  } else {
    base = `/${scope.execution_env}/${scope.lane}`;
  }
  const suffix = surface.replace(/^\/+|\/+$/g, "");
  if (!suffix) return `${base}/`;
  return `${base}/${suffix}/`;
}

export function deskLabel(scope: DatasetScope | null | undefined): string {
  if (!scope) return "—";
  if (scope.execution_env === "live") return "Live";
  const env =
    scope.execution_env === "sim"
      ? "Sim"
      : scope.execution_env === "demo"
        ? "Demo"
        : String(scope.execution_env);
  return `${env} ${String(scope.lane).toUpperCase()}`;
}

export function isLane(value: string | null | undefined): value is Lane {
  return value === "a" || value === "b";
}

export function isExecutionEnv(
  value: string | null | undefined
): value is ExecutionEnv {
  return value === "sim" || value === "demo" || value === "live";
}
