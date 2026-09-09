import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteRuns, type RunDeleteMode } from "@/api/client";
import { runLabel, type BoardRun } from "@/lib/runBoard";
import type { DatasetScope } from "@/types/scope";

export type DeleteRunsVars = {
  run_ids: string[];
  mode?: RunDeleteMode;
  /** Set false to skip the browser confirm (tests). Default true. */
  confirm?: boolean;
  /** Optional label for the confirm dialog (single-run UX). */
  label?: string;
};

/**
 * Discard Sim Batch run(s) via POST /api/runs/delete.
 * Invalidates the runs query cache so the Run Board drops deleted columns.
 */
export function useDeleteRuns(scope: DatasetScope | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: DeleteRunsVars) => {
      if (!scope || scope.execution_env !== "sim") {
        throw new Error(
          "Delete Run is available on Sim desks only (Batch run ledger)."
        );
      }
      const run_ids = (vars.run_ids || []).map(String).filter(Boolean);
      if (!run_ids.length) {
        throw new Error("No run selected to delete.");
      }
      const mode: RunDeleteMode = vars.mode || "data_and_results";
      if (vars.confirm !== false) {
        const who =
          vars.label ||
          (run_ids.length === 1 ? run_ids[0] : `${run_ids.length} runs`);
        const ok = window.confirm(
          `Delete ${who}?\n\nRemoves data and results from this Sim desk (cannot undo). Hide keeps the run in storage.`
        );
        if (!ok) {
          const err = new Error("Cancelled.");
          (err as Error & { code?: string }).code = "cancelled";
          throw err;
        }
      }
      return deleteRuns(scope, { mode, run_ids });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["runs", scope?.scope_key] });
    },
  });
}

/** Convenience: delete one board column run. */
export function deleteRunVars(run: BoardRun): DeleteRunsVars {
  return {
    run_ids: [String(run.run_id)],
    mode: "data_and_results",
    label: runLabel(run),
  };
}
