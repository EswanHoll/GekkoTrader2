import { useQuery } from "@tanstack/react-query";
import { fetchDashboard } from "@/api/client";
import type { DatasetScope } from "@/types/scope";

const LIVE_SCOPE: DatasetScope = {
  execution_env: "live",
  lane: null,
  scope_key: "live",
};

/** Live desk dashboard — poll every 5s (no SSE/WebSocket). */
export function useLiveDashboard() {
  return useQuery({
    queryKey: ["dashboard", "live"],
    queryFn: () => fetchDashboard(LIVE_SCOPE),
    staleTime: 4_000,
    refetchInterval: 5_000,
    retry: 1,
  });
}

export { LIVE_SCOPE };
