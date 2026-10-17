import { DEFAULT_WRITTEN_OPTIONS, normalizeWrittenOptions } from '../../shared/written-options.mjs';

const MOVE_FALLBACKS = {
  "window:moveUp": "Alt+Shift+Up",
  "window:moveDown": "Alt+Shift+Down",
  "window:moveLeft": "Alt+Shift+Left",
  "window:moveRight": "Alt+Shift+Right"
};
function normalizeAccelerator(accel) {
  return accel.split("+").map((p) => p.trim()).filter(Boolean).map((p) => {
    const lower = p.toLowerCase();
    if (lower === "ctrl") return "Control";
    if (lower === "control") return "Control";
    if (lower === "alt") return "Alt";
    if (lower === "shift") return "Shift";
    if (lower === "win" || lower === "meta" || lower === "super") return "Super";
    if (lower === "up" || lower === "arrowup") return "Up";
    if (lower === "down" || lower === "arrowdown") return "Down";
    if (lower === "left" || lower === "arrowleft") return "Left";
    if (lower === "right" || lower === "arrowright") return "Right";
    return p.length === 1 ? p.toUpperCase() : p;
  }).join("+");
}
function getAcceleratorsForAction(action, accel) {
  const values = [normalizeAccelerator(accel)];
  const fallback = MOVE_FALLBACKS[action];
  if (fallback) values.push(normalizeAccelerator(fallback));
  return [...new Set(values.filter(Boolean))];
}
const DEFAULT_HOTKEYS = {
  "screenshot:capture": "Ctrl+Q",
  "screenshot:captureScrolling": "Ctrl+Shift+Q",
  // Kept in the action map for rolling compatibility with older renderer
  // events. New and migrated clients use screenshot:capture as the atomic
  // capture-and-submit command, so the legacy global shortcut stays disabled.
  "screenshot:analyze": "",
  "window:toggle": "Ctrl+E",
  "window:hide": "Ctrl+Shift+H",
  "window:show": "Ctrl+Shift+E",
  "session:reset": "Ctrl+R",
  "interview:clearContext": "Ctrl+Shift+Backspace",
  "exam:exit": "Ctrl+Shift+Z",
  "screenshot:popLast": "Ctrl+D",
  // 已取消“快捷键退出应用”。保留动作以兼容旧存档，但默认不绑定任何按键；
  // 退出应用请使用托盘菜单或设置中的退出按钮。
  "app:quit": "",
  "mode:switchQueue": "Ctrl+1",
  "interview:toggleChat": "Ctrl+2",
  "listen:toggle": "Ctrl+3",
  "llm:resendHistory": "Alt+C",
  "window:moveUp": "Ctrl+Shift+Up",
  "window:moveDown": "Ctrl+Shift+Down",
  "window:moveLeft": "Ctrl+Shift+Left",
  "window:moveRight": "Ctrl+Shift+Right",
  "window:zoomIn": "Ctrl+Shift+=",
  "window:zoomOut": "Ctrl+Shift+-",
  "window:zoomReset": "Ctrl+Shift+0",
  "window:opacityDown": "Ctrl+Shift+[",
  "window:opacityUp": "Ctrl+Shift+]",
  "window:toggleMouseThrough": "Ctrl+Shift+X",
  // Registered only for an active task while click-through mode is enabled.
  // Ctrl+Win+Up/Down avoids Alt menu activation, browser tab switching, phone
  // scrolling, and the Ctrl+Shift+Arrow window-movement shortcuts.
  "answer:scrollUp": "Ctrl+Win+Up",
  "answer:scrollDown": "Ctrl+Win+Down",
  // Ctrl+Win+Left/Right is reserved by Windows for virtual desktops.
  "answer:scrollLeft": "Ctrl+Alt+Shift+Left",
  "answer:scrollRight": "Ctrl+Alt+Shift+Right",
  // These two shortcuts are registered only while an active task has a
  // paired, foreground mobile result viewport. Keeping them in settings does
  // not make them permanent global shortcuts.
  "mobile:scrollUp": "Ctrl+Up",
  "mobile:scrollDown": "Ctrl+Down"
};
const DEFAULT_VOICE_VAD_CONFIG = {
  enabled: true,
  minRms: 8e-3,
  peakThreshold: 0.035,
  noiseMultiplier: 3.2,
  speechStartMs: 180,
  silenceEndMs: 900,
  preRollMs: 250,
  minSpeechMs: 250
};
const DEFAULT_VOICE_LLM_MAX_TOKENS = 780;
const MIN_VOICE_LLM_MAX_TOKENS = 64;
const MAX_VOICE_LLM_MAX_TOKENS = 4096;
const LEGACY_DEFAULT_VOICE_LLM_MAX_TOKENS = 384;
const MIN_WINDOW_OPACITY = 0.01;
const DEFAULT_MOUSE_THROUGH_OPACITY = 0.48;
function normalizeWindowOpacity(value, fallback = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(Math.max(MIN_WINDOW_OPACITY, Math.min(1, value)) * 100) / 100;
}
function resolveWindowOpacity(settings, mouseThrough) {
  return mouseThrough ? normalizeWindowOpacity(settings.mouseThroughOpacity, DEFAULT_MOUSE_THROUGH_OPACITY) : normalizeWindowOpacity(settings.opacity);
}
function normalizeVoiceLlmMaxTokens(value) {
  if (value === LEGACY_DEFAULT_VOICE_LLM_MAX_TOKENS) {
    return DEFAULT_VOICE_LLM_MAX_TOKENS;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_VOICE_LLM_MAX_TOKENS;
  }
  return Math.max(
    MIN_VOICE_LLM_MAX_TOKENS,
    Math.min(MAX_VOICE_LLM_MAX_TOKENS, Math.round(value))
  );
}
const DEFAULT_SETTINGS = {
  writtenOptions: DEFAULT_WRITTEN_OPTIONS,
  hotkeys: DEFAULT_HOTKEYS,
  theme: { outer: "#F2C6FF", inner: "#2A1744" },
  language: "Python",
  solverMode: "LeetCode",
  windowMode: "normal",
  position: null,
  zoom: 1,
  opacity: 1,
  mouseThroughOpacity: DEFAULT_MOUSE_THROUGH_OPACITY,
  disableClipboard: false,
  hideTrayIcon: false,
  mouseThrough: false,
  doubleClickScreenshotEnabled: false,
  quadrupleClickScreenshotEnabled: false,
  longPressScreenshotEnabled: false,
  autoLongScreenshotEnabled: false,
  localScreenshotDisplayId: null,
  screenshotDisplayId: null,
  voiceSystemPrompt: "",
  /** 实时面试回答的客户端输出上限；服务端仍会执行自己的安全边界。 */
  voiceLlmMaxTokens: DEFAULT_VOICE_LLM_MAX_TOKENS,
  memoryEnabled: true,
  selectedPositions: [],
  answerLanguage: "中文",
  interviewHotwords: [
    "React",
    "Vue",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "Python",
    "Java",
    "Spring Boot",
    "MySQL",
    "Redis",
    "Docker",
    "Kubernetes",
    "微服务",
    "分布式",
    "算法",
    "复杂度",
    "动态规划",
    "二叉树",
    "链表",
    "哈希表",
    "Agent",
    "AI Agent",
    "智能体",
    "多智能体",
    "Multi-Agent",
    "RAG",
    "MCP",
    "LLM",
    "大语言模型",
    "Function Calling",
    "Tool Calling",
    "工具调用",
    "ReAct",
    "LangChain",
    "LangGraph",
    "LlamaIndex",
    "AutoGen",
    "CrewAI",
    "A2A",
    "OpenAI Agents SDK",
    "Embedding",
    "VAD",
    "ASR",
    "TTS",
    "DeepSeek",
    "Qwen",
    "GLM",
    "向量数据库",
    "向量检索",
    "工作流",
    "编排"
  ],
  customPrompts: "",
  examVisionModelProfile: "personal-custom-api",
  interviewVoiceModelProfile: "personal-custom-api",
  screenshotResponsePreset: "balanced",
  voiceVad: DEFAULT_VOICE_VAD_CONFIG
};
const CUSTOM_PROMPTS_MAX_CHARS = 700;
function limitCustomPrompts(value) {
  return Array.from(value).slice(0, CUSTOM_PROMPTS_MAX_CHARS).join("");
}
function normalizeCustomPrompts(value) {
  return limitCustomPrompts(value.trim());
}
function normalizeExamVisionModelProfile(value) {
  if (value === "doubao" || value === "gemini-3.8" || value === "personal-custom-api") return value;
  if (value === "codex-cli" || value === "gemini-cli") return "gemini";
  if (value === "personal-gemini" || value === "personal-openai") {
    return "personal-custom-api";
  }
  return "gemini";
}
function normalizeInterviewVoiceModelProfile(value) {
  if (value === "personal-custom-api" || value === "client") return "personal-custom-api";
  return "managed";
}
function normalizeScreenshotResponsePreset(_value) {
  return "balanced";
}
function normalizeScreenshotDisplayId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
}
const STEALTH_TOGGLE_ALLOWED_EMAILS = [
  "local@climb.local",
  "admin@climb.local",
  "month-test@climb.local"
];
function isStealthToggleAllowed(email) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return STEALTH_TOGGLE_ALLOWED_EMAILS.includes(normalized);
}
function normalizeWindowMode(mode) {
  return mode === "normal" ? "normal" : "stealth";
}
function enforceDesktopSettingsPolicy(settings, options) {
  const scrollingShortcut = typeof settings.hotkeys["screenshot:captureScrolling"] === "string" ? settings.hotkeys["screenshot:captureScrolling"] : DEFAULT_HOTKEYS["screenshot:captureScrolling"];
  const scrollingConflict = scrollingShortcut && Object.entries(settings.hotkeys).some(([action, combo]) => action !== "screenshot:captureScrolling" && action !== "screenshot:analyze" && action !== "app:quit" && typeof combo === "string" && normalizeAccelerator(combo) === normalizeAccelerator(scrollingShortcut));
  const answerScrollUp = settings.hotkeys["answer:scrollUp"] === "Alt+PageUp" ? DEFAULT_HOTKEYS["answer:scrollUp"] : settings.hotkeys["answer:scrollUp"];
  const answerScrollDown = settings.hotkeys["answer:scrollDown"] === "Alt+PageDown" ? DEFAULT_HOTKEYS["answer:scrollDown"] : settings.hotkeys["answer:scrollDown"];
  return {
    ...settings,
    writtenOptions: normalizeWrittenOptions(settings.writtenOptions),
    hotkeys: {
      ...DEFAULT_HOTKEYS,
      ...settings.hotkeys,
      "screenshot:captureScrolling": scrollingConflict ? "" : scrollingShortcut,
      // Ctrl+Q is the single-screen submission shortcut. Clearing the
      // legacy binding also releases Ctrl+W for the user's active application.
      "screenshot:analyze": "",
      // Alt activates the browser menu bar on some Windows machines even when
      // the PageUp/PageDown chord itself is captured. Migrate only the retired
      // defaults; disabled or user-defined bindings remain untouched.
      "answer:scrollUp": answerScrollUp,
      "answer:scrollDown": answerScrollDown,
      // 退出应用的快捷键已下线。强制清除旧存档里的 Ctrl+X 绑定，
      // 释放该按键；退出改用托盘菜单或设置中的退出按钮。
      "app:quit": ""
    },
    // 仅白名单账号可保留自选窗口模式；其余账号一律强制隐身。
    windowMode: options?.allowStealthToggle ? normalizeWindowMode(settings.windowMode) : "stealth",
    memoryEnabled: true,
    hideTrayIcon: settings.hideTrayIcon === true,
    opacity: normalizeWindowOpacity(settings.opacity),
    mouseThroughOpacity: normalizeWindowOpacity(
      settings.mouseThroughOpacity,
      DEFAULT_MOUSE_THROUGH_OPACITY
    ),
    voiceLlmMaxTokens: normalizeVoiceLlmMaxTokens(settings.voiceLlmMaxTokens),
    doubleClickScreenshotEnabled: settings.doubleClickScreenshotEnabled === true,
    // Do not migrate four-click opt-in to the much broader two-click gesture.
    quadrupleClickScreenshotEnabled: false,
    longPressScreenshotEnabled: settings.longPressScreenshotEnabled === true,
    autoLongScreenshotEnabled: false,
    localScreenshotDisplayId: normalizeScreenshotDisplayId(settings.localScreenshotDisplayId),
    screenshotDisplayId: normalizeScreenshotDisplayId(settings.screenshotDisplayId),
    customPrompts: normalizeCustomPrompts(settings.customPrompts),
    examVisionModelProfile: normalizeExamVisionModelProfile(settings.examVisionModelProfile),
    interviewVoiceModelProfile: normalizeInterviewVoiceModelProfile(
      settings.interviewVoiceModelProfile
    ),
    screenshotResponsePreset: normalizeScreenshotResponsePreset(settings.screenshotResponsePreset)
  };
}

export { MOVE_FALLBACKS, normalizeAccelerator, getAcceleratorsForAction, DEFAULT_HOTKEYS, DEFAULT_VOICE_VAD_CONFIG, DEFAULT_VOICE_LLM_MAX_TOKENS, MIN_VOICE_LLM_MAX_TOKENS, MAX_VOICE_LLM_MAX_TOKENS, LEGACY_DEFAULT_VOICE_LLM_MAX_TOKENS, MIN_WINDOW_OPACITY, DEFAULT_MOUSE_THROUGH_OPACITY, normalizeWindowOpacity, resolveWindowOpacity, normalizeVoiceLlmMaxTokens, DEFAULT_SETTINGS, CUSTOM_PROMPTS_MAX_CHARS, limitCustomPrompts, normalizeCustomPrompts, normalizeExamVisionModelProfile, normalizeInterviewVoiceModelProfile, normalizeScreenshotResponsePreset, normalizeScreenshotDisplayId, STEALTH_TOGGLE_ALLOWED_EMAILS, isStealthToggleAllowed, normalizeWindowMode, enforceDesktopSettingsPolicy };
