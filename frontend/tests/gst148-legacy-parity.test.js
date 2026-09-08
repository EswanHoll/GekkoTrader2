/**
 * GST-148 — legacy functional parity smoke (Audit, Bandit, Telegram, CSV).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (...parts) => path.join(__dirname, "..", "src", ...parts);
const root = (...parts) => path.join(__dirname, "..", "..", ...parts);

describe("GST-148 legacy parity surfaces", () => {
  it("Admin Audit page + nav entry exist", () => {
    const page = fs.readFileSync(src("pages", "Admin", "AuditPage.tsx"), "utf8");
    assert.match(page, /data-testid="audit-page"/);
    assert.match(page, /fetchAuditEvents/);
    const nav = fs.readFileSync(src("lib", "navigation.ts"), "utf8");
    assert.match(nav, /Audit Logs/);
    assert.match(nav, /\/admin\/audit\//);
    const app = fs.readFileSync(src("App.tsx"), "utf8");
    assert.match(app, /admin\/audit/);
    assert.match(app, /AuditPage/);
  });

  it("RunBoard Bandit Concentrate is editable", () => {
    const specs = fs.readFileSync(src("lib", "runBoard.ts"), "utf8");
    assert.match(specs, /key:\s*"bandit_concentrate"/);
    assert.match(specs, /label:\s*"Bandit Concentrate"/);
    assert.match(specs, /editable:\s*true/);
    const results = fs.readFileSync(src("pages", "ResultsPage.tsx"), "utf8");
    assert.match(results, /bandit_concentrate/);
    assert.match(results, /concentrate:\s*text/);
  });

  it("Settings exposes Telegram Chat ID alerts section", () => {
    const settings = fs.readFileSync(src("pages", "Settings.tsx"), "utf8");
    assert.match(settings, /alerts-notifications/);
    assert.match(settings, /telegram-chat-id/);
    assert.match(settings, /updateAuthProfile/);
  });

  it("RecentTradesTable offers full ledger CSV export", () => {
    const table = fs.readFileSync(
      src("components", "desk", "RecentTradesTable.tsx"),
      "utf8"
    );
    assert.match(table, /export-full-ledger/);
    assert.match(table, /Export Full Ledger \(CSV\)/);
    assert.match(table, /fetchFullDeskLedger/);
  });

  it("tradesToCsv helper ships downloadable CSV columns", () => {
    const helper = fs.readFileSync(src("lib", "ledgerCsv.ts"), "utf8");
    assert.match(helper, /export function tradesToCsv/);
    assert.match(helper, /downloadTextFile/);
    assert.match(helper, /"id"/);
    assert.match(helper, /"symbol"/);
    assert.match(helper, /CSV_COLS\.join/);
  });

  it("backend audit route is mounted", { skip: !fs.existsSync(root("backend", "app", "main.py")) }, () => {
    // GekkoTrader2 is archive UI only — Fly/backend is not imported.
    const main = fs.readFileSync(root("backend", "app", "main.py"), "utf8");
    assert.match(main, /audit_router/);
    const audit = fs.readFileSync(
      root("backend", "app", "api", "audit_routes.py"),
      "utf8"
    );
    assert.match(audit, /\/api\/audit\/scope-events/);
  });
});
