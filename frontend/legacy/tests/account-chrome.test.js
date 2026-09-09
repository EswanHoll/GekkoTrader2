/**
 * GST-51 — GekkoFlow account footer + pinned Admin; no top-right Sign in.
 * Run: node --test frontend/tests/account-chrome.test.js
 */
"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

delete global.document;
delete global.location;
delete global.window;

require(path.join(__dirname, "..", "display-labels.js"));
const Nav = require(path.join(__dirname, "..", "navigation-config.js"));
global.GekkoNavigationConfig = Nav;
const Shell = require(path.join(__dirname, "..", "app-shell.js"));

describe("GST-51 top-right account chrome removed", () => {
  it("authChromeHtml top surface is empty (no Sign in host)", () => {
    assert.equal(Shell.authChromeHtml(null, { surface: "top" }), "");
    assert.equal(
      Shell.authChromeHtml(
        { user: { email: "owner@fixtures.local", role: "super_admin" } },
        { surface: "top" }
      ),
      ""
    );
  });

  it("workspace HTML has no top-right Sign in / healthPill hosts", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "..", "sim", "a", "index.html"),
      "utf8"
    );
    assert.doesNotMatch(html, /id="appAuthActions"/);
    assert.doesNotMatch(html, /id="healthPill"/);
    assert.doesNotMatch(html, /id="statusPills"/);
    assert.doesNotMatch(html, /appAuthSignIn/);
    assert.match(html, /id="appAccountFooter"/);
    assert.match(html, /id="shellSignIn"/);
  });

  it("CSS hides retired top auth / status hosts", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
    assert.match(css, /#appAuthActions[\s\S]*display:\s*none\s*!important/);
    assert.match(css, /#healthPill[\s\S]*display:\s*none\s*!important/);
  });
});

describe("GST-51 GekkoFlow account footer", () => {
  it("logged-out footer is a Sign in control to /login/?force=1", () => {
    const html = Shell.authChromeHtml(null, { surface: "footer" });
    assert.match(html, /id="shellSignIn"/);
    assert.match(html, /shell-footer-signin/);
    assert.match(html, /\/login\/\?/);
    assert.match(html, /force=1/);
    assert.match(html, /Sign in/);
    assert.doesNotMatch(html, /btn-primary/);
  });

  it("logged-in footer has avatar initial + display name + menu", () => {
    const email = ["eswan", "holl"].join(".") + "@gekkotech.co.za"; // pragma: allowlist secret
    const html = Shell.authChromeHtml(
      { user: { email, role: "super_admin", name: "Eswan Holl" } },
      { surface: "footer" }
    );
    assert.match(html, /shell-account-avatar/);
    assert.match(html, />E</);
    assert.match(html, /Eswan Holl/);
    assert.match(html, /id="shellAccountTrigger"/);
    assert.match(html, /id="shellAccountMenu"/);
    assert.match(html, /Change password/);
    assert.match(html, /id="shellSignOut"/);
    assert.match(html, /danger/);
    assert.doesNotMatch(html, /Light|Dark|System/);
  });

  it("displayNameFromUser prefers known name then email local-part", () => {
    assert.equal(
      Shell.displayNameFromUser({ name: "Eswan Holl", email: "x@y.z" }),
      "Eswan Holl"
    );
    assert.equal(
      Shell.displayNameFromUser({ email: "eswan.holl@gekkotech.co.za" }),
      "Eswan Holl"
    );
    assert.equal(Shell.avatarInitialFromUser({ name: "Eswan Holl" }), "E");
  });
});

describe("GST-51 Admin pinned in utility above account", () => {
  before(() => {
    assert.equal(typeof Shell.buildSidebarNavParts, "function");
  });

  it("puts Admin in utility for super_admin only", () => {
    const parts = Shell.buildSidebarNavParts("/sim/a/", { role: "super_admin" });
    assert.doesNotMatch(parts.primary, /data-nav-id="admin"/);
    assert.match(parts.utility, /data-nav-id="admin"/);
    assert.match(parts.utility, /shell-nav-chevron/);
    assert.match(parts.utility, /nav-children-admin/);
  });

  it("hides Admin utility for non-super_admin roles", () => {
    for (const role of ["", "view_only", "admin", "operator"]) {
      const parts = Shell.buildSidebarNavParts("/sim/a/", { role });
      assert.equal(parts.utility, "", `role=${role} must not see Admin`);
      assert.doesNotMatch(parts.primary, /data-nav-id="admin"/);
    }
  });

  it("workspace scaffold ships #appSidebarUtility above #appAccountFooter", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "..", "sim", "a", "index.html"),
      "utf8"
    );
    const utilIdx = html.indexOf('id="appSidebarUtility"');
    const footIdx = html.indexOf('id="appAccountFooter"');
    assert.ok(utilIdx > 0, "utility host present");
    assert.ok(footIdx > utilIdx, "utility above account footer");
  });

  it("CSS pins utility + footer at bottom of rail", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
    assert.match(
      css,
      /\.app-sidebar-utility:not\(\[hidden\]\)\s*\{[^}]*margin-top:\s*auto/s
    );
    assert.match(css, /\.app-sidebar-footer\s*\{[^}]*margin-top:\s*auto/s);
  });
});
