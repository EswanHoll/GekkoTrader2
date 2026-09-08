import { useQuery } from "@tanstack/react-query";
import { fetchOverview } from "@/api/client";

export function useOverview() {
  return useQuery({
    queryKey: ["overview", "desks"],
    queryFn: fetchOverview,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
