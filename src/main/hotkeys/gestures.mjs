import * as node_perf_hooks from "node:perf_hooks";

const MODIFIER_TOKENS = /* @__PURE__ */ new Set(["ctrl", "control", "shift", "alt", "super", "win", "meta", "cmd"]);
function isUnmodifiedCombo(combo) {
  const tokens = combo.split("+").map((t) => t.trim()).filter(Boolean);
  return tokens.length > 0 && tokens.some((t) => !MODIFIER_TOKENS.has(t.toLowerCase())) && tokens.every((t) => !MODIFIER_TOKENS.has(t.toLowerCase()));
}
const DOUBLE_CLICK_SCREENSHOT_WINDOW_MS = 3e3;
const DOUBLE_CLICK_SCREENSHOT_COOLDOWN_MS = 1200;
class DoubleClickGesture {
  firstClickMs = null;
  lastEventMs = Number.NEGATIVE_INFINITY;
  cooldownUntilMs = Number.NEGATIVE_INFINITY;
  push(timeMs) {
    if (!Number.isFinite(timeMs)) return false;
    if (timeMs < this.lastEventMs) this.reset();
    this.lastEventMs = timeMs;
    if (timeMs < this.cooldownUntilMs) return false;
    if (this.firstClickMs === null || timeMs - this.firstClickMs > DOUBLE_CLICK_SCREENSHOT_WINDOW_MS) {
      this.firstClickMs = timeMs;
      return false;
    }
    this.firstClickMs = null;
    this.cooldownUntilMs = timeMs + DOUBLE_CLICK_SCREENSHOT_COOLDOWN_MS;
    return true;
  }
  reset() {
    this.firstClickMs = null;
    this.lastEventMs = Number.NEGATIVE_INFINITY;
    this.cooldownUntilMs = Number.NEGATIVE_INFINITY;
  }
}
const DEFAULT_QUADRUPLE_CLICK_WINDOW_MS = 500;
const DEFAULT_QUADRUPLE_CLICK_DRIFT_PX = 20;
const DEFAULT_QUADRUPLE_CLICK_COOLDOWN_MS = 1200;
function positiveFinite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
class QuadrupleClickGesture {
  maxIntervalMs;
  maxDriftPx;
  cooldownMs;
  firstClick = null;
  previousClickTimeMs = Number.NEGATIVE_INFINITY;
  clickCount = 0;
  cooldownUntilMs = Number.NEGATIVE_INFINITY;
  lastEventTimeMs = Number.NEGATIVE_INFINITY;
  constructor(options = {}) {
    this.maxIntervalMs = positiveFinite(
      options.maxIntervalMs,
      DEFAULT_QUADRUPLE_CLICK_WINDOW_MS
    );
    this.maxDriftPx = positiveFinite(
      options.maxDriftPx,
      DEFAULT_QUADRUPLE_CLICK_DRIFT_PX
    );
    this.cooldownMs = positiveFinite(
      options.cooldownMs,
      DEFAULT_QUADRUPLE_CLICK_COOLDOWN_MS
    );
  }
  push(sample) {
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.timeMs)) {
      return false;
    }
    if (sample.timeMs < this.lastEventTimeMs) {
      this.reset();
      this.cooldownUntilMs = Number.NEGATIVE_INFINITY;
    }
    this.lastEventTimeMs = sample.timeMs;
    if (sample.timeMs < this.cooldownUntilMs) return false;
    if (!this.firstClick) {
      this.startSequence(sample);
      return false;
    }
    const adjacentIntervalMs = sample.timeMs - this.previousClickTimeMs;
    const distanceSquared = (sample.x - this.firstClick.x) ** 2 + (sample.y - this.firstClick.y) ** 2;
    if (adjacentIntervalMs > this.maxIntervalMs || distanceSquared > this.maxDriftPx ** 2) {
      this.startSequence(sample);
      return false;
    }
    this.clickCount += 1;
    this.previousClickTimeMs = sample.timeMs;
    if (this.clickCount < 4) return false;
    this.firstClick = null;
    this.previousClickTimeMs = Number.NEGATIVE_INFINITY;
    this.clickCount = 0;
    this.cooldownUntilMs = sample.timeMs + this.cooldownMs;
    return true;
  }
  reset() {
    this.firstClick = null;
    this.previousClickTimeMs = Number.NEGATIVE_INFINITY;
    this.clickCount = 0;
    this.cooldownUntilMs = Number.NEGATIVE_INFINITY;
    this.lastEventTimeMs = Number.NEGATIVE_INFINITY;
  }
  startSequence(sample) {
    this.firstClick = sample;
    this.previousClickTimeMs = sample.timeMs;
    this.clickCount = 1;
  }
}
const DEFAULT_QUADRUPLE_CLICK_POLL_INTERVAL_MS = 10;
const LONG_PRESS_SCREENSHOT_HOLD_MS = 3e3;
class PollingQuadrupleClickListener {
  onTrigger;
  logger;
  gesture;
  doubleClickGesture = new DoubleClickGesture();
  platform;
  supportedPlatform;
  platformLabel;
  now;
  defer;
  loadNativeBindings;
  setPollInterval;
  clearPollInterval;
  native = null;
  pollHandle = null;
  phase;
  lastError;
  generation = 0;
  acceptingClicks = false;
  wasLeftButtonDown = false;
  pressStarted = null;
  enabledGestures;
  constructor(options, dependencies) {
    this.onTrigger = options.onTrigger;
    this.logger = options.logger ?? console;
    this.gesture = new QuadrupleClickGesture(options.gesture);
    this.enabledGestures = options.enabledGestures ?? { quadrupleClick: true, longPress: false };
    this.platform = dependencies.platform ?? process.platform;
    this.supportedPlatform = options.supportedPlatform;
    this.platformLabel = options.platformLabel;
    this.now = dependencies.now ?? (() => node_perf_hooks.performance.now());
    this.defer = dependencies.defer ?? queueMicrotask;
    this.loadNativeBindings = dependencies.loadNativeBindings;
    this.setPollInterval = dependencies.setPollInterval ?? ((callback, intervalMs) => setInterval(callback, intervalMs));
    this.clearPollInterval = dependencies.clearPollInterval ?? ((handle) => clearInterval(handle));
    this.phase = this.platform === this.supportedPlatform ? "stopped" : "unsupported";
  }
  getStatus() {
    return this.lastError ? { phase: this.phase, error: this.lastError } : { phase: this.phase };
  }
  setEnabledGestures(next) {
    if (next.doubleClick === this.enabledGestures.doubleClick && next.quadrupleClick === this.enabledGestures.quadrupleClick && next.longPress === this.enabledGestures.longPress) return;
    this.enabledGestures = { ...next };
    this.generation += 1;
    this.resetClickGestures();
    this.pressStarted = null;
  }
  start() {
    if (this.platform !== this.supportedPlatform) return this.getStatus();
    if (this.phase === "running" && this.pollHandle !== null) {
      return this.getStatus();
    }
    if (this.pollHandle !== null) {
      const cleanup = this.stop();
      if (cleanup.phase === "failed") return cleanup;
    }
    this.resetClickGestures();
    this.pressStarted = null;
    this.lastError = void 0;
    this.acceptingClicks = false;
    try {
      const native = this.native ?? this.loadNativeBindings();
      this.native = native;
      this.wasLeftButtonDown = native.isLeftButtonDown();
      this.generation += 1;
      this.acceptingClicks = true;
      this.phase = "running";
      this.pollHandle = this.setPollInterval(
        () => this.poll(),
        DEFAULT_QUADRUPLE_CLICK_POLL_INTERVAL_MS
      );
      if (this.pollHandle === null || this.pollHandle === void 0) {
        throw new Error("poll timer was not created");
      }
      return this.getStatus();
    } catch (error) {
      this.failAndStop(
        `${this.platformLabel} mouse polling is unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
      return this.getStatus();
    }
  }
  stop() {
    if (this.platform !== this.supportedPlatform) return this.getStatus();
    this.acceptingClicks = false;
    this.generation += 1;
    this.resetClickGestures();
    this.pressStarted = null;
    this.wasLeftButtonDown = false;
    if (this.pollHandle !== null) {
      try {
        this.clearPollInterval(this.pollHandle);
        this.pollHandle = null;
      } catch (error) {
        this.fail(
          `Mouse polling cleanup failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return this.getStatus();
      }
    }
    this.phase = "stopped";
    this.lastError = void 0;
    return this.getStatus();
  }
  poll() {
    const native = this.native;
    if (!native || !this.acceptingClicks || this.phase !== "running") return;
    try {
      const isDown = native.isLeftButtonDown();
      const wasDown = this.wasLeftButtonDown;
      this.wasLeftButtonDown = isDown;
      if (isDown === wasDown) return;
      if (!isDown) {
        const press = this.pressStarted;
        this.pressStarted = null;
        if (!this.enabledGestures.longPress || !press) return;
        const releasedAt = this.now();
        if (!Number.isFinite(releasedAt) || releasedAt < press.timeMs) {
          this.resetClickGestures();
          return;
        }
        const sample2 = { ...press, timeMs: releasedAt };
        if (releasedAt - press.timeMs >= LONG_PRESS_SCREENSHOT_HOLD_MS) {
          this.resetClickGestures();
          this.queueTrigger(sample2);
        } else if (this.pushClickGesture(press)) {
          this.queueTrigger(sample2);
        }
        return;
      }
      if (!this.enabledGestures.doubleClick && !this.enabledGestures.quadrupleClick && !this.enabledGestures.longPress) return;
      const position = native.getCursorPosition();
      if (!position) {
        throw new Error("Cursor position unavailable");
      }
      const sample = { ...position, timeMs: this.now() };
      if (!Number.isFinite(sample.timeMs)) return;
      if (this.enabledGestures.longPress) {
        this.pressStarted = sample;
      } else if (this.pushClickGesture(sample)) {
        this.queueTrigger(sample);
      }
    } catch (error) {
      this.failAndStop(
        `${this.platformLabel} mouse polling failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  pushClickGesture(sample) {
    if (this.enabledGestures.doubleClick === true) {
      return this.doubleClickGesture.push(sample.timeMs);
    }
    return this.enabledGestures.quadrupleClick && this.gesture.push(sample);
  }
  resetClickGestures() {
    this.gesture.reset();
    this.doubleClickGesture.reset();
  }
  queueTrigger(sample) {
    const generation = this.generation;
    this.defer(() => {
      if (!this.acceptingClicks || this.phase !== "running" || generation !== this.generation) return;
      try {
        this.onTrigger(sample);
      } catch (error) {
        this.logger.warn("[zhiyue:mouse-screenshot] trigger callback failed:", error);
      }
    });
  }
  failAndStop(message) {
    this.acceptingClicks = false;
    this.generation += 1;
    this.resetClickGestures();
    this.pressStarted = null;
    this.wasLeftButtonDown = false;
    if (this.pollHandle !== null) {
      try {
        this.clearPollInterval(this.pollHandle);
        this.pollHandle = null;
      } catch (error) {
        this.logger.warn(
          "[zhiyue:quadruple-click] polling cleanup after failure failed:",
          error
        );
      }
    }
    this.fail(message);
  }
  fail(message) {
    this.acceptingClicks = false;
    this.phase = "failed";
    this.lastError = message;
    this.logger.warn(`[zhiyue:quadruple-click] ${message}`);
  }
}
const VK_LBUTTON = 1;
const KEY_DOWN_MASK = 32768;
function loadWindowsMousePollingBindings() {
  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");
  const pointType = koffi.struct("ClimbQuadClickPollingPoint", {
    x: "long",
    y: "long"
  });
  const getAsyncKeyState = user32.func(
    "__stdcall",
    "GetAsyncKeyState",
    "int16_t",
    ["int"]
  );
  const getCursorPos = user32.func(
    "__stdcall",
    "GetCursorPos",
    "int",
    [koffi.out(koffi.pointer(pointType))]
  );
  return {
    isLeftButtonDown() {
      return (Number(getAsyncKeyState(VK_LBUTTON)) & KEY_DOWN_MASK) !== 0;
    },
    getCursorPosition() {
      const point = { x: 0, y: 0 };
      const ok = Number(getCursorPos(point)) !== 0;
      if (!ok) return null;
      const x = Number(point.x);
      const y = Number(point.y);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }
  };
}
class WindowsQuadrupleClickListener extends PollingQuadrupleClickListener {
  constructor(options, dependencies = {}) {
    super(
      { ...options, supportedPlatform: "win32", platformLabel: "Windows" },
      { ...dependencies, loadNativeBindings: dependencies.loadNativeBindings ?? loadWindowsMousePollingBindings }
    );
  }
}
function createWindowsQuadrupleClickListener(options) {
  return new WindowsQuadrupleClickListener(options);
}
function loadMacMousePollingBindings(readCursor = () => require("electron").screen.getCursorScreenPoint()) {
  const koffi = require("koffi");
  const coreGraphics = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
  const getButtonState = coreGraphics.func("CGEventSourceButtonState", "bool", ["int32_t", "uint32_t"]);
  const kCGEventSourceStateCombinedSessionState = 0;
  const kCGMouseButtonLeft = 0;
  return {
    isLeftButtonDown: () => Boolean(getButtonState(kCGEventSourceStateCombinedSessionState, kCGMouseButtonLeft)),
    getCursorPosition() {
      const point = readCursor();
      return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
    }
  };
}
class MacQuadrupleClickListener extends PollingQuadrupleClickListener {
  constructor(options, dependencies = {}) {
    super(
      { ...options, supportedPlatform: "darwin", platformLabel: "macOS" },
      { ...dependencies, loadNativeBindings: dependencies.loadNativeBindings ?? loadMacMousePollingBindings }
    );
  }
}
function createMacQuadrupleClickListener(options) {
  return new MacQuadrupleClickListener(options);
}

export { MODIFIER_TOKENS, isUnmodifiedCombo, DOUBLE_CLICK_SCREENSHOT_WINDOW_MS, DOUBLE_CLICK_SCREENSHOT_COOLDOWN_MS, DoubleClickGesture, DEFAULT_QUADRUPLE_CLICK_WINDOW_MS, DEFAULT_QUADRUPLE_CLICK_DRIFT_PX, DEFAULT_QUADRUPLE_CLICK_COOLDOWN_MS, positiveFinite, QuadrupleClickGesture, DEFAULT_QUADRUPLE_CLICK_POLL_INTERVAL_MS, LONG_PRESS_SCREENSHOT_HOLD_MS, PollingQuadrupleClickListener, VK_LBUTTON, KEY_DOWN_MASK, loadWindowsMousePollingBindings, WindowsQuadrupleClickListener, createWindowsQuadrupleClickListener, loadMacMousePollingBindings, MacQuadrupleClickListener, createMacQuadrupleClickListener };
