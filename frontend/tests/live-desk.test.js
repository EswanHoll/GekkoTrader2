/**
 * GST-117 — Live Desk React polling + emergency controls (data-testid).
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

describe("GST-117 Live Desk React", () => {
  it("LiveDesk exposes dormant note + emergency control testids", () => {
    const page = fs.readFileSync(src("pages", "LiveDesk.tsx"), "utf8");
    assert.match(page, /data-testid="live-desk-page"/);
    assert.match(page, /id="dormantNote"/);
    assert.match(page, /data-testid="dormant-note"/);
    assert.match(page, /data-testid="live-emergency-controls"/);
    assert.match(page, /data-testid="live-freeze-trading"/);
    assert.match(page, /data-testid="live-resume-trading"/);
    assert.match(page, /data-testid="live-global-panic"/);
    assert.match(page, /data-testid="live-positions"/);
    // Must not offer Start / Activate / Promote on Live desk.
    assert.doesNotMatch(page, />\s*Start\s*</);
    assert.doesNotMatch(page, /Activate/);
    assert.doesNotMatch(page, /Promote/);
  });

  it("useLiveDashboard polls every 5000ms (no SSE/WebSocket)", () => {
    const hook = fs.readFileSync(src("hooks", "useLiveDashboard.ts"), "utf8");
    assert.match(hook, /refetchInterval:\s*5_000/);
    assert.doesNotMatch(hook, /\bEventSource\b|\bnew WebSocket\b|subscribeDashboard\(/);
  });

  it("wires desk kill + global panic through client", () => {
    const api = fs.readFileSync(src("api", "client.ts"), "utf8");
    assert.match(api, /export function setDeskKill/);
    assert.match(api, /\/api\/desks\/kill/);
    assert.match(api, /export function setKillSwitch/);
    assert.match(api, /\/api\/kill/);
  });
});
