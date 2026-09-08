/**
 * GST-120 — Delete Run on React Run Board (API + confirm).
 * Run: npm --prefix frontend test
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

async function loadClient() {
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
  const mod = await import(pathToFileURL(src("api", "client.ts")).href);
  return mod.default && typeof mod.default === "object" && !mod.deleteRuns
    ? { ...mod.default, ...mod }
    : mod;
}

describe("GST-120 deleteRuns client", () => {
  let calls;
  let confirmCalls;
  let confirmReturn;

  beforeEach(() => {
    calls = [];
    confirmCalls = [];
    confirmReturn = true;
    globalThis.window = globalThis.window || globalThis;
    globalThis.window.confirm = (msg) => {
      confirmCalls.push(String(msg));
      return confirmReturn;
    };
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      const u = new URL(String(url));
      const env = u.searchParams.get("execution_env") || "sim";
      const lane = u.searchParams.get("lane") || "a";
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            execution_env: env,
            lane,
            scope_key: `${env}|${lane}`,
            items: [{ run_id: "r1", mode: "data_and_results" }],
          });
        },
      };
    };
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it("posts mode + run_ids to /api/runs/delete with control token", async () => {
    const Api = await loadClient();
    await Api.deleteRuns(
      { execution_env: "sim", lane: "a", scope_key: "sim|a" },
      { mode: "data_and_results", run_ids: ["r1", "r2"] }
    );
    assert.match(calls[0].url, /\/api\/runs\/delete\?/);
    assert.match(calls[0].url, /execution_env=sim/);
    assert.match(calls[0].url, /lane=a/);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.mode, "data_and_results");
    assert.deepEqual(body.run_ids, ["r1", "r2"]);
    assert.equal(
      calls[0].options.headers["X-Gekko-Control-Token"],
      "ctrl-token"
    );
  });

  it("supports data mode (soft delete artefacts retained)", async () => {
    const Api = await loadClient();
    await Api.deleteRuns(
      { execution_env: "sim", lane: "b", scope_key: "sim|b" },
      { mode: "data", run_ids: ["run-b"] }
    );
    assert.match(calls[0].url, /lane=b/);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.mode, "data");
    assert.deepEqual(body.run_ids, ["run-b"]);
  });
});

describe("GST-120 useDeleteRuns confirm guard", () => {
  it("deleteRunVars builds data_and_results single-id payload", async () => {
    const mod = await import(
      pathToFileURL(src("hooks", "useDeleteRuns.ts")).href
    );
    const api =
      mod.default && typeof mod.default === "object" && !mod.deleteRunVars
        ? { ...mod.default, ...mod }
        : mod;
    const vars = api.deleteRunVars({
      run_id: "abc-123",
      run_label: "2026-08-05 morning",
      status: "succeeded",
    });
    assert.deepEqual(vars.run_ids, ["abc-123"]);
    assert.equal(vars.mode, "data_and_results");
    assert.match(String(vars.label || ""), /2026-08-05|abc-123/);
  });
});
