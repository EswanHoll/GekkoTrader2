/**
 * GST-50 — rendered nav must use CSS active classes (is-active / is-active-parent).
 * Do not claim pass from findActive alone — assert on rendered HTML attributes.
 * Run: node --test frontend/tests/nav-active-highlight.test.js
 */
"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const Nav = require(path.join(__dirname, "..", "navigation-config.js"));
require(path.join(__dirname, "..", "display-labels.js"));
global.GekkoNavigationConfig = Nav;
const Shell = require(path.join(__dirname, "..", "app-shell.js"));

/** Minimal attribute parse of rendered <a> tags (headless DOM assertion). */
function parseAnchors(html) {
  const out = [];
  const re = /<a\s+([^>]+)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    out.push({
      href: /href="([^"]*)"/.exec(attrs)?.[1] || "",
      className: /class="([^"]*)"/.exec(attrs)?.[1] || "",
      navId: /data-nav-id="([^"]*)"/.exec(attrs)?.[1] || "",
    });
  }
  return out;
}

function byHref(anchors, href) {
  return anchors.find((a) => a.href === href);
}

describe("GST-50 nav active highlight (rendered HTML)", () => {
  before(() => {
    assert.equal(typeof Shell.buildSidebarNavHtml, "function");
  });

  it("styles /sim/a/ desk leaf with is-active and parent with is-active-parent", () => {
    const active = Nav.findActive("/sim/a/");
    assert.equal(active?.id, "sim-a-desk", "findActive sanity (not sufficient alone)");

    const html = Shell.buildSidebarNavHtml("/sim/a/", { role: "super_admin" });
    const anchors = parseAnchors(html);

    const desk = byHref(anchors, "/sim/a/");
    // Child Desk page and parent group both link to /sim/a/ — find the leaf by nav id.
    const deskLeaf = anchors.find((a) => a.navId === "sim-a-desk");
    const parent = anchors.find((a) => a.navId === "sim-a");

    assert.ok(deskLeaf, "sim-a-desk link rendered");
    assert.match(deskLeaf.className, /\bis-active\b/);
    assert.doesNotMatch(
      deskLeaf.className,
      /(^|\s)active(\s|$)/,
      "must not use bare class active (CSS ignores it)"
    );

    assert.ok(parent, "sim-a parent group link rendered");
    assert.match(parent.className, /\bis-active-parent\b/);

    // CSS contract: styled selectors exist for these classes.
    const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
    assert.match(css, /\.shell-nav-link\.is-active/);
    assert.match(css, /\.is-active-parent/);
  });

  it("styles /sim/a/runs/ child with is-active and keeps parent is-active-parent", () => {
    const active = Nav.findActive("/sim/a/runs/");
    assert.equal(active?.id, "sim-a-runs");

    const html = Shell.buildSidebarNavHtml("/sim/a/runs/", { role: "view_only" });
    const anchors = parseAnchors(html);

    const runs = anchors.find((a) => a.navId === "sim-a-runs");
    const parent = anchors.find((a) => a.navId === "sim-a");
    const deskLeaf = anchors.find((a) => a.navId === "sim-a-desk");

    assert.ok(runs);
    assert.match(runs.className, /\bis-active\b/);
    assert.doesNotMatch(runs.className, /(^|\s)active(\s|$)/);

    assert.ok(parent);
    assert.match(parent.className, /\bis-active-parent\b/);

    // Sibling desk leaf must not stay active.
    assert.ok(deskLeaf);
    assert.doesNotMatch(deskLeaf.className, /\bis-active\b/);
  });

  it("GST-87: styles /sim/a/setup/ leaf with is-active (visible L2 chip CSS)", () => {
    const active = Nav.findActive("/sim/a/setup/");
    assert.equal(active?.id, "sim-a-setup");

    const html = Shell.buildSidebarNavHtml("/sim/a/setup/", { role: "view_only" });
    const anchors = parseAnchors(html);
    const setup = anchors.find((a) => a.navId === "sim-a-setup");
    const parent = anchors.find((a) => a.navId === "sim-a");
    const runs = anchors.find((a) => a.navId === "sim-a-runs");

    assert.ok(setup, "sim-a-setup link rendered");
    assert.match(setup.className, /\bis-active\b/);
    assert.ok(parent);
    assert.match(parent.className, /\bis-active-parent\b/);
    assert.ok(runs);
    assert.doesNotMatch(runs.className, /\bis-active\b/);

    const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
    // L2 leaf active must use soft chip — not transparent-only background.
    assert.match(
      css,
      /\.app-sidebar-primary > \.shell-nav-group > \.shell-nav-children > a\.shell-nav-link\.is-active[\s\S]*?background:\s*var\(--nav-l1-soft\)/
    );
    assert.doesNotMatch(
      css,
      /\.app-sidebar-primary > \.shell-nav-group > \.shell-nav-children > a\.shell-nav-link\.is-active,\s*\n\.app-sidebar-utility > \.shell-nav-group > \.shell-nav-children > a\.shell-nav-link\.is-active \{\s*\n\s*background:\s*transparent;/
    );
  });

  it("does not mark unrelated desks active", () => {
    const html = Shell.buildSidebarNavHtml("/sim/a/", { role: "super_admin" });
    const anchors = parseAnchors(html);
    const demo = anchors.find((a) => a.navId === "demo-a");
    assert.ok(demo);
    assert.doesNotMatch(demo.className, /\bis-active-parent\b/);
    assert.doesNotMatch(demo.className, /\bis-active\b/);
  });
});

describe("GST-50 shell tip still includes rail chrome", () => {
  it("keeps collapse/hover helpers and no Env/Lane picker mount", () => {
    assert.equal(typeof Shell.resolveShellRailState, "function");
    assert.equal(
      Shell.resolveShellRailState({ collapsed: true, hover: true }),
      "desktop-hover"
    );
    const src = fs.readFileSync(path.join(__dirname, "..", "app-shell.js"), "utf8");
    assert.match(src, /wireRailHoverExpand/);
    assert.match(src, /unmountTopChrome/);
    const page = fs.readFileSync(
      path.join(__dirname, "..", "sim", "a", "index.html"),
      "utf8"
    );
    assert.doesNotMatch(page, /scopeEnvSelect|scopeSelector/);
  });
});
