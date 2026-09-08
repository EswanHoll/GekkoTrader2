/**
 * Start-run body from the *bound* settings version only.
 * Fail closed — never invent dataset_id or a placeholder manifest.
 */

export type SettingsVersion = {
  settings_version_id?: string | number;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SettingsBundle = {
  active_binding?: { settings_version_id?: string | number } | null;
  versions?: SettingsVersion[];
};

export type StartRunBody = {
  idempotency_key: string;
  settings_version_id: string;
  dataset_id: number;
  seed: number;
  manifest_sha256: string;
};

export class StartRunError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "StartRunError";
    this.code = code;
  }
}

function payloadOf(version: SettingsVersion | undefined): Record<string, unknown> {
  if (!version) return {};
  if (version.payload && typeof version.payload === "object") {
    return version.payload;
  }
  return version as Record<string, unknown>;
}

export function buildStartRunBody(
  settings: SettingsBundle | null | undefined,
  opts: { idempotency_key?: string } = {}
): StartRunBody {
  const versions = settings?.versions || [];
  const settings_version_id =
    settings?.active_binding?.settings_version_id != null
      ? String(settings.active_binding.settings_version_id)
      : "";
  if (!settings_version_id) {
    throw new StartRunError(
      "No bound settings version. Bind a settings version before Start run.",
      "settings_binding_missing"
    );
  }
  const bound = versions.find(
    (v) => String(v.settings_version_id) === settings_version_id
  );
  if (!bound) {
    throw new StartRunError(
      `Bound settings version ${settings_version_id} not found in versions list.`,
      "settings_version_missing"
    );
  }
  const p = payloadOf(bound);
  if (
    p.dataset_id == null ||
    p.dataset_id === "" ||
    !Number.isFinite(Number(p.dataset_id))
  ) {
    throw new StartRunError(
      "Bound settings version is missing dataset_id. Save and bind a version that includes it — do not invent one.",
      "dataset_id_missing"
    );
  }
  const manifest = String(p.manifest_sha256 || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(manifest)) {
    throw new StartRunError(
      "Bound settings version is missing a valid 64-hex manifest_sha256. Save and bind a version that includes it — do not invent one.",
      "manifest_sha256_missing"
    );
  }
  const seedRaw = p.seed ?? p.learning_seed;
  if (
    seedRaw == null ||
    seedRaw === "" ||
    !Number.isFinite(Number(seedRaw))
  ) {
    throw new StartRunError(
      "Bound settings version is missing seed (or learning_seed).",
      "seed_missing"
    );
  }
  const key =
    opts.idempotency_key ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ui-${Date.now()}`);
  return {
    idempotency_key: key,
    settings_version_id,
    dataset_id: Number(p.dataset_id),
    seed: Number(seedRaw),
    manifest_sha256: manifest.toLowerCase(),
  };
}
