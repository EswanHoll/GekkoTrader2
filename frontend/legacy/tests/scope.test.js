/**
 * Scope contract helpers (Node harness).
 * Run: node --test frontend/tests/scope.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

global.GEKKO_USE_MOCK_API = true;
// Inject a fake Control base — never assert *.fly.dev as the product default.
global.GEKKO_API_URL = "https://control.example.test";

const Scope = require(path.join(__dirname, "..", "scope.js"));
const Nav = require(path.join(__dirname, "..", "navigation-config.js"));
const Mock = require(path.join(__dirname, "..", "mock-api.js"));

const FAKE_CONTROL = "https://control.example.test";

describe("parseScopeFromPath", () => {
  it("parses env-before-lane desks", () => {
    assert.deepEqual(Scope.parseScopeFromPath("/sim/a/"), {
      execution_env: "sim",
      lane: "a",
      scope_key: "sim|a",
    });
    assert.deepEqual(Scope.parseScopeFromPath("/demo/b/results/"), {
      execution_env: "demo",
      lane: "b",
      scope_key: "demo|b",
    });
    assert.deepEqual(Scope.parseScopeFromPath("/live/"), {
      execution_env: "live",
      lane: null,
      scope_key: "live",
    });
  });

  it("returns null for hubs (no invented default scope)", () => {
    assert.equal(Scope.parseScopeFromPath("/"), null);
    assert.equal(Scope.parseScopeFromPath("/overview/"), null);
    assert.equal(Scope.parseScopeFromPath("/status/"), null);
    assert.equal(Scope.parseScopeFromPath("/audit/"), null);
    assert.equal(Scope.parseScopeFromPath("/admin/keys/"), null);
  });

  it("fail-closed on missing/invalid lane", () => {
    assert.throws(() => Scope.parseScopeFromPath("/sim/"), /missing lane/);
    assert.throws(() => Scope.parseScopeFromPath("/demo/x/"), /invalid lane/);
  });
});

describe("scopeQueryParams", () => {
  it("sends execution_env and lane for sim/demo", () => {
    const q = Scope.scopeQueryParams({ execution_env: "demo", lane: "a" });
    assert.equal(q.get("execution_env"), "demo");
    assert.equal(q.get("lane"), "a");
  });

  it("omits lane for live", () => {
    const q = Scope.scopeQueryParams({ execution_env: "live", lane: null });
    assert.equal(q.get("execution_env"), "live");
    assert.equal(q.get("lane"), null);
  });

  it("never invents a default lane", () => {
    assert.throws(
      () => Scope.scopeQueryParams({ execution_env: "sim", lane: null }),
      /lane required/
    );
  });
});

describe("assertScopeEcho", () => {
  it("accepts matching echo", () => {
    const req = { execution_env: "demo", lane: "a", scope_key: "demo|a" };
    assert.equal(
      Scope.assertScopeEcho(req, { execution_env: "demo", lane: "a", equity: 1 }),
      true
    );
  });

  it("rejects mismatched echo as 404", () => {
    const req = { execution_env: "demo", lane: "a", scope_key: "demo|a" };
    try {
      Scope.assertScopeEcho(req, { execution_env: "demo", lane: "b" });
      assert.fail("expected throw");
    } catch (err) {
      assert.equal(err.http_status, 404);
      assert.equal(err.code, "scope_echo_mismatch");
    }
  });
});

describe("formatScopeLabel", () => {
  it("renders short desk · playbook (Sim A, not Lane)", () => {
    assert.equal(
      Scope.formatScopeLabel({ execution_env: "sim", lane: "b" }, "playbook3.1"),
      "Sim B · playbook3.1"
    );
    assert.equal(
      Scope.formatScopeLabel({ execution_env: "demo", lane: "a" }),
      "Demo A"
    );
    assert.equal(
      Scope.formatScopeLabel({ execution_env: "live", lane: null }, "playbook1.1"),
      "Live · playbook1.1"
    );
  });
});

describe("navigation routes", () => {
  it("exposes canonical desks only", () => {
    const hrefs = Nav.flattenNav(Nav.NAVIGATION).map((n) => n.href).join(" ");
    assert.match(hrefs, /\/sim\/a\//);
    assert.match(hrefs, /\/demo\/b\//);
    assert.match(hrefs, /\/live\//);
    assert.match(hrefs, /\/overview\//);
    assert.match(hrefs, /\/status\//);
    assert.match(hrefs, /\/audit\//);
    // Retired lane spellings must not appear as path segments.
    for (const token of ["v" + "1", "v" + "2"]) {
      assert.ok(!hrefs.includes(`/${token}/`), `retired segment /${token}/ present`);
    }
  });
});

describe("mock api contract shape", () => {
  it("echoes scope on dashboard and 422 without scope", async () => {
    const ok = await Mock.handle(
      `${FAKE_CONTROL}/api/dashboard?execution_env=demo&lane=a`
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.body.execution_env, "demo");
    assert.equal(ok.body.lane, "a");
    assert.equal(ok.body.scope_key, "demo|a");
    assert.ok(ok.body.playbook_key);

    const missing = await Mock.handle(`${FAKE_CONTROL}/api/dashboard`);
    assert.equal(missing.status, 422);
  });
});
