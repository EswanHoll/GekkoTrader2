/**
 * GST-117 — Setup settings-versions + mobile shell chrome for smoke S5/S6.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

describe("GST-117 Setup + mobile shell", () => {
  it("SetupPage mounts #setupRoot and uses settings-versions hook", () => {
    const page = fs.readFileSync(src("pages", "SetupPage.tsx"), "utf8");
    assert.match(page, /id="setupRoot"/);
    assert.match(page, /data-testid="setup-page"/);
    assert.match(page, /useSettingsVersions/);
  });

  it("App routes desk setup to SetupPage", () => {
    const app = fs.readFileSync(src("App.tsx"), "utf8");
    assert.match(app, /SetupPage/);
    assert.match(app, /element=\{<SetupPage\s*\/>\}/);
  });

  it("TopBar exposes .app-menu-trigger for mobile overlay", () => {
    const top = fs.readFileSync(src("components", "TopBar.tsx"), "utf8");
    assert.match(top, /className="[^"]*app-menu-trigger/);
    assert.match(top, /data-testid="app-menu-trigger"/);
  });

  it("Layout toggles body.shell-nav-open and sidebar is-open", () => {
    const layout = fs.readFileSync(src("components", "Layout.tsx"), "utf8");
    assert.match(layout, /shell-nav-open/);
    const side = fs.readFileSync(src("components", "Sidebar.tsx"), "utf8");
    assert.match(side, /is-open/);
  });
});
