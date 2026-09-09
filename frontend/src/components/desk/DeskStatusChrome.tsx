import { useDashboard } from "@/hooks/useDashboard";
import { useDeskScope } from "@/hooks/useDeskScope";
import { useDesksStatus } from "@/hooks/useDesksStatus";
import {
  deskHealthLabel,
  deskRunLabel,
  egressIpText,
  fleetDeskId,
  latencyText,
} from "@/lib/deskLedger";

function pillTone(tone: "ok" | "bad" | "warn" | "off"): string {
  if (tone === "ok") return "border-gekko/40 bg-gekko/10 text-gekko";
  if (tone === "bad") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (tone === "warn") return "border-amber-400/40 bg-amber-400/10 text-amber-100";
  return "border-gekko-border bg-gekko-surface/50 text-gekko-muted";
}

/** Top-right IP / Latency / Healthy / Running when on a desk route (GST-131). */
export function DeskStatusChrome() {
  const scope = useDeskScope();
  const dash = useDashboard(scope);
  const fleet = useDesksStatus({
    pollMs: 20_000,
    enabled: !!scope,
  });

  if (!scope) return null;

  const payload = (dash.data || null) as Record<string, unknown> | null;
  const deskId = fleetDeskId(scope);
  const fleetRow =
    deskId && fleet.data?.desks
      ? fleet.data.desks[deskId] ||
        Object.values(fleet.data.desks).find(
          (d) =>
            d.desk_id === deskId ||
            (d.environment === scope.execution_env &&
              String((d as { lane?: string }).lane || "") === scope.lane)
        )
      : null;

  const health = deskHealthLabel(fleetRow, payload);
  const run = deskRunLabel(fleetRow, payload);
  const ip = egressIpText(payload, scope);
  const ping = latencyText(payload);

  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-xs"
      data-testid="desk-status-chrome"
      aria-label="Desk connection and engine health"
    >
      <span
        className="desk-net inline-flex items-center gap-1.5 rounded border border-gekko-border bg-gekko-surface/40 px-2 py-1 font-mono text-gekko-muted"
        data-testid="desk-net"
      >
        <span id="deskEgressIp" data-testid="desk-egress-ip">
          {dash.isLoading ? "…" : ip}
        </span>
        <span aria-hidden="true">·</span>
        <span id="deskPing" data-testid="desk-ping">
          {dash.isLoading ? "…" : ping}
        </span>
      </span>
      <span
        id="powerPill"
        data-testid="desk-health-pill"
        className={`rounded border px-2 py-1 font-semibold ${pillTone(health.tone)}`}
      >
        {health.label}
      </span>
      <span
        id="activityPill"
        data-testid="desk-run-pill"
        className={`rounded border px-2 py-1 font-semibold ${pillTone(run.tone)}`}
      >
        {run.label}
      </span>
    </div>
  );
}
