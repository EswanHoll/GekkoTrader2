import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { compareRuns, fetchRuns } from "@/api/client";
import {
  mergeHydratedSettings,
  normalizeRunForBoard,
  PAGE_SIZE,
  type BoardRun,
} from "@/lib/runBoard";
import type { DatasetScope } from "@/types/scope";

const SUCCESS = new Set(["succeeded", "completed"]);

export function useRunsBoard(scope: DatasetScope | null) {
  const qc = useQueryClient();
  const [fetchedAll, setFetchedAll] = useState(false);
  const [extraRuns, setExtraRuns] = useState<BoardRun[]>([]);
  const [listOffset, setListOffset] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hydratedMap, setHydratedMap] = useState<
    Record<string, Record<string, unknown>>
  >({});

  // GST-134 — reset pager state only when the desk scope changes, not on
  // every background refetch (that was wiping Fetch-all results).
  useEffect(() => {
    setFetchedAll(false);
    setExtraRuns([]);
    setHydratedMap({});
    setListOffset(PAGE_SIZE);
  }, [scope?.scope_key]);

  const initial = useQuery({
    queryKey: ["runs", scope?.scope_key, "page", 0, PAGE_SIZE],
    queryFn: async () => {
      const list = await fetchRuns(scope!, {
        limit: PAGE_SIZE,
        offset: 0,
      });
      return list;
    },
    enabled: !!scope && (scope.execution_env === "sim" || scope.execution_env === "demo"),
    staleTime: 8_000,
    // While Fetch-all owns the cache, do not clobber it with a 5-row page.
    refetchInterval: fetchedAll ? false : 15_000,
  });

  // Keep listOffset aligned after the first page lands (scope reset handles clear).
  useEffect(() => {
    if (!initial.data || fetchedAll) return;
    const list = initial.data;
    setListOffset(
      Number.isFinite(Number(list.offset))
        ? Number(list.offset) + list.runs.length
        : list.runs.length
    );
  }, [initial.data, fetchedAll]);

  const baseRuns: BoardRun[] = (initial.data?.runs || [])
    .map((r) => normalizeRunForBoard(r))
    .filter((r): r is BoardRun => !!r);

  const seen = new Set(baseRuns.map((r) => String(r.run_id)));
  const appended = extraRuns.filter((r) => !seen.has(String(r.run_id)));
  const listRuns = [...baseRuns, ...appended];

  // Overlay compare-hydrate settings onto list rows (no sequential fetchRun
  // before first paint — GST-97).
  const runs = mergeHydratedSettings(
    listRuns,
    Object.values(hydratedMap)
  );

  const total = initial.data?.total ?? runs.length;
  const hasMore =
    !fetchedAll &&
    (initial.data?.has_more ?? false) &&
    runs.length < total;

  // After list paint, hydrate settings via /api/runs/compare when possible.
  useEffect(() => {
    if (!scope || (scope.execution_env !== "sim" && scope.execution_env !== "demo"))
      return;
    // Demo compare is not on /api/runs/compare yet — list metrics still paint.
    if (scope.execution_env === "demo") return;
    const candidates = listRuns
      .filter((r) => SUCCESS.has(String(r.status || "").toLowerCase()))
      .map((r) => String(r.run_id));
    if (candidates.length < 2) return;
    // Compare API caps batch size; hydrate in chunks so Fetch-all still fills.
    const chunks: string[][] = [];
    for (let i = 0; i < candidates.length; i += 10) {
      chunks.push(candidates.slice(i, i + 10));
    }
    let cancelled = false;
    void (async () => {
      for (const ids of chunks) {
        if (cancelled || ids.length < 2) continue;
        try {
          const body = await compareRuns(scope, ids);
          if (cancelled) return;
          const rows = Array.isArray(body.rows) ? body.rows : [];
          const next: Record<string, Record<string, unknown>> = {};
          for (const row of rows) {
            if (row?.run_id) next[String(row.run_id)] = row;
          }
          setHydratedMap((prev) => ({ ...prev, ...next }));
        } catch {
          /* list metrics still paint; settings cells may stay sparse */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, listRuns.map((r) => r.run_id).join(",")]);

  const loadNext5 = useCallback(async () => {
    if (!scope || loadingMore) return;
    setLoadingMore(true);
    try {
      const list = await fetchRuns(scope, {
        limit: PAGE_SIZE,
        offset: listOffset,
      });
      const page = list.runs
        .map((r) => normalizeRunForBoard(r))
        .filter((r): r is BoardRun => !!r);
      setExtraRuns((prev) => {
        const ids = new Set(prev.map((r) => String(r.run_id)));
        const merged = [...prev];
        for (const row of page) {
          if (!ids.has(String(row.run_id))) merged.push(row);
        }
        return merged;
      });
      setListOffset(
        Number.isFinite(Number(list.offset))
          ? Number(list.offset) + list.runs.length
          : listOffset + list.runs.length
      );
      if (!list.has_more) setFetchedAll(true);
    } finally {
      setLoadingMore(false);
    }
  }, [scope, loadingMore, listOffset]);

  const loadAll = useCallback(async () => {
    if (!scope || loadingMore) return;
    setLoadingMore(true);
    try {
      const list = await fetchRuns(scope);
      const page = list.runs
        .map((r) => normalizeRunForBoard(r))
        .filter((r): r is BoardRun => !!r);
      setExtraRuns([]);
      setFetchedAll(true);
      qc.setQueryData(["runs", scope.scope_key, "page", 0, PAGE_SIZE], {
        ...list,
        has_more: false,
      });
      setListOffset(page.length);
    } finally {
      setLoadingMore(false);
    }
  }, [scope, loadingMore, qc]);

  return {
    runs,
    total,
    hasMore,
    fetchedAll,
    isLoading: initial.isLoading,
    isError: initial.isError,
    error: initial.error,
    loadingMore,
    loadNext5,
    loadAll,
    refetch: initial.refetch,
    PAGE_SIZE,
    hydrated: Object.keys(hydratedMap).length > 0,
  };
}
