/**
 * Navigation + scope-selector + scope-echo rejection (Node harness).
 * CI: node --test frontend/tests/poll.test.js frontend/tests/navigation.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

// Opt into contract mocks for shell navigation tests (GST-12 defaults mock off).
global.GEKKO_USE_MOCK_API = true;
// Inject a fake Control base — never assert *.fly.dev as the product default.
global.GEKKO_API_URL = "https://control.example.test";

const Nav = require(path.join(__dirname, "..", "navigation-config.js"));
const Scope = require(path.join(__dirname, "..", "scope.js"));
const Selector = require(path.join(__dirname, "..", "scope-selector.js"));
const Mock = require(path.join(__dirname, "..", "mock-api.js"));
const Api = require(path.join(__dirname, "..", "api-client.js"));

const FAKE_CONTROL = "https://control.example.test";

const BANNED_PATH_TOKENS = [
  "v1",
  "v2",
  "product",
  "strategy_id",
  "backtest",
  "paper",
  "testnet",
  "book",
  "gt-",
];

/** Same filter app-shell uses for desktop sidebar + mobile overlay. */
function renderedNavGroupIds(navigation, { isAdmin = true } = {}) {
  return navigation
    .filter((g) => !(g.role === "admin" && !isAdmin))
    .map((g) => g.id);
}

const EXPECTED_DESK_IDS = ["live", "demo-a", "demo-b", "sim-a", "sim-b"];
const EXPECTED_NAV_GROUPS = ["overview", ...EXPECTED_DESK_IDS, "admin"];
const EXPECTED_ENV_OPTIONS = ["live", "demo", "sim"];
const EXPECTED_SCOPE_KEYS = ["live", "demo|a", "demo|b", "sim|a", "sim|b"];

describe("canonical navigation", () => {
  const hrefs = Nav.flattenNav(Nav.NAVIGATION).map((n) => n.href);

  it("exposes env-before-lane desks and hubs", () => {
    for (const required of [
      "/overview/",
      "/status/",
      "/audit/",
      "/sim/a/",
      "/sim/b/",
      "/demo/a/",
      "/demo/b/",
      "/live/",
    ]) {
      assert.ok(hrefs.includes(required), `missing ${required}`);
    }
  });

  it("keeps Live → Demo A/B → Sim A/B operational order in NAVIGATION", () => {
    assert.deepEqual(Nav.operationalDeskIds(), EXPECTED_DESK_IDS);
    assert.deepEqual(Nav.navGroupIds(), EXPECTED_NAV_GROUPS);
    const deskSlice = Nav.NAVIGATION.map((n) => n.id).filter((id) =>
      EXPECTED_DESK_IDS.includes(id)
    );
    assert.deepEqual(deskSlice, EXPECTED_DESK_IDS);
  });

  it("includes results + runs under each champion/challenger desk", () => {
    for (const env of ["sim", "demo"]) {
      for (const lane of ["a", "b"]) {
        assert.ok(hrefs.includes(`/${env}/${lane}/results/`));
        assert.ok(hrefs.includes(`/${env}/${lane}/runs/`));
      }
    }
  });

  it("finds active page for desk surfaces", () => {
    const desk = Nav.findActive("/demo/a/");
    assert.equal(desk?.id, "demo-a-desk");
    const results = Nav.findActive("/sim/b/results/");
    assert.equal(results?.id, "sim-b-results");
    const live = Nav.findActive("/live/");
    assert.equal(live?.id, "live-status");
  });

  it("breadcrumbs use short desk labels (Demo B)", () => {
    const crumbs = Nav.breadcrumbs("/demo/b/runs/");
    const labels = crumbs.map((c) => c.label).join(" > ");
    assert.match(labels, /Demo B/);
    assert.doesNotMatch(labels, /Lane/);
    assert.match(labels, /Reports/);
  });

  it("Sim L2 matches old-site order: Desk · Results · Strategy · Reports", () => {
    const simA = Nav.NAVIGATION.find((n) => n.id === "sim-a");
    const labels = (simA?.children || []).map((c) => c.label);
    assert.deepEqual(labels.slice(0, 4), [
      "Desk",
      "Results",
      "Strategy",
      "Reports",
    ]);
    assert.ok(!labels.includes("Setup"));
    assert.ok(!labels.includes("Runs"));
    assert.ok(!labels.some((l) => /Lane/.test(l)));
  });

  it("contains no banned legacy path tokens", () => {
    const joined = hrefs.join(" ");
    for (const token of BANNED_PATH_TOKENS) {
      if (token.endsWith("-")) {
        assert.ok(!joined.includes(token), `banned token ${token} in nav`);
      } else {
        assert.ok(!joined.includes(`/${token}/`), `banned segment /${token}/ in nav`);
        assert.ok(!joined.includes(`/${token}`), `banned trailing /${token} in nav`);
      }
    }
  });
});

