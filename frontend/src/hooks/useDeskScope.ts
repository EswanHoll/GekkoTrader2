import { useMemo } from "react";
import { useParams } from "react-router-dom";
import type { DatasetScope, ExecutionEnv, Lane } from "@/types/scope";

function isLane(value: string | undefined): value is Lane {
  return value === "a" || value === "b";
}

/** Sim/Demo desk scope from `/:env/:lane` (never Live). */
export type DeskRouteScope =
  | { execution_env: "sim"; lane: Lane; scope_key: `sim|${Lane}` }
  | { execution_env: "demo"; lane: Lane; scope_key: `demo|${Lane}` };

/**
 * Resolve desk DatasetScope from React Router params (`/:env/:lane/...`).
 * Returns null when the path is not a sim/demo desk route.
 */
export function useDeskScope(): DeskRouteScope | null {
  const { env, lane } = useParams<{ env?: string; lane?: string }>();
  return useMemo((): DeskRouteScope | null => {
    if (!isLane(lane)) return null;
    if (env === "sim") {
      return { execution_env: "sim", lane, scope_key: `sim|${lane}` };
    }
    if (env === "demo") {
      return { execution_env: "demo", lane, scope_key: `demo|${lane}` };
    }
    return null;
  }, [env, lane]);
}

/** Matching Demo desk for a Sim lane (A↔A, B↔B). */
export function demoScopeFor(
  scope: DatasetScope
): Extract<DeskRouteScope, { execution_env: "demo" }> {
  const lane: Lane = scope.lane === "b" ? "b" : "a";
  return {
    execution_env: "demo",
    lane,
    scope_key: `demo|${lane}`,
  };
}

/** Matching Sim desk for a Demo lane. */
export function simScopeFor(
  scope: DatasetScope
): Extract<DeskRouteScope, { execution_env: "sim" }> {
  const lane: Lane = scope.lane === "b" ? "b" : "a";
  return {
    execution_env: "sim",
    lane,
    scope_key: `sim|${lane}`,
  };
}

export function productKeyForLane(lane: Lane | null | undefined): "v1" | "v2" {
  return lane === "b" ? "v2" : "v1";
}

export function isDeskEnv(value: string | undefined): value is ExecutionEnv {
  return value === "sim" || value === "demo" || value === "live";
}
