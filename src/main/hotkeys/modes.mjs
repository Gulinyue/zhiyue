

const WORK_MODES = ["idle", "exam", "interview"];
const ALWAYS_ALLOWED_HOTKEYS = /* @__PURE__ */ new Set([
  'mobile:scrollUp',
  'mobile:scrollDown',
  'exam:exit',
  "window:toggle",
  "window:hide",
  "window:show",
  "window:moveUp",
  "window:moveDown",
  "window:moveLeft",
  "window:moveRight",
  "window:toggleMouseThrough",
  "answer:scrollUp",
  "answer:scrollDown",
  "answer:scrollLeft",
  "answer:scrollRight",
  "session:reset",
  "app:quit",
  "window:zoomIn",
  "window:zoomOut",
  "window:zoomReset",
  "window:opacityDown",
  "window:opacityUp"
]);
const EXAM_ALLOWED_HOTKEYS = /* @__PURE__ */ new Set([
  "screenshot:capture",
  "screenshot:captureScrolling",
  "screenshot:analyze",
  "screenshot:popLast",
  "exam:exit",
  "llm:resendHistory",
  "window:toggleMouseThrough",
  "window:moveUp",
  "window:moveDown",
  "window:moveLeft",
  "window:moveRight",
  "answer:scrollUp",
  "answer:scrollDown",
  "mobile:scrollUp",
  "mobile:scrollDown"
]);
const INTERVIEW_ALLOWED_HOTKEYS = /* @__PURE__ */ new Set([
  "screenshot:capture",
  "screenshot:captureScrolling",
  "screenshot:analyze",
  "interview:clearContext",
  "listen:toggle",
  "interview:toggleChat",
  "llm:resendHistory",
  "window:toggleMouseThrough",
  "window:moveUp",
  "window:moveDown",
  "window:moveLeft",
  "window:moveRight",
  "answer:scrollUp",
  "answer:scrollDown",
  "mobile:scrollUp",
  "mobile:scrollDown"
]);
const MODE_GATED_HOTKEYS = /* @__PURE__ */ new Set([
  "screenshot:capture",
  "screenshot:captureScrolling",
  "screenshot:analyze",
  "screenshot:popLast",
  "exam:exit",
  "mode:switchQueue",
  "interview:clearContext",
  "listen:toggle",
  "interview:toggleChat",
  "llm:resendHistory",
  "window:toggleMouseThrough",
  "window:moveUp",
  "window:moveDown",
  "window:moveLeft",
  "window:moveRight",
  "answer:scrollUp",
  "answer:scrollDown",
  "mobile:scrollUp",
  "mobile:scrollDown"
]);
function isWorkMode(value) {
  return typeof value === "string" && WORK_MODES.includes(value);
}
function isHotkeyAllowedForWorkMode(mode, action) {
  if (ALWAYS_ALLOWED_HOTKEYS.has(action)) return true;
  if (mode === "exam") return EXAM_ALLOWED_HOTKEYS.has(action);
  if (mode === "interview") return INTERVIEW_ALLOWED_HOTKEYS.has(action);
  return !MODE_GATED_HOTKEYS.has(action);
}
const WINDOW_SURFACES = ["preparation", "focus"];
function isWindowSurface(value) {
  return typeof value === "string" && WINDOW_SURFACES.includes(value);
}

export { WORK_MODES, ALWAYS_ALLOWED_HOTKEYS, EXAM_ALLOWED_HOTKEYS, INTERVIEW_ALLOWED_HOTKEYS, MODE_GATED_HOTKEYS, isWorkMode, isHotkeyAllowedForWorkMode, WINDOW_SURFACES, isWindowSurface };