describe("rendered desktop/mobile nav order", () => {
  it("sidebar/overlay group order matches operational desks (admin)", () => {
    assert.deepEqual(
      renderedNavGroupIds(Nav.NAVIGATION, { isAdmin: true }),
      EXPECTED_NAV_GROUPS
    );
  });

  it("sidebar/overlay keeps desk order when admin is hidden", () => {
    assert.deepEqual(renderedNavGroupIds(Nav.NAVIGATION, { isAdmin: false }), [
      "overview",
      ...EXPECTED_DESK_IDS,
    ]);
  });
});

describe("scope selector helpers", () => {
  it("shows lane picker only for sim/demo", () => {
    assert.equal(Selector.showsLanePicker("sim"), true);
    assert.equal(Selector.showsLanePicker("demo"), true);
    assert.equal(Selector.showsLanePicker("live"), false);
    assert.equal(Selector.showsLanePicker(""), false);
  });

  it("lists env options Live → Demo → Sim", () => {
    assert.deepEqual(Selector.executionEnvUiOrder(), EXPECTED_ENV_OPTIONS);
    assert.deepEqual(Nav.EXECUTION_ENV_UI_ORDER, EXPECTED_ENV_OPTIONS);
    const html = Selector.envOptionsHtml("", { includePlaceholder: true });
    const values = [...html.matchAll(/value="(live|demo|sim)"/g)].map((m) => m[1]);
    assert.deepEqual(values, EXPECTED_ENV_OPTIONS);
  });

  it("builds env-before-lane scopes without inventing defaults", () => {
    assert.deepEqual(Selector.buildScopeFromSelection("live", "a"), {
      execution_env: "live",
      lane: null,
      scope_key: "live",
    });
    assert.deepEqual(Selector.buildScopeFromSelection("demo", "b"), {
      execution_env: "demo",
      lane: "b",
      scope_key: "demo|b",
    });
    assert.equal(Selector.buildScopeFromSelection("sim", null), null);
    assert.equal(Selector.buildScopeFromSelection("sim", ""), null);
    assert.equal(Selector.buildScopeFromSelection("", "a"), null);
    assert.equal(Selector.buildScopeFromSelection("demo", "x"), null);
  });

  it("preserves results/runs surface when switching desks", () => {
    assert.equal(Selector.surfaceFromPath("/sim/a/results/"), "results");
    assert.equal(Selector.surfaceFromPath("/demo/b/runs/"), "runs");
    assert.equal(Selector.surfaceFromPath("/demo/a/"), "");
    assert.equal(Selector.surfaceFromPath("/live/"), "");
    assert.equal(Selector.surfaceFromPath("/overview/"), "");
  });

  it("pathForScope matches selector navigation targets", () => {
    const scope = Selector.buildScopeFromSelection("sim", "a");
    assert.equal(Scope.pathForScope(scope, "results"), "/sim/a/results/");
    assert.equal(Scope.pathForScope({ execution_env: "live", lane: null }), "/live/");
  });
});

describe("overview cards / sections order", () => {
  it("mock overview desks follow Live → Demo A/B → Sim A/B", async () => {
    const res = await Mock.handle(`${FAKE_CONTROL}/api/overview`);
    assert.equal(res.status, 200);
    const keys = (res.body.desks || []).map((d) => d.scope_key);
    assert.deepEqual(keys, EXPECTED_SCOPE_KEYS);
  });

  it("sortDesksByOperationalOrder repairs shuffled API payloads", () => {
    const shuffled = [
      { execution_env: "sim", lane: "b", scope_key: "sim|b" },
      { execution_env: "live", lane: null, scope_key: "live" },
      { execution_env: "demo", lane: "b", scope_key: "demo|b" },
      { execution_env: "sim", lane: "a", scope_key: "sim|a" },
      { execution_env: "demo", lane: "a", scope_key: "demo|a" },
    ];
    const sorted = Nav.sortDesksByOperationalOrder(shuffled);
    assert.deepEqual(
      sorted.map((d) => d.scope_key),
      EXPECTED_SCOPE_KEYS
    );
  });

  it("Demo A sits beside Demo B and Sim A beside Sim B", () => {
    const ids = Nav.operationalDeskIds();
    assert.equal(ids.indexOf("demo-b"), ids.indexOf("demo-a") + 1);
    assert.equal(ids.indexOf("sim-b"), ids.indexOf("sim-a") + 1);
    assert.ok(ids.indexOf("live") < ids.indexOf("demo-a"));
    assert.ok(ids.indexOf("demo-b") < ids.indexOf("sim-a"));
  });
});

