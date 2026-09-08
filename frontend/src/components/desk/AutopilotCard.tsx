import {
  autopilotMetaText,
  latencyText,
  universeLine,
} from "@/lib/deskLedger";

type Props = {
  payload: Record<string, unknown> | null | undefined;
};

export function AutopilotCard({ payload }: Props) {
  return (
    <section
      className="rounded-lg border border-gekko-border bg-gekko-surface/30 p-4"
      data-testid="desk-autopilot"
    >
      <div className="mb-3">
        <h2 className="text-lg font-bold">Autopilot</h2>
        <p className="text-sm text-gekko-muted">
          Universe, cycle timing, and desk telemetry.
        </p>
      </div>
      <p
        className="text-sm"
        id="symbolsLine"
        data-testid="autopilot-universe"
      >
        <span className="text-gekko-muted">Universe: </span>
        <span className="font-mono">{universeLine(payload)}</span>
      </p>
      <p className="mt-2 text-sm" data-testid="autopilot-latency">
        <span className="text-gekko-muted">Latency </span>
        <strong id="latency" className="font-mono">
          {latencyText(payload)}
        </strong>
      </p>
      <p
        className="mt-2 text-sm text-gekko-muted"
        id="autopilotMeta"
        data-testid="autopilot-meta"
      >
        {autopilotMetaText(payload)}
      </p>
    </section>
  );
}
