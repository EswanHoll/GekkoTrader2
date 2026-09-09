/**
 * Collapsible rail + hover expand; no top Env/Lane pickers.
 * Run: node --test frontend/tests/shell-rail.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

require(path.join(__dirname, "..", "display-labels.js"));
const Shell = require(path.join(__dirname, "..", "app-shell.js"));
const Selector = require(path.join(__dirname, "..", "scope-selector.js"));

describe("resolveShellRailState", () => {
  it("expands and collapses on desktop", () => {
    assert.equal(
      Shell.resolveShellRailState({ collapsed: false }),
      "desktop-expanded"
    );
    assert.equal(
      Shell.resolveShellRailState({ collapsed: true }),
      "desktop-collapsed"
    );
  });

  it("hover or focus peeks when collapsed (not when pinned open)", () => {
    assert.equal(
      Shell.resolveShellRailState({ collapsed: true, hover: true }),
      "desktop-hover"
    );
    assert.equal(
      Shell.resolveShellRailState({ collapsed: true, focus: true }),
      "desktop-hover"
    );
    assert.equal(
      Shell.resolveShellRailState({ collapsed: false, hover: true }),
      "desktop-expanded"
    );
  });

  it("uses a collapsed/overlay rail on tablets and an explicit drawer on phones", () => {
    assert.equal(
      Shell.resolveShellRailState({ compact: true, mobile: false, overlayOpen: false }),
      "tablet-collapsed"
    );
    assert.equal(
      Shell.resolveShellRailState({
        compact: true,
        mobile: false,
        overlayOpen: true,
        collapsed: true,
        hover: true,
      }),
      "tablet-overlay"
    );
    assert.equal(
      Shell.resolveShellRailState({ compact: true, mobile: true, overlayOpen: false }),
      "mobile-closed"
    );
    assert.equal(
      Shell.resolveShellRailState({ compact: true, mobile: true, overlayOpen: true }),
      "mobile-open"
    );
  });
});

describe("resolveGroupExpanded", () => {
  it("follows the active desk when the operator has no saved preference", () => {
    assert.equal(Shell.resolveGroupExpanded({ groupActive: true }), true);
    assert.equal(Shell.resolveGroupExpanded({ groupActive: false }), false);
  });

  it("honours a saved preference over the active desk", () => {
    assert.equal(
      Shell.resolveGroupExpanded({ groupActive: true, stored: false }),
      false
    );
    assert.equal(
      Shell.resolveGroupExpanded({ groupActive: false, stored: true }),
      true
    );
  });
});

describe("collapsible L1 nav groups", () => {
  const Nav = require(path.join(__dirname, "..", "navigation-config.js"));
  global.GekkoNavigationConfig = Nav;

  function chevronFor(html, id) {
    const re = new RegExp(
      `<button[^>]*data-nav-chevron="${id}"[^>]*>`,
      "m"
    );
    return re.exec(html)?.[0] || "";
  }

  function childrenTagFor(html, id) {
    const re = new RegExp(`<div class="shell-nav-children" id="nav-children-${id}"[^>]*>`);
    return re.exec(html)?.[0] || "";
  }

  it("gives every primary L1 group a chevron", () => {
    const { primary } = Shell.buildSidebarNavParts("/sim/a/", {
      role: "view_only",
    });
    for (const id of ["overview", "live", "demo-a", "demo-b", "sim-a", "sim-b"]) {
      assert.notEqual(chevronFor(primary, id), "", `${id} chevron rendered`);
    }
  });

  it("opens the active desk and closes the rest by default", () => {
    const { primary } = Shell.buildSidebarNavParts("/sim/a/runs/", {
      role: "view_only",
    });
    assert.match(chevronFor(primary, "sim-a"), /aria-expanded="true"/);
    assert.doesNotMatch(childrenTagFor(primary, "sim-a"), /hidden/);

    assert.match(chevronFor(primary, "demo-a"), /aria-expanded="false"/);
    assert.match(childrenTagFor(primary, "demo-a"), /hidden/);
  });

  it("remembers a group the operator collapsed or expanded", () => {
    const { primary } = Shell.buildSidebarNavParts("/sim/a/", {
      role: "view_only",
      expandedGroups: { "sim-a": false, live: true },
    });
    assert.match(chevronFor(primary, "sim-a"), /aria-expanded="false"/);
    assert.match(childrenTagFor(primary, "sim-a"), /hidden/);
    assert.match(chevronFor(primary, "live"), /aria-expanded="true"/);
    assert.doesNotMatch(childrenTagFor(primary, "live"), /hidden/);
  });

  it("keeps the active-parent highlight on the collapsible group link", () => {
    const { primary } = Shell.buildSidebarNavParts("/sim/a/runs/", {
      role: "view_only",
    });
    const link = /<a class="([^"]*)"[^>]*data-nav-id="sim-a"/.exec(primary)?.[1] || "";
    assert.match(link, /\bis-active-parent\b/);
  });

  it("still pins Admin as a collapsible utility group for super admins", () => {
    const { utility } = Shell.buildSidebarNavParts("/admin/", {
      role: "super_admin",
    });
    assert.match(chevronFor(utility, "admin"), /aria-expanded="true"/);
  });

  it("wires chevrons for both primary and utility rails", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "app-shell.js"),
      "utf8"
    );
    assert.match(src, /wireNavChevrons\("appSidebarNav"\)/);
    assert.match(src, /wireNavChevrons\("appSidebarUtility"\)/);
    assert.match(src, /writeExpandedGroup/);
  });

  it("hides children and chevrons while the rail is collapsed", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
    assert.match(css, /\[data-shell-state="desktop-collapsed"\] \.shell-nav-children/);
    assert.match(css, /\.shell-nav-chevron\[aria-expanded="true"\] \.shell-icon/);
  });
});

describe("no top Env/Lane picker chrome", () => {
  it("workspace HTML has no scopeSelector / Env/Lane selects", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "..", "sim", "a", "index.html"),
      "utf8"
    );
    assert.doesNotMatch(html, /id="scopeSelector"/);
    assert.doesNotMatch(html, /scopeEnvSelect/);
    assert.doesNotMatch(html, /scopeLaneSelect/);
    assert.doesNotMatch(html, /Select env/);
    assert.match(html, /id="shellRailToggle"/);
    assert.match(html, /shell-rail-toggle-label/);
  });

  it("mount / unmountTopChrome does not render Env/Lane selects", () => {
    const host = {
      innerHTML: "<div class='stale'>x</div>",
      hidden: false,
      setAttribute() {},
    };
    Selector.unmountTopChrome(host);
    assert.equal(host.innerHTML, "");
    assert.equal(host.hidden, true);
    host.innerHTML = "dirty";
    Selector.mount(host);
    assert.equal(host.innerHTML, "");
    assert.doesNotMatch(host.innerHTML, /scopeEnvSelect|Env|Lane/);
  });

  it("shell source wires hover expand and skips scope picker mount", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "app-shell.js"),
      "utf8"
    );
    assert.match(src, /wireRailHoverExpand/);
    assert.match(src, /desktop-hover/);
    assert.match(src, /unmountTopChrome/);
    assert.doesNotMatch(src, /GekkoScopeSelector\?\.mount\?\.\(\)/);
  });
});
