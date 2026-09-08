/**
 * GST-47 — change password helper + account chrome.
 * Run: node --test frontend/tests/change-password.test.js
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

delete global.document;
delete global.location;
delete global.window;

const Auth = require(path.join(__dirname, "..", "auth.js"));
const Shell = require(path.join(__dirname, "..", "app-shell.js"));

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

describe("GST-47 post-login landing", () => {
  it("prefers Sim A MVP", () => {
    assert.equal(Auth.landingPath, "/sim/a/");
  });
});

describe("GST-47 account footer chrome", () => {
  it("offers Change password under signed-in footer", () => {
    const email = ["owner", "fixture"].join(".") + "@fixtures.local"; // pragma: allowlist secret
    const html = Shell.authChromeHtml(
      { user: { email, role: "super_admin" } },
      { surface: "footer" }
    );
    assert.match(html, /Change password/);
    assert.match(html, /id="shellChangePassword"/);
    assert.match(html, /\/account\/password\//);
    assert.match(html, /Sign out/);
  });

  it("does not show Change password when logged out", () => {
    const html = Shell.authChromeHtml(null, { surface: "footer" });
    assert.doesNotMatch(html, /shellChangePassword/);
    assert.match(html, /Sign in/);
  });
});

describe("GST-47 changePassword API helper", () => {
  let storage;
  let fetches;

  beforeEach(() => {
    storage = memoryStorage();
    global.localStorage = storage;
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64url");
    storage.setItem("gekko_auth_token", `hdr.${payload}.sig`);
    global.GEKKO_API_URL = "https://control.example.test";
    fetches = [];
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.fetch;
    delete global.GEKKO_API_URL;
  });

  it("posts current_password + new_password via authFetch path", async () => {
    global.fetch = async (url, opts) => {
      fetches.push({ url: String(url), opts });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true };
        },
      };
    };
    await Auth.changePassword("old-password-fixture", "new-password-fixture");
    assert.equal(fetches.length, 1);
    assert.match(fetches[0].url, /\/api\/auth\/change-password$/);
    assert.equal(fetches[0].opts.method, "POST");
    const body = JSON.parse(fetches[0].opts.body);
    assert.equal(body.current_password, "old-password-fixture");
    assert.equal(body.new_password, "new-password-fixture");
  });

  it("feature-detects App 404 with friendly message", async () => {
    global.fetch = async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      async json() {
        return { detail: "Not Found" };
      },
    });
    await assert.rejects(
      () => Auth.changePassword("old-password-fixture", "new-password-fixture"),
      (err) => {
        assert.match(String(err.message), /not available on Control yet/i);
        assert.equal(err.code, "not_available");
        return true;
      }
    );
  });

  it("maps wrong current password plainly", () => {
    assert.match(
      Auth.changePasswordErrorMessage({ status: 403, message: "incorrect" }),
      /Current password is incorrect/
    );
  });

  it("rejects short new passwords locally", async () => {
    global.fetch = async () => {
      assert.fail("should not call Control for short password");
    };
    await assert.rejects(
      () => Auth.changePassword("old-password-fixture", "short"),
      /at least 8 characters/i
    );
  });
});

describe("GST-47 change-password page assets", () => {
  it("ships account/password page with form fields", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "..", "account", "password", "index.html"),
      "utf8"
    );
    assert.match(html, /id="changePasswordForm"/);
    assert.match(html, /id="currentPassword"/);
    assert.match(html, /id="newPassword"/);
    assert.match(html, /change-password\.js/);
    assert.match(html, /data-page="change-password"/);
  });
});
