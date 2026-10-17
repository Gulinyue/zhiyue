

const MAC_CAPTURE_PROTECTION_NOTICE = "macOS 内容保护仅为尽力保护：使用 ScreenCaptureKit 的共享或录屏软件仍可能捕获 Climb。请先检查共享端预览；需要保证内容不外露时，请仅共享指定业务窗口，或在共享前隐藏 Climb。";
const warned$1 = /* @__PURE__ */ new WeakSet();
const failed = /* @__PURE__ */ new WeakSet();
function applyMacContentProtection(owner, warn = console.warn) {
  if (owner.isDestroyed()) return "failed";
  try {
    owner.setContentProtection(true);
  } catch (error) {
    if (!owner.isDestroyed() && owner.isVisible()) owner.hide();
    if (!failed.has(owner)) warn("[zhiyue:mac-protection] native protection failed; window kept hidden", error);
    failed.add(owner);
    return "failed";
  }
  failed.delete(owner);
  if (!warned$1.has(owner)) {
    warned$1.add(owner);
    warn("[zhiyue:mac-protection]", MAC_CAPTURE_PROTECTION_NOTICE);
  }
  return "mac-best-effort";
}
function bindMacProtectionRecovery(owner, power, displays, reapply) {
  const subscriptions = [];
  for (const [source, events] of [
    [owner, ["restore", "enter-full-screen", "leave-full-screen"]],
    [power, ["resume", "unlock-screen"]],
    [displays, ["display-added", "display-removed", "display-metrics-changed"]]
  ]) {
    for (const event of events) {
      const listener = () => {
        if (!owner.isDestroyed()) reapply(`mac-${event}`);
      };
      source.on(event, listener);
      subscriptions.push([source, event, listener]);
    }
  }
  const dispose = () => {
    for (const [source, event, listener] of subscriptions) source.removeListener(event, listener);
    owner.removeListener("closed", dispose);
  };
  owner.on("closed", dispose);
}

export { MAC_CAPTURE_PROTECTION_NOTICE, warned$1, failed, applyMacContentProtection, bindMacProtectionRecovery };
