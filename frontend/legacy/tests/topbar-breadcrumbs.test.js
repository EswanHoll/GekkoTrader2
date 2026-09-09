/**
 * GST-87 — restore old.gekkotrader.com top L1 desk bar + content breadcrumbs.
 * Run: node --test frontend/tests/topbar-breadcrumbs.test.js
 */
"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const Nav = require(path.join(__dirname, "..", "navigation-config.js"));
global.GekkoNavigationConfig = Nav;
const Shell = require(path.join(__dirname, "..", "app-shell.js"));

const shellSrc = fs.readFileSync(
  path.join(__dirname, "..", "app-shell.js"),
  "utf8"
);
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

describe("GST-87 old-site topnav + breadcrumbs", () => {
  before(() => {
    assert.equal(typeof Shell.buildTopNavHtml, "function");
    assert.equal(typeof Shell.topNavLabel, "function");
  });

  it("keeps short desk labels for top bar (Sim A / Demo A)", () => {
    assert.equal(Shell.topNavLabel("Demo A"), "Demo A");
    assert.equal(Shell.topNavLabel("Sim B"), "Sim B");
    assert.equal(Shell.topNavLabel("Demo · Lane A"), "Demo A"); // legacy alias
    assert.equal(Shell.topNavLabel("Home"), "Home");
  });

  it("renders color-coded L1 topnav with active Sim A on setup", () => {
    const html = Shell.buildTopNavHtml("/sim/a/setup/");
    assert.match(html, /data-nav-id="overview"/);
    assert.match(html, />Home</);
    assert.match(html, /data-nav-id="live"/);
    assert.match(html, /data-nav-id="demo-a"/);
    assert.match(html, /data-nav-id="sim-a"/);
    assert.match(html, /data-nav-id="sim-b"/);
    assert.doesNotMatch(html, /data-nav-id="admin"/);
    assert.match(
      html,
      /class="app-topnav-item is-active"[^>]*data-nav-id="sim-a"/
    );
    assert.match(html, />Sim A</);
  });

  it("keeps topnav visible on desktop (not globally display:none)", () => {
    assert.match(shellSrc, /function renderTopNav\s*\(/);
    assert.match(shellSrc, /ensureTopNavHost\s*\(/);
    assert.match(shellSrc, /renderTopNav\s*\(/);
    // Must not hide .app-topnav-region with !important globally.
    assert.doesNotMatch(
      css,
      /#scopeSelector,\s*\n\.app-topnav-region \{\s*\n\s*display:\s*none\s*!important/
    );
    assert.match(css, /\.app-topbar \.app-topnav-region/);
    assert.match(css, /\.app-topnav-top\[data-nav-id="sim-a"\]/);
  });

  it("keeps breadcrumbs under topbar in content chrome (old-site trail)", () => {
    assert.match(shellSrc, /ensureBreadcrumbsHost\s*\(/);
    assert.match(shellSrc, /class="breadcrumbs"/);
    assert.match(shellSrc, /breadcrumb-link/);
    assert.doesNotMatch(shellSrc, /ensureBreadcrumbsInTopbar/);
    const crumbs = Nav.breadcrumbs("/sim/a/setup/");
    assert.equal(crumbs[0].label, "Home");
    assert.equal(crumbs[crumbs.length - 1].label, "Strategy");
  });

  it("paints topnav and breadcrumbs before async auth validation", () => {
    const bootStart = shellSrc.indexOf("async function boot()");
    const bootEnd = shellSrc.indexOf("const api =", bootStart);
    const bootSrc = shellSrc.slice(bootStart, bootEnd);
    const topNavPaint = bootSrc.indexOf("renderTopNav()");
    const breadcrumbPaint = bootSrc.indexOf("renderBreadcrumbs()");
    const authValidation = bootSrc.indexOf("validateSessionOrRedirect");
    assert.ok(topNavPaint > -1, "boot renders topnav");
    assert.ok(breadcrumbPaint > -1, "boot renders breadcrumbs");
    assert.ok(authValidation > -1, "boot validates auth");
    assert.ok(topNavPaint < authValidation, "topnav paints before auth validation");
    assert.ok(
      breadcrumbPaint < authValidation,
      "breadcrumbs paint before auth validation"
    );
  });
});
