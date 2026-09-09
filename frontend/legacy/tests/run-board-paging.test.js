/**
 * GST-97 — Run Board loads first 5 from list (no per-run hydrate), Next 5 / Fetch all.
 * Run: node --test frontend/tests/run-board-paging.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const execSrc = fs.readFileSync(
  path.join(__dirname, "..", "sim-execution.js"),
  "utf8"
);
const apiSrc = fs.readFileSync(
  path.join(__dirname, "..", "api-client.js"),
  "utf8"
);

describe("GST-97 Run Board paging", () => {
  it("first Results load requests limit=5 and paints from list (no fetchRun loop)", () => {
    assert.match(execSrc, /PAGE_SIZE\s*=\s*5/);
    assert.match(
      execSrc,
      /fetchRuns\(scope,\s*\{\s*limit:\s*PAGE_SIZE,\s*offset:\s*0/
    );
    assert.match(execSrc, /normalizeRunForBoard\(row\)/);
    assert.match(execSrc, /btnResultsNext5/);
    assert.match(execSrc, /btnResultsFetchAll/);
    // Must not re-introduce the sequential hydrate loop before first paint.
    assert.doesNotMatch(
      execSrc,
      /for\s*\(\s*const\s+row\s+of\s+boardSource\.slice[\s\S]*fetchRun/
    );
  });

  it("api client forwards limit/offset on fetchRuns", () => {
    assert.match(apiSrc, /fetchRuns:\s*async\s*\(scope,\s*opts\s*=\s*\{\}\)/);
    assert.match(apiSrc, /withQuery\("\/api\/runs"/);
  });

  it("pager mounts next to Run Board heading (not under the table)", () => {
    assert.match(execSrc, /results-board-part-heading/);
    assert.match(execSrc, /panel-heading-copy/);
    assert.match(execSrc, /titleCopy\.appendChild\(pager\)/);
    assert.doesNotMatch(
      execSrc,
      /boardRoot\.insertAdjacentElement\(\s*["']afterend["']/
    );
  });
});
