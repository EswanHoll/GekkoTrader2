/**
 * GST-104 — write sessions mint from admin login (no secret paste).
 * Run: node --test frontend/tests/operator-admin-mint.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadOperator({ authToken = "admin-jwt", secret = "", mintImpl } = {}) {
  const store = {
    local: {},
    session: {},
  };
  if (secret) store.local.gekko_ops_device_secret = secret;
  if (authToken) store.local.gekko_auth_token = authToken;
  const storage = (kind) => ({
    getItem: (k) => (store[kind][k] == null ? null : String(store[kind][k])),
    setItem: (k, v) => {
      store[kind][k] = String(v);
    },
    removeItem: (k) => {
      delete store[kind][k];
    },
  });
  const sandbox = {
    console,
    Date,
    JSON,
    Error,
    setTimeout,
    clearTimeout,
    GEKKO_API_URL: "https://control.test",
    GekkoControlConfig: {
      resolveControlBase: () => "https://control.test",
      isConfigured: () => true,
    },
    GekkoAuth: { getToken: () => authToken || "" },
    localStorage: storage("local"),
    sessionStorage: storage("session"),
    document: {
      addEventListener() {},
      visibilityState: "visible",
    },
    fetch: async (url, opts = {}) => {
      if (mintImpl) return mintImpl(url, opts);
      if (String(url).includes("/api/operator/session") && (!opts.method || opts.method === "GET")) {
        return {
          ok: true,
          async json() {
            return { active: false, ttl_remaining: 0 };
          },
        };
      }
      return {
        ok: true,
        async json() {
          return {
            token: "minted-from-admin",
            expires_at: Math.floor(Date.now() / 1000) + 600,
            ttl_seconds: 600,
            mint_via: "super_admin_session",
          };
        },
        async text() {
          return "";
        },
      };
    },
    globalThis: null,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  const code = fs.readFileSync(path.join(__dirname, "..", "operator.js"), "utf8");
  vm.runInNewContext(code, sandbox, { filename: "operator.js" });
  return { Op: sandbox.GekkoOperator, store };
}

const shellSrc = fs.readFileSync(path.join(__dirname, "..", "operator.js"), "utf8");
const keysHtml = fs.readFileSync(
  path.join(__dirname, "..", "admin", "keys", "index.html"),
  "utf8"
);

describe("GST-104 admin-login write session", () => {
  it("documents mint-from-admin path and optional secret", () => {
    assert.match(shellSrc, /GST-104/);
    assert.match(shellSrc, /function appAuthToken\s*\(/);
    assert.match(shellSrc, /Sign in as admin/);
    assert.match(keysHtml, /admin login unlocks writes/i);
    assert.match(keysHtml, /Unlock writes/);
  });

  it("ensureWriteSession remints without a device secret when auth exists", async () => {
    let mintCalls = 0;
    const { Op } = loadOperator({
      authToken: "admin-jwt",
      secret: "",
      mintImpl: async (url, opts = {}) => {
        if (String(url).includes("/api/operator/session") && (!opts.method || opts.method === "GET")) {
          return {
            ok: true,
            async json() {
              return { active: false, ttl_remaining: 0 };
            },
          };
        }
        mintCalls += 1;
        assert.match(opts.headers.Authorization || "", /Bearer admin-jwt/);
        assert.equal(opts.headers["X-Operator-Control-Secret"], undefined);
        return {
          ok: true,
          async json() {
            return {
              token: "minted-from-admin",
              expires_at: Math.floor(Date.now() / 1000) + 600,
              ttl_seconds: 600,
              mint_via: "super_admin_session",
            };
          },
          async text() {
            return "";
          },
        };
      },
    });
    assert.equal(Op.hasDeviceSecret(), false);
    const ensured = await Op.ensureWriteSession({ force: true });
    assert.equal(ensured.active, true);
    assert.equal(mintCalls, 1);
    assert.equal(Op.getSessionToken(), "minted-from-admin");
  });
});
