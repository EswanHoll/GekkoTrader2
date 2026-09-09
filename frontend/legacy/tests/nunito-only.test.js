"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FRONTEND = path.join(__dirname, "..");
const SOURCE_EXTENSIONS = new Set([".css", ".html", ".js"]);

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [file] : [];
  });
}

describe("P0 Nunito-only typography", () => {
  it("does not request or declare a competing visible UI font", () => {
    const sources = sourceFiles(FRONTEND)
      .map((file) => ({ file, text: fs.readFileSync(file, "utf8") }))
      .filter(({ file }) => !file.includes(`${path.sep}tests${path.sep}`));
    const offenders = sources.filter(({ text }) =>
      /JetBrains(?:\+|\s)Mono|Fira(?:\+|\s)Code|ui-monospace|monospace/i.test(text)
    );
    assert.deepEqual(
      offenders.map(({ file }) => path.relative(FRONTEND, file)),
      [],
      "all user-visible frontend typography must use Nunito only"
    );
  });

  it("defines Nunito as the shared UI font token", () => {
    const css = fs.readFileSync(path.join(FRONTEND, "styles.css"), "utf8");
    assert.match(css, /--font-ui:\s*"Nunito"/);
    assert.doesNotMatch(css, /JetBrains(?:\+|\s)Mono|ui-monospace|monospace/i);
  });
});
