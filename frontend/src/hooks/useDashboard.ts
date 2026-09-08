import { useQuery } from "@tanstack/react-query";
import { fetchDashboard, type DashboardSnapshot } from "@/api/client";
import type { DatasetScope } from "@/types/scope";

const IDLE_POLL_MS = 15_000;
/** GST-132 — while a run is active, poll EOD-flushed positions/trades faster. */
const ACTIVE_POLL_MS = 2_000;

function isActiveRun(data: DashboardSnapshot | undefined): boolean {
  const status = String(data?.active_run?.status || "").toLowerCase();
  return (
    status === "queued" ||
    status === "preparing" ||
    status === "running" ||
    status === "cancelling"
  );
}

export function useDashboard(scope: DatasetScope | null) {
  return useQuery({
    queryKey: ["dashboard", scope?.scope_key],
    queryFn: () => fetchDashboard(scope!),
    enabled: !!scope,
    staleTime: 1_000,
    refetchInterval: (query) =>
      isActiveRun(query.state.data) ? ACTIVE_POLL_MS : IDLE_POLL_MS,
  });
}
