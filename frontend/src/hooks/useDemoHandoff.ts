import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  clearDemoJournal,
  endAndPublishDemo,
  promoteDemoToLive,
} from "@/api/client";
import type { DatasetScope, Lane } from "@/types/scope";

function productForLane(lane: Lane | null | undefined): "v1" | "v2" {
  return lane === "b" ? "v2" : "v1";
}

function invalidateDemoLive(qc: ReturnType<typeof useQueryClient>, lane: Lane) {
  void qc.invalidateQueries({ queryKey: ["demo-settings", lane] });
  void qc.invalidateQueries({ queryKey: ["live-dashboard"] });
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
  void qc.invalidateQueries({ queryKey: ["desks-status"] });
  void qc.invalidateQueries({ queryKey: ["overview"] });
}

/**
 * GST-128 — Demo Results desk book + Promote To Live mutations.
 * Invalidates Demo + Live desk queries so scoreboards refresh after success.
 */
export function useDemoHandoff(scope: DatasetScope | null) {
  const qc = useQueryClient();
  const lane: Lane = scope?.lane === "b" ? "b" : "a";
  const product = productForLane(lane);
  const enabled = scope?.execution_env === "demo";

  const clearWindow = useMutation({
    mutationFn: async () => {
      if (!enabled) throw new Error("Clear window is available on Demo desks only.");
      return clearDemoJournal(product);
    },
    onSuccess: () => invalidateDemoLive(qc, lane),
  });

  const endPublish = useMutation({
    mutationFn: async (notes?: string) => {
      if (!enabled) throw new Error("End & publish is available on Demo desks only.");
      return endAndPublishDemo(product, notes);
    },
    onSuccess: () => invalidateDemoLive(qc, lane),
  });

  const promoteLive = useMutation({
    mutationFn: async (settings?: Record<string, unknown> | null) => {
      if (!enabled) {
        throw new Error("Promote To Live is available on Demo desks only.");
      }
      return promoteDemoToLive(product, {
        settings: settings && Object.keys(settings).length ? settings : undefined,
        approved_by: "ui:demo_results_promote_live",
      });
    },
    onSuccess: () => invalidateDemoLive(qc, lane),
  });

  return {
    product,
    lane,
    clearWindow,
    endPublish,
    promoteLive,
    busy:
      clearWindow.isPending || endPublish.isPending || promoteLive.isPending,
  };
}
