/**
 * Clear legacy privileged credentials from browser storage.
 *
 * Long-lived dashboard/control tokens must not authorize kill/control and must
 * not remain in localStorage.
 *
 * Short-lived write sessions use HttpOnly cookies (and a same-tab header token)
 * from /api/operator/session. Admin → Keys may keep `gekko_ops_device_secret`
 * so sessions can auto-start; that key is intentional and is not cleared here.
 * The control *token* itself must never live in localStorage.
 */
(function () {
  "use strict";
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("gekko_dashboard_token");
      localStorage.removeItem("gekko_control_token");
      // Migrate pre-Keys storage name before scrubbing the retired key.
      const legacySecret = String(localStorage.getItem("gekko_operator_control_secret") || "").trim();
      const currentSecret = String(localStorage.getItem("gekko_ops_device_secret") || "").trim();
      if (legacySecret && !currentSecret) {
        localStorage.setItem("gekko_ops_device_secret", legacySecret);
      }
      localStorage.removeItem("gekko_operator_control_secret");
      // Keep gekko_api_url when it is an https Control host (AWS Tokyo ALB, or
      // legacy Fly only if the operator explicitly set it). Drop only clearly
      // invalid / non-https values — never hard-pin a product default host.
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("gekko_api_url")) continue;
        const val = String(localStorage.getItem(key) || "").trim();
        if (key !== "gekko_api_url" || (val && !/^https:\/\//i.test(val))) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch (_) {
    /* private mode / blocked storage */
  }
})();
