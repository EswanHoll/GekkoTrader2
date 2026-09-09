import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDesksStatus,
  setDeskKill,
  setDeskPower,
  setKillSwitch,
} from "@/api/client";

export function useDesksStatus(opts: { pollMs?: number; enabled?: boolean } = {}) {
  const pollMs = opts.pollMs ?? 20_000;
  return useQuery({
    queryKey: ["desks", "status"],
    queryFn: fetchDesksStatus,
    enabled: opts.enabled !== false,
    staleTime: Math.min(pollMs, 10_000),
    refetchInterval: pollMs,
  });
}

export function useFleetActions() {
  const qc = useQueryClient();
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["desks", "status"] });

  const power = useMutation({
    mutationFn: ({ deskId, action }: { deskId: string; action: "start" | "stop" }) =>
      setDeskPower(deskId, action),
    onSuccess: invalidate,
  });

  const kill = useMutation({
    mutationFn: ({ deskId, active }: { deskId: string; active: boolean }) =>
      setDeskKill(deskId, active),
    onSuccess: invalidate,
  });

  const globalKill = useMutation({
    mutationFn: (active: boolean) => setKillSwitch(active),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["dashboard", "live"] });
    },
  });

  return { power, kill, globalKill };
}
