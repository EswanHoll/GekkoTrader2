/**
 * GST-129/130 — upload_failed disables Analyze; Copy/Hide/Delete stay active.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (...parts) => path.join(__dirname, "..", "src", ...parts);

describe("GST-129/130 upload_failed Analyze gate", () => {
  it("isAnalyzeUnavailable is true only for upload_failed", () => {
    function isAnalyzeUnavailable(run) {
      return String(run?.status || "").trim().toLowerCase() === "upload_failed";
    }
    assert.equal(isAnalyzeUnavailable({ status: "upload_failed" }), true);
    assert.equal(isAnalyzeUnavailable({ status: "UPLOAD_FAILED" }), true);
    assert.equal(isAnalyzeUnavailable({ status: "succeeded" }), false);
    assert.equal(isAnalyzeUnavailable({ status: "failed" }), false);
    assert.equal(isAnalyzeUnavailable({ status: "completed" }), false);
    assert.equal(isAnalyzeUnavailable(null), false);

    const lib = fs.readFileSync(src("lib", "runBoard.ts"), "utf8");
    assert.match(lib, /export function isAnalyzeUnavailable/);
    assert.match(
      lib,
      /Detailed trade logs unavailable \(archive upload failed\)\./
    );
  });

  it("RunBoard disables Analyze for upload_failed and keeps other actions", () => {
    const board = fs.readFileSync(src("components", "RunBoard.tsx"), "utf8");
    assert.match(board, /isAnalyzeUnavailable/);
    assert.match(board, /ANALYZE_UPLOAD_FAILED_TITLE/);
    assert.match(board, /disabled=\{analyzeBlocked\}/);
    assert.match(board, /data-testid="run-board-copy-all"/);
    assert.match(board, /data-testid="run-board-hide"/);
    assert.match(board, /data-testid="run-board-delete"/);
    // Copy/Hide are not gated on upload_failed.
    const copyBlock = board.slice(
      board.indexOf('data-testid="run-board-copy-all"'),
      board.indexOf('data-testid="run-board-copy-all"') + 280
    );
    assert.doesNotMatch(copyBlock, /disabled=\{analyzeBlocked\}/);
    const hideBlock = board.slice(
      board.indexOf('data-testid="run-board-hide"'),
      board.indexOf('data-testid="run-board-hide"') + 280
    );
    assert.doesNotMatch(hideBlock, /disabled=\{analyzeBlocked\}/);
  });

  it("ResultsPage analyze() short-circuits upload_failed", () => {
    const page = fs.readFileSync(src("pages", "ResultsPage.tsx"), "utf8");
    assert.match(page, /isAnalyzeUnavailable\(run\)/);
    assert.match(page, /ANALYZE_UPLOAD_FAILED_TITLE/);
  });
});
