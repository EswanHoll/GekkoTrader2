/**
 * P0.5 hardened dashboard poll helper.
 *
 * - Finite fetch timeout via AbortController
 * - Bounded exponential retry with jitter
 * - Strict overlap prevention (no concurrent polls)
 * - Visibility-aware: pause/reduce when document.hidden
 *
 * Works in browser (window.GekkoPoll) and Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GekkoPoll = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function computeBackoffMs(attempt, opts) {
    const base = opts.baseMs ?? 250;
    const cap = opts.maxMs ?? 8_000;
    const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt)));
    const jitterRatio = opts.jitterRatio ?? 0.3;
    const jitter = exp * jitterRatio * (opts.random?.() ?? Math.random());
    return Math.floor(exp - jitter / 2 + (opts.random?.() ?? Math.random()) * jitter);
  }

  /**
   * Fetch with AbortController timeout. Does not retry.
   */
  async function fetchWithTimeout(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 12_000;
    const fetchImpl = options.fetchImpl || fetch;
    const controller = options.controller || new AbortController();
    const externalSignal = options.signal;
    let onAbort = null;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else {
        onAbort = () => controller.abort();
        externalSignal.addEventListener("abort", onAbort, { once: true });
      }
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        ...options,
        signal: controller.signal,
      });
      return res;
    } catch (err) {
      if (err?.name === "AbortError") {
        const e = new Error(`Request timed out after ${timeoutMs}ms`);
        e.name = "TimeoutError";
        e.timeoutMs = timeoutMs;
        throw e;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (externalSignal && onAbort) {
        externalSignal.removeEventListener("abort", onAbort);
      }
    }
  }

  /**
   * Retry wrapper with bounded exponential backoff + jitter.
   * Only retries network/timeout failures (not HTTP 4xx except 408/429).
   */
  async function fetchWithRetry(url, options = {}) {
    const maxAttempts = clamp(Number(options.maxAttempts) || 3, 1, 6);
    const sleep = options.sleepImpl || ((ms) => new Promise((r) => setTimeout(r, ms)));
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetchWithTimeout(url, options);
        if (!res.ok && (res.status === 408 || res.status === 429 || res.status >= 500)) {
          lastErr = new Error(`HTTP ${res.status}`);
          lastErr.status = res.status;
          if (attempt + 1 >= maxAttempts) throw lastErr;
        } else {
          return res;
        }
      } catch (err) {
        lastErr = err;
        if (attempt + 1 >= maxAttempts) throw err;
        if (err?.status && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
          throw err;
        }
      }
      const delay = computeBackoffMs(attempt, options);
      await sleep(delay);
    }
    throw lastErr || new Error("fetchWithRetry exhausted");
  }

  /**
   * Create a poller that prevents overlapping ticks and respects visibility.
   */
  function createPoller(tickFn, options = {}) {
    const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 30_000;
    const hiddenIntervalMs =
      options.hiddenIntervalMs === 0
        ? 0
        : Number(options.hiddenIntervalMs) > 0
          ? Number(options.hiddenIntervalMs)
          : 0; // default: pause when hidden
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    let inFlight = null;
    let timer = null;
    let stopped = false;
    let coalesce = false;

    function isHidden() {
      return !!(doc && doc.hidden);
    }

    async function runTick() {
      if (stopped) return;
      if (inFlight) {
        coalesce = true;
        return inFlight;
      }
      inFlight = (async () => {
        try {
          await tickFn();
        } finally {
          inFlight = null;
          if (coalesce && !stopped) {
            coalesce = false;
            // One trailing pass after the slow request finishes — still serialized.
            await runTick();
          }
        }
      })();
      return inFlight;
    }

    function clearTimer() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleNext() {
      clearTimer();
      if (stopped) return;
      const hidden = isHidden();
      if (hidden && hiddenIntervalMs === 0) {
        return; // paused until visible
      }
      const wait = hidden ? hiddenIntervalMs : intervalMs;
      timer = setTimeout(async () => {
        timer = null;
        await runTick();
        scheduleNext();
      }, wait);
    }

    function onVisibility() {
      if (stopped) return;
      if (!isHidden()) {
        // Resume promptly when tab becomes visible.
        clearTimer();
        runTick().finally(scheduleNext);
      } else {
        scheduleNext();
      }
    }

    function start() {
      stopped = false;
      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("visibilitychange", onVisibility);
      }
      runTick().finally(scheduleNext);
      return api;
    }

    function stop() {
      stopped = true;
      clearTimer();
      if (doc && typeof doc.removeEventListener === "function") {
        doc.removeEventListener("visibilitychange", onVisibility);
      }
    }

    const api = {
      start,
      stop,
      runTick,
      get inFlight() {
        return inFlight;
      },
      get isHidden() {
        return isHidden();
      },
    };
    return api;
  }

  function createEventSource(url, options = {}) {
    const EventSourceImpl = options.EventSourceImpl || (typeof EventSource !== "undefined" ? EventSource : null);
    const onMessage = options.onMessage || (() => {});
    const onError = options.onError || (() => {});
    const fallbackPoller = options.fallbackPoller || null;
    const withCredentials = options.withCredentials !== false;
    const maxReconnectAttempts =
      Number(options.maxReconnectAttempts) >= 0 ? Number(options.maxReconnectAttempts) : 5;
    const random = options.random;
    let es = null;
    let stopped = false;
    let usingFallback = false;
    let reconnectAttempts = 0;
    let reconnectTimer = null;

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function startFallback() {
      if (usingFallback || stopped) return;
      usingFallback = true;
      clearReconnectTimer();
      if (es) {
        try {
          es.close();
        } catch (_) {}
        es = null;
      }
      if (fallbackPoller && typeof fallbackPoller.start === "function") {
        fallbackPoller.start();
      }
    }

    function scheduleReconnect(reason) {
      if (stopped || usingFallback) return;
      if (es) {
        try {
          es.close();
        } catch (_) {}
        es = null;
      }
      if (reconnectAttempts >= maxReconnectAttempts) {
        onError(new Error(reason || "EventSource reconnect exhausted"));
        startFallback();
        return;
      }
      const attempt = reconnectAttempts;
      reconnectAttempts += 1;
      const delay = computeBackoffMs(attempt, {
        baseMs: options.reconnectBaseMs ?? 500,
        maxMs: options.reconnectMaxMs ?? 8_000,
        random,
      });
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (stopped || usingFallback) return;
        openSocket();
      }, delay);
    }

    function openSocket() {
      if (stopped || usingFallback) return;
      if (!EventSourceImpl) {
        startFallback();
        return;
      }
      try {
        // withCredentials so HttpOnly control cookies ride along on cross-origin Pages → Fly.
        es = new EventSourceImpl(url, { withCredentials });
        es.addEventListener("snapshot", (ev) => {
          reconnectAttempts = 0;
          try {
            onMessage({ type: "snapshot", id: ev.lastEventId, data: JSON.parse(ev.data) });
          } catch (err) {
            onError(err);
          }
        });
        es.addEventListener("heartbeat", (ev) => {
          reconnectAttempts = 0;
          try {
            onMessage({ type: "heartbeat", data: JSON.parse(ev.data) });
          } catch (_) {}
        });
        es.addEventListener("reconnect", () => {
          scheduleReconnect("EventSource reconnect");
        });
        es.onerror = () => {
          scheduleReconnect("EventSource error");
        };
      } catch (err) {
        onError(err);
        scheduleReconnect("EventSource open failed");
      }
    }

    function start() {
      stopped = false;
      usingFallback = false;
      reconnectAttempts = 0;
      clearReconnectTimer();
      if (!EventSourceImpl) {
        startFallback();
        return api;
      }
      openSocket();
      return api;
    }

    function stop() {
      stopped = true;
      clearReconnectTimer();
      if (es) {
        try {
          es.close();
        } catch (_) {}
        es = null;
      }
      if (fallbackPoller && typeof fallbackPoller.stop === "function") {
        fallbackPoller.stop();
      }
    }

    const api = {
      start,
      stop,
      get usingFallback() {
        return usingFallback;
      },
      get reconnectAttempts() {
        return reconnectAttempts;
      },
    };
    return api;
  }

  return {
    computeBackoffMs,
    fetchWithTimeout,
    fetchWithRetry,
    createPoller,
    createEventSource,
  };
});
