/**
 * GST-139 — Demo desk 404 soft-state, Stop/Kill controls, Demo Run Board.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (...parts) => path.join(root, "src", ...parts);

describe("GST-139 Demo desk + Stop/Kill + Demo Run Board", () => {
  it("DeskPage soft-handles Demo dashboard empty and wires Stop/Kill", () => {
    const page = fs.readFileSync(src("pages", "DeskPage.tsx"), "utf8");
    assert.match(page, /desk-dash-empty/);
    assert.match(page, /desk-stop-run/);
    assert.match(page, /desk-kill-run/);
    assert.match(page, /useTerminateEngine/);
    assert.match(page, /terminate\.mutate\("graceful"/);
    assert.match(page, /terminate\.mutate\("hard"/);
  });

  it("api client routes Demo runs + terminateEngine", () => {
    const api = fs.readFileSync(src("api", "client.ts"), "utf8");
    assert.match(api, /\/api\/\$\{product\}\/demo\/runs/);
    assert.match(api, /export function terminateEngine/);
    assert.match(api, /\/api\/engine\/terminate/);
  });

  it("useRunsBoard enables Demo scopes", () => {
    const hook = fs.readFileSync(src("hooks", "useRunsBoard.ts"), "utf8");
    assert.match(
      hook,
      /execution_env === "sim" \|\| scope\.execution_env === "demo"/
    );
  });

  it("Demo Results renders RunBoard and drops No Sim run matrix copy", () => {
    const page = fs.readFileSync(src("pages", "ResultsPage.tsx"), "utf8");
    assert.doesNotMatch(page, /No Sim run matrix on Demo/);
    assert.match(page, /useRunsBoard\(scope\)/);
    assert.match(page, /<RunBoard/);
    assert.match(page, /demo window/);
  });
});
