import { useQuery } from "@tanstack/react-query";
import { fetchControlHealth } from "@/api/client";

export function useControlHealth() {
  return useQuery({
    queryKey: ["control", "health"],
    queryFn: fetchControlHealth,
    staleTime: 30_000,
    retry: 1,
  });
}
