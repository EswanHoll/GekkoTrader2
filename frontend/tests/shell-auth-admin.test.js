/**
 * GST-123 — shell layout, consolidated auth chrome, Admin RBAC.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

describe("GST-123 sidebar layout", () => {
  it("uses flex column h-screen with scrollable primary nav", () => {
    const side = fs.readFileSync(src("components", "Sidebar.tsx"), "utf8");
    assert.match(side, /h-screen/);
    assert.match(side, /flex-col/);
    assert.match(side, /flex-1/);
    assert.match(side, /overflow-y-auto/);
    assert.match(side, /app-sidebar-primary/);
    assert.match(side, /UserProfile/);
  });

  it("pins Admin in utility above account footer for admins only", () => {
    const side = fs.readFileSync(src("components", "Sidebar.tsx"), "utf8");
    assert.match(side, /appSidebarUtility/);
    assert.match(side, /isAdmin/);
    assert.match(side, /ADMIN_GROUP/);
    assert.match(side, /buildPrimaryNavTree/);
  });
});

describe("GST-123 TopBar declutter", () => {
  it("removes Sign in and ui version from the header", () => {
    const top = fs.readFileSync(src("components", "TopBar.tsx"), "utf8");
    assert.doesNotMatch(top, /Sign in/);
    assert.doesNotMatch(top, /uiVersion/);
    assert.doesNotMatch(top, /\/login\//);
    assert.match(top, /app-menu-trigger/);
    assert.match(top, /Breadcrumbs/);
  });
});

describe("GST-123 UserProfile", () => {
  it("hosts Sign in / account menu and ui version tip", () => {
    const profile = fs.readFileSync(
      src("components", "UserProfile.tsx"),
      "utf8"
    );
    assert.match(profile, /data-testid="shell-sign-in"/);
    assert.match(profile, /data-testid="shell-account-trigger"/);
    assert.match(profile, /data-testid="shell-sign-out"/);
    assert.match(profile, /data-testid="shell-account-menu"/);
    assert.match(profile, /data-testid="shell-ui-version"/);
    assert.match(profile, /uiVersion/);
    assert.match(profile, /Sign out/);
  });
});

describe("GST-123 Admin RBAC", () => {
  it("isAdminRole is super_admin only", () => {
    const auth = fs.readFileSync(src("lib", "auth.ts"), "utf8");
    assert.match(auth, /export function isAdminRole/);
    assert.match(auth, /super_admin/);
  });

  it("AdminGate wraps /admin routes", () => {
    const app = fs.readFileSync(src("App.tsx"), "utf8");
    assert.match(app, /AdminGate/);
    assert.match(app, /element=\{<AdminGate\s*\/>\}/);
    const gate = fs.readFileSync(src("components", "AdminGate.tsx"), "utf8");
    assert.match(gate, /isAdmin/);
    assert.match(gate, /Navigate to="\/overview\/"/);
  });

  it("useAuthSession refreshes /api/auth/me", () => {
    const hook = fs.readFileSync(src("hooks", "useAuthSession.ts"), "utf8");
    assert.match(hook, /fetchAuthMe/);
    assert.match(hook, /isAdminRole/);
    const client = fs.readFileSync(src("api", "client.ts"), "utf8");
    assert.match(client, /\/api\/auth\/me/);
  });
});
