/**
 * GST-125 — collapsible L1 sidebar accordion + hidden scrollbar.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

describe("GST-125 sidebar accordion", () => {
  it("wires chevron buttons and collapsible L2 children", () => {
    const side = fs.readFileSync(src("components", "Sidebar.tsx"), "utf8");
    assert.match(side, /useState/);
    assert.match(side, /data-nav-chevron/);
    assert.match(side, /aria-expanded/);
    assert.match(side, /aria-controls/);
    assert.match(side, /shell-nav-children/);
    assert.match(side, /hidden=\{!expanded\}/);
    assert.match(side, /Chevron/);
    assert.match(side, /rotate-90/);
  });

  it("auto-expands the L1 group matching the current route", () => {
    const side = fs.readFileSync(src("components", "Sidebar.tsx"), "utf8");
    assert.match(side, /groupMatchesRoute/);
    assert.match(side, /useEffect/);
    assert.match(side, /pathname/);
    assert.match(side, /initialExpanded|groupMatchesRoute\(group, pathname\)/);
  });

  it("covers Live / Demo / Sim L1 groups from primary nav tree", () => {
    const side = fs.readFileSync(src("components", "Sidebar.tsx"), "utf8");
    assert.match(side, /buildPrimaryNavTree/);
    assert.match(side, /ADMIN_GROUP/);
    assert.match(side, /toggleGroup/);
  });
});

describe("GST-125 hidden scrollbar", () => {
  it("hides scrollbar on sidebar scroll containers", () => {
    const css = fs.readFileSync(src("index.css"), "utf8");
    assert.match(css, /app-sidebar-primary/);
    assert.match(css, /scrollbar-width:\s*none/);
    assert.match(css, /::-webkit-scrollbar/);
    assert.match(css, /display:\s*none/);
  });

  it("keeps overflow-y-auto on the primary nav", () => {
    const side = fs.readFileSync(src("components", "Sidebar.tsx"), "utf8");
    assert.match(side, /overflow-y-auto/);
    assert.match(side, /app-sidebar-scroll|app-sidebar-primary/);
  });
});
