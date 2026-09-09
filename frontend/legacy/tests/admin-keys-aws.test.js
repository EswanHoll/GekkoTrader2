/**
 * GST-98 — Admin Keys talks to AWS vault; Not Found is not “secret wiped”.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "admin-keys.js"), "utf8");
const html = fs.readFileSync(
  path.join(__dirname, "..", "admin", "keys", "index.html"),
  "utf8"
);

describe("GST-98 Admin Keys AWS vault", () => {
  it("saves to AWS and never says Save to Fly", () => {
    assert.match(src, /Save to AWS/);
    assert.doesNotMatch(src, /Save to Fly/);
    assert.match(src, /AWS Secrets Manager/);
  });

  it("explains Not Found without blaming the operator secret", () => {
    assert.match(src, /not your operator secret/);
    assert.match(src, /AWS password vault/);
    assert.match(html, /website releases do not wipe/i);
  });
});
