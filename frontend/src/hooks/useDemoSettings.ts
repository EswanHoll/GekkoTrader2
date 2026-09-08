import { useQuery } from "@tanstack/react-query";
import { fetchDemoDeskSettings } from "@/api/client";
import type { DatasetScope } from "@/types/scope";

/** Demo product-desk settings (GET /api/v{1|2}/demo/settings). */
export function useDemoSettings(scope: DatasetScope | null) {
  const lane = scope?.execution_env === "demo" ? scope.lane : null;
  return useQuery({
    queryKey: ["demo-settings", lane],
    queryFn: () => fetchDemoDeskSettings(lane!),
    enabled: !!lane,
    staleTime: 15_000,
  });
}
