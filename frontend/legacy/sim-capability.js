/**
 * Desk capability gates (GST-85 activation).
 * Active commands: Sim A + Sim B. Demo desks are live workers (no
 * Control Batch start/cancel). Live stays dormant.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GekkoSimCapability = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MVP_SCOPE_KEY = "sim|a";

  function scopeKey(scope) {
    if (!scope) return "";
    if (scope.scope_key) return scope.scope_key;
    if (scope.execution_env === "live") return "live";
    if (scope.execution_env && scope.lane) {
      return `${scope.execution_env}|${scope.lane}`;
    }
    return "";
  }

  function isSimLaneA(scope) {
    return scopeKey(scope) === MVP_SCOPE_KEY;
  }

  function isLive(scope) {
    return scope?.execution_env === "live";
  }

  function isDemo(scope) {
    return scope?.execution_env === "demo";
  }

  function isSimLaneB(scope) {
    return scope?.execution_env === "sim" && scope?.lane === "b";
  }

  /** Sim A or Sim B — Control greenfield read/write API is available. */
  function isSimActive(scope) {
    return isSimLaneA(scope) || isSimLaneB(scope);
  }

  /**
   * Whether this desk uses the Control Sim Batch run ledger
   * (`/api/runs`, settings-version run copy, compare). Demo/Live do not —
   * calling those routes yields scope-unavailable (404). UI must soft-gate.
   */
  function hasSimRunLedger(scope) {
    return isSimActive(scope);
  }

  /** Commands (start/cancel/settings write) for Sim A and Sim B. */
  function commandsEnabled(scope) {
    return isSimActive(scope);
  }

  /**
   * Whether mutation controls may be rendered. Scope gate + super_admin role.
   * View-only users must not see Start/Delete/Save (UAT C-04). Backend still
   * enforces via require_privileged_identity — this is the UI guardrail only.
   */
  async function canMutate(scope) {
    if (!commandsEnabled(scope)) return false;
    try {
      const session =
        (typeof globalThis !== "undefined" &&
          globalThis.GekkoAuth &&
          (await globalThis.GekkoAuth.getSession?.())) ||
        null;
      return session?.user?.role === "super_admin";
    } catch (_) {
      return false;
    }
  }

  function gateState(scope) {
    if (isSimLaneA(scope)) {
      return {
        state: "active",
        title: "Sim A — active",
        message: "Setup, start/cancel, monitor, results, and compare are enabled for this desk.",
        commands: true,
      };
    }
    if (isSimLaneB(scope)) {
      return {
        state: "active",
        title: "Sim B — active",
        message:
          "Setup, start/cancel, monitor, results, and compare are enabled (product V2 / regime).",
        commands: true,
      };
    }
    if (isDemo(scope)) {
      return {
        state: "active",
        title: "Demo — active",
        message:
          "This desk trades on the Binance demo venue. Sim desks own start/cancel Batch runs; Live stays off.",
        commands: false,
      };
    }
    if (isLive(scope)) {
      return {
        state: "dormant",
        title: "Live — dormant",
        message: "Live is first in nav and lane-less. No activation, promote, or capital actions from this UI.",
        commands: false,
      };
    }
    return {
      state: "unknown",
      title: "Scope not ready",
      message: "Choose a desk scope. Missing scope fails closed.",
      commands: false,
    };
  }

  function renderGateBanner(host, scope) {
    const el = typeof host === "string" ? document.getElementById(host) : host;
    if (!el) return;
    const gate = gateState(scope);
    el.hidden = gate.state === "active";
    el.className = `panel gate-banner gate-${gate.state}`;
    el.setAttribute("role", "status");
    el.innerHTML = `<strong>${gate.title}</strong><p class="muted-line">${gate.message}</p>`;
  }

  /**
   * GST-105 — website writes need a signed-in super_admin only.
   * No Admin → Keys paste. No second control-token unlock gate.
   * Best-effort remint of a control token remains for legacy routes only;
   * failure there must not block Start Run / Save.
   *
   * Returns { ok, status, detail } without throwing.
   */
  async function assertCommandIdentity() {
    const session = (await (typeof window !== "undefined"
      ? window.GekkoAuth?.getSession?.()
      : null)) || null;
    if (!session?.token) {
      return { ok: false, status: 401, detail: "authentication required" };
    }
    if (session.user?.role !== "super_admin") {
      return {
        ok: false,
        status: 403,
        detail: "Super admin role required for settings/run commands",
      };
    }

    const operator =
      typeof window !== "undefined" ? window.GekkoOperator || null : null;
    if (operator?.ensureWriteSession) {
      try {
        const hasHeader = !!operator.getSessionToken?.();
        await operator.ensureWriteSession({ force: !hasHeader });
      } catch (_) {
        /* legacy remint optional — do not block */
      }
    }
    return {
      ok: true,
      status: 200,
      session,
      control_token: operator?.getSessionToken?.() || "",
    };
  }

  return {
    MVP_SCOPE_KEY,
    scopeKey,
    isSimLaneA,
    isSimLaneB,
    isSimActive,
    hasSimRunLedger,
    isDemo,
    isLive,
    commandsEnabled,
    canMutate,
    gateState,
    renderGateBanner,
    assertCommandIdentity,
  };
});
