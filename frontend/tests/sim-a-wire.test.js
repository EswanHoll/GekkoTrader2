/**
 * GST-116 — Sim A wire + Start Run body (React modules).
 * Run: npx tsx --test frontend/tests/sim-a-wire.test.js
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

async function loadTs(relParts) {
  const mod = await import(pathToFileURL(src(...relParts)).href);
  // tsx CJS interop may nest named exports under default.
  return mod.default && typeof mod.default === "object" && !mod.buildStartRunBody
    ? { ...mod.default, ...mod }
    : mod;
}

async function loadStartRun() {
  return loadTs(["lib", "startRun.ts"]);
}

async function loadClient() {
  // Provide window-like globals for config resolution.
  globalThis.window = globalThis.window || globalThis;
  globalThis.window.GEKKO_API_URL = "https://control.example.test";
  globalThis.window.GEKKO_USE_MOCK_API = false;
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  globalThis.sessionStorage = {
    getItem: () =>
      JSON.stringify({
        token: "ctrl-token",
        expires_at: Math.floor(Date.now() / 1000) + 600,
      }),
    setItem() {},
    removeItem() {},
  };
  return loadTs(["api", "client.ts"]);
}

describe("GST-116 React DOM testids (Sim desk)", () => {
  it("DeskPage exposes Start Run + bound settings testids", () => {
    const page = fs.readFileSync(src("pages", "DeskPage.tsx"), "utf8");
    assert.match(page, /data-testid="sim-desk-page"/);
    assert.match(page, /data-testid="desk-start-run"/);
    assert.match(page, /data-testid="bound-settings"/);
    assert.match(page, /data-testid="desk-run-controls"/);
    assert.match(page, /id="deskStartRun"/);
  });

  it("OverviewPage exposes desk grid testids", () => {
    const page = fs.readFileSync(src("pages", "OverviewPage.tsx"), "utf8");
    assert.match(page, /data-testid="overview-page"/);
    assert.match(page, /data-testid="overview-desk-grid"/);
    assert.match(page, /data-testid="overview-control-status"/);
  });
});

describe("GST-116 Start run uses bound settings version", () => {
  const MANIFEST = "ab".repeat(32);

  it("sources dataset_id/seed/manifest from bound version (not versions[0])", async () => {
    const { buildStartRunBody } = await loadStartRun();
    const body = buildStartRunBody(
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

  it("fails closed without binding (no versions[0] fallback)", async () => {
    const { buildStartRunBody } = await loadStartRun();
    assert.throws(
      () =>
        buildStartRunBody({
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

  it("fails closed when bound payload lacks dataset_id (no invent)", async () => {
    const { buildStartRunBody } = await loadStartRun();
    assert.throws(
      () =>
        buildStartRunBody({
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

  it("fails closed when bound payload lacks manifest_sha256 (no placeholder)", async () => {
    const { buildStartRunBody } = await loadStartRun();
    assert.throws(
      () =>
        buildStartRunBody({
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

describe("GST-116 React client wire shapes", () => {
  let calls;

  beforeEach(() => {
    calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            execution_env: "sim",
            lane: "a",
            scope_key: "sim|a",
            items: [{ run_id: "r1", status: "succeeded" }],
            ok: true,
          });
        },
      };
    };
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it("scopedUrl uses Control base (not *.fly.dev)", async () => {
    const Api = await loadClient();
    const url = Api.scopedUrl("/api/dashboard", {
      execution_env: "sim",
      lane: "a",
      scope_key: "sim|a",
    });
    assert.match(url, /^https:\/\/control\.example\.test\/api\/dashboard/);
    assert.doesNotMatch(url, /fly\.dev/);
  });

  it("withQuery repeats run_ids for compare", async () => {
    const Api = await loadClient();
    const pathQ = Api.withQuery("/api/runs/compare", {
      run_ids: ["r1", "r2", "r3"],
    });
    assert.match(pathQ, /run_ids=r1/);
    assert.match(pathQ, /run_ids=r2/);
    assert.match(pathQ, /run_ids=r3/);
  });

  it("startRun posts dataset_id + manifest_sha256 + idempotency_key", async () => {
    const Api = await loadClient();
    globalThis.fetch = async (url, options = {}) => {
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
    await Api.startRun(
      { execution_env: "sim", lane: "a", scope_key: "sim|a" },
      {
        idempotency_key: "k1",
        settings_version_id: "sv-1",
        dataset_id: 7,
        seed: 42,
        manifest_sha256: "a".repeat(64),
      }
    );
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.dataset_id, 7);
    assert.equal(body.manifest_sha256.length, 64);
    assert.equal(body.idempotency_key, "k1");
    assert.equal(calls[0].options.headers["X-Gekko-Control-Token"], "ctrl-token");
  });

  it("fetchRuns normalizes items → runs", async () => {
    const Api = await loadClient();
    const body = await Api.fetchRuns({
      execution_env: "sim",
      lane: "a",
      scope_key: "sim|a",
    });
    assert.equal(body.runs.length, 1);
    assert.equal(body.runs[0].run_id, "r1");
  });
});
