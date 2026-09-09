/**
 * GT2 login chrome lock — branded wordmark, password + forgot/reset, no Google.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (...parts) => path.join(__dirname, "..", "src", ...parts);

describe("GT2 login chrome lock", () => {
  it("LoginPage uses Gekko + Trader2 split wordmark", () => {
    const page = fs.readFileSync(src("pages", "LoginPage.tsx"), "utf8");
    assert.match(page, /data-testid="login-wordmark"/);
    assert.match(page, /login-brand-gekko">Gekko</);
    assert.match(page, /login-brand-trader">Trader2</);
    assert.doesNotMatch(page, /Trader4/);
    assert.doesNotMatch(page, /Control desk/);
    assert.doesNotMatch(page, />GekkoTrader</);
    assert.doesNotMatch(page, />GekkoTrader4</);
  });

  it("LoginPage has no Google button or continue-with divider", () => {
    const page = fs.readFileSync(src("pages", "LoginPage.tsx"), "utf8");
    assert.doesNotMatch(page, /loginGoogle|login-google|login-divider|or continue with/i);
    assert.doesNotMatch(page, /googleConfig|loginWithGoogle|accounts\.google|gsi\/client/);
    assert.match(page, /loginWithPassword/);
    assert.match(page, /data-testid="login-submit"/);
    assert.match(page, /["']Login["']/);
    assert.doesNotMatch(page, /Continue with Google/);
  });

  it("LoginPage exposes forgot + reset before sign-in", () => {
    const page = fs.readFileSync(src("pages", "LoginPage.tsx"), "utf8");
    const client = fs.readFileSync(src("api", "client.ts"), "utf8");
    assert.match(page, /data-testid="login-forgot-link"/);
    assert.match(page, /Forgot password\?/);
    assert.match(page, /data-testid="forgot-form"/);
    assert.match(page, /requestForgotPassword/);
    assert.match(page, /data-testid="reset-form"/);
    assert.match(page, /resetPasswordWithToken/);
    assert.match(page, /params\.get\("reset"\)/);
    assert.match(client, /\/api\/auth\/forgot-password/);
    assert.match(client, /\/api\/auth\/reset-password/);
    assert.match(client, /new_password/);
    // Prefill operator email for forgot flow (not a password).
    assert.match(page, /eswan@gekkotech\.co\.za/);
  });

  it("Sidebar wordmark stays Gekko + Trader2", () => {
    const side = fs.readFileSync(src("components", "Sidebar.tsx"), "utf8");
    assert.match(side, /data-testid="sidebar-wordmark"/);
    assert.match(side, /text-gekko">Gekko</);
    assert.match(side, /text-white">Trader2</);
    assert.doesNotMatch(side, /Control desk/);
    assert.doesNotMatch(side, /Trader4/);
  });
});
