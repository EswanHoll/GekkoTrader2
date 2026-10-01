/**
 * AuthGate — unauthenticated SPA shows login chrome only; no desk/overview.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

describe("AuthGate workspace lock", () => {
  it("AuthGate redirects unauthenticated users to login with next=", () => {
    const gate = fs.readFileSync(src("components", "AuthGate.tsx"), "utf8");
    assert.match(gate, /export function AuthGate/);
    assert.match(gate, /useAuthSession/);
    assert.match(gate, /signedIn/);
    assert.match(gate, /Navigate/);
    assert.match(gate, /\/login\/\?force=1&next=/);
    assert.match(gate, /encodeURIComponent\(location\.pathname \+ location\.search\)/);
    assert.match(gate, /<Outlet\s*\/>/);
    // Must not require admin — any signed-in user may enter the workspace.
    assert.doesNotMatch(gate, /isAdmin/);
  });

  it("App wraps Layout inside AuthGate; login stays outside", () => {
    const app = fs.readFileSync(src("App.tsx"), "utf8");
    assert.match(app, /import \{ AuthGate \} from "@\/components\/AuthGate"/);
    assert.match(app, /element=\{<AuthGate\s*\/>\}/);
    assert.match(app, /element=\{<Layout\s*\/>\}/);

    const authIdx = app.indexOf("element={<AuthGate");
    const layoutIdx = app.indexOf("element={<Layout");
    const loginIdx = app.indexOf('path="/login"');
    assert.ok(authIdx >= 0 && layoutIdx >= 0 && loginIdx >= 0);
    assert.ok(
      loginIdx < authIdx,
      "/login routes must be declared before AuthGate"
    );
    assert.ok(
      authIdx < layoutIdx,
      "AuthGate must wrap Layout so anonymous users never mount shell chrome"
    );
  });

  it("LoginPage has no Back-to-Home / overview link for anonymous users", () => {
    const page = fs.readFileSync(src("pages", "LoginPage.tsx"), "utf8");
    assert.doesNotMatch(page, /login-back-home/);
    assert.doesNotMatch(page, /Back to Home/);
    assert.doesNotMatch(page, /to=["']\/overview\/["']/);
  });
});
