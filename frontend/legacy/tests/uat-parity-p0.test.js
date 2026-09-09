/**
 * UAT P0 — overview composition + view-only mutation visibility (GST-78 / GST-79).
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const Scope = require(path.join(__dirname, "..", "scope.js"));
const Nav = require(path.join(__dirname, "..", "navigation-config.js"));
const Cap = require(path.join(__dirname, "..", "sim-capability.js"));

const SIM_A = Object.freeze({
  execution_env: "sim",
  lane: "a",
  scope_key: "sim|a",
});

function loadApi() {
  delete require.cache[require.resolve(path.join(__dirname, "..", "api-client.js"))];
  global.GEKKO_USE_MOCK_API = false;
  global.GEKKO_API_URL = "https://control.example.test";
  global.GekkoScope = Scope;
  global.GekkoNavigationConfig = Nav;
  global.GekkoSimCapability = Cap;
  global.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  global.sessionStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  return require(path.join(__dirname, "..", "api-client.js"));
}

describe("UAT P0 overview composition (C-01)", () => {
  afterEach(() => {
    delete global.GEKKO_USE_MOCK_API;
    delete global.GEKKO_API_URL;
    delete global.GekkoNavigationConfig;
    delete global.GekkoSimCapability;
    delete global.GekkoScope;
    delete require.cache[require.resolve(path.join(__dirname, "..", "api-client.js"))];
  });

  it("compose desks without calling unscoped /api/overview", async () => {
    const Api = loadApi();
    const paths = [];
    global.fetch = async (url) => {
      const requestUrl = new URL(String(url));
      paths.push(requestUrl.toString());
      const pathname = requestUrl.pathname;
      const isDemoA = pathname.includes("/api/v1/demo/dashboard");
      const isDemoB = pathname.includes("/api/v2/demo/dashboard");
      const execution_env =
        isDemoA || isDemoB
          ? "demo"
          : requestUrl.searchParams.get("execution_env") || "sim";
      const lane =
        isDemoA ? "a" : isDemoB ? "b" : requestUrl.searchParams.get("lane") || null;
      const scope_key = lane ? `${execution_env}|${lane}` : execution_env;
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            execution_env,
            lane,
            scope_key,
            equity: 5000,
            realized_pnl: 12.5,
            open_positions: 0,
            runtime_status: "idle",
            is_dormant: false,
            playbook_key: "playbook1.1",
          });
        },
      };
    };
    const body = await Api.fetchOverview();
    assert.equal(body.desks.length, 5);
    assert.ok(paths.every((p) => !p.includes("/api/overview")));
    assert.ok(paths.some((p) => p.includes("/api/dashboard") && p.includes("execution_env=sim")));
    const simA = body.desks.find((d) => d.scope_key === "sim|a");
    assert.equal(simA.equity, 5000);
    const live = body.desks.find((d) => d.scope_key === "live");
    assert.match(String(live.runtime_status), /Live/i);
    assert.equal(live.is_dormant, true);
    const demoA = body.desks.find((d) => d.scope_key === "demo|a");
    assert.equal(demoA.equity, 5000);
    assert.equal(demoA.runtime_status, "idle");
  });

  it("audit soft-fails 404 to empty events", async () => {
    const Api = loadApi();
    global.fetch = async () => ({
      ok: false,
      status: 404,
      async text() {
        return JSON.stringify({ detail: "Not Found" });
      },
    });
    const body = await Api.fetchAuditEvents();
    assert.deepEqual(body.events, []);
  });
});

describe("UAT P0 view-only mutation visibility (C-04)", () => {
  beforeEach(() => {
    global.GekkoAuth = null;
  });
  afterEach(() => {
    delete global.GekkoAuth;
  });

  it("canMutate false for view_only on sim|a", async () => {
    global.GekkoAuth = {
      async getSession() {
        return { token: "t", user: { email: "v@example.com", role: "view_only" } };
      },
    };
    assert.equal(Cap.commandsEnabled(SIM_A), true);
    assert.equal(await Cap.canMutate(SIM_A), false);
  });

  it("canMutate true for super_admin on sim|a", async () => {
    global.GekkoAuth = {
      async getSession() {
        return { token: "t", user: { email: "a@example.com", role: "super_admin" } };
      },
    };
    assert.equal(await Cap.canMutate(SIM_A), true);
  });

  it("canMutate false on live even for super_admin", async () => {
    global.GekkoAuth = {
      async getSession() {
        return { token: "t", user: { email: "a@example.com", role: "super_admin" } };
      },
    };
    assert.equal(
      await Cap.canMutate({ execution_env: "live", lane: null, scope_key: "live" }),
      false
    );
  });
});
