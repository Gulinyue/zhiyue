

const GWL_EXSTYLE = -20;
const WS_EX_NOACTIVATE = 134217728;
const WS_EX_TOOLWINDOW = 128;
const WS_EX_APPWINDOW = 262144;
let cachedBindings;
function loadUser32() {
  if (cachedBindings !== void 0) return cachedBindings;
  if (process.platform !== "win32") {
    cachedBindings = null;
    return cachedBindings;
  }
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    const getFn = user32.func(
      "__stdcall",
      "GetWindowLongPtrW",
      "intptr_t",
      ["intptr_t", "int"]
    );
    const setFn = user32.func(
      "__stdcall",
      "SetWindowLongPtrW",
      "intptr_t",
      ["intptr_t", "int", "intptr_t"]
    );
    const setAffFn = user32.func(
      "__stdcall",
      "SetWindowDisplayAffinity",
      "int",
      ["intptr_t", "uint32"]
    );
    const getAffFn = user32.func(
      "int __stdcall GetWindowDisplayAffinity(intptr_t hwnd, _Out_ uint32_t *affinity)"
    );
    cachedBindings = {
      getExStyle: (hwnd) => BigInt(getFn(hwnd, GWL_EXSTYLE)),
      setExStyle: (hwnd, val) => BigInt(setFn(hwnd, GWL_EXSTYLE, val)),
      setDisplayAffinity: (hwnd, affinity) => Number(setAffFn(hwnd, affinity)),
      getDisplayAffinity: (hwnd) => {
        const affinity = [null];
        const ok = Number(getAffFn(hwnd, affinity));
        return ok && typeof affinity[0] === "number" ? affinity[0] : null;
      }
    };
  } catch (err) {
    console.warn("[zhiyue:harden] koffi load failed:", err);
    cachedBindings = null;
  }
  return cachedBindings;
}
const WDA_NONE = 0;
const WDA_MONITOR = 1;
const WDA_EXCLUDEFROMCAPTURE = 17;
function readDisplayAffinity(bindings, hwnd) {
  const affinity = bindings.getDisplayAffinity(hwnd);
  if (affinity === WDA_NONE) return "none";
  if (affinity === WDA_MONITOR) return "monitor";
  if (affinity === WDA_EXCLUDEFROMCAPTURE) return "exclude";
  return "failed";
}
function getContentProtectionDirect(win2) {
  const bindings = loadUser32();
  if (!bindings) return "failed";
  try {
    const hwnd = readHwnd(win2);
    return hwnd === null ? "failed" : readDisplayAffinity(bindings, hwnd);
  } catch (err) {
    console.warn("[zhiyue:harden] GetWindowDisplayAffinity failed:", err);
    return "failed";
  }
}
function applyContentProtectionDirect(win2, enabled, options = {}) {
  const bindings = loadUser32();
  if (!bindings) return "failed";
  try {
    const hwnd = readHwnd(win2);
    if (hwnd === null) return "failed";
    if (!enabled) {
      const ok2 = bindings.setDisplayAffinity(hwnd, WDA_NONE);
      return ok2 ? readDisplayAffinity(bindings, hwnd) : "failed";
    }
    const ok = bindings.setDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
    if (ok) return readDisplayAffinity(bindings, hwnd);
    const current = readDisplayAffinity(bindings, hwnd);
    if (current === "exclude" || options.allowMonitorFallback === false) {
      return current;
    }
    const okMon = bindings.setDisplayAffinity(hwnd, WDA_MONITOR);
    if (okMon) return readDisplayAffinity(bindings, hwnd);
    return "failed";
  } catch (err) {
    console.warn("[zhiyue:harden] SetWindowDisplayAffinity failed:", err);
    return "failed";
  }
}
function readHwnd(win2) {
  const buf = win2.getNativeWindowHandle();
  if (buf.length >= 8) return buf.readBigUInt64LE(0);
  if (buf.length >= 4) return BigInt(buf.readUInt32LE(0));
  return null;
}
const patched = /* @__PURE__ */ new WeakSet();
function hardenWindow(win2) {
  if (patched.has(win2)) return;
  const bindings = loadUser32();
  if (!bindings) return;
  try {
    const hwnd = readHwnd(win2);
    if (hwnd === null) return;
    const current = bindings.getExStyle(hwnd);
    const added = BigInt(WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
    const removed = BigInt(WS_EX_APPWINDOW);
    const next = (current | added) & ~removed;
    bindings.setExStyle(hwnd, next);
    patched.add(win2);
  } catch (err) {
    console.warn("[zhiyue:harden] patch failed:", err);
  }
}

export { GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_APPWINDOW, cachedBindings, loadUser32, WDA_NONE, WDA_MONITOR, WDA_EXCLUDEFROMCAPTURE, readDisplayAffinity, getContentProtectionDirect, applyContentProtectionDirect, readHwnd, patched, hardenWindow };
