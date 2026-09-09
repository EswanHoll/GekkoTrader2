/**
 * GST-119 / GST-120 — dynamic desk routing, Demo parity, secondary tabs.
 * Run: npm --prefix frontend test
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
  return mod.default && typeof mod.default === "object" && !mod.useDeskScope
    ? { ...mod.default, ...mod }
    : mod;
}

describe("GST-119 dynamic desk routes (App)", () => {
  it("App uses /:env/:lane dynamic paths for desk surfaces", () => {
    const app = fs.readFileSync(src("App.tsx"), "utf8");
    assert.match(app, /path="\/:env\/:lane"/);
    assert.match(app, /path="\/:env\/:lane\/results"/);
    assert.match(app, /path="\/:env\/:lane\/setup"/);
    assert.match(app, /path="\/:env\/:lane\/runs"/);
    assert.match(app, /path="\/:env\/:lane\/compare"/);
    assert.match(app, /DeskPage/);
    assert.match(app, /ReportsPage/);
    assert.match(app, /ComparePage/);
    assert.doesNotMatch(app, /deskSurfaceRoutes\("sim"/);
  });

  it("useDeskScope resolves sim|demo × a|b", async () => {
    // Pure helpers do not need a Router — exercise demoScopeFor / productKey.
    const mod = await loadTs(["hooks", "useDeskScope.ts"]);
    assert.deepEqual(mod.demoScopeFor({ execution_env: "sim", lane: "a", scope_key: "sim|a" }), {
      execution_env: "demo",
      lane: "a",
      scope_key: "demo|a",
    });
    assert.deepEqual(mod.demoScopeFor({ execution_env: "sim", lane: "b", scope_key: "sim|b" }), {
      execution_env: "demo",
      lane: "b",
      scope_key: "demo|b",
    });
    assert.equal(mod.productKeyForLane("a"), "v1");
    assert.equal(mod.productKeyForLane("b"), "v2");
    assert.deepEqual(mod.simScopeFor({ execution_env: "demo", lane: "b", scope_key: "demo|b" }), {
      execution_env: "sim",
      lane: "b",
      scope_key: "sim|b",
    });
  });

  it("pages extract scope via useDeskScope (not pathname-only)", () => {
    for (const file of [
      "pages/DeskPage.tsx",
      "pages/ResultsPage.tsx",
      "pages/SetupPage.tsx",
      "pages/ReportsPage.tsx",
      "pages/ComparePage.tsx",
    ]) {
      const body = fs.readFileSync(src(...file.split("/")), "utf8");
      assert.match(body, /useDeskScope/, `${file} should use useDeskScope`);
    }
  });

  it("DeskPage supports demo (no Start Run; shows Demo settings)", () => {
    const page = fs.readFileSync(src("pages", "DeskPage.tsx"), "utf8");
    assert.match(page, /useDemoSettings/);
    assert.match(page, /data-desk-env=\{scope\.execution_env\}/);
    assert.match(page, /Demo settings/);
    assert.match(page, /desk-sim-results-link/);
  });

  it("ResultsPage Copy/Go To Demo uses copySettingsToDemo + navigate", () => {
    const page = fs.readFileSync(src("pages", "ResultsPage.tsx"), "utf8");
    assert.match(page, /copySettingsToDemo/);
    assert.match(page, /useNavigate/);
    assert.match(page, /DemoResultsLanding/);
    assert.match(page, /demo-hydrated-banner/);
    assert.match(page, /data-testid="results-copy-to-demo"/);
    assert.match(page, /data-testid="results-go-to-demo"/);
    // GST-124 — promote via Sim-scoped DEFINER path (desk save 404s on Control).
    assert.match(page, /copySettingsToDemo\(scope,/);
    assert.match(page, /pathForScope\(demo, "results"\)/);
    assert.doesNotMatch(page, /saveSettingsVersion\(demo/);
    assert.doesNotMatch(page, /saveDemoDeskSettings/);
    // GST-127 — Copy/Go To Demo must not prompt; Hide Run may still confirm.
    assert.doesNotMatch(
      page,
      /navigateAway \? "Go To Demo" : "Copy to Demo"/
    );
    assert.match(page, /hasBoundDemoSettings/);
    assert.match(page, /data-testid="demo-results-unbound"/);
    assert.match(page, /data-testid="demo-results-knobs"/);
    // GST-128 — Demo desk book + Promote To Live restored above settings card.
    assert.match(page, /useDemoHandoff/);
    assert.match(page, /data-testid="demo-results-run-control"/);
    assert.match(page, /data-testid="demo-clear-window"/);
    assert.match(page, /data-testid="demo-end-publish"/);
    assert.match(page, /data-testid="demo-promote-live"/);
    assert.match(page, /Promote To Live/);
    assert.match(page, /Clear window \(no publish\)/);
    assert.match(page, /End & publish/);
  });

  it("Reports + Compare + Setup secondary tabs exist with soft gates", () => {
    const reports = fs.readFileSync(src("pages", "ReportsPage.tsx"), "utf8");
    const compare = fs.readFileSync(src("pages", "ComparePage.tsx"), "utf8");
    const setup = fs.readFileSync(src("pages", "SetupPage.tsx"), "utf8");
    assert.match(reports, /data-testid="reports-page"/);
    assert.match(reports, /data-testid="reports-unavailable"/);
    assert.match(reports, /data-testid="runs-board"/);
    assert.match(compare, /data-testid="compare-page"/);
    assert.match(compare, /compareRuns/);
    assert.match(compare, /data-testid="compare-unavailable"/);
    assert.match(setup, /useDemoSettings/);
    assert.match(setup, /Copy to Demo/);
  });
});

describe("GST-119 Demo settings API client", () => {
  let calls;

  beforeEach(() => {
    calls = [];
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
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            environment: "demo",
            product: "v1",
            settings: { risk_per_trade_pct: 0.5 },
            settings_version_id: "sv-demo-1",
          });
        },
      };
    };
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it("copySettingsToDemo posts Sim-scoped /api/settings-versions/copy-to-demo", async () => {
    const mod = await import(pathToFileURL(src("api", "client.ts")).href);
    const Api =
      mod.default && typeof mod.default === "object" && !mod.copySettingsToDemo
        ? { ...mod.default, ...mod }
        : mod;
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 201,
        async text() {
          return JSON.stringify({
            settings_version_id: "sv-1",
            scope_key: "sim|a",
            execution_env: "sim",
            lane: "a",
            target_scope_key: "demo|a",
            desk_id: "v1/demo",
          });
        },
      };
    };
    await Api.copySettingsToDemo(
      { execution_env: "sim", lane: "a", scope_key: "sim|a" },
      { risk_per_trade_pct: 0.7 },
      { source_run_id: "run-1" }
    );
    assert.match(calls[0].url, /\/api\/settings-versions\/copy-to-demo/);
    assert.match(calls[0].url, /execution_env=sim/);
    assert.match(calls[0].url, /lane=a/);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.payload.risk_per_trade_pct, 0.7);
    assert.equal(body.source_run_id, "run-1");
  });

  it("saveDemoDeskSettings still posts to /api/v1/demo/settings/save for lane a", async () => {
    const mod = await import(pathToFileURL(src("api", "client.ts")).href);
    const Api =
      mod.default && typeof mod.default === "object" && !mod.saveDemoDeskSettings
        ? { ...mod.default, ...mod }
        : mod;
    await Api.saveDemoDeskSettings("a", { risk_per_trade_pct: 0.7 });
    assert.match(calls[0].url, /\/api\/v1\/demo\/settings\/save$/);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.settings.risk_per_trade_pct, 0.7);
    assert.equal(calls[0].options.headers["X-Gekko-Control-Token"], "ctrl-token");
  });

  it("dashboardPathFor maps demo lanes to product paths", async () => {
    const mod = await import(pathToFileURL(src("api", "client.ts")).href);
    const Api =
      mod.default && typeof mod.default === "object" && !mod.dashboardPathFor
        ? { ...mod.default, ...mod }
        : mod;
    assert.equal(
      Api.dashboardPathFor({
        execution_env: "demo",
        lane: "a",
        scope_key: "demo|a",
      }),
      "/api/v1/demo/dashboard"
    );
    assert.equal(
      Api.dashboardPathFor({
        execution_env: "demo",
        lane: "b",
        scope_key: "demo|b",
      }),
      "/api/v2/demo/dashboard"
    );
  });
});

describe("GST-119 route matrix coverage (Sim B / Demo A / Demo B)", () => {
  it("spa-route-html includes sim-b and demo a/b surfaces", () => {
    const script = fs.readFileSync(
      path.join(root, "scripts", "spa-route-html.mjs"),
      "utf8"
    );
    for (const route of [
      "sim/b",
      "sim/b/results",
      "sim/b/runs",
      "sim/b/setup",
      "sim/b/compare",
      "demo/a",
      "demo/a/results",
      "demo/a/runs",
      "demo/a/setup",
      "demo/b",
      "demo/b/results",
      "demo/b/runs",
      "demo/b/setup",
    ]) {
      assert.match(script, new RegExp(`"${route}"`));
    }
  });

  it("nav tree still exposes Demo A/B and Sim B children", () => {
    const nav = fs.readFileSync(src("lib", "navigation.ts"), "utf8");
    assert.match(nav, /id: "demo-a"/);
    assert.match(nav, /id: "demo-b"/);
    assert.match(nav, /id: "sim-b"/);
    assert.match(nav, /\$\{base\}\/results\//);
    assert.match(nav, /\$\{base\}\/runs\//);
    assert.match(nav, /\$\{base\}\/setup\//);
    assert.match(nav, /label: "Reports"/);
    assert.match(nav, /label: "Strategy"/);
    assert.match(nav, /label: "Compare"/);
  });
});
