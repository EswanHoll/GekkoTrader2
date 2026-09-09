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
    // Defect lock: forgot link must precede Login submit (not follow it).
    const forgotIdx = page.indexOf('data-testid="login-forgot-link"');
    const submitIdx = page.indexOf('data-testid="login-submit"');
    assert.ok(forgotIdx >= 0 && submitIdx >= 0, "forgot link and submit present");
    assert.ok(
      forgotIdx < submitIdx,
      "login-forgot-link must appear before login-submit"
    );
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
    // Forgot recipient lock: only eswan@ — never trader@ / traderN@ / operator note.
    assert.match(page, /requestForgotPassword\(recipient\)|requestForgotPassword\(PREFILL_EMAIL\)/);
    assert.match(page, /value=\{PREFILL_EMAIL\}/);
    assert.match(page, /readOnly/);
    assert.doesNotMatch(page, /trader\d*@/i);
    assert.doesNotMatch(page, /operator note/i);
    assert.match(client, /\/api\/auth\/forgot-password/);
    assert.match(client, /\/api\/auth\/reset-password/);
  });

  it("LoginPage form supports Chrome password save", () => {
    const page = fs.readFileSync(src("pages", "LoginPage.tsx"), "utf8");
    assert.match(page, /method=["']post["']/);
    assert.match(page, /name=["']username["']/);
    assert.match(page, /name=["']password["']/);
    assert.match(page, /type=["']email["']/);
    assert.match(page, /autoComplete=["']username["']/);
    assert.match(page, /autoComplete=["']current-password["']/);
    assert.match(page, /type=["']submit["']/);
    assert.match(page, /FormData/);
    assert.match(page, /window\.location\.assign/);
    assert.doesNotMatch(page, /navigate\(/);
  });

  it("Login control sticks to the viewport bottom", () => {
    const page = fs.readFileSync(src("pages", "LoginPage.tsx"), "utf8");
    const css = fs.readFileSync(src("index.css"), "utf8");
    assert.match(page, /data-testid="login-control"/);
    assert.match(page, /h-dvh/);
    assert.match(page, /login-page-scroll/);
    assert.match(page, /overflow-y-auto/);
    // Must not vertically center the whole page (empty space under the card).
    assert.doesNotMatch(page, /justify-center/);
    assert.match(css, /\.login-control\s*\{[^}]*flex-shrink:\s*0/s);
    // Forgot → Login → Back to Home all live in the bottom control.
    const controlIdx = page.indexOf('data-testid="login-control"');
    const forgotIdx = page.indexOf('data-testid="login-forgot-link"');
    const submitIdx = page.indexOf('data-testid="login-submit"');
    const homeIdx = page.indexOf('data-testid="login-back-home"');
    assert.ok(controlIdx >= 0, "login-control present");
    assert.ok(
      controlIdx < forgotIdx && forgotIdx < submitIdx && submitIdx < homeIdx,
      "bottom control order: forgot, Login submit, Back to Home"
    );
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
