/**
 * GST-103 — old-site left-rail parity: Home label, Search, collapsible chrome.
 * Run: node --test frontend/tests/nav-parity-rail-search.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const Nav = require(path.join(__dirname, "..", "navigation-config.js"));
global.GekkoNavigationConfig = Nav;
const Shell = require(path.join(__dirname, "..", "app-shell.js"));

const shellSrc = fs.readFileSync(
  path.join(__dirname, "..", "app-shell.js"),
  "utf8"
);
const navSrc = fs.readFileSync(
  path.join(__dirname, "..", "navigation-config.js"),
  "utf8"
);
const overviewHtml = fs.readFileSync(
  path.join(__dirname, "..", "overview", "index.html"),
  "utf8"
);

describe("GST-103 Home label (Overview renamed)", () => {
  it("L1 group and Home page link say Home", () => {
    const home = Nav.NAVIGATION.find((n) => n.id === "overview");
    assert.ok(home);
    assert.equal(home.label, "Home");
    const page = (home.children || []).find((c) => c.id === "overview-main");
    assert.ok(page);
    assert.equal(page.label, "Home");
  });

  it("topnav and sidebar HTML render Home for the overview scope", () => {
    const top = Shell.buildTopNavHtml("/overview/");
    assert.match(top, /data-nav-id="overview"[^>]*>Home</);
    const { primary } = Shell.buildSidebarNavParts("/overview/", {
      role: "view_only",
    });
    assert.match(primary, /data-nav-id="overview"[\s\S]*?>Home</);
    assert.match(primary, /data-nav-id="overview-main"[\s\S]*?>Home</);
  });

  it("Home page title and H1 say Home", () => {
    assert.match(overviewHtml, /<title>Home — GekkoTrader<\/title>/);
    assert.match(overviewHtml, /class="page-title">Home</);
  });

  it("breadcrumbs do not insert a redundant Overview crumb", () => {
    const crumbs = Nav.breadcrumbs("/overview/strategies/");
    assert.equal(crumbs[0].label, "Home");
    assert.ok(!crumbs.some((c) => c.label === "Overview"));
    assert.equal(crumbs[crumbs.length - 1].label, "Strategies");
  });
});

describe("GST-103 Search + collapse chrome", () => {
  it("shell restores Search toggle, search field, and panel-left collapse icon", () => {
    assert.match(shellSrc, /shellSearchToggle/);
    assert.match(shellSrc, /shellNavSearch/);
    assert.match(shellSrc, /data-shell-search-toggle/);
    assert.match(shellSrc, /function applyNavSearch\s*\(/);
    assert.match(shellSrc, /function setNavSearchOpen\s*\(/);
    assert.match(shellSrc, /icon-panel-left/);
    assert.match(shellSrc, /icon-search/);
    assert.match(shellSrc, /Closing the rail also closes Search/);
    assert.match(navSrc, /GST-103/);
  });

  it("exports applyNavSearch for operators/tests", () => {
    assert.equal(typeof Shell.applyNavSearch, "function");
    assert.equal(typeof Shell.setNavSearchOpen, "function");
  });
});
