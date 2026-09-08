import { useQuery } from "@tanstack/react-query";
import { fetchSettingsVersions } from "@/api/client";
import type { DatasetScope } from "@/types/scope";

export function useSettingsVersions(scope: DatasetScope | null) {
  return useQuery({
    queryKey: ["settings-versions", scope?.scope_key],
    queryFn: () => fetchSettingsVersions(scope!),
    enabled: !!scope && scope.execution_env === "sim",
    staleTime: 15_000,
  });
}
