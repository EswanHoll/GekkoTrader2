/** Runtime Control origin — patched into /config.js at deploy (ADR-0006). */

export function uiVersion(): string {
  return String(window.GEKKO_UI_VERSION || "dev");
}

export function resolveControlBase(): string {
  const cfg = window.GekkoControlConfig;
  if (cfg?.resolveControlBase) {
    return cfg.resolveControlBase({ allowMockLocal: true });
  }
  const raw = String(window.GEKKO_API_URL || "").trim();
  if (raw) return raw.replace(/\/$/, "");
  throw new Error(
    "Control API URL is not configured. Deploy patches window.GEKKO_API_URL from CONTROL_API_URL__PROJ_GEKKOTRADER."
  );
}

export function useMockApi(): boolean {
  if (typeof window.GEKKO_USE_MOCK_API === "boolean") {
    return window.GEKKO_USE_MOCK_API;
  }
  try {
    const flag = localStorage.getItem("gekko_use_mock_api");
    if (flag === "1" || flag === "true") return true;
    if (flag === "0" || flag === "false") return false;
  } catch {
    /* private mode */
  }
  return false;
}
