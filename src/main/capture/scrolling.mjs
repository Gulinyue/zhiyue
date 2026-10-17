import { CAPTURE_LONG_UNAVAILABLE, MAX_SCROLL_SCREENSHOT_IMAGES, CAPTURE_LONG_INTERRUPTED } from "./constants.mjs";

const MAX_LONG_SCREENSHOT_PIXELS = 16e6;
const MAX_SCROLL_SCREENSHOT_TOTAL_PIXELS = 32e6;
const LONG_SCREENSHOT_SETTLE_MS = 340;
class LongScreenshotError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function valid(frame) {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 64 || frame.height < 80 || frame.width * frame.height > MAX_LONG_SCREENSHOT_PIXELS || frame.pixels.length !== frame.width * frame.height * 4) {
    throw new LongScreenshotError(CAPTURE_LONG_UNAVAILABLE, "截图分辨率超出安全范围，请降低截屏显示器分辨率后重试");
  }
}
function hasScreenContentChanged(a, b) {
  valid(a);
  valid(b);
  if (a.width !== b.width || a.height !== b.height) return true;
  const stepX = Math.max(1, Math.floor(a.width / 100)), stepY = Math.max(1, Math.floor(a.height / 220));
  let changed = 0, sampled = 0;
  for (let y = 2; y < a.height - 2; y += stepY) for (let x = 2; x < a.width - 2; x += stepX) {
    const p = (y * a.width + x) * 4;
    sampled++;
    const difference = (Math.abs(a.pixels[p] - b.pixels[p]) + Math.abs(a.pixels[p + 1] - b.pixels[p + 1]) + Math.abs(a.pixels[p + 2] - b.pixels[p + 2])) / 3;
    if (difference > 18) changed++;
  }
  return changed >= Math.max(8, sampled * 8e-4);
}
async function collectScrollingScreenshots(first, deps) {
  valid(first);
  deps.assertAllowed();
  let previous = first;
  const frames = [first];
  let pixels = first.width * first.height;
  while (frames.length < MAX_SCROLL_SCREENSHOT_IMAGES) {
    deps.assertAllowed();
    if (deps.canContinue?.() === false || deps.scroll() === false) return frames;
    await deps.settle(LONG_SCREENSHOT_SETTLE_MS);
    deps.assertAllowed();
    if (deps.canContinue?.() === false) return frames;
    const next = await deps.capture();
    deps.assertAllowed();
    if (deps.canContinue?.() === false) return frames;
    if (!hasScreenContentChanged(previous, next)) return frames;
    if (pixels + next.width * next.height > MAX_SCROLL_SCREENSHOT_TOTAL_PIXELS) return frames;
    frames.push(next);
    previous = next;
    pixels += next.width * next.height;
  }
  return frames;
}
let nativeBindings = null;
function createLongScreenshotScroller(bounds, isClimbFocused, dependencies) {
  if (isClimbFocused()) return null;
  let bindings;
  try {
    bindings = dependencies?.bindings ?? loadLongScrollBindings();
  } catch {
    return null;
  }
  const snapshot = () => {
    try {
      return bindings.snapshot();
    } catch {
      return null;
    }
  };
  const ownProcessId = process.pid;
  const initial = snapshot();
  if (!initial || initial.processId === ownProcessId || !initial.identity || initial.cursor.x < bounds.x || initial.cursor.x >= bounds.x + bounds.width || initial.cursor.y < bounds.y || initial.cursor.y >= bounds.y + bounds.height) {
    return null;
  }
  const assertSafe = () => {
    if (snapshot()?.escapePressed) throw new LongScreenshotError(CAPTURE_LONG_INTERRUPTED, "已取消本次滚动截图");
  };
  const canScroll = () => {
    const current = snapshot();
    return Boolean(current && !isClimbFocused() && current.identity === initial.identity && current.processId === initial.processId && current.hoveringTarget && !current.inputBusy && current.cursor.x >= bounds.x && current.cursor.x < bounds.x + bounds.width && current.cursor.y >= bounds.y && current.cursor.y < bounds.y + bounds.height);
  };
  return { assertSafe, canScroll, scrollDown() {
    assertSafe();
    if (!canScroll()) return false;
    try {
      const sent = bindings.scrollDown() !== false;
      assertSafe();
      return sent;
    } catch (error) {
      if (error instanceof LongScreenshotError && error.code === CAPTURE_LONG_INTERRUPTED) throw error;
      return false;
    }
  } };
}
function unavailable(message) {
  return new LongScreenshotError(CAPTURE_LONG_UNAVAILABLE, message);
}
function loadLongScrollBindings() {
  if (nativeBindings) return nativeBindings;
  try {
    if (process.platform === "win32") nativeBindings = loadWindowsLongScrollBindings();
    else if (process.platform === "darwin") {
      if (require("electron").systemPreferences.getMediaAccessStatus("screen") !== "granted") {
        throw unavailable("macOS 滚动截图需要屏幕录制权限；请先在系统设置中授权后重试");
      }
      if (!require("electron").systemPreferences.isTrustedAccessibilityClient(false)) {
        throw unavailable("macOS 滚动截图需要辅助功能权限；请在系统设置中授权后重试，或使用普通截图");
      }
      nativeBindings = loadMacLongScrollBindings();
    } else throw unavailable("此系统暂不支持滚动截图，请使用普通截图");
    return nativeBindings;
  } catch (error) {
    if (error instanceof LongScreenshotError) throw error;
    throw unavailable("系统滚动接口不可用，请使用普通截图");
  }
}
function loadWindowsLongScrollBindings(readCursor = () => require("electron").screen.getCursorScreenPoint()) {
  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");
  const point = koffi.struct("ClimbLongCapturePoint", { x: "long", y: "long" });
  const getForeground = user32.func("void* __stdcall GetForegroundWindow()");
  const getPid = user32.func("__stdcall", "GetWindowThreadProcessId", "uint32_t", ["void *", koffi.out(koffi.pointer("uint32_t"))]);
  const getCursor = user32.func("__stdcall", "GetCursorPos", "int", [koffi.out(koffi.pointer(point))]);
  const windowFromPoint = user32.func("__stdcall", "WindowFromPoint", "void *", [point]);
  const getAncestor = user32.func("void* __stdcall GetAncestor(void* window, unsigned int flags)");
  const getKey = user32.func("int16_t __stdcall GetAsyncKeyState(int key)");
  const mouse = koffi.struct("ClimbLongMouseInput", { dx: "long", dy: "long", mouseData: "uint32_t", dwFlags: "uint32_t", time: "uint32_t", dwExtraInfo: "uintptr_t" });
  const keyboard = koffi.struct("ClimbLongKeyboardInput", { wVk: "uint16_t", wScan: "uint16_t", dwFlags: "uint32_t", time: "uint32_t", dwExtraInfo: "uintptr_t" });
  const hardware = koffi.struct("ClimbLongHardwareInput", { uMsg: "uint32_t", wParamL: "uint16_t", wParamH: "uint16_t" });
  const input = koffi.struct("ClimbLongInput", { type: "uint32_t", u: koffi.union({ mi: mouse, ki: keyboard, hi: hardware }) });
  const send = user32.func("unsigned int __stdcall SendInput(unsigned int count, ClimbLongInput* inputs, int size)");
  const keyDown = (key) => (Number(getKey(key)) & 32768) !== 0;
  return {
    snapshot() {
      const window = getForeground();
      if (!window) return null;
      const pid = [0];
      getPid(window, pid);
      const physical = { x: 0, y: 0 };
      if (!getCursor(physical)) return null;
      const root = getAncestor(windowFromPoint(physical), 2);
      const cursor = readCursor();
      return {
        identity: String(koffi.address(window)),
        processId: Number(pid[0]),
        cursor,
        hoveringTarget: root != null && koffi.address(root) === koffi.address(window),
        inputBusy: [17, 16, 18, 91, 92].some(keyDown),
        escapePressed: keyDown(27)
      };
    },
    scrollDown() {
      const sent = send(1, [{ type: 0, u: { mi: { dx: 0, dy: 0, mouseData: -360 >>> 0, dwFlags: 2048, time: 0, dwExtraInfo: 0 } } }], koffi.sizeof(input));
      if (Number(sent) !== 1) throw unavailable("系统未接受滚动操作，可能存在权限或应用兼容限制；请分次单张截图");
    }
  };
}
function loadMacLongScrollBindings(readCursor = () => require("electron").screen.getCursorScreenPoint()) {
  const koffi = require("koffi");
  koffi.load("/System/Library/Frameworks/AppKit.framework/AppKit");
  const objc = koffi.load("/usr/lib/libobjc.A.dylib");
  const cg = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
  const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
  const getClass = objc.func("objc_getClass", "void *", ["str"]);
  const selector = objc.func("sel_registerName", "void *", ["str"]);
  const msgPointer = objc.func("objc_msgSend", "void *", ["void *", "void *"]);
  const msgPid = objc.func("objc_msgSend", "int32_t", ["void *", "void *"]);
  const poolPush = objc.func("objc_autoreleasePoolPush", "void *", []);
  const poolPop = objc.func("objc_autoreleasePoolPop", "void", ["void *"]);
  const workspaceClass = getClass("NSWorkspace");
  const shared = selector("sharedWorkspace"), front = selector("frontmostApplication"), pidSelector = selector("processIdentifier");
  const list = cg.func("CGWindowListCopyWindowInfo", "void *", ["uint32_t", "uint32_t"]);
  const count = cf.func("CFArrayGetCount", "long", ["void *"]);
  const item = cf.func("CFArrayGetValueAtIndex", "void *", ["void *", "long"]);
  const value = cf.func("CFDictionaryGetValue", "void *", ["void *", "void *"]);
  const number = cf.func("CFNumberGetValue", "bool", ["void *", "int", koffi.out(koffi.pointer("int32_t"))]);
  const release = cf.func("CFRelease", "void", ["void *"]);
  const key = (name) => koffi.decode(cg.symbol(name, "void *"), "void *");
  const ownerKey = key("kCGWindowOwnerPID"), layerKey = key("kCGWindowLayer"), idKey = key("kCGWindowNumber"), boundsKey = key("kCGWindowBounds");
  const readNumber = (dict, field) => {
    const target = value(dict, field);
    if (!target) return -1;
    const out = [0];
    return number(target, 3, out) ? Number(out[0]) : -1;
  };
  const flags = cg.func("CGEventSourceFlagsState", "uint64_t", ["int32_t"]);
  const keyState = cg.func("CGEventSourceKeyState", "bool", ["int32_t", "uint16_t"]);
  const create = cg.func("CGEventCreateScrollWheelEvent", "void *", ["void *", "uint32_t", "uint32_t", "int32_t", "..."]);
  const point = koffi.struct("ClimbLongCGPoint", { x: "double", y: "double" });
  const size = koffi.struct("ClimbLongCGSize", { width: "double", height: "double" });
  const rect = koffi.struct("ClimbLongCGRect", { origin: point, size });
  const readBounds = cg.func("CGRectMakeWithDictionaryRepresentation", "bool", ["void *", koffi.out(koffi.pointer(rect))]);
  const location = cg.func("CGEventSetLocation", "void", ["void *", point]);
  const clearFlags = cg.func("CGEventSetFlags", "void", ["void *", "uint64_t"]);
  const post = cg.func("CGEventPostToPid", "void", ["int32_t", "void *"]);
  const snapshot = () => {
    if (!require("electron").systemPreferences.isTrustedAccessibilityClient(false)) return null;
    if (require("electron").systemPreferences.getMediaAccessStatus("screen") !== "granted") return null;
    const pool = poolPush();
    let windows = null;
    try {
      const workspace = msgPointer(workspaceClass, shared), app = msgPointer(workspace, front);
      if (!app) return null;
      const pid = Number(msgPid(app, pidSelector));
      windows = list(1 | 16, 0);
      if (!windows) return null;
      let windowId = -1;
      const bounds = { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
      for (let i = 0, length = Math.min(Number(count(windows)), 2048); i < length; i++) {
        const dict = item(windows, i);
        if (readNumber(dict, ownerKey) === pid && readNumber(dict, layerKey) === 0) {
          const windowBounds = value(dict, boundsKey);
          if (windowBounds && readBounds(windowBounds, bounds)) windowId = readNumber(dict, idKey);
          break;
        }
      }
      if (pid <= 0 || windowId < 0) return null;
      const cursor = readCursor();
      return {
        identity: `${pid}:${windowId}`,
        processId: pid,
        cursor,
        hoveringTarget: cursor.x >= bounds.origin.x && cursor.x < bounds.origin.x + bounds.size.width && cursor.y >= bounds.origin.y && cursor.y < bounds.origin.y + bounds.size.height,
        inputBusy: Boolean(Number(flags(0)) & 1966080),
        escapePressed: Boolean(keyState(0, 53))
      };
    } finally {
      if (windows) release(windows);
      poolPop(pool);
    }
  };
  return {
    snapshot,
    scrollDown() {
      const current = snapshot();
      if (!current || current.inputBusy) return false;
      const event = create(null, 0, 1, -320);
      if (!event) throw unavailable("系统未创建滚动事件，请使用普通截图重试");
      try {
        location(event, current.cursor);
        clearFlags(event, 0);
        post(current.processId, event);
      } finally {
        release(event);
      }
    }
  };
}

export { MAX_LONG_SCREENSHOT_PIXELS, MAX_SCROLL_SCREENSHOT_TOTAL_PIXELS, LONG_SCREENSHOT_SETTLE_MS, LongScreenshotError, valid, hasScreenContentChanged, collectScrollingScreenshots, nativeBindings, createLongScreenshotScroller, unavailable, loadLongScrollBindings, loadWindowsLongScrollBindings, loadMacLongScrollBindings };
