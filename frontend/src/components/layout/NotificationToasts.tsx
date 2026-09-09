import type { ShellNotification } from "@/components/layout/notifications";

type Props = {
  toasts: ShellNotification[];
  onDismiss: (id: string) => void;
};

function toneClass(type: string): string {
  if (type === "emergency_freeze") {
    return "border-red-400/50 bg-gekko-surface text-white";
  }
  if (type === "trade_executed") {
    return "border-gekko/40 bg-gekko-surface text-white";
  }
  return "border-gekko-border bg-gekko-surface text-white";
}

export function NotificationToasts({ toasts, onDismiss }: Props) {
  if (!toasts.length) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      data-testid="shell-notification-toasts"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          data-testid="shell-notification-toast"
          data-notification-type={toast.type}
          className={[
            "pointer-events-auto rounded-md border px-3 py-2 shadow-lg backdrop-blur-sm",
            toneClass(toast.type),
          ].join(" ")}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gekko">
                {toast.title}
              </div>
              <div className="mt-0.5 text-xs text-gekko-muted">{toast.body}</div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded px-1.5 py-0.5 text-xs text-gekko-muted hover:bg-gekko-surface-hover hover:text-white"
              aria-label="Dismiss notification"
              data-testid="shell-notification-dismiss"
              onClick={() => onDismiss(toast.id)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
