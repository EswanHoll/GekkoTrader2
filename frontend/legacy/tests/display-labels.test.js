/**
 * Human labels for wire/API enums — never show raw tokens as the main label.
 * Run: node --test frontend/tests/display-labels.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const Labels = require(path.join(__dirname, "..", "display-labels.js"));
// Shell needs Labels on globalThis (UMD root).
require(path.join(__dirname, "..", "display-labels.js"));
const Shell = require(path.join(__dirname, "..", "app-shell.js"));

describe("formatRoleLabel", () => {
  it("maps known roles to human titles", () => {
    assert.equal(Labels.formatRoleLabel("super_admin"), "Super admin");
    assert.equal(Labels.formatRoleLabel("view_only"), "View only");
    assert.equal(Labels.formatRoleLabel("admin"), "Admin");
  });

  it("never returns the raw code for unknown roles", () => {
    assert.equal(Labels.formatRoleLabel("weird_role_token"), "Unknown role");
    assert.equal(Labels.formatRoleLabel(""), "Unknown role");
    assert.equal(Labels.formatRoleLabel(null), "Unknown role");
    assert.doesNotMatch(Labels.formatRoleLabel("weird_role_token"), /_/);
  });
});

describe("formatUserStatusLabel", () => {
  it("maps pending/active/rejected", () => {
    assert.equal(Labels.formatUserStatusLabel("pending"), "Pending");
    assert.equal(Labels.formatUserStatusLabel("active"), "Active");
    assert.equal(Labels.formatUserStatusLabel("rejected"), "Rejected");
    assert.equal(Labels.formatUserStatusLabel("PENDING"), "Pending");
  });

  it("never returns the raw code for unknown status", () => {
    assert.equal(Labels.formatUserStatusLabel("suspended_wire"), "Unknown status");
  });
});

describe("shell account HTML uses human role labels", () => {
  it("footer shows Super admin without raw super_admin", () => {
    const email = ["owner", "fixture"].join(".") + "@fixtures.local"; // pragma: allowlist secret
    const html = Shell.authChromeHtml(
      { user: { email, role: "super_admin" } },
      { surface: "footer" }
    );
    assert.match(html, /Super admin/);
    assert.doesNotMatch(html, /super_admin/);
    assert.match(html, /shell-account-role/);
  });

  it("top-bar chrome is empty (GST-51); footer still human-labels view_only", () => {
    const email = ["viewer", "fixture"].join(".") + "@fixtures.local"; // pragma: allowlist secret
    assert.equal(
      Shell.authChromeHtml(
        { user: { email, role: "view_only" } },
        { surface: "top" }
      ),
      ""
    );
    const html = Shell.authChromeHtml(
      { user: { email, role: "view_only" } },
      { surface: "footer" }
    );
    assert.match(html, /View only/);
    assert.doesNotMatch(html, /view_only/);
  });
});
