import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchSettingsVersions, startRun as apiStartRun } from "@/api/client";
import { buildStartRunBody } from "@/lib/startRun";
import type { DatasetScope } from "@/types/scope";

export function useStartRun(scope: DatasetScope | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { idempotency_key?: string; confirm?: boolean } = {}) => {
      if (!scope || scope.execution_env !== "sim") {
        throw new Error(
          "Start Run queues a Sim research job on this desk. Demo/Live trading is not started from this control."
        );
      }
      if (opts.confirm !== false) {
        const ok = window.confirm(
          `Start Run for Sim ${String(scope.lane).toUpperCase()}?\n\nQueues a research job from the bound Current settings, then refreshes the desk.`
        );
        if (!ok) {
          const err = new Error("Cancelled.");
          (err as Error & { code?: string }).code = "cancelled";
          throw err;
        }
      }
      const settings = await fetchSettingsVersions(scope);
      const body = buildStartRunBody(settings, {
        idempotency_key: opts.idempotency_key,
      });
      return apiStartRun(scope, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard", scope?.scope_key] });
      void qc.invalidateQueries({ queryKey: ["runs", scope?.scope_key] });
      void qc.invalidateQueries({ queryKey: ["settings-versions", scope?.scope_key] });
    },
  });
}
