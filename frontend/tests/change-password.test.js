/**
 * GST-117 / GST-47 — change password React Settings + validation.
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

async function loadTs(relParts) {
  const mod = await import(pathToFileURL(src(...relParts)).href);
  return mod.default && typeof mod.default === "object" && !mod.changePassword
    ? { ...mod.default, ...mod }
    : mod;
}

describe("GST-117 Settings / change-password DOM", () => {
  it("Settings page exposes form testids and legacy ids", () => {
    const page = fs.readFileSync(src("pages", "Settings.tsx"), "utf8");
    assert.match(page, /data-testid="settings-page"/);
    assert.match(page, /data-page="change-password"/);
    assert.match(page, /id="changePasswordForm"/);
    assert.match(page, /id="currentPassword"/);
    assert.match(page, /id="newPassword"/);
    assert.match(page, /id="confirmPassword"/);
    assert.match(page, /data-testid="change-password-form"/);
    assert.match(page, /data-testid="change-password-submit"/);
  });
});

describe("GST-117 changePassword validation + API", () => {
  let calls;

  beforeEach(() => {
    calls = [];
    globalThis.window = globalThis.window || globalThis;
    globalThis.window.GEKKO_API_URL = "https://control.example.test";
    globalThis.window.GEKKO_USE_MOCK_API = false;
    globalThis.localStorage = {
      getItem: (k) => (k === "gekko_auth_token" ? "jwt-token" : null),
      setItem() {},
      removeItem() {},
    };
    globalThis.sessionStorage = {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    };
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it("validatePasswordChange rejects mismatch and short passwords", async () => {
    const { validatePasswordChange } = await loadTs(["lib", "password.ts"]);
    assert.match(
      validatePasswordChange("old-password-fixture", "short", "short") || "",
      /at least 8/i
    );
    assert.match(
      validatePasswordChange(
        "old-password-fixture",
        "new-password-fixture",
        "other-password-fixture"
      ) || "",
      /do not match/i
    );
    assert.equal(
      validatePasswordChange(
        "old-password-fixture",
        "new-password-fixture",
        "new-password-fixture"
      ),
      null
    );
  });

  it("changePassword posts current_password + new_password", async () => {
    const Api = await loadTs(["api", "client.ts"]);
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), opts });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ ok: true });
        },
      };
    };
    await Api.changePassword("old-password-fixture", "new-password-fixture");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/auth\/change-password$/);
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.current_password, "old-password-fixture");
    assert.equal(body.new_password, "new-password-fixture");
  });

  it("rejects short new passwords locally", async () => {
    const Api = await loadTs(["api", "client.ts"]);
    globalThis.fetch = async () => {
      assert.fail("should not call Control for short password");
    };
    await assert.rejects(
      () => Api.changePassword("old-password-fixture", "short"),
      /at least 8 characters/i
    );
  });

  it("maps wrong current password plainly", async () => {
    const Api = await loadTs(["api", "client.ts"]);
    assert.match(
      Api.changePasswordErrorMessage({ status: 403, message: "incorrect" }),
      /Current password is incorrect/
    );
  });

  it("feature-detects App 404 with friendly message", async () => {
    const Api = await loadTs(["api", "client.ts"]);
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      async text() {
        return JSON.stringify({ detail: "Not Found" });
      },
    });
    await assert.rejects(
      () => Api.changePassword("old-password-fixture", "new-password-fixture"),
      (err) => {
        assert.match(String(err.message), /not available on Control yet/i);
        assert.equal(err.code, "not_available");
        return true;
      }
    );
  });
});
