import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchAdminKeys,
  saveAdminKey,
  type AdminKeyTarget,
} from "@/api/client";
import { getAuthToken, getAuthUser } from "@/lib/auth";

function KeyCard({
  target,
  onSaved,
}: {
  target: AdminKeyTarget;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveAdminKey(target.id, {
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim(),
        confirm: confirm.trim(),
      }),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || !apiSecret.trim()) {
      setOk(false);
      setMsg("API key and secret are required.");
      return;
    }
    if (target.id === "live" && confirm.trim() !== "LIVE") {
      setOk(false);
      setMsg('Type LIVE to confirm before saving Live keys.');
      return;
    }
    setMsg("Saving to AWS Secrets Manager…");
    setOk(null);
    try {
      const data = await save.mutateAsync();
      setApiKey("");
      setApiSecret("");
      setConfirm("");
      setOk(true);
      setMsg(
        `Saved to AWS · fingerprint ${data.api_key_fingerprint || "—"} · workers pick this up after restart`
      );
      onSaved();
    } catch (err) {
      setOk(false);
      setMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

  const exchange =
    target.execution_env === "demo" || target.is_demo
      ? "Binance demo"
      : "Binance live";

  return (
    <article
      className="rounded-lg border border-gekko-border bg-gekko-surface/50 p-4"
      data-testid={`admin-keys-card-${target.id}`}
      data-target={target.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">{target.label || target.id}</h3>
          <p className="text-sm text-gekko-muted">{exchange}</p>
        </div>
        <span
          className={
            target.error
              ? "text-red-400"
              : target.configured
                ? "text-gekko"
                : "text-gekko-muted"
          }
          data-testid={`admin-keys-status-${target.id}`}
        >
          {target.error ? "error" : target.configured ? "configured" : "missing"}
        </span>
      </div>
      <p className="mt-2 text-sm text-gekko-muted">
        Key {target.has_api_key ? "set" : "missing"} · Secret{" "}
        {target.has_api_secret ? "set" : "missing"}
      </p>
      {target.error ? (
        <p className="mt-1 text-sm text-red-400">{target.error}</p>
      ) : null}

      <form
        className="mt-4 space-y-3"
        data-keys-form={target.id}
        data-testid={`admin-keys-form-${target.id}`}
        onSubmit={onSubmit}
      >
        <label className="block text-sm">
          <span className="text-gekko-muted">API key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="mt-1 w-full rounded border border-gekko-border bg-gekko-bg px-3 py-2"
            data-testid={`admin-keys-api-key-${target.id}`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-gekko-muted">API secret</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            className="mt-1 w-full rounded border border-gekko-border bg-gekko-bg px-3 py-2"
            data-testid={`admin-keys-api-secret-${target.id}`}
          />
        </label>
        {target.id === "live" ? (
          <label className="block text-sm">
            <span className="text-gekko-muted">Type LIVE to confirm</span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="LIVE"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded border border-gekko-border bg-gekko-bg px-3 py-2"
              data-testid="admin-keys-live-confirm"
            />
          </label>
        ) : null}
        <button
          type="submit"
          className="rounded bg-gekko px-3 py-2 text-sm font-bold text-gekko-bg disabled:opacity-40"
          disabled={save.isPending}
          data-testid={`admin-keys-save-${target.id}`}
        >
          Save to AWS
        </button>
        <p
          className={
            ok === false
              ? "text-sm text-red-400"
              : ok === true
                ? "text-sm text-gekko"
                : "text-sm text-gekko-muted"
          }
          data-form-status
          data-testid={`admin-keys-form-status-${target.id}`}
        >
          {msg}
        </p>
      </form>
    </article>
  );
}

export function AdminKeys() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = getAuthUser();
  const isSuper = user?.role === "super_admin" || !!user?.is_super_admin;

  useEffect(() => {
    if (!getAuthToken()) {
      navigate(`/login/?next=${encodeURIComponent("/admin/keys/")}`, {
        replace: true,
      });
    }
  }, [navigate]);

  const keysQ = useQuery({
    queryKey: ["admin", "keys"],
    queryFn: fetchAdminKeys,
    enabled: !!getAuthToken() && isSuper,
    staleTime: 15_000,
  });

  if (!isSuper) {
    return (
      <section data-testid="admin-keys-page">
        <h1 className="text-2xl font-extrabold">Keys</h1>
        <p className="mt-2 text-red-400">Super admin access required.</p>
      </section>
    );
  }

  const targets = [...(keysQ.data?.targets || [])].sort((a, b) => {
    const order: Record<string, number> = {
      live: 0,
      "demo-a": 1,
      "demo-b": 2,
      "demo-v1": 1,
      "demo-v2": 2,
      "v1-demo": 1,
      "v2-demo": 2,
    };
    return (order[a.id] ?? 99) - (order[b.id] ?? 99);
  });

  let meta = "";
  let metaBad = false;
  if (keysQ.isLoading) {
    meta = "Loading key status from the AWS password vault…";
  } else if (keysQ.isError) {
    const msg =
      keysQ.error instanceof Error ? keysQ.error.message : "Failed to load";
    const lower = msg.toLowerCase();
    if (lower.includes("not found") || lower.includes("404")) {
      meta =
        "Exchange key status is unavailable from Control right now — this is not your operator secret. Demo keys already live in the AWS password vault and are not cleared by website releases. Retry after Control is updated, or use Refresh keys.";
    } else {
      meta = msg;
    }
    metaBad = true;
  } else if (targets.length) {
    const configured = targets.filter((t) => t.configured).length;
    meta = `${configured} of ${targets.length} desks have exchange keys in AWS · actor ${
      keysQ.data?.actor || "—"
    }. Website releases do not wipe these. Sim never receives keys.`;
  }

  return (
    <section className="space-y-6" data-testid="admin-keys-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
            Super admin
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Keys</h1>
          <p className="mt-2 max-w-2xl text-gekko-muted">
            Exchange keys for Live / Demo in <strong>AWS Secrets Manager</strong>.
            Website releases do not wipe these.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            id="keysRefreshBtn"
            data-testid="admin-keys-refresh"
            className="rounded border border-gekko-border px-3 py-2 text-sm"
            onClick={() => void keysQ.refetch()}
          >
            Refresh keys
          </button>
          <Link
            to="/admin/operator/"
            className="rounded border border-gekko-border px-3 py-2 text-sm"
          >
            Environments
          </Link>
        </div>
      </div>

      <p
        id="keysStatusMeta"
        data-testid="admin-keys-meta"
        className={metaBad ? "text-sm text-red-400" : "text-sm text-gekko-muted"}
      >
        {meta}
      </p>

      <div
        id="keysTargetsRoot"
        className="grid gap-4 lg:grid-cols-2"
        data-testid="admin-keys-targets"
      >
        {targets.map((t) => (
          <KeyCard
            key={t.id}
            target={t}
            onSaved={() => void qc.invalidateQueries({ queryKey: ["admin", "keys"] })}
          />
        ))}
      </div>
    </section>
  );
}
