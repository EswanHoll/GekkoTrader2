/**
 * GST-128 — Demo Results desk book + Promote To Live wire checks.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (...parts) => path.join(__dirname, "..", "src", ...parts);

describe("GST-128 Demo handoff wiring", () => {
  it("client exposes clear / end / promote Control paths", () => {
    const client = fs.readFileSync(src("api", "client.ts"), "utf8");
    assert.match(client, /export function clearDemoJournal/);
    assert.match(client, /\/api\/backtests\/desk\/journal\/clear/);
    assert.match(client, /export function endAndPublishDemo/);
    assert.match(client, /\/api\/backtests\/desk\/demo\/end/);
    assert.match(client, /export function promoteDemoToLive/);
    assert.match(client, /\/api\/live\/settings\/promote/);
    assert.match(client, /from: `\$\{product\}\/demo`/);
  });

  it("useDemoHandoff invalidates Demo + Live query keys", () => {
    const hook = fs.readFileSync(src("hooks", "useDemoHandoff.ts"), "utf8");
    assert.match(hook, /\["demo-settings"/);
    assert.match(hook, /\["live-dashboard"\]/);
    assert.match(hook, /promoteDemoToLive/);
    assert.match(hook, /clearDemoJournal/);
    assert.match(hook, /endAndPublishDemo/);
  });

  it("does not touch frontend/legacy", () => {
    const page = fs.readFileSync(src("pages", "ResultsPage.tsx"), "utf8");
    assert.doesNotMatch(page, /frontend\/legacy/);
    assert.match(page, /data-action="promote-live"/);
    assert.match(page, /data-action="clear-journal"/);
    assert.match(page, /data-action="end-demo"/);
  });
});
