import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFleetActions, useDesksStatus } from "@/hooks/useDesksStatus";
import {
  FLEET_DESK_ORDER,
  actionsForDesk,
  tileStatus,
} from "@/lib/fleet";
import { getAuthToken, getAuthUser } from "@/lib/auth";
import type { DeskFleetRow } from "@/api/client";

export function AdminOperator() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const isSuper = user?.role === "super_admin" || !!user?.is_super_admin;
  const [status, setStatus] = useState("");
  const fleet = useDesksStatus({ pollMs: 5_000, enabled: isSuper });
  const actions = useFleetActions();

  useEffect(() => {
    if (!getAuthToken()) {
      navigate(`/login/?next=${encodeURIComponent("/admin/operator/")}`, {
        replace: true,
      });
    }
  }, [navigate]);

  if (!isSuper) {
    return (
      <section data-testid="admin-operator-page">
        <h1 className="text-2xl font-extrabold">Operator</h1>
        <p
          id="fleetPowerStatus"
          className="mt-2 text-red-400"
          data-testid="admin-operator-forbidden"
        >
          Super admin access required.
        </p>
      </section>
    );
  }

  const desks = fleet.data?.desks || {};
  const orderedIds = [
    ...FLEET_DESK_ORDER.filter((id) => desks[id]),
    ...Object.keys(desks).filter(
      (id) => !(FLEET_DESK_ORDER as readonly string[]).includes(id)
    ),
  ];

  async function runAction(desk: DeskFleetRow, actionId: string) {
    const label = desk.label || desk.desk_id;
    try {
      if (actionId === "start" || actionId === "stop") {
        if (
          actionId === "stop" &&
          !window.confirm(
            `Stop ${label}? Trading on that environment will stop when the machine stops.`
          )
        ) {
          return;
        }
        setStatus(
          actionId === "start" ? `Starting ${label}…` : `Stopping ${label}…`
        );
        await actions.power.mutateAsync({
          deskId: desk.desk_id,
          action: actionId,
        });
        setStatus(`${label} ${actionId} requested.`);
        return;
      }
      if (actionId === "freeze" || actionId === "resume") {
        const freeze = actionId === "freeze";
        if (
          freeze &&
          !window.confirm(
            `Freeze trading on ${label}? Open positions stay; new trades stop.`
          )
        ) {
          return;
        }
        setStatus(freeze ? `Freezing ${label}…` : `Resuming ${label}…`);
        await actions.kill.mutateAsync({
          deskId: desk.desk_id,
          active: freeze,
        });
        setStatus(`${label} ${freeze ? "frozen" : "resumed"}.`);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="space-y-6" data-testid="admin-operator-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
            Super admin
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Operator</h1>
          <p className="mt-2 max-w-2xl text-gekko-muted">
            Turn environments on or off and freeze trading when needed. Status
            polls every 5 seconds.
          </p>
        </div>
        <Link
          to="/admin/keys/"
          className="rounded border border-gekko-border px-3 py-2 text-sm"
        >
          Session &amp; keys
        </Link>
      </div>

      <section
        className="space-y-3"
        id="fleetPowerPanel"
        aria-label="Environments"
        data-testid="fleet-power-panel"
      >
        <h2 className="text-lg font-bold">Environments</h2>
        <div
          id="fleetDeskRows"
          className="space-y-2"
          data-testid="fleet-desk-rows"
        >
          {fleet.isLoading && !orderedIds.length ? (
            <p className="text-sm text-gekko-muted">Loading fleet status…</p>
          ) : null}
          {orderedIds.map((id) => {
            const desk = desks[id];
            if (!desk) return null;
            const st = tileStatus(desk);
            const btns = actionsForDesk(desk);
            return (
              <div
                key={id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gekko-border bg-gekko-surface/50 px-4 py-3"
                data-desk-id={id}
                data-testid={`fleet-desk-${id}`}
              >
                <div>
                  <div className="font-bold" data-testid={`fleet-desk-name-${id}`}>
                    {desk.label || id}
                  </div>
                  <div
                    className={
                      st.tone === "bad"
                        ? "text-sm text-red-400"
                        : st.tone === "ok"
                          ? "text-sm text-gekko"
                          : "text-sm text-gekko-muted"
                    }
                    data-testid={`fleet-desk-status-${id}`}
                  >
                    {st.label}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {btns.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      data-action={action.id}
                      data-testid={`fleet-action-${id}-${action.id}`}
                      disabled={actions.power.isPending || actions.kill.isPending}
                      className={
                        action.kind === "danger"
                          ? "rounded border border-red-400/50 px-3 py-1.5 text-sm text-red-200"
                          : action.kind === "ghost"
                            ? "rounded border border-gekko-border px-3 py-1.5 text-sm"
                            : "rounded bg-gekko px-3 py-1.5 text-sm font-bold text-gekko-bg"
                      }
                      onClick={() => void runAction(desk, action.id)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p
          id="fleetPowerStatus"
          className="text-sm text-gekko-muted"
          data-testid="fleet-power-status"
        >
          {status ||
            (fleet.isError
              ? fleet.error instanceof Error
                ? fleet.error.message
                : "Could not load status"
              : fleet.data?.as_of
                ? `Updated ${fleet.data.as_of}`
                : "")}
        </p>
      </section>
    </section>
  );
}
