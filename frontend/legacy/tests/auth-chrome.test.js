/**
 * GST-44 — login discoverability + catch-22 hotfix.
 * Run: node --test frontend/tests/auth-chrome.test.js
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Avoid soft-gate side effects: no document/location in Node.
delete global.document;
delete global.location;
delete global.window;

const Auth = require(path.join(__dirname, "..", "auth.js"));
const Shell = require(path.join(__dirname, "..", "app-shell.js"));
const Desk = require(path.join(__dirname, "..", "desk-surface.js"));
const Cap = require(path.join(__dirname, "..", "sim-capability.js"));

const TOKEN_KEY = "gekko_auth_token";
const USER_KEY = "gekko_auth_user";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

describe("GST-44 soft-gate", () => {
  it("lands new sessions on Sim A", () => {
    assert.equal(Auth.landingPath, "/sim/a/");
  });

  it("treats missing and expired tokens the same (need login)", () => {
    assert.equal(
      Auth.needsLoginRedirect({ pathname: "/demo/a/", token: "" }),
      true
    );
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 })
    ).toString("base64url");
    const expired = `hdr.${payload}.sig`;
    assert.equal(
      Auth.needsLoginRedirect({
        pathname: "/demo/a/",
        token: expired,
        nowMs: Date.now(),
      }),
      true
    );
  });

  it("does not redirect on /login/", () => {
    assert.equal(
      Auth.needsLoginRedirect({ pathname: "/login/", token: "" }),
      false
    );
  });

  it("builds /login/?next= for return path", () => {
    assert.equal(
      Auth.loginHrefWithNext("/demo/a/", "?x=1"),
      "/login/?next=%2Fdemo%2Fa%2F%3Fx%3D1"
    );
  });

  it("forceLoginHref always includes force=1", () => {
    const href = Auth.forceLoginHref("/demo/a/", "");
    assert.match(href, /\/login\/\?/);
    assert.match(href, /force=1/);
    assert.match(href, /next=/);
  });
});

describe("GST-44 force/clear catch-22 break", () => {
  let storage;

  beforeEach(() => {
    storage = memoryStorage();
    global.localStorage = storage;
    storage.setItem(TOKEN_KEY, "stale.token.value");
    storage.setItem(USER_KEY, JSON.stringify({ email: "stale@fixtures.local" }));
  });

  afterEach(() => {
    delete global.localStorage;
  });

  it("wantsForceClear for force=1 and clear=1", () => {
    assert.equal(Auth.wantsForceClear("?force=1"), true);
    assert.equal(Auth.wantsForceClear("?clear=1"), true);
    assert.equal(Auth.wantsForceClear("?next=%2Fsim%2Fa%2F"), false);
  });

  it("applyForceClear wipes token+user and strips flags", () => {
    let replaced = "";
    const applied = Auth.applyForceClear("?force=1&next=%2Fsim%2Fa%2F&mode=login", {
      replaceUrl: (href) => {
        replaced = href;
      },
    });
    assert.equal(applied, true);
    assert.equal(storage.getItem(TOKEN_KEY), null);
    assert.equal(storage.getItem(USER_KEY), null);
    assert.match(replaced, /\/login\/\?/);
    assert.doesNotMatch(replaced, /force=/);
    assert.doesNotMatch(replaced, /clear=/);
    assert.match(replaced, /next=/);
  });

  it("applyForceClear is a no-op without force/clear", () => {
    const applied = Auth.applyForceClear("?next=%2Foverview%2F", {
      replaceUrl: () => {
        assert.fail("should not rewrite URL");
      },
    });
    assert.equal(applied, false);
    assert.equal(storage.getItem(TOKEN_KEY), "stale.token.value");
  });
});

describe("GST-44 getSession refresh vs cache", () => {
  let storage;
  let fetches;

  beforeEach(() => {
    storage = memoryStorage();
    global.localStorage = storage;
    fetches = [];
    // Non-expired JWT (exp far future)
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64url");
    storage.setItem(TOKEN_KEY, `hdr.${payload}.sig`);
    storage.setItem(
      USER_KEY,
      JSON.stringify({ email: "cached@fixtures.local", role: "admin" })
    );
    global.GEKKO_API_URL = "https://control.example.test";
    global.fetch = async (url) => {
      fetches.push(String(url));
      return {
        ok: false,
        status: 401,
        async json() {
          return { detail: "invalid" };
        },
      };
    };
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.fetch;
    delete global.GEKKO_API_URL;
  });

  it("cache short-circuit trusts local email without /me", async () => {
    const session = await Auth.getSession();
    assert.equal(session?.user?.email, "cached@fixtures.local");
    assert.equal(fetches.length, 0);
  });

  it("refresh:true requires live /me and clears on 401", async () => {
    const session = await Auth.getSession({ refresh: true });
    assert.equal(session, null);
    assert.ok(fetches.some((u) => u.includes("/api/auth/me")));
    assert.equal(storage.getItem(TOKEN_KEY), null);
    assert.equal(storage.getItem(USER_KEY), null);
  });
});

describe("GST-44/51 auth chrome (footer only; top removed)", () => {
  it("top-bar auth chrome is retired (empty)", () => {
    assert.equal(Shell.authChromeHtml(null, { surface: "top" }), "");
  });

  it("footer Sign in is primary, force=1, and clearly labeled", () => {
    const html = Shell.authChromeHtml(null, { surface: "footer" });
    assert.match(html, /Sign in/);
    assert.match(html, /id="shellSignIn"/);
    assert.match(html, /shell-footer-signin/);
    assert.match(html, /data-auth-primary="1"/);
    assert.match(html, /force=1/);
    assert.match(html, /aria-label="Sign in"/);
  });

  it("footer shows avatar menu + Sign out when logged in", () => {
    const email = ["ui", "fixture", "user"].join(".") + "@fixtures.local"; // pragma: allowlist secret
    const html = Shell.authChromeHtml(
      { user: { email, role: "admin" } },
      { surface: "footer" }
    );
    assert.match(html, /ui\.fixture\.user@fixtures\.local/);
    assert.match(html, /Sign out/);
    assert.match(html, /id="shellSignOut"/);
    assert.match(html, /id="shellAccountTrigger"/);
    assert.match(html, /data-auth-primary="1"/);
  });
});

describe("GST-44 sticky sidebar footer scaffold", () => {
  it("CSS pins footer and scrolls primary nav", () => {
    const css = require("node:fs").readFileSync(
      path.join(__dirname, "..", "styles.css"),
      "utf8"
    );
    assert.match(css, /\.app-sidebar-inner\s*\{[^}]*flex-direction:\s*column/s);
    assert.match(css, /\.app-sidebar-primary\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(css, /\.app-sidebar-footer\s*\{[^}]*position:\s*sticky/s);
    assert.match(css, /\.app-sidebar-footer\s*\{[^}]*margin-top:\s*auto/s);
    assert.match(css, /\.shell-footer-signin/);
  });

  it("workspace HTML ships pinned #shellSignIn before JS", () => {
    const html = require("node:fs").readFileSync(
      path.join(__dirname, "..", "sim", "a", "index.html"),
      "utf8"
    );
    assert.match(html, /id="appAccountFooter"/);
    assert.match(html, /app-sidebar-footer/);
    assert.match(html, /id="shellSignIn"/);
    assert.match(html, /\/login\/\?force=1/);
    assert.match(html, /id="appSidebarNav"/);
    assert.match(html, /id="shellRailToggle"/);
  });

  it("exports ensureSidebarScaffold for shell wiring", () => {
    assert.equal(typeof Shell.ensureSidebarScaffold, "function");
    assert.equal(typeof Shell.applyShellCollapsed, "function");
  });
});

describe("GST-44 soft-gate stays on shell (no auto-bounce)", () => {
  let storage;
  let replaced;

  beforeEach(() => {
    storage = memoryStorage();
    global.localStorage = storage;
    replaced = null;
    global.location = {
      pathname: "/demo/a/",
      search: "",
      href: "https://gekkotrader.test/demo/a/",
      replace(url) {
        replaced = String(url);
      },
    };
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.location;
  });

  it("requireAuthOrRedirect clears expired token but does not navigate", () => {
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 })
    ).toString("base64url");
    storage.setItem(TOKEN_KEY, `hdr.${payload}.sig`);
    storage.setItem(USER_KEY, JSON.stringify({ email: "stale@fixtures.local" }));
    const loggedOut = Auth.requireAuthOrRedirect();
    assert.equal(loggedOut, true);
    assert.equal(storage.getItem(TOKEN_KEY), null);
    assert.equal(replaced, null);
  });
});

describe("GST-85 Demo active copy", () => {
  it("Demo gate banner is active (Binance demo workers)", () => {
    const gate = Cap.gateState({
      execution_env: "demo",
      lane: "a",
      scope_key: "demo|a",
    });
    assert.equal(gate.state, "active");
    assert.equal(gate.commands, false);
    assert.match(gate.message, /demo|Binance/i);
  });
});

describe("GST-86 Demo has no Sim run ledger", () => {
  it("Demo A/B and Live must not call Sim Batch /api/runs", () => {
    assert.equal(
      Cap.hasSimRunLedger({
        execution_env: "demo",
        lane: "a",
        scope_key: "demo|a",
      }),
      false
    );
    assert.equal(
      Cap.hasSimRunLedger({
        execution_env: "demo",
        lane: "b",
        scope_key: "demo|b",
      }),
      false
    );
    assert.equal(
      Cap.hasSimRunLedger({ execution_env: "live", lane: null, scope_key: "live" }),
      false
    );
    assert.equal(
      Cap.hasSimRunLedger({
        execution_env: "sim",
        lane: "a",
        scope_key: "sim|a",
      }),
      true
    );
  });
});

describe("GST-85 Sim B execution gate", () => {
  it("Sim B is active with commands", () => {
    const gate = Cap.gateState({
      execution_env: "sim",
      lane: "b",
      scope_key: "sim|b",
    });
    assert.equal(gate.state, "active");
    assert.equal(gate.commands, true);
    assert.equal(Cap.commandsEnabled({ execution_env: "sim", lane: "b" }), true);
  });
});
