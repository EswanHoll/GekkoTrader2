/**
 * GST-126 / GST-133 — read-only EventSource → shell toast notifications.
 *
 * Relies on the browser's native EventSource reconnect (including after
 * backgrounding). No custom reconnect loop. Control publishes critical
 * events (e.g. ``sim_completed``) onto ``/api/events/notifications``.
 */
import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/auth";
import { resolveControlBase, useMockApi } from "@/lib/config";
import {
  CRITICAL_NOTIFICATION_TYPES,
  parseNotificationEvent,
  type ShellNotification,
} from "@/components/layout/notifications";

export type UseNotificationsOptions = {
  /** When false, the stream is not opened (e.g. signed-out). */
  enabled?: boolean;
  /** Max toasts retained in the stack. */
  maxToasts?: number;
  /** Auto-dismiss after ms (0 = sticky until dismiss). */
  dismissMs?: number;
  /**
   * Inject EventSource for tests. Defaults to `window.EventSource`, or
   * `window.__GEKKO_EVENT_SOURCE__` when present (Playwright init script).
   */
  EventSourceImpl?: typeof EventSource | null;
};

declare global {
  interface Window {
    __GEKKO_EVENT_SOURCE__?: typeof EventSource;
    /** Test helper — push a toast without a live SSE socket. */
    __gekkoPushNotification?: (payload: Record<string, unknown>) => void;
  }
}

function notificationsUrl(token: string): string {
  const base = resolveControlBase().replace(/\/$/, "");
  const u = new URL(`${base}/api/events/notifications`);
  // EventSource cannot set Authorization — token travels as a query param.
  u.searchParams.set("access_token", token);
  return u.toString();
}

export function useNotifications(opts: UseNotificationsOptions = {}) {
  const enabled = opts.enabled !== false;
  const maxToasts = opts.maxToasts ?? 5;
  const dismissMs = opts.dismissMs ?? 8_000;
  const [toasts, setToasts] = useState<ShellNotification[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle != null) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }

  function pushToast(note: ShellNotification) {
    setToasts((prev) => {
      const next = [note, ...prev.filter((t) => t.id !== note.id)].slice(
        0,
        maxToasts
      );
      return next;
    });
    if (dismissMs > 0) {
      const existing = timers.current.get(note.id);
      if (existing != null) window.clearTimeout(existing);
      const handle = window.setTimeout(() => dismiss(note.id), dismissMs);
      timers.current.set(note.id, handle);
    }
  }

  useEffect(() => {
    // Test / Storybook escape hatch — no live Control required.
    window.__gekkoPushNotification = (payload) => {
      const type = String(payload.type || "message");
      const note = parseNotificationEvent(type, JSON.stringify(payload));
      if (note) pushToast(note);
    };
    return () => {
      delete window.__gekkoPushNotification;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable helpers
  }, [maxToasts, dismissMs]);

  useEffect(() => {
    if (!enabled || useMockApi()) return;
    const token = getAuthToken();
    if (!token) return;

    const ES =
      opts.EventSourceImpl !== undefined
        ? opts.EventSourceImpl
        : typeof window !== "undefined"
          ? window.__GEKKO_EVENT_SOURCE__ || window.EventSource
          : null;
    if (!ES) return;

    let closed = false;
    let source: EventSource | null = null;
    try {
      // withCredentials keeps CORS cookies if Control ever adds them; JWT is
      // already on the query string for header-less EventSource.
      source = new ES(notificationsUrl(token), { withCredentials: true });
    } catch {
      return;
    }

    const onCritical = (ev: Event) => {
      const msg = ev as MessageEvent<string>;
      const note = parseNotificationEvent(
        (ev as MessageEvent).type || "message",
        String(msg.data || "")
      );
      if (note) pushToast(note);
    };

    for (const kind of CRITICAL_NOTIFICATION_TYPES) {
      source.addEventListener(kind, onCritical);
    }
    // Also accept unnamed messages that carry type in JSON.
    source.onmessage = (ev) => {
      const note = parseNotificationEvent("message", String(ev.data || ""));
      if (note) pushToast(note);
    };

    return () => {
      closed = true;
      for (const kind of CRITICAL_NOTIFICATION_TYPES) {
        source?.removeEventListener(kind, onCritical);
      }
      source?.close();
      void closed;
    };
    // Native EventSource reconnects on its own — do not schedule reopen here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, opts.EventSourceImpl]);

  useEffect(() => {
    return () => {
      for (const handle of timers.current.values()) {
        window.clearTimeout(handle);
      }
      timers.current.clear();
    };
  }, []);

  return { toasts, dismiss, pushToast };
}
