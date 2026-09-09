const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const Scope = require(path.join(__dirname, "..", "scope.js"));

test("GST-107 / GST-121 — suite names map to playbookN.M", () => {
  assert.equal(Scope.resolvePlaybookKey(null, "baseline"), "playbook1.1");
  assert.equal(Scope.resolvePlaybookKey("baseline"), "playbook1.1");
  assert.equal(Scope.resolvePlaybookKey(null, "classic"), "playbook2.1");
  assert.equal(Scope.resolvePlaybookKey(null, "regime"), "playbook3.1");
  assert.equal(Scope.resolvePlaybookKey(null, "playbook1"), "playbook1.1");
  assert.equal(Scope.resolvePlaybookKey(null, "playbook_3"), "playbook3.1");
  assert.notEqual(Scope.resolvePlaybookKey("baseline"), "baseline");
});

test("GST-107 — keeps explicit playbook versions", () => {
  assert.equal(Scope.resolvePlaybookKey("playbook1.2"), "playbook1.2");
  assert.equal(Scope.resolvePlaybookKey("playbook3"), "playbook3.1");
});

test("GST-107 — formatScopeLabel never embeds bare suite names", () => {
  const label = Scope.formatScopeLabel(
    { execution_env: "sim", lane: "a" },
    "baseline"
  );
  assert.match(label, /playbook1\.1/);
  assert.doesNotMatch(label, /\bbaseline\b/);
});
