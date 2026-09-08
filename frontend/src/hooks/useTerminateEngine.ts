import { useMutation, useQueryClient } from "@tanstack/react-query";
import { terminateEngine } from "@/api/client";
import type { DatasetScope } from "@/types/scope";

export type TerminateMode = "graceful" | "hard" | "resume";

/** Amber Stop (graceful), red Kill (hard), green Resume (inverse of Stop). */
export function useTerminateEngine(scope: DatasetScope | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: TerminateMode) => {
      if (!scope) throw new Error("desk scope required");
      return terminateEngine(scope, mode);
    },
    onSuccess: () => {
      if (!scope) return;
      void qc.invalidateQueries({ queryKey: ["dashboard", scope.scope_key] });
      void qc.invalidateQueries({ queryKey: ["runs", scope.scope_key] });
    },
  });
}
