// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.
import { create$1 } from "../vendor/react-icons-state.mjs";

const DEFAULT_HOTKEYS = {
  "screenshot:capture": "Ctrl+Q",
  "screenshot:captureScrolling": "Ctrl+Shift+Q",
  // Kept in the action map for rolling compatibility with older renderer
  // events. New and migrated clients use screenshot:capture as the atomic
  // capture-and-submit command, so the legacy global shortcut stays disabled.
  "screenshot:analyze": "",
  "window:toggle": "Ctrl+E",
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
  hotkeys: DEFAULT_HOTKEYS,
  theme: { outer: "#F2C6FF", inner: "#2A1744" },
  language: "Python",
  solverMode: "LeetCode",
  windowMode: "stealth",
  position: null,
  zoom: 1,
  opacity: 1,
  mouseThroughOpacity: DEFAULT_MOUSE_THROUGH_OPACITY,
  disableClipboard: true,
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
  examVisionModelProfile: "gemini",
  interviewVoiceModelProfile: "managed",
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
const STEALTH_TOGGLE_ALLOWED_EMAILS = [
  "admin@climb.local",
  "month-test@climb.local"
];
function isStealthToggleAllowed(email) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return STEALTH_TOGGLE_ALLOWED_EMAILS.includes(normalized);
}
const DEFAULT_SYSTEM_PROMPT = "You are Climb, an in-interview overlay assistant. Answer concisely in the user's language.";
const DEFAULT_VOICE_SYSTEM_PROMPT = "你是正在参加真实面试的候选人。先直接回答当前问题，再按问题复杂度补充必要依据；简单追问可以一句话，复杂题再自然展开。只把明确提供的经历当作个人事实，不编造公司、项目、职责、数据或结果。经历题讲清自己的责任、行动、结果和反思，技术题说明判断、实现、取舍、风险与验证，但不要机械套用固定模板、固定分点或程式化结尾。使用自然口语，回答完整后停止。";
const DEFAULT_LLM_TEMPERATURE = 0.3;
const useSettings = create$1((set) => ({
  settings: DEFAULT_SETTINGS,
  ready: false,
  async load() {
    const s2 = await window.api.settings.get();
    applyTheme(s2);
    set({ settings: s2, ready: true });
  },
  async set(next) {
    const saved = await window.api.settings.set(next);
    applyTheme(saved);
    set({ settings: saved });
  },
  async patch(p2) {
    const saved = await window.api.settings.patch(p2);
    applyTheme(saved);
    set({ settings: saved });
  },
  applyFromMain(s2) {
    applyTheme(s2);
    set({ settings: s2 });
  }
}));
function applyTheme(s2) {
  const root2 = document.documentElement;
  root2.style.setProperty("--shell-outer", s2.theme.outer);
  root2.style.setProperty("--shell-inner", s2.theme.inner);
  root2.style.setProperty("--climb-glow-a", s2.theme.outer);
  root2.style.setProperty("--climb-card", s2.theme.inner);
}

export { DEFAULT_HOTKEYS, DEFAULT_VOICE_VAD_CONFIG, DEFAULT_VOICE_LLM_MAX_TOKENS, MIN_VOICE_LLM_MAX_TOKENS, MAX_VOICE_LLM_MAX_TOKENS, LEGACY_DEFAULT_VOICE_LLM_MAX_TOKENS, MIN_WINDOW_OPACITY, DEFAULT_MOUSE_THROUGH_OPACITY, normalizeWindowOpacity, resolveWindowOpacity, normalizeVoiceLlmMaxTokens, DEFAULT_SETTINGS, CUSTOM_PROMPTS_MAX_CHARS, limitCustomPrompts, normalizeCustomPrompts, STEALTH_TOGGLE_ALLOWED_EMAILS, isStealthToggleAllowed, DEFAULT_SYSTEM_PROMPT, DEFAULT_VOICE_SYSTEM_PROMPT, DEFAULT_LLM_TEMPERATURE, useSettings, applyTheme };
