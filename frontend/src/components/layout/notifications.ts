/** Shared types + helpers for shell SSE toasts (GST-126). */

export const CRITICAL_NOTIFICATION_TYPES = [
  "trade_executed",
  "sim_completed",
  "emergency_freeze",
] as const;

export type CriticalNotificationType =
  (typeof CRITICAL_NOTIFICATION_TYPES)[number];

export type ShellNotification = {
  id: string;
  type: CriticalNotificationType | string;
  title: string;
  body: string;
  at: string;
  raw?: Record<string, unknown>;
};

export function isCriticalNotificationType(
  value: string
): value is CriticalNotificationType {
  return (CRITICAL_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function titleForNotification(
  type: string,
  payload: Record<string, unknown>
): string {
  if (typeof payload.title === "string" && payload.title.trim()) {
    return payload.title.trim();
  }
  switch (type) {
    case "trade_executed":
      return "Trade executed";
    case "sim_completed":
      return "Simulation complete";
    case "emergency_freeze":
      return "Emergency freeze";
    default:
      return type.replace(/_/g, " ");
  }
}

export function bodyForNotification(
  type: string,
  payload: Record<string, unknown>
): string {
  if (typeof payload.body === "string" && payload.body.trim()) {
    return payload.body.trim();
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  const scope = payload.scope_key || payload.desk_id || payload.scope;
  const run = payload.run_id || payload.run_label;
  const parts: string[] = [];
  if (scope) parts.push(String(scope));
  if (run) parts.push(`run ${String(run)}`);
  if (type === "trade_executed" && payload.symbol) {
    parts.push(String(payload.symbol));
  }
  if (type === "emergency_freeze" && payload.active != null) {
    parts.push(payload.active ? "active" : "cleared");
  }
  return parts.join(" · ") || "Open the desk for details.";
}

export function parseNotificationEvent(
  eventType: string,
  data: string
): ShellNotification | null {
  const type = (eventType || "message").trim();
  if (type === "heartbeat" || type === "connected" || type === "reconnect") {
    return null;
  }
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(data || "{}") as unknown;
    if (parsed && typeof parsed === "object") {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = { body: data };
  }
  const resolvedType = String(payload.type || type);
  if (!isCriticalNotificationType(resolvedType)) {
    return null;
  }
  const id = String(
    payload.id ||
      payload.event_id ||
      `${resolvedType}-${payload.at || Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  return {
    id,
    type: resolvedType,
    title: titleForNotification(resolvedType, payload),
    body: bodyForNotification(resolvedType, payload),
    at: String(payload.at || new Date().toISOString()),
    raw: payload,
  };
}
