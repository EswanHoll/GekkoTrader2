import { Link } from "react-router-dom";
import { ApiError } from "@/api/client";
import { useDemoSettings } from "@/hooks/useDemoSettings";
import { useDeskScope, simScopeFor } from "@/hooks/useDeskScope";
import { useSettingsVersions } from "@/hooks/useSettingsVersions";
import {
  deskLabel,
  formatScopeLabel,
  pathForScope,
  resolvePlaybookKey,
} from "@/lib/scope";

function boundPayload(
  versions: {
    settings_version_id?: string | number;
    payload?: Record<string, unknown>;
    [key: string]: unknown;
  }[],
  activeId: string
): Record<string, unknown> {
  const bound =
    versions.find((v) => String(v.settings_version_id) === activeId) ||
    versions[0];
  return (bound?.payload as Record<string, unknown>) || bound || {};
}

function KnobGrid({
  knobs,
  activeId,
  versionsCount,
  playbook,
}: {
  knobs: Record<string, unknown>;
  activeId: string;
  versionsCount: number;
  playbook: string;
}) {
  return (
    <section
      className="rounded-lg border border-gekko-border bg-gekko-surface/40 px-4 py-4"
      aria-label="Bound settings"
    >
      <h2 className="text-lg font-bold">Bound settings</h2>
      <p className="mt-1 text-sm text-gekko-muted">
        What this desk will use next.
      </p>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-gekko-muted">Playbook</dt>
          <dd className="font-mono" data-testid="setup-playbook">
            {playbook || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-gekko-muted">Opening balance</dt>
          <dd className="font-mono">
            {String(knobs.opening_balance ?? "—")}
          </dd>
        </div>
        <div>
          <dt className="text-gekko-muted">Risk %</dt>
          <dd className="font-mono">
            {String(knobs.risk_per_trade_pct ?? "—")}
          </dd>
        </div>
        <div>
          <dt className="text-gekko-muted">Max open</dt>
          <dd className="font-mono">
            {String(knobs.max_open_positions ?? "—")}
          </dd>
        </div>
        <div>
          <dt className="text-gekko-muted">Version</dt>
          <dd className="font-mono" id="svId">
            {activeId || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-gekko-muted">Versions listed</dt>
          <dd className="font-mono">{versionsCount}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Strategy / bound-settings surface — Sim settings-versions; Demo product settings. */
export function SetupPage() {
  const scope = useDeskScope();
  const isSim = scope?.execution_env === "sim";
  const isDemo = scope?.execution_env === "demo";
  const settings = useSettingsVersions(isSim ? scope : null);
  const demoSettings = useDemoSettings(isDemo ? scope : null);

  if (!scope) {
    return (
      <p className="text-gekko-muted" data-testid="setup-wrong-scope">
        Unknown desk scope.
      </p>
    );
  }

  if (isDemo) {
    const knobs =
      (demoSettings.data?.settings as Record<string, unknown>) || {};
    const playbook = resolvePlaybookKey(
      knobs.playbook_key as string | undefined,
      knobs.strategy_suite as string | undefined,
      scope
    );
    const chip = formatScopeLabel(scope, playbook);
    const activeId =
      demoSettings.data?.settings_version_id != null
        ? String(demoSettings.data.settings_version_id)
        : "";

    return (
      <section className="space-y-6" data-testid="setup-page" data-page="setup">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
            {deskLabel(scope)}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            Strategy
          </h1>
          <p className="mt-2 max-w-2xl text-gekko-muted">
            Demo settings are read-only here. Promote proven Sim knobs with{" "}
            <strong>Copy to Demo</strong> on{" "}
            <Link
              className="text-gekko underline"
              to={pathForScope(simScopeFor(scope), "results")}
            >
              Sim {String(scope.lane).toUpperCase()} Results
            </Link>
            .
          </p>
          <p
            id="scopeBanner"
            className="mt-2 text-sm text-gekko-muted"
            data-testid="scope-banner"
          >
            {chip}
          </p>
        </div>

        {demoSettings.isError ? (
          <p
            id="pageError"
            className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
            data-testid="setup-error"
          >
            Settings:{" "}
            {demoSettings.error instanceof ApiError
              ? demoSettings.error.message
              : demoSettings.error instanceof Error
                ? demoSettings.error.message
                : "unavailable"}
          </p>
        ) : null}

        <div id="setupRoot" aria-label="Bound settings" data-testid="setup-root">
          {demoSettings.isLoading ? (
            <p className="text-gekko-muted">Loading Demo settings…</p>
          ) : (
            <KnobGrid
              knobs={knobs}
              activeId={activeId}
              versionsCount={Object.keys(knobs).length ? 1 : 0}
              playbook={playbook}
            />
          )}
        </div>
      </section>
    );
  }

  if (!isSim) {
    return (
      <section className="space-y-4" data-testid="setup-page" data-page="setup">
        <h1 className="text-3xl font-extrabold tracking-tight">Strategy</h1>
        <div id="setupRoot" aria-label="Bound settings">
          <p className="text-gekko-muted">
            Bound settings editor is Sim/Demo only on these routes.
          </p>
        </div>
      </section>
    );
  }

  const versions = settings.data?.versions || [];
  const activeId =
    settings.data?.active_binding?.settings_version_id != null
      ? String(settings.data.active_binding.settings_version_id)
      : "";
  const knobs = boundPayload(versions, activeId);
  const playbook = resolvePlaybookKey(
    knobs.playbook_key as string | undefined,
    knobs.strategy_suite as string | undefined,
    scope
  );
  const chip = formatScopeLabel(scope, playbook);

  return (
    <section className="space-y-6" data-testid="setup-page" data-page="setup">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
          {deskLabel(scope)}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Strategy</h1>
        <p className="mt-2 max-w-2xl text-gekko-muted">
          Bound settings for the next Sim run ({chip}).
        </p>
        <p
          id="scopeBanner"
          className="mt-2 text-sm text-gekko-muted"
          data-testid="scope-banner"
        >
          {chip}
        </p>
      </div>

      {settings.isError ? (
        <p
          id="pageError"
          className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
          data-testid="setup-error"
        >
          Settings:{" "}
          {settings.error instanceof ApiError
            ? settings.error.message
            : settings.error instanceof Error
              ? settings.error.message
              : "unavailable"}
        </p>
      ) : null}

      <div id="setupRoot" aria-label="Bound settings" data-testid="setup-root">
        {settings.isLoading ? (
          <p className="text-gekko-muted">Loading bound settings…</p>
        ) : (
          <KnobGrid
            knobs={knobs}
            activeId={
              activeId ||
              (versions[0]?.settings_version_id != null
                ? String(versions[0].settings_version_id)
                : "—")
            }
            versionsCount={versions.length}
            playbook={playbook}
          />
        )}
      </div>
    </section>
  );
}
