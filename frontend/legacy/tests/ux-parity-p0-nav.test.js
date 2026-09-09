/**
 * UX Parity P0 — navigation model + local menus + auth recovery (GST-93).
 * Acceptance: UX-P0-01 … UX-P0-06 (journeys asserted here; visual proof via
 * scripts/ux_parity_p0_journeys.mjs after Pages publish).
 * Run: node --test frontend/tests/ux-parity-p0-nav.test.js
 */
"use strict";

const { describe, it, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const Nav = require(path.join(__dirname, "..", "navigation-config.js"));
global.GekkoNavigationConfig = Nav;
const Shell = require(path.join(__dirname, "..", "app-shell.js"));
const Auth = require(path.join(__dirname, "..", "auth.js"));
global.GekkoAuth = Auth;
const Desk = require(path.join(__dirname, "..", "desk-surface.js"));

const shellSrc = fs.readFileSync(
  path.join(__dirname, "..", "app-shell.js"),
  "utf8"
);
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const runBoardSrc = fs.readFileSync(
  path.join(__dirname, "..", "run-board.js"),
  "utf8"
);
const resultsHtml = fs.readFileSync(
  path.join(__dirname, "..", "sim", "a", "results", "index.html"),
  "utf8"
);

describe("UX-P0-01 dual desktop chrome (top + left rail)", () => {
  it("GST-101: desktop uses dual chrome; left primary rail stays visible", () => {
    assert.match(shellSrc, /function applyNavModel\s*\(/);
    assert.match(shellSrc, /"dual"/);
    assert.match(shellSrc, /never use topbar-only|GST-101/);
    // dual explicitly keeps the rail; topbar-only hide must not win for dual.
    assert.match(
      css,
      /data-nav-model="dual"[\s\S]*?\.app-sidebar-primary[\s\S]{0,240}display:\s*flex\s*!important/
    );
  });

  it("topnav remains the L1 scope list (Overview…Sim B)", () => {
    const html = Shell.buildTopNavHtml("/sim/a/setup/");
    for (const id of ["overview", "live", "demo-a", "demo-b", "sim-a", "sim-b"]) {
      assert.match(html, new RegExp(`data-nav-id="${id}"`));
    }
    assert.doesNotMatch(html, /data-nav-id="admin"/);
  });

  it("keeps every L1 scope in the compact rail so no route is removed", () => {
    const parts = Shell.buildSidebarNavParts("/sim/a/compare/", {
      role: "view_only",
    });
    for (const id of ["overview", "live", "demo-a", "demo-b", "sim-a", "sim-b"]) {
      assert.match(parts.primary, new RegExp(`data-nav-id="${id}"`));
    }
  });

  it("uses the mobile-open state required by the phone drawer CSS", () => {
    assert.equal(
      Shell.resolveShellRailState({ mobile: true, overlayOpen: true }),
      "mobile-open"
    );
    assert.equal(
      Shell.resolveShellRailState({ mobile: true, overlayOpen: false }),
      "mobile-closed"
    );
    assert.match(css, /data-shell-state="mobile-open"/);
  });
});

describe("UX-P0-02 discoverable L2 menu (click/keyboard/hover)", () => {
  it("each desk scope exposes a trigger with aria-expanded + caret", () => {
    const html = Shell.buildTopNavHtml("/sim/a/");
    assert.match(html, /app-topnav-trigger/);
    assert.match(html, /aria-haspopup="menu"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /app-topnav-caret/);
    assert.match(html, /app-topnav-menu/);
    assert.match(shellSrc, /ArrowDown/);
    assert.match(shellSrc, /e\.key === "Escape"/);
    assert.match(shellSrc, /preventDefault\(\)/);
    assert.match(shellSrc, /canHoverTopMenus/);
  });

  it("CSS keeps menus hidden until opened and shows caret", () => {
    assert.match(css, /\.app-topnav-menu\[hidden\]/);
    assert.match(css, /\.app-topnav-caret/);
  });

  it("topbar/topnav overflow stays visible so L2 menus are not clipped", () => {
    const region = css.match(
      /\.app-topbar \.app-topnav-region\s*\{([^}]*)\}/s
    );
    assert.ok(region, "topnav-region rule present");
    assert.match(region[1], /overflow:\s*visible/);
    assert.doesNotMatch(region[1], /overflow-x\s*:/);
    assert.match(css, /\.app-topbar\s*\{[^}]*overflow:\s*visible/s);
  });
});

describe("UX-P0-03 local hierarchy labels", () => {
  it("Sim A: Desk, Results, Strategy, Reports, Compare", () => {
    const html = Shell.buildTopNavHtml("/sim/a/results/");
    const simBlock = html.match(
      /data-nav-id="sim-a"[\s\S]*?role="menu"[\s\S]*?<\/div><\/div>/
    );
    assert.ok(simBlock, "sim-a menu block");
    const menu = simBlock[0];
    for (const label of ["Desk", "Results", "Strategy", "Reports", "Compare"]) {
      assert.match(menu, new RegExp(`>${label}<`));
    }
    assert.match(menu, /href="\/sim\/a\/setup\/"/);
    assert.match(menu, /href="\/sim\/a\/compare\/"/);
  });

  it("Demo A: Desk, Results, Strategy, Reports — no Compare (Parity Plus)", () => {
    const html = Shell.buildTopNavHtml("/demo/a/");
    const demoBlock = html.match(
      /data-nav-id="demo-a"[\s\S]*?role="menu"[\s\S]*?<\/div><\/div>/
    );
    assert.ok(demoBlock, "demo-a menu block");
    const menu = demoBlock[0];
    for (const label of ["Desk", "Results", "Strategy", "Reports"]) {
      assert.match(menu, new RegExp(`>${label}<`));
    }
    assert.match(menu, /href="\/demo\/a\/setup\/"/);
    assert.doesNotMatch(menu, />Compare</);
  });
});

describe("UX-P0-04 sign-in recovery (no raw 401 primary)", () => {
  beforeEach(() => {
    global.location = {
      pathname: "/sim/a/setup/",
      search: "",
      href: "https://gekkotrader.com/sim/a/setup/",
    };
  });
  afterEach(() => {
    delete global.location;
  });

  it("authRecoveryHtml is plain language with return-to-route Sign in", () => {
    const html = Desk.authRecoveryHtml(
      { status: 401, message: "Authentication required" },
      { pathname: "/sim/a/setup/", search: "" }
    );
    assert.match(html, /Sign in required/);
    assert.match(html, /data-auth-recovery="1"/);
    assert.match(html, /data-auth-recovery-signin="1"/);
    assert.match(html, /btn-primary/);
    assert.match(html, /\/login\/\?/);
    assert.match(html, /next=/);
    assert.match(html, /force=1/);
    assert.doesNotMatch(html, /<strong>Error 401/);
    assert.match(html, /Technical detail: HTTP 401/);
  });

  it("showError paints recovery panel into a host", () => {
    const host = {
      hidden: true,
      classList: {
        _set: new Set(),
        add(c) {
          this._set.add(c);
        },
        remove(c) {
          this._set.delete(c);
        },
      },
      innerHTML: "",
    };
    Desk.showError(host, { status: 401, message: "Authentication required" });
    assert.equal(host.hidden, false);
    assert.ok(host.classList._set.has("is-auth-recovery"));
    assert.match(host.innerHTML, /Sign in required/);
    assert.doesNotMatch(host.innerHTML, /<strong>Error 401/);
  });
});

describe("UX-P0-05 Results Run Board retained", () => {
  it("results page still mounts Run Board (not raw Metrics JSON dump)", () => {
    assert.match(resultsHtml, /run-board/);
    assert.match(runBoardSrc, /function renderRunBoard|renderBoard|Run Board/i);
    assert.match(resultsHtml, /id="resultsBoard"|run-board|Results/i);
  });
});

describe("UX-P0-06 journey assertions", () => {
  before(() => {
    assert.equal(typeof Shell.buildTopNavHtml, "function");
  });

  it("Overview → Sim A → Strategy deep link marks Sim A + Strategy active", () => {
    const html = Shell.buildTopNavHtml("/sim/a/setup/");
    assert.match(
      html,
      /class="app-topnav-item is-active"[^>]*data-nav-id="sim-a"/
    );
    assert.match(
      html,
      /data-nav-id="sim-a-setup"[^>]*aria-current="page"|aria-current="page"[^>]*data-nav-id="sim-a-setup"/
    );
    const crumbs = Nav.breadcrumbs("/sim/a/setup/");
    assert.equal(crumbs[crumbs.length - 1].label, "Strategy");
  });

  it("Overview → Demo A → Results deep link marks Demo A + Results", () => {
    const html = Shell.buildTopNavHtml("/demo/a/results/");
    assert.match(
      html,
      /class="app-topnav-item is-active"[^>]*data-nav-id="demo-a"/
    );
    assert.match(html, /data-nav-id="demo-a-results"/);
    assert.match(html, /aria-current="page"/);
    const crumbs = Nav.breadcrumbs("/demo/a/results/");
    assert.equal(crumbs[crumbs.length - 1].label, "Results");
  });

  it("keyboard local menu: source wires ArrowDown/Enter/Space + Escape", () => {
    assert.match(shellSrc, /ArrowDown/);
    assert.match(shellSrc, /e\.key === "Enter"/);
    assert.match(shellSrc, /e\.key === " "/);
    assert.match(shellSrc, /closeTopMenus/);
  });

  it("unauthenticated return-to-route preserves Strategy path", () => {
    const href = Auth.forceLoginHref("/sim/a/setup/", "");
    assert.match(href, /\/login\/\?/);
    assert.match(href, /next=%2Fsim%2Fa%2Fsetup%2F/);
    assert.match(href, /force=1/);
  });
});

describe("Parity Plus floor surfaces (GST-94)", () => {
  it("Home L2 exposes Strategies, Roadmaps, desk summaries, Status, Audit", () => {
    const html = Shell.buildTopNavHtml("/overview/");
    assert.match(html, /data-nav-id="overview"[^>]*>Home</);
    const block = html.match(
      /data-nav-id="overview"[\s\S]*?role="menu"[\s\S]*?<\/div><\/div>/
    );
    assert.ok(block, "Home menu");
    const menu = block[0];
    for (const label of [
      "Home",
      "Strategies",
      "Roadmaps",
      "Live Summary",
      "Demo A Summary",
      "Sim A Summary",
      "Status",
      "Promotion Audit",
    ]) {
      assert.match(menu, new RegExp(`>${label}<`));
    }
    assert.match(menu, /href="\/overview\/strategies\/"/);
    assert.match(menu, /href="\/overview\/roadmaps\/"/);
  });

  it("Home Strategies and Roadmaps pages exist", () => {
    assert.ok(
      fs.existsSync(path.join(__dirname, "..", "overview", "strategies", "index.html"))
    );
    assert.ok(
      fs.existsSync(path.join(__dirname, "..", "overview", "roadmaps", "index.html"))
    );
    assert.ok(fs.existsSync(path.join(__dirname, "..", "overview-home.js")));
  });

  it("Demo A/B Strategy pages exist", () => {
    assert.ok(
      fs.existsSync(path.join(__dirname, "..", "demo", "a", "setup", "index.html"))
    );
    assert.ok(
      fs.existsSync(path.join(__dirname, "..", "demo", "b", "setup", "index.html"))
    );
  });

  it("Results wiring includes unified board actions and Promote to Demo", () => {
    const exec = fs.readFileSync(
      path.join(__dirname, "..", "sim-execution.js"),
      "utf8"
    );
    assert.match(exec, /mode:\s*mutateOk\s*\?\s*"unified"\s*:\s*"results"/);
    assert.match(exec, /paintOpts\.onCopy\s*=/);
    assert.match(exec, /paintOpts\.onSaveCurrent\s*=/);
    assert.match(exec, /paintOpts\.onRevertCurrent\s*=/);
    assert.match(exec, /onHide:\s*\(run\)/);
    assert.match(exec, /onApplyRecommendations:\s*async/);
    assert.match(exec, /btnCopyToDemo/);
    assert.match(exec, /Promote to Demo/);
    assert.match(exec, /saveSettingsVersion\(demo/);
  });
});
