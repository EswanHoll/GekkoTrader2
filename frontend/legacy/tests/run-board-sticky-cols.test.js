/**
 * GST-100 — sticky label column + half-width run columns.
 * Run: node --test frontend/tests/run-board-sticky-cols.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const board = fs.readFileSync(path.join(__dirname, "..", "run-board.js"), "utf8");

describe("GST-100 Run Board sticky label + narrow runs", () => {
  it("pins the label column with sticky left inside the scroll wrap", () => {
    assert.match(
      css,
      /\.results-board-panel\s+\.run-board-wrap\s+\.run-board-table\s*>\s*thead\s*>\s*tr\s*>\s*th:first-child[\s\S]*?left:\s*0/s
    );
    assert.match(
      css,
      /tbody\s*>\s*tr\s*>\s*th\[scope="row"\][\s\S]*?position:\s*sticky[\s\S]*?left:\s*0/s
    );
  });

  it("sizes run columns at half the prior ×1.5 width (0.75× fit)", () => {
    assert.match(board, /fitData\s*\*\s*0\.75/);
    assert.match(board, /84\s*\*\s*0\.75/);
    assert.doesNotMatch(board, /fitData\s*\*\s*1\.5/);
  });
});