describe("scope-echo rejection", () => {
  it("assertScopeEcho accepts matching snake_case echo", () => {
    const req = { execution_env: "demo", lane: "a", scope_key: "demo|a" };
    assert.equal(
      Scope.assertScopeEcho(req, {
        execution_env: "demo",
        lane: "a",
        equity: 100,
      }),
      true
    );
  });

  it("assertScopeEcho rejects mismatched lane as 404", () => {
    const req = { execution_env: "demo", lane: "a", scope_key: "demo|a" };
    try {
      Scope.assertScopeEcho(req, { execution_env: "demo", lane: "b" });
      assert.fail("expected throw");
    } catch (err) {
      assert.equal(err.http_status, 404);
      assert.equal(err.code, "scope_echo_mismatch");
    }
  });

  it("assertScopeEcho rejects live payload that echoes a lane", () => {
    try {
      Scope.assertScopeEcho(
        { execution_env: "live", lane: null, scope_key: "live" },
        { execution_env: "live", lane: "a" }
      );
      assert.fail("expected throw");
    } catch (err) {
      assert.equal(err.http_status, 404);
      assert.equal(err.code, "scope_echo_mismatch");
    }
  });

  it("scopedGet verifies echo and rejects foreign payload", async () => {
    const scope = { execution_env: "demo", lane: "a", scope_key: "demo|a" };
    const ok = await Api.fetchDashboard(scope);
    assert.equal(ok.execution_env, "demo");
    assert.equal(ok.lane, "a");
    assert.ok(ok.playbook_key);

    // Force a foreign echo through assertScopeEcho (client contract).
    assert.throws(
      () =>
        Scope.assertScopeEcho(scope, {
          execution_env: "demo",
          lane: "b",
          scope_key: "demo|b",
        }),
      (err) => err.code === "scope_echo_mismatch" && err.http_status === 404
    );
  });

  it("mock API returns 422 without scope and never sends legacy params", async () => {
    const missing = await Mock.handle(`${FAKE_CONTROL}/api/dashboard`);
    assert.equal(missing.status, 422);

    const url = Api.scopedUrl("/api/dashboard", {
      execution_env: "sim",
      lane: "b",
    });
    assert.match(url, new RegExp(`^${FAKE_CONTROL.replace(/\./g, "\\.")}/api/dashboard`));
    assert.doesNotMatch(url, /fly\.dev/);
    assert.match(url, /execution_env=sim/);
    assert.match(url, /lane=b/);
    assert.doesNotMatch(url, /[?&]product=/);
    assert.doesNotMatch(url, /[?&]book=/);
    assert.doesNotMatch(url, /[?&]strategy_id=/);
    assert.doesNotMatch(url, /[?&]testnet=/);
    assert.doesNotMatch(url, /[?&]paper=/);
  });
});

describe("greenfield shell source hygiene", () => {
  it("new shell modules avoid banned legacy tokens", () => {
    const files = [
      "scope.js",
      "scope-selector.js",
      "api-client.js",
      "mock-api.js",
      "navigation-config.js",
      "desk-surface.js",
      "pages.js",
      "app-shell.js",
    ];
    // Split tokens so this test file itself does not trip a naive scan of its source.
    const banned = [
      ["v", "1"].join(""),
      ["v", "2"].join(""),
      "product",
      "strategy_id",
      "backtest",
      "paper",
      "testnet",
      "book",
      "gt-",
    ];
    for (const file of files) {
      const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
      // Strip line/block comment noise before scanning identifiers.
      const code = src
        .split("\n")
        .filter((line) => {
          const t = line.trimStart();
          return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
        })
        .join("\n");
      for (const token of banned) {
        if (token === "gt-") {
          assert.ok(!code.includes("gt-"), `${file} contains banned token gt-`);
          continue;
        }
        // Whole-token match so playbook* does not trip the retired "book" identifier.
        const re = new RegExp(`\\b${token}\\b`);
        assert.ok(!re.test(code), `${file} contains banned token ${token}`);
      }
    }
  });
});


describe("P0 Demo dashboard routing", () => {
  it("uses each Demo desk's canonical product dashboard", () => {
    assert.equal(
      Api.dashboardPathFor({ execution_env: "demo", lane: "a" }),
      "/api/v1/demo/dashboard"
    );
    assert.equal(
      Api.dashboardPathFor({ execution_env: "demo", lane: "b" }),
      "/api/v2/demo/dashboard"
    );
    assert.equal(
      Api.dashboardPathFor({ execution_env: "sim", lane: "a" }),
      "/api/dashboard"
    );
  });
});
