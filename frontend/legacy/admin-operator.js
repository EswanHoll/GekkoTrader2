/*! Super-admin fleet power — vertical status tiles + Start/Stop CTA tiles. */
(function () {
  "use strict";

  // Same operator priority as navigation-config OPERATIONAL_DESK_ORDER.
  function deskOrder() {
    return (
      window.GekkoNavigationConfig?.operationalDeskIds?.() || [
        "live",
        "demo-a",
        "demo-b",
        "sim-a",
        "sim-b",
      ]
    );
  }

  async function ensureAdmin() {
    const status = document.getElementById("fleetPowerStatus");
    const session = (await window.GekkoAuth?.getSession?.()) || null;
    const user = session?.user;
    const act = document.getElementById("activityPill") || document.getElementById("healthPill");
    if (!user) {
      location.replace("/login/?next=" + encodeURIComponent("/admin/operator/"));
      return null;
    }
    if (user.role !== "super_admin") {
      if (status) status.textContent = "Super admin access required.";
      if (act) {
        act.textContent = "forbidden";
        act.className = "pill bad";
      }
      return null;
    }
    if (act) {
      act.textContent = "super admin";
      act.className = "pill ok";
    }
    return user;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** One human status for the tile face. */
  function tileStatus(desk) {
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

  function actionsForDesk(desk) {
    const power = desk.power?.state || "unknown";
    const activity = desk.activity?.state || "idle";
    const canTradeControl = desk.environment !== "sim";
    const actions = [];
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

  function renderFleet(payload) {
    const root = document.getElementById("fleetDeskRows");
    if (!root || !payload?.desks) return;
    root.replaceChildren();

    for (const id of deskOrder()) {
      const desk = payload.desks[id];
      if (!desk) continue;
      const status = tileStatus(desk);
      const actions = actionsForDesk(desk);
      const row = document.createElement("div");
      row.className = `fleet-env-row tone-${status.tone}`;
      row.dataset.deskId = id;

      const statusTile = document.createElement("article");
      statusTile.className = "fleet-tile fleet-status-tile";
      statusTile.innerHTML = `
        <span class="fleet-tile-name">${escapeHtml(desk.label || id)}</span>
        <span class="fleet-tile-status">${escapeHtml(status.label)}</span>`;

      const ctaTile = document.createElement("article");
      ctaTile.className = "fleet-tile fleet-cta-tile";
      ctaTile.setAttribute("aria-label", `${desk.label || id} actions`);
      const btns = document.createElement("div");
      btns.className = "fleet-cta-btns";
      actions.forEach((action) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `btn fleet-cta-btn kind-${action.kind}${
          action.kind === "ghost" ? " ghost" : action.kind === "danger" ? " danger" : ""
        }`;
        item.dataset.action = action.id;
        item.textContent = action.label;
        btns.appendChild(item);
      });
      ctaTile.appendChild(btns);

      row.appendChild(statusTile);
      row.appendChild(ctaTile);
      root.appendChild(row);
    }
  }

  async function refreshFleet() {
    const status = document.getElementById("fleetPowerStatus");
    try {
      const payload = await window.GekkoDeskStatus.fetchStatus();
      renderFleet(payload);
      if (status) {
        status.textContent = payload.as_of
          ? window.GekkoTime?.formatUpdated?.(payload.as_of) ||
            `Updated ${payload.as_of}`
          : "";
      }
      return payload;
    } catch (err) {
      if (status) {
        if (window.GekkoOperator?.applyStatusMessage) {
          window.GekkoOperator.applyStatusMessage(status, err.message || "Could not load status");
        } else {
          status.textContent = err.message || "Could not load status";
        }
      }
      throw err;
    }
  }

  async function runAction(deskId, action, label) {
    const status = document.getElementById("fleetPowerStatus");
    const Op = window.GekkoOperator;
    if (action === "start" || action === "stop") {
      if (
        action === "stop" &&
        !confirm(`Stop ${label}? Trading on that environment will stop when the machine stops.`)
      ) {
        return;
      }
      if (status) status.textContent = action === "start" ? `Starting ${label}…` : `Stopping ${label}…`;
      await window.GekkoDeskStatus.setPower(deskId, action);
      return;
    }
    if (action === "freeze" || action === "resume") {
      const freeze = action === "freeze";
      if (freeze && !confirm(`Freeze trading on ${label}? Open positions stay; new trades stop.`)) {
        return;
      }
      if (!Op?.privilegedFetch) {
        throw new Error(
          Op?.operatorSessionMessage?.() ||
            "Writes are locked. Unlock on Keys with the operator secret, then retry."
        );
      }
      if (status) status.textContent = freeze ? `Freezing ${label}…` : `Resuming ${label}…`;
      await Op.privilegedFetch(
        `/api/desks/kill?active=${freeze ? "true" : "false"}&desk_id=${encodeURIComponent(deskId)}`,
        { method: "POST" }
      );
    }
  }

  function wireFleetActions() {
    const root = document.getElementById("fleetDeskRows");
    if (!root || root.dataset.wired === "1") return;
    root.dataset.wired = "1";
    const status = document.getElementById("fleetPowerStatus");

    root.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;
      const row = btn.closest("[data-desk-id]");
      const deskId = row?.dataset?.deskId;
      const action = btn.getAttribute("data-action");
      const label = row?.querySelector(".fleet-tile-name")?.textContent || deskId;
      if (!deskId || !action) return;
      try {
        await runAction(deskId, action, label);
        await refreshFleet();
      } catch (err) {
        if (status) {
          if (window.GekkoOperator?.applyStatusMessage) {
            window.GekkoOperator.applyStatusMessage(status, err.message || String(err));
          } else {
            status.textContent = err.message || String(err);
          }
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    void (async () => {
      const user = await ensureAdmin();
      if (!user) return;
      wireFleetActions();
      void refreshFleet();
      setInterval(() => {
        void refreshFleet().catch(() => {});
      }, 20_000);
    })();
  });
})();
