/**
 * GST-117 — Admin Keys / Operator / Users React data-testid contracts.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = (...parts) => path.join(root, "src", ...parts);

describe("GST-117 Admin Keys AWS vault", () => {
  it("saves to AWS and never says Save to Fly", () => {
    const page = fs.readFileSync(src("pages", "Admin", "AdminKeys.tsx"), "utf8");
    assert.match(page, /Save to AWS/);
    assert.doesNotMatch(page, /Save to Fly/);
    assert.match(page, /AWS Secrets Manager/);
    assert.match(page, /data-testid="admin-keys-page"/);
    assert.match(page, /data-testid="admin-keys-refresh"/);
  });

  it("explains Not Found without blaming the operator secret", () => {
    const page = fs.readFileSync(src("pages", "Admin", "AdminKeys.tsx"), "utf8");
    assert.match(page, /not your operator secret/);
    assert.match(page, /AWS password vault/);
    assert.match(page, /Website releases do not wipe/i);
  });
});

describe("GST-117 Admin Operator fleet", () => {
  it("exposes fleet rows + freeze/start actions with testids", () => {
    const page = fs.readFileSync(
      src("pages", "Admin", "AdminOperator.tsx"),
      "utf8"
    );
    const fleet = fs.readFileSync(src("lib", "fleet.ts"), "utf8");
    assert.match(page, /data-testid="admin-operator-page"/);
    assert.match(page, /data-testid="fleet-desk-rows"/);
    assert.match(page, /data-testid="fleet-power-status"/);
    assert.match(fleet, /Freeze Trading/);
    assert.match(fleet, /Resume Trading/);
    const hook = fs.readFileSync(src("hooks", "useDesksStatus.ts"), "utf8");
    assert.match(hook, /refetchInterval/);
    assert.match(hook, /setDeskKill|setDeskPower/);
  });
});

describe("GST-117 Admin Users", () => {
  it("exposes pending/all tabs and approve/reject testids", () => {
    const page = fs.readFileSync(src("pages", "Admin", "AdminUsers.tsx"), "utf8");
    assert.match(page, /data-testid="admin-users-page"/);
    assert.match(page, /data-testid="admin-users-tab-pending"/);
    assert.match(page, /data-testid="admin-users-tab-all"/);
    assert.match(page, /Approve/);
    assert.match(page, /Reject/);
  });
});
