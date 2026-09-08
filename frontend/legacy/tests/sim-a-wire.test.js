/**
 * GST-12 — Sim A real Control API client shapes (no live network).
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const Scope = require(path.join(__dirname, "..", "scope.js"));

const SIM_A = Object.freeze({
  execution_env: "sim",
  lane: "a",
  scope_key: "sim|a",
});

function loadApi({ useMock = false } = {}) {
  // Fresh module load with controllable globals.
  delete require.cache[require.resolve(path.join(__dirname, "..", "api-client.js"))];
  global.GEKKO_USE_MOCK_API = useMock;
  global.GEKKO_API_URL = "https://control.example.test";
  global.GekkoScope = Scope;
  global.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  global.sessionStorage = {
    getItem: () =>
      JSON.stringify({ token: "ctrl-token", expires_at: Math.floor(Date.now() / 1000) + 600 }),
    setItem() {},
    removeItem() {},
  };
  // Privileged posts read the parsed token via GekkoOperator (not raw sessionStorage).
  global.GekkoOperator = {
    getSessionToken: () => "ctrl-token",
    hasDeviceSecret: () => false,
    ensureWriteSession: async () => ({ active: true, ttl_remaining: 600 }),
    clearSessionToken() {},
  };
  return require(path.join(__dirname, "..", "api-client.js"));
}

describe("GST-12 real wire defaults", () => {
  afterEach(() => {
    delete global.GEKKO_USE_MOCK_API;
    delete global.GEKKO_API_URL;
    delete global.GekkoControlConfig;
    delete require.cache[require.resolve(path.join(__dirname, "..", "api-client.js"))];
    delete require.cache[require.resolve(path.join(__dirname, "..", "config.js"))];
  });

  it("defaults to real Control (mock off)", () => {
    const Api = loadApi({ useMock: false });
    assert.equal(Api.useMock(), false);
  });

  it("uses injected Control base (not *.fly.dev product default)", () => {
    const Api = loadApi({ useMock: false });
    const url = Api.scopedUrl("/api/dashboard", SIM_A);
    assert.match(url, /^https:\/\/control\.example\.test\/api\/dashboard/);
    assert.doesNotMatch(url, /fly\.dev/);
  });

  it("fails closed when GEKKO_API_URL unset and mock off", () => {
    delete require.cache[require.resolve(path.join(__dirname, "..", "api-client.js"))];
    delete require.cache[require.resolve(path.join(__dirname, "..", "config.js"))];
    delete global.GEKKO_API_URL;
    global.GEKKO_USE_MOCK_API = false;
    global.GekkoScope = Scope;
    global.localStorage = {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    };
    // Load config.js so empty GEKKO_API_URL + GekkoControlConfig apply.
    require(path.join(__dirname, "..", "config.js"));
    const Api = require(path.join(__dirname, "..", "api-client.js"));
    assert.throws(
      () => Api.controlBase(),
      (err) =>
        err.code === "gekko_api_url_missing" &&
        /CONTROL_API_URL__PROJ_GEKKOTRADER/.test(err.message) &&
        /AWS Tokyo Control ALB/i.test(err.message) &&
        !/gekkotrader-control\.fly\.dev/.test(err.message)
    );
  });

  it("builds compare URL with repeated run_ids (2–10 FastAPI list)", () => {
    const Api = loadApi({ useMock: false });
    const pathQ = Api.withQuery("/api/runs/compare", {
      run_ids: ["r1", "r2", "r3"],
    });
    assert.match(pathQ, /run_ids=r1/);
    assert.match(pathQ, /run_ids=r2/);
    assert.match(pathQ, /run_ids=r3/);
    const url = Api.scopedUrl(pathQ, SIM_A);
    assert.match(url, /execution_env=sim/);
    assert.match(url, /lane=a/);
  });
});

describe("GST-12 request bodies match App #565", () => {
  let calls;

  beforeEach(() => {
    calls = [];
    global.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            execution_env: "sim",
            lane: "a",
            scope_key: "sim|a",
            items: [],
            ok: true,
          });
        },
      };
    };
  });

  afterEach(() => {
    delete global.fetch;
    delete global.GEKKO_USE_MOCK_API;
  });

  it("saveSettingsVersion wraps payload and sends control token", async () => {
    const Api = loadApi({ useMock: false });
    await Api.saveSettingsVersion(SIM_A, {
      symbols: ["BTCUSDT"],
      playbook_key: "playbook1.1",
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/settings-versions\?/);
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body.payload.symbols, ["BTCUSDT"]);
    assert.equal(calls[0].options.headers["X-Gekko-Control-Token"], "ctrl-token");
    assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  });

  it("startRun posts dataset_id + manifest_sha256 + idempotency_key", async () => {
    const Api = loadApi({ useMock: false });
    global.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 202,
        async text() {
          return JSON.stringify({
            execution_env: "sim",
            lane: "a",
            scope_key: "sim|a",
            run_id: "run-1",
            status: "queued",
            created: true,
          });
        },
      };
    };
    await Api.startRun(SIM_A, {
      idempotency_key: "k1",
      settings_version_id: "sv-1",
      dataset_id: 7,
      seed: 42,
      manifest_sha256: "a".repeat(64),
    });
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.dataset_id, 7);
    assert.equal(body.manifest_sha256.length, 64);
    assert.equal(body.idempotency_key, "k1");
  });

  it("deleteRuns posts mode + run_ids to /api/runs/delete", async () => {
    const Api = loadApi({ useMock: false });
    await Api.deleteRuns(SIM_A, {
      mode: "data_and_results",
      run_ids: ["r1", "r2"],
    });
    assert.match(calls[0].url, /\/api\/runs\/delete\?/);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.mode, "data_and_results");
    assert.deepEqual(body.run_ids, ["r1", "r2"]);
  });

  it("copySettingsVersion sends selected_keys (App name)", async () => {
    const Api = loadApi({ useMock: false });
    global.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 201,
        async text() {
          return JSON.stringify({
            execution_env: "sim",
            lane: "a",
            scope_key: "sim|a",
            settings_version_id: "sv-2",
            copied_keys: ["symbols"],
          });
        },
      };
    };
    await Api.copySettingsVersion(SIM_A, {
      source_run_id: "run-1",
      mode: "selected",
      keys: ["symbols"],
    });
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body.selected_keys, ["symbols"]);
    assert.equal(body.mode, "selected");
  });

  it("fetchRuns normalizes items → runs", async () => {
    const Api = loadApi({ useMock: false });
    global.fetch = async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          execution_env: "sim",
          lane: "a",
          scope_key: "sim|a",
          items: [{ run_id: "r1", status: "succeeded" }],
        });
      },
    });
    const body = await Api.fetchRuns(SIM_A);
    assert.equal(body.runs.length, 1);
    assert.equal(body.runs[0].run_id, "r1");
  });
});

describe("GST-12 Start run uses bound settings version", () => {
  const Exec = require(path.join(__dirname, "..", "sim-execution.js"));
  const MANIFEST = "ab".repeat(32);

  it("sources dataset_id/seed/manifest from bound version (not versions[0])", () => {
    const body = Exec.buildStartRunBody(
      {
        active_binding: { settings_version_id: "sv-bound" },
        versions: [
          {
            settings_version_id: "sv-newest",
            payload: {
              dataset_id: 99,
              seed: 1,
              manifest_sha256: "cd".repeat(32),
            },
          },
          {
            settings_version_id: "sv-bound",
            payload: {
              dataset_id: 7,
              seed: 42,
              manifest_sha256: MANIFEST,
            },
          },
        ],
      },
      { idempotency_key: "k-test" }
    );
    assert.equal(body.settings_version_id, "sv-bound");
    assert.equal(body.dataset_id, 7);
    assert.equal(body.seed, 42);
    assert.equal(body.manifest_sha256, MANIFEST);
    assert.equal(body.idempotency_key, "k-test");
  });

  it("fails closed without binding (no versions[0] fallback)", () => {
    assert.throws(
      () =>
        Exec.buildStartRunBody({
          versions: [
            {
              settings_version_id: "sv-0",
              payload: { dataset_id: 1, seed: 1, manifest_sha256: MANIFEST },
            },
          ],
        }),
      (err) => err.code === "settings_binding_missing"
    );
  });

  it("fails closed when bound payload lacks dataset_id (no invent)", () => {
    assert.throws(
      () =>
        Exec.buildStartRunBody({
          active_binding: { settings_version_id: "sv-bound" },
          versions: [
            {
              settings_version_id: "sv-bound",
              payload: { seed: 1, manifest_sha256: MANIFEST },
            },
          ],
        }),
      (err) => err.code === "dataset_id_missing"
    );
  });

  it("fails closed when bound payload lacks manifest_sha256 (no placeholder)", () => {
    assert.throws(
      () =>
        Exec.buildStartRunBody({
          active_binding: { settings_version_id: "sv-bound" },
          versions: [
            {
              settings_version_id: "sv-bound",
              payload: { dataset_id: 7, seed: 1 },
            },
          ],
        }),
      (err) => err.code === "manifest_sha256_missing"
    );
  });
});
