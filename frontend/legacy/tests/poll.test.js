/**
 * P0.5 — hardened poll helper tests (Node harness, no network).
 * Run: node --test frontend/tests/poll.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const poll = require(path.join(__dirname, "..", "poll.js"));

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("computeBackoffMs", () => {
  it("is bounded and applies jitter from provided random", () => {
    const values = [];
    let i = 0;
    const random = () => {
      const seq = [0.0, 1.0, 0.5, 0.25];
      return seq[i++ % seq.length];
    };
    for (let attempt = 0; attempt < 6; attempt++) {
      values.push(
        poll.computeBackoffMs(attempt, {
          baseMs: 100,
          maxMs: 800,
          jitterRatio: 0.3,
          random,
        })
      );
    }
    assert.ok(values.every((v) => v >= 0 && v <= 800));
    // Deterministic with fixed random: not all equal once jitter engages.
    assert.ok(new Set(values).size >= 2);
  });
});

describe("fetchWithTimeout", () => {
  it("aborts slow fetch and raises TimeoutError", async () => {
    const fetchImpl = (_url, opts) =>
      new Promise((_resolve, reject) => {
        const t = setTimeout(() => reject(new Error("should have aborted")), 500);
        opts.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          },
          { once: true }
        );
      });

    await assert.rejects(
      () => poll.fetchWithTimeout("/x", { timeoutMs: 30, fetchImpl }),
      (err) => err.name === "TimeoutError" && err.timeoutMs === 30
    );
  });
});

describe("fetchWithRetry", () => {
  it("retries bounded times with backoff sleeps", async () => {
    let calls = 0;
    const sleeps = [];
    const fetchImpl = async () => {
      calls += 1;
      const err = new Error("boom");
      err.name = "TypeError";
      throw err;
    };
    await assert.rejects(
      () =>
        poll.fetchWithRetry("/x", {
          maxAttempts: 3,
          timeoutMs: 50,
          fetchImpl,
          baseMs: 10,
          maxMs: 40,
          jitterRatio: 0,
          random: () => 0,
          sleepImpl: async (ms) => {
            sleeps.push(ms);
          },
        }),
      /boom|timed out|exhausted/i
    );
    assert.equal(calls, 3);
    assert.equal(sleeps.length, 2);
    assert.ok(sleeps.every((ms) => ms >= 0 && ms <= 40));
  });

  it("does not retry ordinary 4xx", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: false, status: 400 };
    };
    const res = await poll.fetchWithRetry("/x", {
      maxAttempts: 4,
      fetchImpl,
      sleepImpl: async () => {
        throw new Error("should not sleep");
      },
    });
    assert.equal(res.status, 400);
    assert.equal(calls, 1);
  });
});

describe("createPoller", () => {
  it("prevents overlapping ticks while a slow request is in flight", async () => {
    let active = 0;
    let maxActive = 0;
    let ticks = 0;
    const started = [];
    const tickFn = async () => {
      ticks += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      started.push(Date.now());
      await delay(40);
      active -= 1;
    };
    const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
    const poller = poll.createPoller(tickFn, {
      intervalMs: 5,
      hiddenIntervalMs: 0,
      document: doc,
    });
    // Manual overlap probe: start then force concurrent runTick calls.
    const p1 = poller.runTick();
    const p2 = poller.runTick();
    const p3 = poller.runTick();
    await Promise.all([p1, p2, p3]);
    assert.equal(maxActive, 1);
    // Coalesce may run a trailing pass — still serialized.
    assert.ok(ticks >= 1 && ticks <= 2);
    poller.stop();
  });

  it("pauses scheduling while document is hidden (hiddenIntervalMs=0)", async () => {
    let ticks = 0;
    const listeners = {};
    const doc = {
      hidden: false,
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
      removeEventListener(type) {
        delete listeners[type];
      },
    };
    const poller = poll.createPoller(
      async () => {
        ticks += 1;
      },
      { intervalMs: 20, hiddenIntervalMs: 0, document: doc }
    );
    poller.start();
    await delay(5);
    const afterStart = ticks;
    assert.ok(afterStart >= 1);
    doc.hidden = true;
    listeners.visibilitychange?.();
    const frozen = ticks;
    await delay(60);
    assert.equal(ticks, frozen, "no further ticks while hidden+paused");
    doc.hidden = false;
    listeners.visibilitychange?.();
    await delay(10);
    assert.ok(ticks > frozen, "resumes when visible");
    poller.stop();
  });
});

describe("createEventSource", () => {
  it("delivers snapshot events and reconnects before falling back", async () => {
    const messages = [];
    let fallbackStarted = false;
    let constructCount = 0;
    class FakeES {
      constructor(url, opts) {
        this.url = url;
        this.opts = opts;
        this.listeners = {};
        constructCount += 1;
        FakeES.last = this;
      }
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      }
      close() {
        this.closed = true;
      }
    }
    FakeES.last = null;
    const fallbackPoller = {
      start() {
        fallbackStarted = true;
      },
      stop() {},
    };
    const esApi = poll.createEventSource("/api/events/dashboard", {
      EventSourceImpl: FakeES,
      withCredentials: true,
      fallbackPoller,
      maxReconnectAttempts: 2,
      reconnectBaseMs: 5,
      reconnectMaxMs: 10,
      random: () => 0,
      onMessage: (m) => messages.push(m),
    });
    esApi.start();
    assert.equal(FakeES.last.opts.withCredentials, true);
    FakeES.last.listeners.snapshot({ lastEventId: "9", data: JSON.stringify({ balance: 1 }) });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, "snapshot");
    assert.equal(messages[0].data.balance, 1);

    FakeES.last.onerror();
    assert.equal(fallbackStarted, false);
    assert.equal(esApi.usingFallback, false);
    await delay(30);
    assert.ok(constructCount >= 2, "reopened EventSource after error");

    for (let i = 0; i < 3; i++) {
      FakeES.last?.onerror?.();
      await delay(30);
    }
    assert.equal(fallbackStarted, true);
    assert.equal(esApi.usingFallback, true);
    esApi.stop();
  });

  it("treats server reconnect event as a soft reconnect", async () => {
    let constructCount = 0;
    class FakeES {
      constructor() {
        this.listeners = {};
        constructCount += 1;
        FakeES.last = this;
      }
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      }
      close() {
        this.closed = true;
      }
    }
    FakeES.last = null;
    const api = poll.createEventSource("/x", {
      EventSourceImpl: FakeES,
      maxReconnectAttempts: 3,
      reconnectBaseMs: 5,
      reconnectMaxMs: 10,
      random: () => 0,
      fallbackPoller: { start() {}, stop() {} },
    });
    api.start();
    FakeES.last.listeners.reconnect();
    await delay(30);
    assert.ok(constructCount >= 2);
    api.stop();
  });

  it("starts fallback immediately when EventSource is unavailable", () => {
    let started = false;
    const api = poll.createEventSource("/x", {
      EventSourceImpl: null,
      fallbackPoller: {
        start() {
          started = true;
        },
        stop() {},
      },
    });
    api.start();
    assert.equal(started, true);
    assert.equal(api.usingFallback, true);
  });
});
