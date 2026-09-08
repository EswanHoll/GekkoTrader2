import type { DeskFleetRow } from "@/api/client";

export type FleetAction = {
  id: "start" | "stop" | "freeze" | "resume";
  label: string;
  kind: "primary" | "ghost" | "danger";
};

export type TileStatus = { label: string; tone: "ok" | "warn" | "bad" | "off" };

export function tileStatus(desk: DeskFleetRow): TileStatus {
  const power = desk.power?.state || "unknown";
  const activity = desk.activity?.state || "idle";
  if (power === "off") return { label: "Off", tone: "off" };
  if (power === "starting") return { label: "Starting…", tone: "warn" };
  if (power === "unhealthy") return { label: "Unhealthy", tone: "bad" };
  if (power === "unknown") return { label: "Unknown", tone: "warn" };
  if (activity === "kill") return { label: "Frozen", tone: "bad" };
  if (activity === "trading" || activity === "running_job") {
    return { label: "Trading", tone: "ok" };
  }
  if (activity === "reserved") return { label: "Reserved", tone: "warn" };
  if (activity === "queued") return { label: "Queued", tone: "warn" };
  if (activity === "stale") return { label: "Stale", tone: "bad" };
  return { label: "On · Idle", tone: "ok" };
}

export function actionsForDesk(desk: DeskFleetRow): FleetAction[] {
  const power = desk.power?.state || "unknown";
  const activity = desk.activity?.state || "idle";
  const canTradeControl = desk.environment !== "sim" && desk.environment !== "backtest";
  const actions: FleetAction[] = [];
  if (power === "off" || power === "unknown" || power === "unhealthy") {
    actions.push({ id: "start", label: "Start", kind: "primary" });
  }
  if (power === "on" || power === "starting") {
    actions.push({ id: "stop", label: "Stop", kind: "ghost" });
  }
  if (canTradeControl && power === "on") {
    if (activity === "kill") {
      actions.push({ id: "resume", label: "Resume Trading", kind: "primary" });
    } else {
      actions.push({ id: "freeze", label: "Freeze Trading", kind: "danger" });
    }
  }
  if (!actions.length) {
    actions.push({ id: "start", label: "Start", kind: "primary" });
  }
  return actions;
}

/** Prefer greenfield catalog order when present. */
export const FLEET_DESK_ORDER = [
  "live",
  "v1-demo",
  "v2-demo",
  "v1-backtest",
  "v2-backtest",
  "demo-a",
  "demo-b",
  "sim-a",
  "sim-b",
] as const;
