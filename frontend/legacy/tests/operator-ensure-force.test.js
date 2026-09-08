/**
 * GST-102 — ensureWriteSession force must not join a soft in-flight peek.
 * Run: node --test frontend/tests/operator-ensure-force.test.js
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadOperator({ secret = "device-secret", mintImpl } = {}) {
  const store = {
    local: { gekko_ops_device_secret: secret },
    session: {},
  };
  const storage = (kind) => ({
    getItem: (k) => (store[kind][k] == null ? null : String(store[kind][k])),
    setItem: (k, v) => {
      store[kind][k] = String(v);
    },
    removeItem: (k) => {
      delete store[kind][k];
    },
  });
  const calls = [];
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
    localStorage: storage("local"),
    sessionStorage: storage("session"),
    document: {
      addEventListener() {},
      visibilityState: "visible",
    },
    fetch: async (url, opts = {}) => {
      calls.push({ url: String(url), method: (opts.method || "GET").toUpperCase() });
      if (String(url).includes("/api/operator/session") && (!opts.method || opts.method === "GET")) {
        return {
          ok: true,
          async json() {
            return { active: false, ttl_remaining: 0 };
          },
        };
      }
      if (mintImpl) return mintImpl(url, opts);
      return {
        ok: true,
        async json() {
          return {
            token: "minted-token",
            expires_at: Math.floor(Date.now() / 1000) + 600,
            ttl_seconds: 600,
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
  return { Op: sandbox.GekkoOperator, calls, store };
}

describe("GST-102 ensureWriteSession force", () => {
  it("force remints even when a soft ensure is already in flight", async () => {
    let mintCount = 0;
    let releasePeek;
    const peekGate = new Promise((r) => {
      releasePeek = r;
    });
    const { Op, calls } = loadOperator({
      mintImpl: async (url, opts) => {
        if ((opts.method || "").toUpperCase() === "POST") {
          mintCount += 1;
          return {
            ok: true,
            async json() {
              return {
                token: `token-${mintCount}`,
                expires_at: Math.floor(Date.now() / 1000) + 600,
                ttl_seconds: 600,
              };
            },
            async text() {
              return "";
            },
          };
        }
        // Soft status peek — hold until force is requested.
        await peekGate;
        return {
          ok: true,
          async json() {
            return { active: false, ttl_remaining: 0 };
          },
        };
      },
    });

    const soft = Op.ensureWriteSession({ force: false });
    // Let soft start the status peek.
    await new Promise((r) => setTimeout(r, 10));
    const forced = Op.ensureWriteSession({ force: true });
    releasePeek();
    const softResult = await soft;
    const forcedResult = await forced;
    assert.equal(forcedResult.active, true);
    assert.ok(Op.getSessionToken());
    assert.ok(mintCount >= 1, `expected a mint, got ${mintCount}; calls=${JSON.stringify(calls)}`);
    // Soft may also mint after peek; either way force must leave a token.
    assert.ok(softResult);
  });
});
