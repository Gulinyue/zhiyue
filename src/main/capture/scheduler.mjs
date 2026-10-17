import { CAPTURE_TIMEOUT } from "./constants.mjs";

const DEFAULT_SCREENSHOT_CAPTURE_TIMEOUT_MS = 8e3;
const systemClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle)
};
class ScreenshotCaptureTimeoutError extends Error {
  code = CAPTURE_TIMEOUT;
  constructor(message = CAPTURE_TIMEOUT) {
    super(message);
    this.name = "ScreenshotCaptureTimeoutError";
  }
}
class CaptureAttempt {
  generation;
  requestId;
  invalidatedBy = null;
  invalidationCallbacks = /* @__PURE__ */ new Set();
  constructor(generation, requestId) {
    this.generation = generation;
    this.requestId = requestId;
  }
  assertActive() {
    if (this.invalidatedBy) throw this.invalidatedBy;
  }
  onInvalidate(cleanup) {
    if (this.invalidatedBy) {
      cleanup();
      return () => {
      };
    }
    this.invalidationCallbacks.add(cleanup);
    return () => this.invalidationCallbacks.delete(cleanup);
  }
  invalidate(error) {
    if (this.invalidatedBy) return;
    this.invalidatedBy = error;
    const callbacks = [...this.invalidationCallbacks];
    this.invalidationCallbacks.clear();
    for (const callback of callbacks) {
      try {
        callback();
      } catch {
      }
    }
  }
  complete() {
    this.invalidationCallbacks.clear();
  }
}
class ScreenshotRecoveryScheduler {
  constructor(timeoutMs = DEFAULT_SCREENSHOT_CAPTURE_TIMEOUT_MS, clock = systemClock) {
    this.timeoutMs = timeoutMs;
    this.clock = clock;
    this.snapshot = {
      state: "healthy",
      generation: 0,
      consecutiveTimeouts: 0,
      recoveryCount: 0,
      lastEvent: "ready",
      lastTransitionAt: clock.now()
    };
  }
  generation = 0;
  requestId = 0;
  laneTail = Promise.resolve();
  activeAttempts = /* @__PURE__ */ new Map();
  snapshot;
  run(operation) {
    const scheduledGeneration = this.generation;
    const requestId = ++this.requestId;
    const result = this.laneTail.then(() => {
      if (scheduledGeneration !== this.generation) {
        throw new ScreenshotCaptureTimeoutError("Screenshot capture lane expired");
      }
      return this.runBoundedAttempt(scheduledGeneration, requestId, operation);
    });
    this.laneTail = result.then(
      () => void 0,
      () => void 0
    );
    return result;
  }
  getSnapshot() {
    return { ...this.snapshot };
  }
  /**
   * Invalidates in-flight and queued work, synchronously releases registered
   * resources, and opens a fresh lane for the next screenshot.
   */
  reset() {
    const error = new ScreenshotCaptureTimeoutError("Screenshot subsystem reset");
    this.rotateLane("manual-reset", false);
    for (const active of [...this.activeAttempts.values()]) active.expire(error);
    return this.getSnapshot();
  }
  async runBoundedAttempt(generation, requestId, operation) {
    const attempt = new CaptureAttempt(generation, requestId);
    let rejectExpiry;
    let expired = false;
    const expiry = new Promise((_resolve, reject) => {
      rejectExpiry = reject;
    });
    const expire = (error) => {
      if (expired) return;
      expired = true;
      attempt.invalidate(error);
      rejectExpiry(error);
    };
    this.activeAttempts.set(requestId, { attempt, expire });
    const timeoutHandle = this.clock.setTimeout(() => {
      if (generation === this.generation) this.rotateLane("timeout", true);
      expire(new ScreenshotCaptureTimeoutError());
    }, this.timeoutMs);
    const underlying = Promise.resolve().then(() => operation(attempt));
    try {
      const value = await Promise.race([underlying, expiry]);
      attempt.assertActive();
      if (generation === this.generation && this.snapshot.state === "degraded") {
        this.snapshot = {
          state: "healthy",
          generation: this.generation,
          consecutiveTimeouts: 0,
          recoveryCount: this.snapshot.recoveryCount + 1,
          lastEvent: "recovered",
          lastTransitionAt: this.clock.now()
        };
      }
      attempt.complete();
      return value;
    } finally {
      this.clock.clearTimeout(timeoutHandle);
      this.activeAttempts.delete(requestId);
    }
  }
  rotateLane(event, countTimeout) {
    this.generation += 1;
    this.laneTail = Promise.resolve();
    this.snapshot = {
      state: "degraded",
      generation: this.generation,
      consecutiveTimeouts: countTimeout ? this.snapshot.consecutiveTimeouts + 1 : this.snapshot.consecutiveTimeouts,
      recoveryCount: this.snapshot.recoveryCount,
      lastEvent: event,
      lastTransitionAt: this.clock.now()
    };
  }
}
async function completeDisplayMediaRequest(scheduler, getSources, callback) {
  let selection = {};
  try {
    const source = await scheduler.run(async (attempt) => {
      attempt.assertActive();
      const sources = await getSources();
      attempt.assertActive();
      return sources[0];
    });
    if (source) selection = { video: source, audio: "loopback" };
  } catch {
    selection = {};
  }
  try {
    callback(selection);
  } catch {
  }
}
async function runScreenshotRecoveryWarmup(scheduler, warmup) {
  try {
    await scheduler.run(async (attempt) => {
      attempt.assertActive();
      await warmup();
      attempt.assertActive();
    });
  } catch {
  }
}
class ScreenshotVisibilityLeases {
  constructor(window) {
    this.window = window;
  }
  active = /* @__PURE__ */ new Set();
  nextLeaseId = 0;
  hiddenByCapture = false;
  acquire() {
    const leaseId = ++this.nextLeaseId;
    let didHideWindow = false;
    if (this.active.size === 0) {
      this.hiddenByCapture = this.window.isVisible();
      if (this.hiddenByCapture) {
        this.window.hide();
        didHideWindow = true;
      }
    }
    this.active.add(leaseId);
    let released = false;
    return {
      didHideWindow,
      release: () => {
        if (released) return;
        released = true;
        if (!this.active.delete(leaseId)) return;
        if (this.active.size === 0 && this.hiddenByCapture) {
          this.hiddenByCapture = false;
          this.window.reveal();
        }
      }
    };
  }
}

export { DEFAULT_SCREENSHOT_CAPTURE_TIMEOUT_MS, systemClock, ScreenshotCaptureTimeoutError, CaptureAttempt, ScreenshotRecoveryScheduler, completeDisplayMediaRequest, runScreenshotRecoveryWarmup, ScreenshotVisibilityLeases };
