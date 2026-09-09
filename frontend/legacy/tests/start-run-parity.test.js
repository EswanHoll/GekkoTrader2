/**
 * Parity Plus — Start Run queues a Sim job and opens Desk (GST-95).
 * Run: node --test frontend/tests/start-run-parity.test.js
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const execSrc = fs.readFileSync(
  path.join(__dirname, "..", "sim-execution.js"),
  "utf8"
);
const pagesSrc = fs.readFileSync(path.join(__dirname, "..", "pages.js"), "utf8");
const resultsHtml = fs.readFileSync(
  path.join(__dirname, "..", "sim", "a", "results", "index.html"),
  "utf8"
);

describe("GST-95 Start Run parity", () => {
  it("exports startRun on GekkoSimExecution", () => {
    assert.match(execSrc, /async function startRun\s*\(/);
    assert.match(execSrc, /startRun,/);
    assert.match(
      execSrc,
      /Queues a research job from the bound Current settings/
    );
  });

  it("Results mounts a real Start Run button (not only a Reports link)", () => {
    assert.match(execSrc, /id="btnResultsStartRun"/);
    assert.match(execSrc, /btnResultsStartRun[\s\S]*startRun\(scope/);
    assert.doesNotMatch(
      execSrc,
      /Start \/ manage runs/
    );
    assert.match(resultsHtml, /resultsRunControl/);
  });

  it("Desk Start Run uses GekkoSimExecution.startRun with navigateToDesk", () => {
    assert.match(pagesSrc, /GekkoSimExecution\?\.startRun/);
    assert.match(pagesSrc, /navigateToDesk:\s*true/);
    assert.match(pagesSrc, /hasSimRunLedger/);
  });

  it("startRun posts via GekkoApi.startRun after buildStartRunBody", () => {
    assert.match(execSrc, /buildStartRunBody\(settings/);
    assert.match(execSrc, /GekkoApi\.startRun\(scope,\s*body\)/);
    assert.match(execSrc, /location\.assign\(`\$\{deskHref\}/);
  });
});

describe("GST-95 startRun behaviour (unit)", () => {
  let assigned = "";
  let confirmCalls = 0;
  const SIM_A = {
    execution_env: "sim",
    lane: "a",
    scope_key: "sim|a",
  };

  beforeEach(() => {
    assigned = "";
    confirmCalls = 0;
    delete require.cache[require.resolve(path.join(__dirname, "..", "sim-execution.js"))];
    global.confirm = () => {
      confirmCalls += 1;
      return true;
    };
    global.location = {
      assign(url) {
        assigned = url;
      },
    };
    const GekkoScope = {
      formatScopeLabel: () => "Sim A",
      pathForScope: (scope, leaf) =>
        leaf ? `/${scope.execution_env}/${scope.lane}/${leaf}/` : `/${scope.execution_env}/${scope.lane}/`,
    };
    const GekkoSimCapability = {
      hasSimRunLedger: (s) => s?.execution_env === "sim",
      assertCommandIdentity: async () => ({ ok: true, status: 200 }),
    };
    const GekkoApi = {
      fetchSettingsVersions: async () => ({
        active_binding: { settings_version_id: "sv-1" },
        versions: [
          {
            settings_version_id: "sv-1",
            payload: {
              dataset_id: 42,
              seed: 7,
              manifest_sha256: "a".repeat(64),
            },
          },
        ],
      }),
      startRun: async (_scope, body) => ({
        run_id: "run-abc",
        status: "queued",
        created: true,
        ...body,
      }),
      saveSettingsVersion: async () => ({ settings_version_id: "sv-2" }),
      bindSettingsVersion: async () => ({ ok: true }),
    };
    global.GekkoScope = GekkoScope;
    global.GekkoSimCapability = GekkoSimCapability;
    global.GekkoApi = GekkoApi;
    global.document = {
      getElementById: () => null,
    };
    // sim-execution Cap() reads window.*
    global.window = {
      GekkoScope,
      GekkoSimCapability,
      GekkoApi,
      GekkoDeskSurface: {},
      GekkoRunBoard: null,
    };
  });

  afterEach(() => {
    delete global.confirm;
    delete global.location;
    delete global.GekkoScope;
    delete global.GekkoSimCapability;
    delete global.GekkoApi;
    delete global.GekkoSimExecution;
    delete global.document;
    delete global.window;
    delete require.cache[require.resolve(path.join(__dirname, "..", "sim-execution.js"))];
  });

  it("queues a run and opens the Desk", async () => {
    const Exec = require(path.join(__dirname, "..", "sim-execution.js"));
    const run = await Exec.startRun(SIM_A, { confirm: true, navigateToDesk: true });
    assert.equal(run.run_id, "run-abc");
    assert.equal(confirmCalls, 1);
    assert.equal(assigned, "/sim/a/?started=run-abc");
  });

  it("refuses Demo scopes (no Sim Batch ledger)", async () => {
    const Exec = require(path.join(__dirname, "..", "sim-execution.js"));
    await assert.rejects(
      () =>
        Exec.startRun(
          { execution_env: "demo", lane: "a", scope_key: "demo|a" },
          { confirm: false }
        ),
      /Sim research job/
    );
  });

  it("GST-99: Start Run uses just-bound id when list omits active_binding", async () => {
    const Exec = require(path.join(__dirname, "..", "sim-execution.js"));
    let postedBody = null;
    global.GekkoApi.fetchSettingsVersions = async () => ({
      // Stale Control shape — versions only, no active_binding (pre-GST-99).
      versions: [
        {
          settings_version_id: "16",
          payload: {
            dataset_id: 1,
            seed: 99,
            manifest_sha256: "ab".repeat(32),
          },
        },
      ],
      active_binding: null,
    });
    global.GekkoApi.saveSettingsVersion = async () => ({
      settings_version_id: "16",
    });
    global.GekkoApi.bindSettingsVersion = async () => ({
      settings_version_id: "16",
    });
    global.GekkoApi.startRun = async (_scope, body) => {
      postedBody = body;
      return { run_id: "run-gst99", status: "queued", created: true, ...body };
    };
    global.window.GekkoApi = global.GekkoApi;
    global.window.GekkoRunBoard = {
      readEditableCurrent: () => ({
        dataset_id: 1,
        seed: 99,
        manifest_sha256: "ab".repeat(32),
      }),
    };
    global.document.getElementById = (id) =>
      id === "resultsBoardRoot" ? { id } : null;

    const run = await Exec.startRun(SIM_A, {
      confirm: false,
      navigateToDesk: false,
      saveCurrentBoard: true,
    });
    assert.equal(run.run_id, "run-gst99");
    assert.equal(String(postedBody.settings_version_id), "16");
  });

  it("GST-99: buildStartRunBody accepts numeric binding ids", () => {
    const Exec = require(path.join(__dirname, "..", "sim-execution.js"));
    const body = Exec.buildStartRunBody({
      active_binding: { settings_version_id: 16 },
      versions: [
        {
          settings_version_id: "16",
          payload: {
            dataset_id: 7,
            seed: 1,
            manifest_sha256: "cd".repeat(32),
          },
        },
      ],
    });
    assert.equal(body.settings_version_id, "16");
    assert.equal(body.dataset_id, 7);
  });
});
