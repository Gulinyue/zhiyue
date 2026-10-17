import { authFetch, BACKEND_BASE_URL, AuthRefreshUnavailableError, AuthRequiredError, SubscriptionRequiredError, ClientUpdateRequiredError } from "../services/gateway.mjs";
import { attachLocalKnowledgeEmbeddings, hasSemanticKnowledgeIndex, isTaskConnectionRecovering, retryUsageSessionConnection, retryVoiceConnection, useRemoteControl, getResumes, listLocalKnowledgeIndexes, getRemoteControlPhoneSummary, probeSystemAudioBeforeMeeting, RemoteControlPanel, TASK_RECONNECT_MESSAGE, PersonalModelsSettings, normalizeHotwordText, EMPTY_RESUME_PROFILE, parsePracticeResumeDocument, createResumeItem, saveResumeItem, deleteResumeItem, MAX_LOCAL_KNOWLEDGE_INDEXES, searchSemanticLocalKnowledge, buildLocalKnowledgeIndexFromFile, saveLocalKnowledgeIndexForAccount, deleteLocalKnowledgeIndex } from "../services/task-runtime.mjs";
import { DASHBOARD_PRIMARY_NAV_ITEMS, DASHBOARD_NAV_ITEMS, getUserDisplayName, buildQuotaSummary, ResponsePanel, buildModeConversationItems, useAnswerAutoFollow, ModeConversationBubble, canEnterCheckoutStep, formatPlanLabel } from "./conversation.mjs";
import { useSettings, normalizeWindowOpacity, MIN_WINDOW_OPACITY, limitCustomPrompts, CUSTOM_PROMPTS_MAX_CHARS, normalizeCustomPrompts } from "../stores/settings.mjs";
import { useAuth } from "../stores/auth.mjs";
import { useSession, requiredTaskHotkeys, runtimeInteractionMode, audioPipelineStage, formatAudioPipelineBytes } from "../stores/session.mjs";
import { reactExports, jsxRuntimeExports, s$8, s$2, m$2, i$2, m$1, s$a } from "../vendor/react-icons-state.mjs";
import { TaskLaunchDialog, LocalRecordsPage, TaskConnectionNotice, FocusResizeHandle } from "./local-records.mjs";
import { PracticeInterviewPage, PracticeHistoryPage } from "./practice.mjs";
import { SettingsPanel } from "./settings.mjs";
import { WindowControls, climbIconUrl } from "./auth.mjs";
import { KeyCombo } from "../components/key-combo.mjs";
import { MarkdownBody } from "../vendor/markdown.mjs";

const DEFAULT_TIME_PLANS = [
  {
    id: "time-hour",
    name: "1 小时版",
    price: 21.9,
    unit: "小时",
    accessMode: "time",
    durationHours: 1,
    durationDays: 1 / 24,
    description: "累加 1 小时实际使用时长"
  },
  {
    id: "time-day",
    name: "1 天版",
    price: 31.9,
    unit: "天",
    accessMode: "time",
    durationHours: 24,
    durationDays: 1,
    description: "在现有日历有效期上延长 24 小时",
    badge: "推荐"
  },
  {
    id: "time-week",
    name: "7 天版",
    price: 59,
    unit: "周",
    accessMode: "time",
    durationHours: 24 * 7,
    durationDays: 7,
    description: "在现有日历有效期上延长 7 天"
  },
  {
    id: "time-month",
    name: "1 个月版",
    price: 125,
    unit: "月",
    accessMode: "time",
    durationHours: 24 * 30,
    durationDays: 30,
    description: "延长 1 个自然月，缺少对应日期时取月末"
  },
  {
    id: "time-two-month",
    name: "2 个月版",
    price: 245,
    unit: "月",
    accessMode: "time",
    durationHours: 24 * 60,
    durationDays: 60,
    description: "延长 2 个自然月，缺少对应日期时取月末"
  }
];
async function getPaymentConfig() {
  const res = await authFetch("/v1/payments/config", { cache: "no-store" });
  if (!res.ok) throw new Error(`充值配置请求失败：${res.status}`);
  const config = await res.json();
  return {
    ...config,
    plans: normalizePaymentPlans(config.plans),
    qr: {
      alipay: resolveBackendAssetUrl(config.qr?.alipay ?? ""),
      wechat: resolveBackendAssetUrl(config.qr?.wechat ?? "")
    }
  };
}
function normalizePaymentPlans(plans) {
  const legalIds = new Set(DEFAULT_TIME_PLANS.map((plan) => plan.id));
  const normalized = Array.isArray(plans) ? plans.filter(
    (plan) => legalIds.has(plan.id) && plan.accessMode === "time" && typeof plan.name === "string" && typeof plan.unit === "string" && Number.isFinite(plan.price) && Number.isFinite(plan.durationDays)
  ).map((plan) => {
    const fallback = DEFAULT_TIME_PLANS.find((item) => item.id === plan.id);
    return {
      ...fallback,
      ...plan,
      accessMode: "time",
      dailyImageLimit: plan.dailyImageLimit ?? fallback?.dailyImageLimit ?? 500,
      dailyVoiceSecondsLimit: plan.dailyVoiceSecondsLimit ?? fallback?.dailyVoiceSecondsLimit ?? 8 * 60 * 60
    };
  }) : [];
  return normalized.length > 0 ? normalized : DEFAULT_TIME_PLANS.map((plan) => ({ ...plan }));
}
function resolveBackendAssetUrl(src) {
  if (!src) return "";
  if (/^https?:\/\//.test(src)) return src;
  return `${BACKEND_BASE_URL}${src.startsWith("/") ? src : `/${src}`}`;
}
async function getMyPaymentSubmissions() {
  const res = await authFetch("/v1/payments/mine");
  if (!res.ok) throw new Error(`充值记录请求失败：${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.items) ? body.items : [];
}
async function submitPaymentRequest(params) {
  const res = await authFetch("/v1/payments/submit", {
    method: "POST",
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    let message = `充值申请提交失败：${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.message === "string") message = body.message;
    } catch {
    }
    throw new Error(message);
  }
  return res.json();
}
const PAYMENT_CHECKOUT_DRAFT_KEY = "climb.payment.checkoutDraft.v1";
const PAYMENT_CHECKOUT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1e3;
function defaultStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}
function readPaymentCheckoutDraft(storage2 = defaultStorage(), now = Date.now()) {
  if (!storage2) return null;
  try {
    const raw = storage2.getItem(PAYMENT_CHECKOUT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const method = parsed.method;
    const checkoutStep = parsed.checkoutStep;
    const updatedAt = Number(parsed.updatedAt);
    if (typeof parsed.planId !== "string" || !parsed.planId.trim() || method !== "alipay" && method !== "wechat" || checkoutStep !== 2 && checkoutStep !== 3 || !Number.isFinite(updatedAt) || updatedAt <= 0 || updatedAt > now + 6e4 || now - updatedAt > PAYMENT_CHECKOUT_DRAFT_MAX_AGE_MS) {
      storage2.removeItem(PAYMENT_CHECKOUT_DRAFT_KEY);
      return null;
    }
    return {
      planId: parsed.planId.trim(),
      method,
      checkoutStep,
      updatedAt
    };
  } catch {
    return null;
  }
}
function savePaymentCheckoutDraft(draft, storage2 = defaultStorage(), now = Date.now()) {
  if (!storage2 || !draft.planId.trim()) return;
  try {
    storage2.setItem(PAYMENT_CHECKOUT_DRAFT_KEY, JSON.stringify({
      planId: draft.planId.trim(),
      method: draft.method,
      checkoutStep: draft.checkoutStep,
      updatedAt: now
    }));
  } catch {
  }
}
function clearPaymentCheckoutDraft(storage2 = defaultStorage()) {
  if (!storage2) return;
  try {
    storage2.removeItem(PAYMENT_CHECKOUT_DRAFT_KEY);
  } catch {
  }
}
const CHECKING_RESUME_LIBRARY_STATUS = {
  state: "checking",
  resumes: []
};
function sortResumeLibrary(items) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
}
function createResumeLibraryStatusController(loadResumes) {
  let generation2 = 0;
  let lastResolved = null;
  const resolved = (resumes) => {
    const sorted = sortResumeLibrary(resumes);
    return sorted.length > 0 ? { state: "ready", resumes: sorted } : { state: "missing", resumes: [] };
  };
  return {
    async refresh(publish2) {
      const requestGeneration = ++generation2;
      publish2({ state: "checking", resumes: lastResolved?.resumes ?? [] });
      try {
        const resumes = await loadResumes();
        if (requestGeneration !== generation2) return;
        lastResolved = resolved(resumes);
        publish2(lastResolved);
      } catch (err) {
        if (requestGeneration !== generation2) return;
        if (isTransientResumeLoadError(err) && lastResolved) {
          publish2(lastResolved);
          return;
        }
        publish2({ state: "error", resumes: lastResolved?.resumes ?? [] });
      }
    },
    reset(publish2) {
      generation2 += 1;
      lastResolved = null;
      publish2(CHECKING_RESUME_LIBRARY_STATUS);
    },
    setPersisted(resume, publish2) {
      generation2 += 1;
      const current = lastResolved?.resumes ?? [];
      lastResolved = resolved([
        resume,
        ...current.filter((item) => item.id !== resume.id)
      ]);
      publish2(lastResolved);
    },
    setDeleted(resumeId, publish2) {
      generation2 += 1;
      lastResolved = resolved((lastResolved?.resumes ?? []).filter((item) => item.id !== resumeId));
      publish2(lastResolved);
    },
    invalidate() {
      generation2 += 1;
    }
  };
}
function primaryResumeStatus(status) {
  if (status.state === "checking" && status.resumes.length === 0) return { state: "checking" };
  if (status.state === "error" && status.resumes.length === 0) return { state: "error" };
  const resume = status.resumes[0];
  return resume ? { state: "ready", resume } : { state: "missing" };
}
function isTransientResumeLoadError(err) {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof AuthRefreshUnavailableError) return true;
  return false;
}
function resumeStatusLabel(status) {
  switch (status.state) {
    case "checking":
      return "检查中…";
    case "ready":
      return "已上传";
    case "missing":
      return "未上传";
    case "error":
      return "状态暂不可用";
  }
}
const INDEX_ENDPOINT = "/v1/voice-knowledge/index";
const QUERY_ENDPOINT = "/v1/voice-knowledge/query-embedding";
const INDEX_TIMEOUT_MS = 6e4;
const MAX_FILE_NAME_CHARS = 180;
const MAX_CHUNKS = 192;
const MAX_CHUNK_ID_CHARS = 80;
const MAX_CHUNK_TEXT_CHARS = 800;
const MAX_QUERY_TEXT_CHARS = 8e3;
class KnowledgeSemanticIndexError extends Error {
  constructor(message) {
    super(message);
    this.name = "KnowledgeSemanticIndexError";
  }
}
function unicodeLength(value) {
  return Array.from(value).length;
}
function validateIndexForUpload(index2) {
  if (!index2.fileName || unicodeLength(index2.fileName) > MAX_FILE_NAME_CHARS) {
    throw new KnowledgeSemanticIndexError(`文件名不能超过 ${MAX_FILE_NAME_CHARS} 个字符`);
  }
  if (index2.chunks.length === 0 || index2.chunks.length > MAX_CHUNKS) {
    throw new KnowledgeSemanticIndexError(`知识库需要包含 1～${MAX_CHUNKS} 个片段`);
  }
  for (const chunk of index2.chunks) {
    if (!chunk.id || unicodeLength(chunk.id) > MAX_CHUNK_ID_CHARS) {
      throw new KnowledgeSemanticIndexError(`片段 ID 不能超过 ${MAX_CHUNK_ID_CHARS} 个字符`);
    }
    if (!chunk.text || unicodeLength(chunk.text) > MAX_CHUNK_TEXT_CHARS) {
      throw new KnowledgeSemanticIndexError(`每个知识片段不能超过 ${MAX_CHUNK_TEXT_CHARS} 个字符`);
    }
  }
}
const LOCAL_FALLBACK_SUFFIX = "；本地快速检索仍可使用。";
function messageForResponseCode(code2, operation) {
  switch (code2) {
    case "VOICE_KNOWLEDGE_INDEX_RATE_LIMITED":
      return `语义索引请求过于频繁，请稍后重新上传${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_INDEX_TIMEOUT":
      return `语义索引构建超时，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_INDEX_BUSY":
      return `语义索引服务当前繁忙，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_EMBEDDING_UNAVAILABLE":
      return `${operation === "query" ? "语义检索" : "语义索引"}服务尚未配置${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_INDEX_UPSTREAM_UNAVAILABLE":
      return `语义索引上游服务暂时不可用，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_INDEX_UPSTREAM_REJECTED":
      return `语义索引上游服务无法处理该请求，请重新上传或稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_INDEX_FAILED":
      return `语义索引上游服务暂时不可用，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_INDEX_ABORTED":
      return `语义索引构建已取消${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_INDEX_INVALID_RESPONSE":
      return `语义索引服务返回了无效结果，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_QUERY_RATE_LIMITED":
      return `语义检索请求过于频繁，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_QUERY_TIMEOUT":
      return `语义检索超时，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_QUERY_BUSY":
      return `语义检索服务当前繁忙，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_QUERY_UPSTREAM_UNAVAILABLE":
      return `语义检索上游服务暂时不可用，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_QUERY_UPSTREAM_REJECTED":
      return `语义检索上游服务无法处理该请求，请修改问题或稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_QUERY_INVALID_RESPONSE":
      return `语义检索服务返回了无效结果，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_QUERY_MODEL_MISMATCH":
      return `查询模型与本地语义索引不匹配，请重新上传知识库文件${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_QUERY_REQUEST_TOO_LARGE":
      return `检索问题过长，请缩短后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_QUERY_ABORTED":
      return "语义检索已取消";
    case "VOICE_KNOWLEDGE_QUERY_FAILED":
      return `语义检索失败，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "VOICE_KNOWLEDGE_INDEX_REQUEST_TOO_LARGE":
      return `知识库内容过长，请缩小文件后重新上传${LOCAL_FALLBACK_SUFFIX}`;
    case "INVALID_KNOWLEDGE_INDEX_REQUEST":
    case "INVALID_JSON":
      return `知识库内容不符合索引要求，请检查文件后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "INVALID_KNOWLEDGE_QUERY_REQUEST":
      return `检索问题不符合要求，请修改后重试${LOCAL_FALLBACK_SUFFIX}`;
    case "SUBSCRIPTION_REQUIRED":
      return `当前套餐暂不支持${operation === "query" ? "语义检索" : "构建语义索引"}${LOCAL_FALLBACK_SUFFIX}`;
    case "AUTH_REQUIRED":
    case "UNAUTHORIZED":
      return `登录状态已失效，请重新登录后重试${LOCAL_FALLBACK_SUFFIX}`;
    default:
      return null;
  }
}
function messageForResponseStatus(status, operation) {
  const action = operation === "query" ? "语义检索" : "语义索引构建";
  if (status === 400) {
    return operation === "query" ? `检索问题不符合要求，请修改后重试${LOCAL_FALLBACK_SUFFIX}` : `知识库内容不符合索引要求，请检查文件后重试${LOCAL_FALLBACK_SUFFIX}`;
  }
  if (status === 401 || status === 403) {
    return `登录状态已失效，请重新登录后重试${LOCAL_FALLBACK_SUFFIX}`;
  }
  if (status === 402) {
    return `当前套餐暂不支持${operation === "query" ? "语义检索" : "构建语义索引"}${LOCAL_FALLBACK_SUFFIX}`;
  }
  if (status === 413) return `知识库内容过长，请缩小文件后重新上传${LOCAL_FALLBACK_SUFFIX}`;
  if (status === 429) return `${action}请求过于频繁，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
  if (status === 504) return `${action}超时，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
  if (status === 502 || status === 503) {
    return `${operation === "query" ? "语义检索" : "语义索引"}服务暂时不可用，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
  }
  return `${action}失败，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
}
async function responseMessage(response, operation = "index") {
  try {
    const body = await response.json();
    const code2 = typeof body.code === "string" ? body.code.trim() : "";
    const mapped = messageForResponseCode(code2, operation);
    if (mapped) return mapped;
  } catch {
  }
  return messageForResponseStatus(response.status, operation);
}
function requestErrorMessage(error2, operation = "index") {
  if (error2 instanceof AuthRequiredError) {
    return `登录状态已失效，请重新登录后重试${LOCAL_FALLBACK_SUFFIX}`;
  }
  if (error2 instanceof AuthRefreshUnavailableError) {
    return `登录验证服务暂时不可用，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
  }
  if (error2 instanceof SubscriptionRequiredError) {
    return `当前套餐暂不支持${operation === "query" ? "语义检索" : "构建语义索引"}${LOCAL_FALLBACK_SUFFIX}`;
  }
  if (error2 instanceof ClientUpdateRequiredError) {
    return `当前客户端版本过旧，请更新后重试${LOCAL_FALLBACK_SUFFIX}`;
  }
  return `${operation === "query" ? "语义检索" : "语义索引"}服务暂时不可用，请稍后重试${LOCAL_FALLBACK_SUFFIX}`;
}
function parseResponse(raw) {
  if (!raw || typeof raw !== "object") {
    throw new KnowledgeSemanticIndexError(`语义索引服务返回了无效结果${LOCAL_FALLBACK_SUFFIX}`);
  }
  const source2 = raw;
  if (source2.encoding !== "float32-base64") {
    throw new KnowledgeSemanticIndexError(`语义索引服务返回了不支持的向量编码${LOCAL_FALLBACK_SUFFIX}`);
  }
  const chunks = Array.isArray(source2.chunks) ? source2.chunks.map((item) => {
    const chunk = item && typeof item === "object" ? item : {};
    return {
      id: typeof chunk.id === "string" ? chunk.id : "",
      embedding: typeof chunk.embedding === "string" ? chunk.embedding : ""
    };
  }) : [];
  return {
    modelId: typeof source2.modelId === "string" ? source2.modelId : "",
    dimensions: Number(source2.dimensions),
    indexedAt: Number(source2.indexedAt),
    encoding: "float32-base64",
    chunks
  };
}
function parseQueryEmbeddingResponse(raw) {
  if (!raw || typeof raw !== "object") {
    throw new KnowledgeSemanticIndexError(`语义检索服务返回了无效结果${LOCAL_FALLBACK_SUFFIX}`);
  }
  const source2 = raw;
  if (source2.encoding !== "float32-base64") {
    throw new KnowledgeSemanticIndexError(`语义检索服务返回了不支持的向量编码${LOCAL_FALLBACK_SUFFIX}`);
  }
  const minScore = typeof source2.minScore === "number" ? source2.minScore : Number.NaN;
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new KnowledgeSemanticIndexError(`语义检索服务返回了无效的置信度阈值${LOCAL_FALLBACK_SUFFIX}`);
  }
  return {
    modelId: typeof source2.modelId === "string" ? source2.modelId : "",
    dimensions: Number(source2.dimensions),
    encoding: "float32-base64",
    embedding: typeof source2.embedding === "string" ? source2.embedding : "",
    minScore,
    ...typeof source2.queryEmbeddingMs === "number" && Number.isFinite(source2.queryEmbeddingMs) ? { queryEmbeddingMs: Math.max(0, source2.queryEmbeddingMs) } : {}
  };
}
async function buildRemoteKnowledgeEmbeddingIndex(index2, options = {}) {
  validateIndexForUpload(index2);
  const controller = new AbortController();
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? INDEX_TIMEOUT_MS));
  const timeout = setTimeout(() => controller.abort("knowledge-index-timeout"), timeoutMs);
  try {
    const response = await authFetch(INDEX_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        fileName: index2.fileName,
        fileSize: index2.fileSize,
        chunks: index2.chunks.map((chunk) => ({ id: chunk.id, text: chunk.text }))
      })
    });
    if (!response.ok) throw new KnowledgeSemanticIndexError(await responseMessage(response));
    const parsed = parseResponse(await response.json());
    try {
      return attachLocalKnowledgeEmbeddings(index2, parsed);
    } catch (error2) {
      const message = error2 instanceof Error ? error2.message : "语义索引服务返回了无效结果";
      throw new KnowledgeSemanticIndexError(
        `${message}${message.includes("本地快速检索仍可使用") ? "" : LOCAL_FALLBACK_SUFFIX}`
      );
    }
  } catch (error2) {
    if (error2 instanceof KnowledgeSemanticIndexError) throw error2;
    if (controller.signal.aborted) {
      throw new KnowledgeSemanticIndexError(`语义索引构建超时，请稍后重试${LOCAL_FALLBACK_SUFFIX}`);
    }
    throw new KnowledgeSemanticIndexError(requestErrorMessage(error2));
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchRemoteKnowledgeQueryEmbedding(index2, query, options = {}) {
  const metadata = index2.embeddingMeta;
  const cleanQuery = query.trim();
  if (!metadata || !hasSemanticKnowledgeIndex(index2)) {
    throw new KnowledgeSemanticIndexError("语义索引尚未就绪，请重新上传知识库文件");
  }
  if (!cleanQuery || unicodeLength(cleanQuery) > MAX_QUERY_TEXT_CHARS) {
    throw new KnowledgeSemanticIndexError(`检索问题需要包含 1～${MAX_QUERY_TEXT_CHARS} 个字符`);
  }
  try {
    const response = await authFetch(QUERY_ENDPOINT, {
      method: "POST",
      signal: options.signal,
      body: JSON.stringify({
        query: cleanQuery,
        modelId: metadata.modelId,
        dimensions: metadata.dimensions
      })
    });
    if (!response.ok) {
      throw new KnowledgeSemanticIndexError(await responseMessage(response, "query"));
    }
    return parseQueryEmbeddingResponse(await response.json());
  } catch (error2) {
    if (error2 instanceof KnowledgeSemanticIndexError) throw error2;
    if (options.signal?.aborted) {
      throw new KnowledgeSemanticIndexError("语义检索已取消");
    }
    throw new KnowledgeSemanticIndexError(requestErrorMessage(error2, "query"));
  }
}
const PLANS_NOTICE_STORAGE_KEY = "climb.plansNotice.dismissedUntil";
const PLANS_NOTICE_SUPPRESS_MS = 24 * 60 * 60 * 1e3;
function browserStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}
function shouldShowPlansNotice(storage2 = browserStorage(), nowMs2 = Date.now()) {
  const raw = storage2?.getItem(PLANS_NOTICE_STORAGE_KEY);
  if (!raw) return true;
  const dismissedUntil = Number(raw);
  if (!Number.isFinite(dismissedUntil)) {
    storage2?.removeItem(PLANS_NOTICE_STORAGE_KEY);
    return true;
  }
  return dismissedUntil <= nowMs2;
}
function dismissPlansNoticeFor24Hours(storage2 = browserStorage(), nowMs2 = Date.now()) {
  storage2?.setItem(PLANS_NOTICE_STORAGE_KEY, String(nowMs2 + PLANS_NOTICE_SUPPRESS_MS));
}
const MODE_WORKSPACE_MAIN_CLASS = "no-drag min-h-0 flex-1 overflow-hidden pb-10 pl-2 pr-10 pt-[68px]";
const MODE_PANEL_GRID_CLASS = "grid h-full min-h-0 w-full grid-cols-1";
const MODE_SIDE_PANEL_CLASS = "focus-tools-panel no-drag fixed left-1/2 top-[64px] z-40 max-h-[calc(100vh-72px)] w-[calc(100%-20px)] max-w-[440px] -translate-x-1/2 overflow-y-auto rounded-[20px] border border-black/[.06] bg-[#fafafc]/[.86] p-4 shadow-[0_18px_48px_-28px_rgba(20,20,24,0.52)] backdrop-blur-2xl";
const MODE_ANSWER_PANEL_CLASS = "focus-answer-canvas flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[18px] border border-black/[.06] bg-[#fafafc]/[.78] backdrop-blur-2xl";
const PREPARATION_CHILD_ROUTES = [
  "resume",
  "knowledge",
  "language",
  "hotwords",
  "prompts",
  "api-keys"
];
function practiceHistoryBackDestination(currentRoute, previousRoute = "practice") {
  return currentRoute === "practice-history" ? previousRoute : currentRoute;
}
function practiceHistoryBackLabel(route) {
  const item = DASHBOARD_PRIMARY_NAV_ITEMS.find((entry) => entry.id === route) ?? DASHBOARD_NAV_ITEMS.find((entry) => entry.id === route);
  return `返回${item?.label ?? "模拟面试"}`;
}
const DashboardShell = ({
  activeRoute,
  responseActive,
  onRouteChange,
  onToggleInterview,
  onEnterExamMode,
  onEnterInterviewMode,
  onToggleMouseThrough,
  onExitMode
}) => {
  const settings = useSettings((s2) => s2.settings);
  const patchSettings = useSettings((s2) => s2.patch);
  const authStatus = useAuth((s2) => s2.status);
  const email = useAuth((s2) => s2.email);
  const sub2 = useAuth((s2) => s2.subscription);
  const logout = useAuth((s2) => s2.logout);
  const refreshStatus = useAuth((s2) => s2.refreshStatus);
  const screenshotCount = useSession((s2) => s2.screenshotCount);
  const listening = useSession((s2) => s2.listening);
  const listenStatus = useSession((s2) => s2.listenStatus);
  const audioHealth = useSession((s2) => s2.audioHealth);
  const streaming = useSession((s2) => s2.streaming);
  const activeMode = useSession((s2) => s2.activeMode);
  const mouseThrough = useSession((s2) => s2.mouseThrough);
  const runtimeTask = useSession((s2) => s2.runtimeTask);
  const taskConnectionStatus = useSession((s2) => s2.taskConnectionStatus);
  const taskConnectionMessage = useSession((s2) => s2.taskConnectionMessage);
  const voiceConnectionStatus = useSession((s2) => s2.voiceConnectionStatus);
  const voiceConnectionMessage = useSession((s2) => s2.voiceConnectionMessage);
  const recoveryStatus = isTaskConnectionRecovering(taskConnectionStatus) ? taskConnectionStatus : activeMode === "interview" ? voiceConnectionStatus : taskConnectionStatus;
  const recoveryMessage = isTaskConnectionRecovering(taskConnectionStatus) ? taskConnectionMessage : voiceConnectionMessage;
  const retryTaskConnection = () => {
    void retryUsageSessionConnection().then(() => {
      retryVoiceConnection();
    }).catch(() => void 0);
  };
  const remotePairingStatus = useRemoteControl((s2) => s2.pairing?.status);
  const remoteMobileOnline = useRemoteControl((s2) => s2.mobileOnline);
  const [menuOpen, setMenuOpen] = reactExports.useState(false);
  const [onboardingOpen, setOnboardingOpen] = reactExports.useState(false);
  const [taskLaunchKind, setTaskLaunchKind] = reactExports.useState(null);
  const [focusToolsOpen, setFocusToolsOpen] = reactExports.useState(false);
  const [practiceHistoryInitialSessionId, setPracticeHistoryInitialSessionId] = reactExports.useState(null);
  const [practiceHistoryBackRoute, setPracticeHistoryBackRoute] = reactExports.useState("practice");
  const [resumeLibraryStatus, setResumeLibraryStatus] = reactExports.useState(
    CHECKING_RESUME_LIBRARY_STATUS
  );
  const resumeStatus = primaryResumeStatus(resumeLibraryStatus);
  const [localKnowledgeIndexes, setLocalKnowledgeIndexes] = reactExports.useState([]);
  const [knowledgeLibraryLoading, setKnowledgeLibraryLoading] = reactExports.useState(false);
  const [knowledgeLibraryError, setKnowledgeLibraryError] = reactExports.useState("");
  const knowledgeLibraryLoadGenerationRef = reactExports.useRef(0);
  const localKnowledge = localKnowledgeIndexes[0] ?? null;
  const [captureDisplays, setCaptureDisplays] = reactExports.useState([]);
  const [lastInterviewMaterialSelection, setLastInterviewMaterialSelection] = reactExports.useState({});
  const resumeStatusControllerRef = reactExports.useRef(null);
  if (!resumeStatusControllerRef.current) {
    resumeStatusControllerRef.current = createResumeLibraryStatusController(getResumes);
  }
  reactExports.useEffect(() => {
    if (activeMode !== "idle") {
      setTaskLaunchKind(null);
      setOnboardingOpen(false);
      if (runtimeTask.status === "error") setFocusToolsOpen(true);
    }
  }, [activeMode, runtimeTask.status]);
  const resumeAccountKey = (authStatus === "loggedIn" || authStatus === "expired") && email ? email.trim().toLowerCase() : null;
  const resumeAccountKeyRef = reactExports.useRef(resumeAccountKey);
  resumeAccountKeyRef.current = resumeAccountKey;
  const refreshResumeStatus = reactExports.useCallback(() => {
    const controller = resumeStatusControllerRef.current;
    if (!controller) return;
    if (!resumeAccountKey) {
      controller.reset(setResumeLibraryStatus);
      return;
    }
    void controller.refresh(setResumeLibraryStatus);
  }, [resumeAccountKey]);
  const handleResumeChanged = reactExports.useCallback((resume) => {
    const controller = resumeStatusControllerRef.current;
    if (!controller || !resumeAccountKey || resumeAccountKeyRef.current !== resumeAccountKey) return;
    if (resume) controller.setPersisted(resume, setResumeLibraryStatus);
    void controller.refresh(setResumeLibraryStatus);
  }, [resumeAccountKey]);
  const handleResumeDeleted = reactExports.useCallback((resumeId) => {
    const controller = resumeStatusControllerRef.current;
    if (!controller || !resumeAccountKey || resumeAccountKeyRef.current !== resumeAccountKey) return;
    controller.setDeleted(resumeId, setResumeLibraryStatus);
    void controller.refresh(setResumeLibraryStatus);
  }, [resumeAccountKey]);
  reactExports.useEffect(() => {
    const controller = resumeStatusControllerRef.current;
    if (!controller) return;
    controller.reset(setResumeLibraryStatus);
    if (resumeAccountKey) void controller.refresh(setResumeLibraryStatus);
    return () => controller.invalidate();
  }, [resumeAccountKey]);
  reactExports.useEffect(() => {
    if (activeMode !== "idle") setTaskLaunchKind(null);
  }, [activeMode]);
  const refreshKnowledgeLibrary = reactExports.useCallback(async (accountKey) => {
    if (resumeAccountKeyRef.current !== accountKey) return;
    const generation2 = ++knowledgeLibraryLoadGenerationRef.current;
    setKnowledgeLibraryLoading(true);
    setKnowledgeLibraryError("");
    try {
      const indexes = await listLocalKnowledgeIndexes(accountKey);
      if (knowledgeLibraryLoadGenerationRef.current === generation2 && resumeAccountKeyRef.current === accountKey) {
        setLocalKnowledgeIndexes(indexes);
      }
    } catch (error2) {
      if (knowledgeLibraryLoadGenerationRef.current === generation2 && resumeAccountKeyRef.current === accountKey) {
        const message = error2 instanceof Error ? error2.message : String(error2);
        setKnowledgeLibraryError(message);
        window.api.log.error("[knowledge-library] load failed", error2);
      }
    } finally {
      if (knowledgeLibraryLoadGenerationRef.current === generation2 && resumeAccountKeyRef.current === accountKey) {
        setKnowledgeLibraryLoading(false);
      }
    }
  }, []);
  reactExports.useEffect(() => {
    ++knowledgeLibraryLoadGenerationRef.current;
    setLocalKnowledgeIndexes([]);
    setKnowledgeLibraryError("");
    if (!resumeAccountKey) {
      setKnowledgeLibraryLoading(false);
      return;
    }
    void refreshKnowledgeLibrary(resumeAccountKey);
    return () => {
      ++knowledgeLibraryLoadGenerationRef.current;
    };
  }, [resumeAccountKey, refreshKnowledgeLibrary]);
  reactExports.useEffect(() => {
    setLastInterviewMaterialSelection({});
  }, [resumeAccountKey]);
  reactExports.useEffect(() => {
    setLastInterviewMaterialSelection((current) => ({
      resumeId: current.resumeId === null ? null : current.resumeId && resumeLibraryStatus.resumes.some((item) => item.id === current.resumeId) ? current.resumeId : resumeLibraryStatus.resumes[0]?.id,
      knowledgeId: current.knowledgeId && localKnowledgeIndexes.some((item) => item.id === current.knowledgeId) ? current.knowledgeId : null
    }));
  }, [resumeLibraryStatus.resumes, localKnowledgeIndexes]);
  reactExports.useEffect(() => {
    if (mouseThrough) setFocusToolsOpen(false);
  }, [mouseThrough]);
  const refreshCaptureDisplays2 = reactExports.useCallback(() => {
    void window.api.screenshot.displays().then(setCaptureDisplays).catch(() => setCaptureDisplays([]));
  }, []);
  reactExports.useEffect(() => {
    if (activeMode === "idle") refreshCaptureDisplays2();
  }, [activeMode, activeRoute, refreshCaptureDisplays2]);
  const userName = getUserDisplayName(email);
  const quota = buildQuotaSummary(sub2);
  const customPromptLength = Array.from(settings.customPrompts.trim()).length;
  const refreshPlanStatus = () => {
    void refreshStatus(true);
  };
  const handleRouteChange = (route) => {
    if (route === "practice-history") {
      setPracticeHistoryBackRoute((previous2) => practiceHistoryBackDestination(activeRoute, previous2));
    }
    if (route !== "practice-history") setPracticeHistoryInitialSessionId(null);
    if (route === "home") {
      refreshPlanStatus();
      refreshResumeStatus();
    }
    onRouteChange(route);
  };
  const openPracticeHistory = (sessionId2) => {
    setPracticeHistoryInitialSessionId(sessionId2?.trim() || null);
    handleRouteChange("practice-history");
  };
  const requestExamMode = () => setTaskLaunchKind("exam");
  const requestInterviewMode = () => {
    refreshResumeStatus();
    setTaskLaunchKind("interview");
  };
  const selectedLocalDisplay = settings.localScreenshotDisplayId ? captureDisplays.find((display) => display.id === settings.localScreenshotDisplayId) ?? null : captureDisplays.find((display) => display.isPrimary) ?? null;
  const localDisplayLabel = settings.localScreenshotDisplayId ? selectedLocalDisplay?.label ?? "已断开的显示器" : selectedLocalDisplay ? `主显示器 · ${selectedLocalDisplay.label}` : "主显示器（推荐）";
  const remotePhoneSummary = getRemoteControlPhoneSummary(
    remotePairingStatus,
    remoteMobileOnline
  );
  const taskLaunchMaterials = taskLaunchKind === "exam" ? [
    { label: "编程语言", value: settings.language, ready: true },
    { label: "解题模式", value: settings.solverMode, ready: true },
    { label: "回答语言", value: settings.answerLanguage, ready: true },
    {
      label: "自定义提示",
      value: customPromptLength > 0 ? `已配置 ${customPromptLength} 字` : "使用默认策略",
      ready: true
    },
    {
      label: "本地截图屏幕",
      value: localDisplayLabel,
      ready: settings.localScreenshotDisplayId === null || selectedLocalDisplay !== null
    },
    {
      label: "手机远控（可选）",
      value: remotePhoneSummary.label,
      ready: true
    }
  ] : [
    {
      label: "简历",
      value: resumeLibraryStatus.resumes.length > 0 ? `${resumeLibraryStatus.resumes.length} 份可选` : resumeStatusLabel(resumeStatus),
      ready: resumeLibraryStatus.resumes.length > 0
    },
    {
      label: "本地知识库",
      value: localKnowledgeIndexes.length > 0 ? `${localKnowledgeIndexes.length} 份可选` : "未配置（可选）",
      ready: true
    },
    { label: "回答语言", value: settings.answerLanguage, ready: true },
    { label: "面试热词", value: `${settings.interviewHotwords.length} 个`, ready: true },
    {
      label: "自定义提示",
      value: customPromptLength > 0 ? `已配置 ${customPromptLength} 字` : "使用默认策略",
      ready: true
    }
  ];
  const taskLaunchDialog = taskLaunchKind ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    TaskLaunchDialog,
    {
      kind: taskLaunchKind,
      materials: taskLaunchMaterials,
      primaryHotkey: taskLaunchKind === "interview" ? settings.hotkeys["listen:toggle"] : settings.hotkeys["screenshot:capture"],
      recoveryHotkey: settings.hotkeys["window:toggleMouseThrough"],
      initialExamModelProfile: settings.examVisionModelProfile,
      initialInterviewVoiceModelProfile: settings.interviewVoiceModelProfile,
      initialVoiceLlmMaxTokens: settings.voiceLlmMaxTokens,
      interviewResumeOptions: resumeLibraryStatus.resumes.map((resume) => ({
        id: resume.id,
        label: `${resume.profile.name ? `${resume.profile.name} · ` : ""}${resume.fileName} · ${resume.updatedAt.slice(0, 10)}`
      })),
      interviewKnowledgeOptions: localKnowledgeIndexes.map((index2) => ({
        id: index2.id,
        label: `${index2.fileName} · ${new Date(index2.updatedAt).toLocaleDateString()}`
      })),
      initialInterviewMaterialSelection: lastInterviewMaterialSelection,
      onPreflight: async (interactionMode, signal) => {
        const cancelled = () => signal.aborted;
        {
          if (cancelled()) return { ok: false, code: "ABORTED", recovery: "retry", message: "启动检查已取消。" };
          const registration = await window.api.hotkey.status(taskLaunchKind);
          if (cancelled()) return { ok: false, code: "ABORTED", recovery: "retry", message: "启动检查已取消。" };
          const missing = requiredTaskHotkeys(taskLaunchKind, interactionMode).filter((action) => !registration[action]);
          if (missing.length > 0) {
            const labels = missing.map((action) => settings.hotkeys[action] || action);
            return {
              ok: false,
              code: "HOTKEY_UNAVAILABLE",
              recovery: "hotkeys",
              message: `快捷键被占用或注册失败：${labels.join("、")}。请打开设置改绑后重试。`
            };
          }
        }
        if (taskLaunchKind === "exam") {
          try {
            if (cancelled()) return { ok: false, code: "ABORTED", recovery: "retry", message: "启动检查已取消。" };
            const probe = await window.api.screenshot.probe(
              settings.localScreenshotDisplayId ?? void 0
            );
            if (cancelled()) return { ok: false, code: "ABORTED", recovery: "retry", message: "启动检查已取消。" };
            return probe.ok ? { ok: true, message: `已实际获取${localDisplayLabel}画面，本次不会加入截图队列。` } : {
              ok: false,
              code: probe.error.code,
              recovery: "screen",
              message: `${localDisplayLabel}截图检查失败：${probe.error.message}（${probe.error.code}）`
            };
          } catch (error2) {
            return {
              ok: false,
              code: "CAPTURE_FAILED",
              recovery: "screen",
              message: "屏幕源检查失败：" + (error2 instanceof Error ? error2.message : String(error2))
            };
          }
        }
        if (cancelled()) return { ok: false, code: "ABORTED", recovery: "retry", message: "启动检查已取消。" };
        const result = await probeSystemAudioBeforeMeeting({ signal });
        if (cancelled()) return { ok: false, code: "ABORTED", recovery: "retry", message: "启动检查已取消。" };
        return result.ok ? { ok: true, code: result.code, message: result.message } : {
          ok: false,
          code: result.code,
          recovery: "audio",
          message: result.message
        };
      },
      onConfirm: async (interactionMode, shortcutOverlayEnabled, signal, examModelProfile, interviewVoiceModelProfile, voiceLlmMaxTokens, interviewMaterialSelection) => {
        if (signal.aborted) return false;
        const launchKind = taskLaunchKind;
        let entered = false;
        if (settings.examVisionModelProfile !== examModelProfile || settings.interviewVoiceModelProfile !== interviewVoiceModelProfile || settings.voiceLlmMaxTokens !== voiceLlmMaxTokens) {
          await patchSettings({
            examVisionModelProfile: examModelProfile,
            interviewVoiceModelProfile,
            voiceLlmMaxTokens
          });
        }
        if (signal.aborted) return false;
        if (taskLaunchKind === "interview") {
          const selectedResume = resumeLibraryStatus.resumes.find(
            (resume) => resume.id === interviewMaterialSelection.resumeId
          );
          if (interviewMaterialSelection.resumeId && !selectedResume) return false;
          const selectedKnowledge = interviewMaterialSelection.knowledgeId ? localKnowledgeIndexes.find((index2) => index2.id === interviewMaterialSelection.knowledgeId) ?? null : null;
          if (interviewMaterialSelection.knowledgeId && !selectedKnowledge) return false;
          setLastInterviewMaterialSelection(interviewMaterialSelection);
          entered = await onEnterInterviewMode(
            interactionMode,
            shortcutOverlayEnabled,
            signal,
            examModelProfile,
            interviewVoiceModelProfile,
            voiceLlmMaxTokens,
            interviewMaterialSelection,
            selectedKnowledge
          );
        } else {
          entered = await onEnterExamMode(
            interactionMode,
            shortcutOverlayEnabled,
            signal,
            examModelProfile,
            interviewVoiceModelProfile
          );
        }
        const committed = launchKind !== null && useSession.getState().activeMode === launchKind;
        if (!committed && (signal.aborted || entered !== true)) return false;
        setFocusToolsOpen(false);
        setTaskLaunchKind(null);
        return true;
      },
      onOpenPreparation: () => {
        setTaskLaunchKind(null);
        handleRouteChange("preparation");
      },
      onOpenApiKeys: () => {
        setTaskLaunchKind(null);
        handleRouteChange("api-keys");
      },
      onOpenSettings: () => {
        setTaskLaunchKind(null);
        handleRouteChange("settings");
      },
      onClose: () => setTaskLaunchKind(null)
    },
    taskLaunchKind
  ) : null;
  const previewOpacity = (next) => {
    const clamped = normalizeWindowOpacity(next);
    void window.api.window.previewOpacity(clamped);
  };
  const commitOpacity = (next) => {
    const clamped = normalizeWindowOpacity(next);
    void patchSettings({ opacity: clamped });
  };
  if (activeRoute === "home" && activeMode === "exam") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ModeWorkspace,
      {
        kind: "exam",
        title: "笔试模式",
        connectionStatus: recoveryStatus,
        connectionMessage: recoveryMessage,
        onRetryConnection: retryTaskConnection,
        status: runtimeTaskStatusLabel(runtimeTask.status, streaming ? "生成中" : screenshotCount > 0 ? `截图队列 ${screenshotCount} 张` : "等待截图"),
        remainingTimeLabel: quota.timeRemainingLabel,
        startedAt: runtimeTask.status === "active" ? runtimeTask.startedAt : null,
        primaryHotkey: settings.hotkeys["screenshot:capture"],
        opacity: settings.opacity,
        mouseThrough,
        mouseThroughHotkey: settings.hotkeys["window:toggleMouseThrough"],
        onOpacityPreview: previewOpacity,
        onOpacityCommit: commitOpacity,
        onToggleMouseThrough,
        onExit: onExitMode,
        toolsOpen: focusToolsOpen,
        onToggleTools: () => setFocusToolsOpen((open2) => !open2),
        interactionMode: runtimeInteractionMode(runtimeTask),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(ExamModePanel, {})
      }
    ) });
  }
  if (activeRoute === "home" && activeMode === "interview") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(AudioHealthLiveRegion, { health: audioHealth }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ModeWorkspace,
        {
          kind: "interview",
          title: "面试模式",
          connectionStatus: recoveryStatus,
          connectionMessage: recoveryMessage,
          onRetryConnection: retryTaskConnection,
          status: runtimeTaskStatusLabel(runtimeTask.status, audioHealth.status === "failed" ? audioHealthHeadline(audioHealth, listenStatus) : listening ? audioHealthHeadline(audioHealth, listenStatus) : streaming ? "生成中" : "等待开始"),
          remainingTimeLabel: quota.timeRemainingLabel,
          startedAt: runtimeTask.status === "active" ? runtimeTask.startedAt : null,
          primaryHotkey: settings.hotkeys["listen:toggle"],
          opacity: settings.opacity,
          mouseThrough,
          mouseThroughHotkey: settings.hotkeys["window:toggleMouseThrough"],
          onOpacityPreview: previewOpacity,
          onOpacityCommit: commitOpacity,
          onToggleMouseThrough,
          onExit: onExitMode,
          toolsOpen: focusToolsOpen,
          onToggleTools: () => setFocusToolsOpen((open2) => !open2),
          interactionMode: runtimeInteractionMode(runtimeTask),
          audioHealth,
          listening,
          taskBusy: runtimeTask.status === "starting" || runtimeTask.status === "ending",
          onRetryInterview: onToggleInterview,
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(InterviewModePanel, {})
        }
      )
    ] });
  }
  const renderContent = () => {
    if (responseActive) return /* @__PURE__ */ jsxRuntimeExports.jsx(ResponsePanel, {});
    if (activeRoute === "home") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        HomePage,
        {
          screenshotCount,
          listening,
          listenStatus,
          resumeStatus,
          knowledgeIndex: localKnowledge,
          resumeCount: resumeLibraryStatus.resumes.length,
          knowledgeCount: localKnowledgeIndexes.length,
          quota,
          captureHotkey: settings.hotkeys["screenshot:capture"],
          listenHotkey: settings.hotkeys["listen:toggle"],
          hideHotkey: settings.hotkeys["window:toggle"],
          onRequestExamMode: requestExamMode,
          onEnterInterviewMode: requestInterviewMode,
          onOpenPractice: () => handleRouteChange("practice"),
          onOpenPlans: () => onRouteChange("plans"),
          onRefreshPlan: refreshPlanStatus,
          onOpenOnboarding: () => setOnboardingOpen(true),
          onRouteChange: handleRouteChange
        }
      );
    }
    if (activeRoute === "practice") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        PracticeInterviewPage,
        {
          initialResume: resumeStatus.state === "ready" ? resumeStatus.resume : resumeStatus.state === "missing" ? null : void 0,
          onResumeChanged: handleResumeChanged,
          onOpenResume: () => handleRouteChange("resume"),
          onOpenPracticeHistory: openPracticeHistory
        },
        `practice:${resumeAccountKey ?? "anonymous"}`
      );
    }
    if (activeRoute === "local-records") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(LocalRecordsPage, { accountKey: resumeAccountKey, onOpenPracticeHistory: () => openPracticeHistory() });
    }
    if (activeRoute === "practice-history") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        PracticeHistoryPage,
        {
          initialSessionId: practiceHistoryInitialSessionId,
          onBack: () => handleRouteChange(practiceHistoryBackRoute),
          backLabel: practiceHistoryBackLabel(practiceHistoryBackRoute),
          onResume: (sessionId2) => {
            setPracticeHistoryInitialSessionId(null);
            try {
              window.localStorage.setItem("climb.practice.activeSessionId", sessionId2);
            } catch {
            }
            handleRouteChange("practice");
          }
        }
      );
    }
    if (activeRoute === "resume") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResumePage,
        {
          resumes: resumeLibraryStatus.resumes,
          loading: resumeLibraryStatus.state === "checking" && resumeLibraryStatus.resumes.length === 0,
          loadError: resumeLibraryStatus.state === "error",
          onResumeChanged: handleResumeChanged,
          onResumeDeleted: handleResumeDeleted,
          onRetry: refreshResumeStatus,
          onBack: () => handleRouteChange("preparation")
        },
        `resume:${resumeAccountKey ?? "anonymous"}`
      );
    }
    if (activeRoute === "knowledge") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        KnowledgePage,
        {
          accountKey: resumeAccountKey ?? "",
          initialIndexes: localKnowledgeIndexes,
          loading: knowledgeLibraryLoading,
          loadError: knowledgeLibraryError,
          onIndexesChange: (indexes) => {
            if (resumeAccountKeyRef.current === resumeAccountKey) {
              setLocalKnowledgeIndexes(indexes);
            }
          },
          onReload: () => resumeAccountKey ? refreshKnowledgeLibrary(resumeAccountKey) : Promise.resolve(),
          onBack: () => handleRouteChange("preparation")
        },
        `knowledge:${resumeAccountKey ?? "anonymous"}`
      );
    }
    if (activeRoute === "preparation") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        PreparationCenter,
        {
          resumeStatus,
          knowledgeIndex: localKnowledge,
          resumeCount: resumeLibraryStatus.resumes.length,
          knowledgeCount: localKnowledgeIndexes.length,
          answerLanguage: settings.answerLanguage,
          hotwordCount: settings.interviewHotwords.length,
          customPromptLength,
          programmingLanguage: settings.language,
          solverMode: settings.solverMode,
          localScreenshotDisplayId: settings.localScreenshotDisplayId,
          captureDisplays,
          onProgrammingLanguageChange: (language2) => void patchSettings({ language: language2 }),
          onSolverModeChange: (solverMode) => void patchSettings({ solverMode }),
          onLocalScreenshotDisplayChange: (displayId) => {
            void patchSettings({ localScreenshotDisplayId: displayId });
          },
          onRefreshCaptureDisplays: refreshCaptureDisplays2,
          onRouteChange: handleRouteChange
        }
      );
    }
    if (activeRoute === "settings") return /* @__PURE__ */ jsxRuntimeExports.jsx(SettingsPanel, {});
    if (activeRoute === "language") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(LanguagePage, { onBack: () => handleRouteChange("preparation") });
    }
    if (activeRoute === "hotwords") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(HotwordsPage, { onBack: () => handleRouteChange("preparation") });
    }
    if (activeRoute === "prompts") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(PromptsPage, { onBack: () => handleRouteChange("preparation") });
    }
    if (activeRoute === "api-keys") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ApiKeyManagementPage, { onBack: () => handleRouteChange("preparation") });
    }
    if (activeRoute === "help") return /* @__PURE__ */ jsxRuntimeExports.jsx(HelpPage, {});
    if (activeRoute === "plans") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        PlansPage,
        {
          quota,
          onRefresh: () => void refreshStatus(true)
        }
      );
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsx(PlaceholderPage, { route: activeRoute, onRouteChange: handleRouteChange });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-dashboard-shell": true,
      className: "dashboard-root drag relative h-full w-full overflow-hidden rounded-[18px] bg-[#f1f1ef] text-slate-950",
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full min-h-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "aside",
          {
            "data-dashboard-sidebar": true,
            className: "drag flex w-[196px] shrink-0 flex-col border-r border-black/[.06] bg-[#f1f1ef] lg:w-[214px]",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-14 items-center gap-2.5 px-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(ClimbMark, {}),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-w-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-[15px] font-semibold tracking-wide text-slate-950", children: "Climb" }) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { className: "no-drag flex-1 overflow-y-auto px-2.5 py-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-2 px-2.5 text-[11px] font-medium tracking-[0.08em] text-slate-400", children: "工作台" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: DASHBOARD_PRIMARY_NAV_ITEMS.map((item) => {
                  const active = !responseActive && (activeRoute === item.id || item.id === "preparation" && PREPARATION_CHILD_ROUTES.includes(activeRoute));
                  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "button",
                    {
                      type: "button",
                      "aria-current": active ? "page" : void 0,
                      onClick: () => handleRouteChange(item.id),
                      className: `flex h-10 w-full items-center gap-3 rounded-[9px] px-3 text-left text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-500 ${active ? "bg-black/[.065] font-medium text-slate-950" : "text-slate-600 hover:bg-black/[.04] hover:text-slate-950"}`,
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(NavIcon, { route: item.id }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: item.label })
                      ]
                    },
                    item.id
                  );
                }) })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { "data-dashboard-canvas": true, className: "flex min-w-0 flex-1 flex-col bg-white", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "drag flex h-14 shrink-0 items-center justify-between border-b border-black/[.06] bg-white px-5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "no-drag flex min-w-0 flex-1 items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              OpacitySlider,
              {
                opacity: settings.opacity,
                onPreview: previewOpacity,
                onCommit: commitOpacity
              }
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "no-drag relative flex shrink-0 items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(StatusPill, { listening, listenStatus, streaming }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => setMenuOpen((v2) => !v2),
                  className: "flex h-9 items-center gap-2 rounded-full border border-black/[.08] bg-white px-1.5 pr-2.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-[#f7f7f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-6 w-6 items-center justify-center rounded-full bg-[#292724] text-[11px] font-semibold text-white", children: userName.slice(0, 1).toUpperCase() }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden max-w-[104px] truncate min-[860px]:block", children: userName }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, {})
                  ]
                }
              ),
              menuOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute right-0 top-12 z-30 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.45)]", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-3 py-2 text-[12px] text-slate-500", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium text-slate-900", children: userName }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate", children: email ?? "未绑定邮箱" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setMenuOpen(false);
                      handleRouteChange("practice-history");
                    },
                    className: "w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100",
                    children: "模拟面试记录"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setMenuOpen(false);
                      handleRouteChange("plans");
                    },
                    className: "w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100",
                    children: "套餐与用量"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setMenuOpen(false);
                      setOnboardingOpen(true);
                    },
                    className: "w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100",
                    children: "新手引导"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setMenuOpen(false);
                      handleRouteChange("help");
                    },
                    className: "w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100",
                    children: "帮助文档"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setMenuOpen(false);
                      void refreshStatus(true);
                    },
                    className: "w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100",
                    children: "刷新套餐"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setMenuOpen(false);
                      void logout();
                    },
                    className: "w-full rounded-lg px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50",
                    children: "退出登录"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(WindowControls, {})
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: activeRoute === "practice" ? "no-drag min-h-0 flex-1 overflow-hidden" : "no-drag min-h-0 flex-1 overflow-y-auto bg-white px-5 py-6 sm:px-7 lg:px-8", children: renderContent() })
        ] }),
        taskLaunchDialog,
        onboardingOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
          OnboardingGuide,
          {
            onClose: () => setOnboardingOpen(false),
            onOpenPreparation: () => {
              setOnboardingOpen(false);
              handleRouteChange("preparation");
            }
          }
        )
      ] })
    }
  );
};
const ONBOARDING_STEPS = [
  {
    eyebrow: "第 1 步 · 选择任务",
    title: "先选择你正在进行的场景",
    body: "实时面试识别电脑播放的面试官声音；笔试 Solver 通过截图答题；模拟面试用于事前练习和复盘。"
  },
  {
    eyebrow: "第 2 步 · 准备材料",
    title: "材料是可选的，但会影响回答质量",
    body: "简历用于经历题和项目题，知识库用于补充岗位资料；回答语种、热词和自定义提示词可以在准备中心调整。"
  },
  {
    eyebrow: "第 3 步 · 启动检查",
    title: "正式开始前先完成一次检查",
    body: "选择普通或防切屏模式，确认截图屏幕、系统音频和快捷键均可用。笔试时还可以选择 Gemini 或豆包。"
  },
  {
    eyebrow: "第 4 步 · 记住核心快捷键",
    title: "任务中不必频繁切回软件",
    body: "Ctrl+Q 截图并提交，Ctrl+3 开关语音，Ctrl+E 显示或隐藏窗口，Ctrl+Shift+X 恢复交互，Ctrl+Shift+Z 退出笔试。快捷键可在设置中修改。"
  },
  {
    eyebrow: "第 5 步 · 先试一次",
    title: "建议在正式任务前完成一次演练",
    body: "先在准备中心补充必要材料，再打开目标会议或考试页面完成启动检查。任何启动操作都需要你再次确认，不会在这里直接计费。"
  }
];
const OnboardingGuide = ({ onClose, onOpenPreparation }) => {
  const [stepIndex, setStepIndex] = reactExports.useState(0);
  const primaryRef = reactExports.useRef(null);
  const step = ONBOARDING_STEPS[stepIndex];
  const lastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  reactExports.useEffect(() => {
    primaryRef.current?.focus();
  }, [stepIndex]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "no-drag fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-5 backdrop-blur-[2px]",
      onKeyDown: (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "section",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "onboarding-title",
          "aria-describedby": "onboarding-description",
          className: "w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.75)]",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] font-semibold uppercase tracking-[0.12em] text-blue-600", children: step.eyebrow }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "onboarding-title", className: "mt-2 text-[22px] font-semibold text-slate-950", children: step.title })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  "aria-label": "关闭新手引导",
                  onClick: onClose,
                  className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[24px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700",
                  children: "×"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { id: "onboarding-description", className: "mt-4 text-[14px] leading-7 text-slate-600", children: step.body }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6 flex gap-2", "aria-label": "引导进度", children: ONBOARDING_STEPS.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                "aria-hidden": "true",
                className: `h-1.5 flex-1 rounded-full ${index2 <= stepIndex ? "bg-blue-600" : "bg-slate-200"}`
              },
              item.eyebrow
            )) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex items-center justify-between gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: onClose,
                  className: "h-10 rounded-lg px-3 text-[13px] font-medium text-slate-500 hover:bg-slate-100",
                  children: "稍后再看"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
                stepIndex > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => setStepIndex((index2) => Math.max(0, index2 - 1)),
                    className: "h-10 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 hover:bg-slate-50",
                    children: "上一步"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    ref: primaryRef,
                    type: "button",
                    onClick: () => {
                      if (lastStep) onOpenPreparation();
                      else setStepIndex((index2) => Math.min(ONBOARDING_STEPS.length - 1, index2 + 1));
                    },
                    className: "h-10 min-w-[112px] rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700",
                    children: lastStep ? "打开准备中心" : "下一步"
                  }
                )
              ] })
            ] })
          ]
        }
      )
    }
  );
};
const PlansNoticeDialog = ({ suppressChecked, onSuppressChange, onClose, onConfirm }) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "no-drag fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-950/20 px-4 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "section",
  {
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "plans-notice-title",
    "aria-describedby": "plans-notice-description",
    className: "max-h-[calc(100vh-2rem)] w-full max-w-[520px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-42px_rgba(15,23,42,0.65)]",
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { id: "plans-notice-title", className: "text-[17px] font-semibold text-slate-950", children: "购买前温馨提醒" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { id: "plans-notice-description", className: "mt-2 text-[13px] leading-relaxed text-slate-600", children: "请先确认套餐规则和订单号审核流程，避免付款后等待时产生误解。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            "aria-label": "关闭",
            onClick: onClose,
            className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(CloseIcon, {})
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] font-semibold text-slate-950", children: "套餐说明" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "mt-3 space-y-2 text-[13px] leading-relaxed text-slate-600", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "1 小时套餐按软件实际使用时长计费，在工作台确认并进入面试/笔试后开始消耗，退出任务后停止。" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "1 天套餐审核通过后完整 24 小时有效，期间不限次数开始/结束使用。" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "7 天有效，7 天内不限次数使用。" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "1 个月内不限次数使用。" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800", children: "当前使用收款码付款，需要提交完整交易单号；管理员审核通过后套餐才会生效。" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "mt-4 flex items-center gap-2 text-[13px] text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            checked: suppressChecked,
            onChange: (event) => onSuppressChange(event.target.checked),
            className: "h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          }
        ),
        "今日不再提醒，24 小时内不再弹出"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onConfirm,
          className: "h-9 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700",
          children: "我知道了"
        }
      ) })
    ]
  }
) });
const HomePage = ({
  screenshotCount,
  listening,
  listenStatus,
  resumeStatus,
  knowledgeIndex,
  resumeCount,
  knowledgeCount,
  quota,
  captureHotkey,
  listenHotkey,
  hideHotkey,
  onRequestExamMode,
  onEnterInterviewMode,
  onOpenPractice,
  onOpenPlans,
  onRefreshPlan,
  onOpenOnboarding,
  onRouteChange
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-[1040px] flex-col gap-7 pb-8", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "flex flex-wrap items-end justify-between gap-4 border-b border-black/[.06] pb-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] font-medium tracking-[0.08em] text-slate-500", children: "开始新任务" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-2 text-[24px] font-semibold text-slate-950", children: "今天要完成哪一种任务？" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[13px] leading-relaxed text-slate-500", children: "选择后先检查材料、交互方式和采集通道，再进入无导航干扰的专注工作面。" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onOpenOnboarding, className: "h-10 rounded-full border border-blue-200 bg-blue-50 px-4 text-[13px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500", children: "新手引导" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onRouteChange("preparation"), className: "h-10 rounded-full border border-black/[.1] bg-white px-4 text-[13px] font-semibold text-slate-800 transition-colors hover:bg-[#f6f6f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500", children: "打开准备中心" })
    ] })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "grid overflow-hidden rounded-[14px] bg-[#f7f7f5] divide-y divide-black/[.06] lg:grid-cols-3 lg:divide-x lg:divide-y-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ModeCard,
      {
        accent: "blue",
        icon: "mic",
        title: "实时面试",
        subtitle: "识别系统音频并实时生成回答；适合线上面试",
        status: listening ? `运行中 · ${listenStatus}` : void 0,
        primaryLabel: "检查并进入",
        onPrimary: onEnterInterviewMode,
        rows: [
          { label: "语音开关", combo: listenHotkey },
          { label: "隐藏窗口", combo: hideHotkey }
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ModeCard,
      {
        accent: "emerald",
        icon: "scan",
        title: "笔试 Solver",
        subtitle: "一键截图并发送给 AI，提供连接第三设备，适合线上笔试",
        status: screenshotCount > 0 ? `截图队列 ${screenshotCount} 张` : void 0,
        primaryLabel: "确认并进入",
        onPrimary: onRequestExamMode,
        rows: [
          { label: "截图并发送给 AI", combo: captureHotkey },
          { label: "移动窗口", combo: "Ctrl+Shift+方向键" },
          { label: "备用移动", combo: "Alt+Shift+方向键" }
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ModeCard,
      {
        accent: "blue",
        icon: "practice",
        title: "模拟面试",
        subtitle: "由 AI 面试官连续提问，支持岗位选择、语音或文字作答和结构化复盘。",
        primaryLabel: "开始模拟面试",
        onPrimary: onOpenPractice,
        rows: [
          { label: "形式", combo: "语音 / 文字" },
          { label: "结果", combo: "结构化复盘" }
        ]
      }
    )
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "border-t border-black/[.06] pt-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[18px] font-semibold text-slate-950", children: "套餐时间" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onRefreshPlan,
            className: "h-9 rounded-full border border-black/[.1] bg-white px-4 text-[13px] font-medium text-slate-700 hover:bg-[#f6f6f4]",
            children: "刷新"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onOpenPlans,
            className: "h-9 rounded-full bg-[#292724] px-4 text-[13px] font-medium text-white hover:bg-black",
            children: "查看套餐"
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(PlanTimeCard, { quota })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "border-t border-black/[.06] pt-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[16px] font-semibold text-slate-950", children: "准备状态" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[12px] text-slate-500", children: "所有上下文配置集中管理，启动任务时会生成只读快照。" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onRouteChange("preparation"), className: "h-9 rounded-full border border-black/[.1] px-4 text-[13px] font-medium text-slate-700 hover:bg-[#f6f6f4]", children: "管理准备材料" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrepTile, { title: "简历", status: resumeCount ? `已保存 ${resumeCount} 份` : resumeStatusLabel(resumeStatus), onClick: () => onRouteChange("resume") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrepTile, { title: "知识库", status: knowledgeCount ? `已保存 ${knowledgeCount} 份` : knowledgeIndex ? `已配置 · ${knowledgeIndex.fileName}` : "未配置", onClick: () => onRouteChange("knowledge") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrepTile, { title: "回答偏好", status: "语种 / 热词 / 提示词", onClick: () => onRouteChange("preparation") })
    ] })
  ] })
] });
const PreparationCenter = ({
  resumeStatus,
  knowledgeIndex,
  resumeCount,
  knowledgeCount,
  answerLanguage,
  hotwordCount,
  customPromptLength,
  programmingLanguage,
  solverMode,
  localScreenshotDisplayId,
  captureDisplays,
  onProgrammingLanguageChange,
  onSolverModeChange,
  onLocalScreenshotDisplayChange,
  onRefreshCaptureDisplays,
  onRouteChange
}) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto max-w-[1040px] space-y-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
  PageCard,
  {
    title: "准备中心",
    subtitle: "集中完成任务材料、回答偏好、截图屏幕与手机远控配置；连接手机不会自动开始笔试或面试。",
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PreparationCard,
          {
            title: "简历上下文",
            status: resumeCount > 0 ? `已保存 ${resumeCount} 份` : resumeStatusLabel(resumeStatus),
            description: "用于经历题、项目题和个人背景回答。",
            onClick: () => onRouteChange("resume")
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PreparationCard,
          {
            title: "本地知识库",
            status: knowledgeCount > 0 ? `已保存 ${knowledgeCount} 份` : knowledgeIndex ? knowledgeIndex.fileName : "未配置（可选）",
            description: "本地索引业务资料，作为实时面试回答上下文。",
            onClick: () => onRouteChange("knowledge")
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PreparationCard,
          {
            title: "API KEY 管理",
            status: "两套自定义 API",
            description: "分别配置截图答题与实时面试回答的 API 凭据。",
            onClick: () => onRouteChange("api-keys")
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PreparationSelect,
          {
            title: "笔试编程语言",
            value: programmingLanguage,
            options: ["Python", "JavaScript", "TypeScript", "Java", "C++", "Go", "Rust"],
            description: "编程题默认使用的代码语言。",
            onChange: (value) => onProgrammingLanguageChange(value)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PreparationSelect,
          {
            title: "笔试解题模式",
            value: solverMode,
            options: ["LeetCode", "牛客", "系统设计", "通用问答"],
            description: "控制截图分析时的解题侧重。",
            onChange: (value) => onSolverModeChange(value)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ScreenshotDisplaySelect,
          {
            value: localScreenshotDisplayId,
            displays: captureDisplays,
            onChange: onLocalScreenshotDisplayChange,
            onRefresh: onRefreshCaptureDisplays
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PreparationCard,
          {
            title: "回答语言",
            status: answerLanguage,
            description: "统一实时面试和笔试回答语言。",
            onClick: () => onRouteChange("language")
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PreparationCard,
          {
            title: "面试热词",
            status: `${hotwordCount} 个词`,
            description: "提高技术名词、产品名和专有名词的识别稳定性。",
            onClick: () => onRouteChange("hotwords")
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PreparationCard,
          {
            title: "回答提示词",
            status: customPromptLength > 0 ? `已配置 ${customPromptLength} 字` : "使用默认策略",
            description: "补充表达风格与回答侧重点，不覆盖服务端安全策略。",
            onClick: () => onRouteChange("prompts")
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(RemoteControlPanel, {})
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 rounded-[10px] bg-[#f4f6f8] p-4 text-[13px] leading-relaxed text-slate-700", children: "实时任务开始后会冻结本次配置，避免中途修改导致回答口径突然变化。退出任务后即可重新选择。" })
    ]
  }
) });
const PreparationCard = ({ title, status, description, onClick }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick, className: "rounded-[12px] border border-black/[.08] bg-[#fafaf9] p-4 text-left transition-colors hover:border-black/[.18] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-semibold text-slate-900", children: title }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 truncate text-[12px] font-medium text-blue-700", children: status }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[12px] leading-relaxed text-slate-500", children: description })
] });
const PreparationSelect = ({ title, value, options, description, onChange }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "rounded-[12px] border border-black/[.08] bg-[#fafaf9] p-4 text-left", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-[14px] font-semibold text-slate-900", children: title }),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "select",
    {
      value,
      onChange: (event) => onChange(event.target.value),
      className: "mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-blue-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
      children: options.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: option, children: option }, option))
    }
  ),
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-3 block text-[12px] leading-relaxed text-slate-500", children: description })
] });
const ScreenshotDisplaySelect = ({ value, displays, onChange, onRefresh }) => {
  const secondaryDisplays = displays.filter((display) => !display.isPrimary);
  const selectedMissing = Boolean(value && !displays.some((display) => display.id === value));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-[12px] border border-black/[.08] bg-[#fafaf9] p-4 text-left", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[14px] font-semibold text-slate-900", children: "本地截图屏幕" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: (event) => {
            event.preventDefault();
            onRefresh();
          },
          className: "text-[11px] font-medium text-blue-700 hover:text-blue-900",
          children: "刷新"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "select",
      {
        "aria-label": "本地截图屏幕",
        value: value ?? "",
        onChange: (event) => onChange(event.target.value || null),
        className: "mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-blue-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "主显示器（推荐，跟随系统）" }),
          selectedMissing && /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: value ?? "", children: "已断开的显示器" }),
          secondaryDisplays.map((display) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: display.id, children: [
            display.label,
            " · ",
            display.width,
            "×",
            display.height
          ] }, display.id))
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-3 block text-[12px] leading-relaxed text-slate-500", children: "Ctrl+Q 默认截取当前主屏；只有明确选择副屏时才会请求该屏幕，无法安全匹配时会停止而不会误截其他屏幕。" })
  ] });
};
const ModeCard = ({
  accent: accent2,
  icon,
  title,
  subtitle,
  status,
  primaryLabel,
  primaryHotkey,
  onPrimary,
  secondaryLabel,
  secondaryHotkey,
  onSecondary,
  rows
}) => {
  const soft = accent2 === "blue" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700";
  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPrimary();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      role: "button",
      tabIndex: 0,
      onClick: onPrimary,
      onKeyDown: handleKeyDown,
      className: "cursor-pointer bg-transparent p-5 transition-colors hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-500/25",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `flex h-11 w-11 items-center justify-center rounded-xl ${soft}`, children: icon === "practice" ? /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeIcon, {}) : icon === "scan" || accent2 === "emerald" ? /* @__PURE__ */ jsxRuntimeExports.jsx(ScanIcon, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(MicIcon, {}) }),
          status && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-600", children: status })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mt-5 text-[20px] font-semibold text-slate-950", children: title }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 min-h-[42px] text-[14px] leading-relaxed text-slate-500", children: subtitle }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: (event) => {
                event.stopPropagation();
                onPrimary();
              },
              className: "inline-flex h-10 items-center gap-2 rounded-full bg-[#292724] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-black",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: primaryLabel }),
                primaryHotkey && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded bg-white/[.18] px-1.5 py-0.5 font-mono text-[11px]", children: primaryHotkey })
              ]
            }
          ),
          secondaryLabel && onSecondary && secondaryHotkey && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: (event) => {
                event.stopPropagation();
                onSecondary();
              },
              className: "inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 hover:bg-slate-50",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: secondaryLabel }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]", children: secondaryHotkey })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 grid gap-2 border-t border-slate-100 pt-4", children: rows.map((row2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3 text-[13px] text-slate-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: row2.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(KeyCombo, { combo: row2.combo })
        ] }, row2.label)) })
      ]
    }
  );
};
const OpacitySlider = ({ opacity, onPreview, onCommit }) => {
  const [draft, setDraft] = reactExports.useState(null);
  const pct = draft ?? Math.round(opacity * 100);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-2 text-[12px] text-slate-600", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "透明度" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        type: "range",
        "aria-label": "窗口透明度",
        min: MIN_WINDOW_OPACITY * 100,
        max: 100,
        step: 1,
        value: pct,
        onChange: (event) => {
          const value = Number(event.target.value);
          setDraft(value);
          onPreview(value / 100);
        },
        onPointerUp: (event) => {
          const value = Number(event.target.value);
          setDraft(null);
          onCommit(value / 100);
        },
        onKeyUp: (event) => {
          const value = Number(event.currentTarget.value);
          setDraft(null);
          onCommit(value / 100);
        },
        className: "focus-opacity-range min-w-0 flex-1"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "w-9 text-right font-mono text-[11px] text-slate-500", children: [
      pct,
      "%"
    ] })
  ] });
};
const ModeWorkspace = ({
  kind,
  title,
  status,
  connectionStatus,
  connectionMessage,
  onRetryConnection,
  remainingTimeLabel,
  startedAt,
  primaryHotkey,
  opacity,
  mouseThrough,
  mouseThroughHotkey,
  onOpacityPreview,
  onOpacityCommit,
  onToggleMouseThrough,
  onExit,
  toolsOpen,
  onToggleTools,
  interactionMode,
  audioHealth,
  listening = false,
  taskBusy = false,
  onRetryInterview,
  children
}) => {
  const authStatus = useAuth((s2) => s2.status);
  const [clockNow, setClockNow] = reactExports.useState(() => Date.now());
  reactExports.useEffect(() => {
    setClockNow(Date.now());
    if (startedAt === null) return;
    const timer2 = window.setInterval(() => setClockNow(Date.now()), 1e3);
    return () => window.clearInterval(timer2);
  }, [startedAt]);
  const elapsedMinutes = startedAt === null ? 0 : Math.max(0, Math.floor((clockNow - startedAt) / 6e4));
  const compactTime = `${String(elapsedMinutes).padStart(2, "0")} min`;
  const compactHotkey = primaryHotkey.replaceAll("+", " ");
  const connectionRecovering = isTaskConnectionRecovering(connectionStatus);
  const displayedStatus = connectionRecovering ? "连接中" : status;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-focus-root": true,
      "data-focus-workspace": true,
      className: "focus-workspace dashboard-root drag relative flex h-full w-full flex-col overflow-hidden bg-transparent text-slate-950",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "header",
          {
            "data-focus-capsule": true,
            "aria-label": `${title} · ${displayedStatus}`,
            className: "focus-capsule absolute left-1/2 top-1 z-30 flex h-[54px] w-[calc(100%-20px)] max-w-[460px] -translate-x-1/2 items-center gap-2 rounded-full border border-black/[.06] px-2.5 text-slate-900",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: "max-w-[92px] shrink-0 truncate rounded-full bg-white/50 px-3 py-2 text-[12px] tabular-nums text-slate-500 sm:text-[13px]",
                  children: compactTime
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  "data-focus-tools-trigger": true,
                  type: "button",
                  "aria-label": toolsOpen ? "收起任务工具" : "展开任务工具",
                  "aria-expanded": toolsOpen,
                  onClick: onToggleTools,
                  className: "no-drag flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-white/60",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(s$8, { size: 17, weight: "bold", className: toolsOpen ? "rotate-180 transition-transform" : "transition-transform" })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `${connectionRecovering ? "hidden sm:block " : ""}shrink-0 text-[17px] font-semibold tracking-[-0.02em]`, children: "Climb" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: connectionRecovering ? "min-w-0 flex-1 truncate text-center text-[12px] text-amber-700" : "hidden min-w-0 flex-1 truncate text-center text-[12px] text-slate-600 sm:block", children: displayedStatus }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden shrink-0 text-[12px] font-medium text-slate-700 min-[780px]:inline", children: compactHotkey }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  "data-focus-exit": true,
                  type: "button",
                  "aria-label": `结束并退出${title}`,
                  onClick: onExit,
                  className: "no-drag flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#26231f] text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(s$2, { size: 17, weight: "fill" })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(m$2, { "aria-hidden": true, size: 18, weight: "bold", className: "shrink-0 text-slate-400" })
            ]
          }
        ),
        toolsOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "section",
          {
            "data-focus-tools": true,
            "data-focus-tools-panel": true,
            "aria-label": "任务工具",
            className: MODE_SIDE_PANEL_CLASS,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-semibold text-slate-950", children: title }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 truncate text-[12px] text-slate-500", children: displayedStatus }),
                  remainingTimeLabel !== "未开通" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[11px] text-slate-500", children: [
                    "套餐剩余 ",
                    remainingTimeLabel
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-white/80 bg-white/55 px-2.5 py-1 text-[11px] text-slate-600", children: mouseThrough ? "仅快捷键" : interactionMode === "passive" ? "快捷键优先" : "可交互" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-[16px] border border-white/70 bg-white/[.48] p-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  OpacitySlider,
                  {
                    opacity,
                    onPreview: onOpacityPreview,
                    onCommit: onOpacityCommit
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    type: "button",
                    "aria-pressed": mouseThrough,
                    onClick: onToggleMouseThrough,
                    className: "mt-3 flex h-10 w-full items-center justify-between rounded-xl border border-white/80 bg-white/[.58] px-3 text-[12px] font-medium text-slate-700 hover:bg-white/[.78]",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: mouseThrough ? "关闭穿透模式" : "开启穿透模式" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(KeyCombo, { combo: mouseThroughHotkey })
                    ]
                  }
                )
              ] }),
              kind === "interview" && audioHealth && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(AudioHealthNotice, { health: audioHealth }),
                onRetryInterview && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    type: "button",
                    disabled: taskBusy,
                    onClick: onRetryInterview,
                    className: "mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#26231f] px-4 text-[13px] font-semibold text-white hover:bg-black disabled:cursor-wait disabled:opacity-55",
                    children: [
                      listening ? /* @__PURE__ */ jsxRuntimeExports.jsx(i$2, { size: 17 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(m$1, { size: 17 }),
                      taskBusy ? "正在切换…" : listening ? "暂停语音" : "重新开始语音"
                    ]
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: `${MODE_WORKSPACE_MAIN_CLASS} flex flex-col`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            TaskConnectionNotice,
            {
              status: connectionStatus,
              message: connectionMessage,
              onRetry: onRetryConnection,
              accessAction: authStatus === "loggedIn" ? void 0 : {
                label: authStatus === "expired" ? "查看套餐" : "重新登录",
                run: () => useSession.getState().setView(authStatus === "expired" ? "paywall" : "login")
              }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-0 flex-1", children })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(FocusResizeHandle, {})
      ]
    }
  );
};
const ExamModePanel = () => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: MODE_PANEL_GRID_CLASS, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
  ModeAnswerPanel,
  {
    title: "当前题结果",
    empty: "使用截图快捷键提交题目后，答案会显示在这里。",
    latestTurnOnly: true
  }
) });
function audioHealthHeadline(health, fallback) {
  if (health.status === "failed") {
    return health.issues.some((issue) => issue.code === "stream-reconnect-failed") ? "语音服务连接异常" : "音频采集异常";
  }
  if (health.connection === "reconnecting") return "音频与语音链路恢复中";
  if (health.issues.some((issue) => issue.code === "socket-not-sending")) {
    return "语音数据未进入发送队列";
  }
  if (health.issues.some((issue) => issue.code === "vad-filtering")) {
    return "系统声音未通过语音检测";
  }
  if (health.issues.some((issue) => issue.code === "asr-stalled")) {
    return "已发送但识别无返回";
  }
  if (health.issues.some((issue) => issue.code === "long-silent")) {
    return "系统音频接近静音";
  }
  if (health.status === "degraded") return "音频链路需注意";
  const stage = audioPipelineStage(health);
  if (stage === "asr") return "语音识别链路正常";
  if (stage === "socket") return "音频已入队，等待识别";
  if (stage === "vad") return "已检测语音，等待发送";
  if (stage === "pcm") return "已接收系统音频，等待语音检测";
  if (health.status === "starting") return "正在建立音频链路";
  return `语音 ${fallback}`;
}
const AudioHealthNotice = ({ health }) => {
  if (health.status === "idle") return null;
  const stage = audioPipelineStage(health);
  const pipeline = health.pipeline;
  const issue = health.issues.find((candidate) => candidate.severity === "fatal") ?? health.issues.find((candidate) => candidate.severity === "warning") ?? health.issues[0];
  const fatal = issue?.severity === "fatal";
  const degraded = Boolean(issue);
  const message = issue?.message ?? (health.status === "healthy" ? "下方按采集、语音检测、客户端发送和识别返回分段显示当前链路。" : "正在建立系统音频采集与语音服务连接。");
  const classes = fatal ? "border-red-200 bg-red-50 text-red-800" : degraded ? "border-amber-200 bg-amber-50 text-amber-800" : health.status === "healthy" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `mt-4 rounded-lg border p-3 text-[12px] leading-relaxed ${classes}`,
      "data-audio-health": health.status,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold", children: audioHealthHeadline(health, "监听中") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1", children: message }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "mt-2 grid gap-1 border-t border-current/10 pt-2 tabular-nums",
            "data-audio-stage": stage,
            "data-pcm-bytes": pipeline.pcmBytes,
            "data-vad-bytes": pipeline.vadForwardedBytes,
            "data-socket-sent-bytes": pipeline.socketSentBytes,
            "data-socket-dropped-bytes": pipeline.socketDroppedBytes,
            "aria-live": "off",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                "系统音频（PCM）：",
                health.lastPcmRms === null ? "等待数据" : `${health.pcmSignalActive ? "有信号" : "接近静音"} · RMS ${health.lastPcmRms.toFixed(3)} · Peak ${(health.lastPcmPeak ?? 0).toFixed(3)}`
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                "语音检测（VAD）：",
                pipeline.vadForwardedBytes > 0 ? "已放行" : "未放行",
                " · ",
                formatAudioPipelineBytes(pipeline.vadForwardedBytes)
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                "网络发送：WS 已入队 ",
                formatAudioPipelineBytes(pipeline.socketSentBytes),
                pipeline.socketDroppedBytes > 0 ? ` · 丢弃 ${formatAudioPipelineBytes(pipeline.socketDroppedBytes)}` : ""
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                "识别返回（ASR）：Partial ",
                pipeline.asrPartialCount,
                " · Final ",
                pipeline.asrFinalCount
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 opacity-70", children: "RMS/Peak 不代表系统或扬声器音量；诊断仅展示本次会话的信号强度、字节数和事件次数，不包含或保存音频与转写内容。" })
            ]
          }
        ),
        issue && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 opacity-80", children: issue.recoverable ? "链路会继续监测并自动恢复状态。" : "当前采集已中断，请查看上方任务状态及恢复提示。" })
      ]
    }
  );
};
const AudioHealthLiveRegion = ({ health }) => {
  if (health.status === "idle") return null;
  const issue = health.issues.find((candidate) => candidate.severity === "fatal") ?? health.issues.find((candidate) => candidate.severity === "warning") ?? health.issues[0];
  const fatal = issue?.severity === "fatal";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "sr-only",
      role: fatal ? "alert" : "status",
      "aria-live": fatal ? "assertive" : "polite",
      "aria-atomic": "true",
      children: [
        audioHealthHeadline(health, "监听中"),
        "。",
        issue?.message ?? ""
      ]
    }
  );
};
const InterviewModePanel = () => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: MODE_PANEL_GRID_CLASS, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ModeAnswerPanel, { title: "面试回答", empty: "识别到面试官的问题后，回答会显示在这里。" }) });
const ModeAnswerPanel = ({ title, empty: empty2, queuedScreenshots = [], latestTurnOnly = false }) => {
  const queueMode = useSession((s2) => s2.queueMode);
  const chatHistory = useSession((s2) => s2.chatHistory);
  const solverHistory = useSession((s2) => s2.solverHistory);
  const streamText = useSession((s2) => s2.streamText);
  const streaming = useSession((s2) => s2.streaming);
  const listenPartial = useSession((s2) => s2.listenPartial);
  const lastError = useSession((s2) => s2.lastError);
  const taskConnectionStatus = useSession((s2) => s2.taskConnectionStatus);
  const error2 = isTaskConnectionRecovering(taskConnectionStatus) && lastError === TASK_RECONNECT_MESSAGE ? null : lastError;
  const history = queueMode === "solver" ? solverHistory : chatHistory;
  const conversationItems = buildModeConversationItems(history, {
    listenPartial,
    streamText
  }, {
    queuedScreenshots: queueMode === "solver" ? queuedScreenshots : [],
    latestTurnOnly
  });
  const { viewportRef: modeAnswerScrollRef, contentRef, following, scrollPage, jumpToLatest } = useAnswerAutoFollow();
  reactExports.useEffect(() => window.api.hotkey.onTriggered((action) => {
    if (action !== "answer:scrollUp" && action !== "answer:scrollDown") return;
    scrollPage(action === "answer:scrollUp" ? -1 : 1);
  }), [scrollPage]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { "data-focus-card": true, "data-focus-canvas": true, "aria-label": title, className: `${MODE_ANSWER_PANEL_CLASS} relative`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sr-only", role: "status", "aria-live": "polite", children: streaming ? "正在回答…" : "工作区已就绪" }),
    error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "alert", "aria-live": "assertive", className: "mx-4 mt-3 rounded-xl border border-red-200/80 bg-red-50/85 px-3 py-2 text-[12px] text-red-700", children: error2 }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        ref: modeAnswerScrollRef,
        "data-focus-conversation": true,
        tabIndex: 0,
        "aria-label": `${title}内容`,
        className: "focus-conversation min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-3 pr-2 sm:px-4 sm:py-4 sm:pr-2.5",
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: contentRef, className: conversationItems.length === 0 ? "h-full space-y-3" : "space-y-3", children: [
          conversationItems.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full min-h-[120px] items-center justify-center px-5 text-center text-[13px] leading-relaxed text-slate-500", children: empty2 }),
          conversationItems.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              "data-focus-question": item.role === "user" ? "" : void 0,
              "data-focus-answer": item.role === "assistant" ? "" : void 0,
              className: `flex w-full ${item.role === "user" ? "justify-start" : "justify-end"}`,
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                ModeConversationBubble,
                {
                  item,
                  label: item.role === "user" ? item.images.length > 0 || queueMode === "solver" ? "截图输入" : "语音输入" : "AI 回答"
                }
              )
            },
            `${item.ts}-${item.role}-${index2}`
          )),
          streaming && !streamText && !listenPartial && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-2 text-[13px] text-slate-500 animate-pulse", children: "思考中..." })
        ] })
      }
    ),
    !following && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        "data-answer-scroll-latest": true,
        onClick: jumpToLatest,
        className: "no-drag absolute bottom-3 right-4 z-10 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(s$8, { size: 14, "aria-hidden": true }),
          "回到最新"
        ]
      }
    )
  ] });
};
const PlanTimeCard = ({ quota }) => {
  if (!quota.hasDisplayablePlan) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 border-t border-black/[.06] pt-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] text-slate-500", children: "当前套餐" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[20px] font-semibold text-slate-950", children: quota.planLabel })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-right", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] text-slate-500", children: "剩余时间" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[20px] font-semibold text-blue-700", children: quota.timeRemainingLabel })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "h-full rounded-full bg-blue-600",
        style: { width: `${Math.min(100, Math.max(0, quota.timeProgressRatio * 100))}%` }
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "有效期至 ",
        quota.renewDateLabel
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        Math.round(quota.timeProgressRatio * 100),
        "%"
      ] })
    ] }),
    quota.isTimePlan && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-subscription-balances": true, className: "mt-3 space-y-2 border-t border-black/[.06] pt-3 text-[12px] text-slate-600", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap justify-between gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "日历套餐" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: quota.calendarActive ? "生效中" : quota.calendarExpired ? "已到期" : "未生效" })
      ] }),
      quota.calendarRenewDateLabel && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap justify-between gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "日历有效期至" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: quota.calendarRenewDateLabel })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap justify-between gap-2 font-medium text-slate-800", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "小时余额" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: quota.hourRemainingLabel })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "leading-relaxed text-slate-500", children: quota.calendarActive ? "优先使用日历套餐，小时余额保留，到期后再按实际使用时长扣减。" : quota.calendarExpired && quota.hourRemainingLabel !== "0分钟" ? "日历套餐已到期，当前可继续使用小时余额。" : "小时余额按实际使用时长扣减，结束任务后停止计时。" })
    ] })
  ] });
};
const PrepTile = ({ title, status, onClick }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "button",
  {
    type: "button",
    onClick,
    className: "flex items-center justify-between rounded-[10px] bg-[#f6f6f4] px-4 py-3 text-left transition-colors hover:bg-[#eeeeeb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500",
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-semibold text-slate-900", children: title }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[12px] text-slate-500", children: status })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, {})
    ]
  }
);
const PageCard = ({ title, subtitle, children, onBack }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-[1040px] space-y-6 pb-8", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex flex-col gap-4 border-b border-black/[.06] pb-5 sm:flex-row sm:items-start sm:justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[22px] font-semibold text-slate-950", children: title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[14px] text-slate-500", children: subtitle })
    ] }),
    onBack && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        "data-preparation-back": true,
        onClick: onBack,
        className: "inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-full border border-black/[.1] bg-white px-4 text-[13px] font-medium text-slate-700 transition-colors hover:bg-[#f6f6f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(s$a, { "aria-hidden": true, size: 16 }),
          "返回准备中心"
        ]
      }
    )
  ] }),
  children
] });
const ApiKeyManagementPage = ({ onBack }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  PageCard,
  {
    title: "API KEY 管理",
    subtitle: "分别配置截图答题与实时面试回答的自定义 API；未填写的调用选项将使用上游默认配置。",
    onBack,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(PersonalModelsSettings, {})
  }
);
const LanguagePage = ({ onBack }) => {
  const settings = useSettings((s2) => s2.settings);
  const patch2 = useSettings((s2) => s2.patch);
  const options = [
    { value: "中文", label: "中文", desc: "默认语言，适合中文面试和笔试回答。" },
    { value: "English", label: "English", desc: "ASR 优先识别英文，模型使用英文回答。" },
    { value: "日本語", label: "日本語", desc: "ASR 优先识别日语，模型使用日语回答。" }
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PageCard, { title: "回答语言", subtitle: "控制面试模式 ASR 语种提示，并控制笔试/面试模式的模型回答语言。", onBack, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-3 md:grid-cols-3", children: options.map((item) => {
    const active = settings.answerLanguage === item.value;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => void patch2({ answerLanguage: item.value }),
        className: `rounded-xl border p-5 text-left transition ${active ? "border-blue-300 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[18px] font-semibold", children: item.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[13px] leading-relaxed text-slate-500", children: item.desc })
        ]
      },
      item.value
    );
  }) }) });
};
const HotwordsPage = ({ onBack }) => {
  const settings = useSettings((s2) => s2.settings);
  const patch2 = useSettings((s2) => s2.patch);
  const [text2, setText] = reactExports.useState(settings.interviewHotwords.join("\n"));
  const [saved, setSaved] = reactExports.useState(false);
  reactExports.useEffect(() => {
    setText(settings.interviewHotwords.join("\n"));
  }, [settings.interviewHotwords]);
  const save = () => {
    void patch2({
      interviewHotwords: normalizeHotwordText(text2)
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PageCard, { title: "面试热词", subtitle: "热词会提高语音识别的准确率。", onBack, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[14px] font-medium text-slate-900", children: "热词列表" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "textarea",
        {
          value: text2,
          onChange: (e2) => setText(e2.target.value),
          rows: 10,
          className: "mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-[13px] leading-relaxed text-slate-800 outline-none focus:border-blue-400"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: save, className: "h-10 rounded-lg bg-blue-600 px-5 text-[14px] font-semibold text-white hover:bg-blue-700", children: "保存热词" }),
      saved && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] text-emerald-600", children: "已保存" })
    ] })
  ] }) });
};
const PromptsPage = ({ onBack }) => {
  const settings = useSettings((s2) => s2.settings);
  const patch2 = useSettings((s2) => s2.patch);
  const [text2, setText] = reactExports.useState(limitCustomPrompts(settings.customPrompts));
  const [saved, setSaved] = reactExports.useState(false);
  reactExports.useEffect(() => setText(limitCustomPrompts(settings.customPrompts)), [settings.customPrompts]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PageCard, { title: "回答提示词", subtitle: "这些内容会作为用户上下文注入当前问题，不会写入系统提示词。", onBack, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "textarea",
      {
        value: text2,
        maxLength: CUSTOM_PROMPTS_MAX_CHARS,
        onChange: (e2) => setText(limitCustomPrompts(e2.target.value)),
        rows: 8,
        placeholder: "例如：回答先给结论；算法题优先给复杂度；面试回答使用 STAR 法则。",
        className: "w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-[13px] leading-relaxed text-slate-800 outline-none focus:border-blue-400"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 text-right text-[12px] text-slate-500", children: [
      "还可输入 ",
      Math.max(0, CUSTOM_PROMPTS_MAX_CHARS - Array.from(text2).length),
      " 字"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => {
            const normalized = normalizeCustomPrompts(text2);
            setText(normalized);
            void patch2({ customPrompts: normalized });
            setSaved(true);
            window.setTimeout(() => setSaved(false), 1200);
          },
          className: "h-10 rounded-lg bg-blue-600 px-5 text-[14px] font-semibold text-white hover:bg-blue-700",
          children: "保存提示词"
        }
      ),
      saved && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] text-emerald-600", children: "已保存" })
    ] })
  ] }) });
};
const HELP_MARKDOWN = `
## 快速上手

1. 登录后在工作台选择 **笔试模式** 或 **面试模式**，完成启动检查并确认后会直接开始任务。
2. 笔试模式中，按 \`Ctrl+Q\` 一键截图并发送给 AI。
3. 面试模式启动后会自动开启语音识别；按 \`Ctrl+3\` 可暂停或恢复语音。
4. 需要临时隐藏窗口时，按 \`Ctrl+E\`；右上角三个按钮可最小化、最大化/还原、关闭客户端。
5. 选择快捷键优先的交互方式时，任务启动后会进入穿透模式；可用左下角提示的快捷键截图、恢复交互或退出任务。

## 核心功能

- **笔试模式**：截图作为输入，右侧只显示当前题目的最新模型答案。
- **面试模式**：识别系统声音，语音输入和模型回答都会显示在右侧对话区。
- **面试语种**：控制 ASR 语种提示和模型回答语言，默认中文。
- **面试热词**：让技术名词、公司名、项目名更容易被正确理解。
- **提示词**：作为用户上下文注入当前问题，不改变系统提示词。
- **连续对话记忆**：面试链路默认携带有界的最近对话，用于理解追问；无需手动开启。
- **重新开始回答**：面试中按清空上下文快捷键，会中止旧回答并清除最近对话；监听、计时、简历、岗位与回答偏好保持不变。

## 常用快捷键

| 操作 | 快捷键 |
| --- | --- |
| 截图并发送给 AI | \`Ctrl+Q\` |
| 删除最后一张截图 | \`Ctrl+D\` |
| 退出笔试 | \`Ctrl+Shift+Z\` |
| 语音开关 | \`Ctrl+3\` |
| 清空面试上下文 | \`Ctrl+Shift+Backspace\` |
| 结束面试 / 任务 | \`Ctrl+R\` |
| 显示/隐藏窗口 | \`Ctrl+E\` |
| 穿透模式 | \`Ctrl+Shift+X\` |
| 移动窗口 | \`Ctrl+Shift+方向键\` |
| 穿透时答案向上滚动约 20% | \`Ctrl+Win+↑\` |
| 穿透时答案向下滚动约 20% | \`Ctrl+Win+↓\` |
`;
const HelpPage = () => /* @__PURE__ */ jsxRuntimeExports.jsx(PageCard, { title: "帮助文档", subtitle: "快速上手、核心功能和常用快捷键。", children: /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "rounded-xl border border-slate-200 bg-white p-6 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownBody, { markdown: HELP_MARKDOWN, className: "max-w-none" }) }) });
const StepCard = ({ index: index2, title, state, enabled: enabled2, onClick }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "button",
  {
    type: "button",
    disabled: !enabled2,
    onClick,
    className: `flex items-center gap-3 rounded-lg px-5 py-4 text-left transition ${state === "active" ? "bg-blue-50" : state === "done" ? "bg-emerald-50 hover:bg-emerald-100" : enabled2 ? "bg-slate-50 hover:bg-slate-100" : "cursor-not-allowed bg-slate-50 opacity-45"}`,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-semibold ${state === "active" ? "bg-blue-600 text-white" : state === "done" ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`, children: index2 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[15px] font-semibold ${state === "idle" ? "text-slate-500" : "text-slate-950"}`, children: title })
    ]
  }
);
function formatPlanPrice(price) {
  return Number.isInteger(price) ? String(price) : price.toFixed(1);
}
function formatPlanDuration(plan) {
  if (typeof plan.durationHours === "number") {
    if (plan.durationHours < 24) return `${plan.durationHours} 小时有效`;
    return `${Math.floor(plan.durationHours / 24)} 天有效`;
  }
  return `${plan.durationDays} 天有效`;
}
const PlansPage = ({ quota, onRefresh }) => {
  const [restoredCheckoutDraft] = reactExports.useState(() => readPaymentCheckoutDraft());
  const [config, setConfig] = reactExports.useState(null);
  const [submissions, setSubmissions] = reactExports.useState([]);
  const [selectedPlanId, setSelectedPlanId] = reactExports.useState(restoredCheckoutDraft?.planId ?? "");
  const [checkoutStep, setCheckoutStep] = reactExports.useState(restoredCheckoutDraft?.checkoutStep ?? 1);
  const [method, setMethod] = reactExports.useState(restoredCheckoutDraft?.method ?? "alipay");
  const [txnId, setTxnId] = reactExports.useState("");
  const [payerName, setPayerName] = reactExports.useState("");
  const [note, setNote] = reactExports.useState("");
  const [loading, setLoading] = reactExports.useState(true);
  const [submitting, setSubmitting] = reactExports.useState(false);
  const [error2, setError] = reactExports.useState("");
  const [success, setSuccess] = reactExports.useState("");
  const [plansNoticeOpen, setPlansNoticeOpen] = reactExports.useState(false);
  const [suppressPlansNotice, setSuppressPlansNotice] = reactExports.useState(false);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextConfig, nextItems] = await Promise.all([getPaymentConfig(), getMyPaymentSubmissions()]);
      setConfig(nextConfig);
      setSubmissions(nextItems);
      setSelectedPlanId((current) => {
        if (nextConfig.plans.some((plan) => plan.id === current)) return current;
        if (current) clearPaymentCheckoutDraft();
        return "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    void load();
  }, []);
  reactExports.useEffect(() => {
    if (shouldShowPlansNotice()) {
      setSuppressPlansNotice(false);
      setPlansNoticeOpen(true);
    }
  }, []);
  const confirmPlansNotice = () => {
    if (suppressPlansNotice) dismissPlansNoticeFor24Hours();
    setPlansNoticeOpen(false);
  };
  const selectedPlan = config?.plans.find((p2) => p2.id === selectedPlanId);
  const qrSrc = selectedPlan ? config?.qr?.[method] : "";
  reactExports.useEffect(() => {
    if (!loading && checkoutStep === 2 && !selectedPlan) {
      setCheckoutStep(1);
    }
  }, [checkoutStep, loading, selectedPlan]);
  reactExports.useEffect(() => {
    if (!selectedPlanId || checkoutStep === 1) return;
    savePaymentCheckoutDraft({
      planId: selectedPlanId,
      method,
      checkoutStep: checkoutStep === 3 ? 3 : 2
    });
  }, [checkoutStep, method, selectedPlanId]);
  const stepState = (index2) => {
    if (checkoutStep === index2) return "active";
    if (checkoutStep > index2) return "done";
    return "idle";
  };
  const submit = async () => {
    if (!selectedPlanId) {
      setError("请选择套餐");
      return;
    }
    if (!txnId.trim()) {
      setError("请填写交易单号");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await submitPaymentRequest({
        planId: selectedPlanId,
        method,
        txnId,
        payerName,
        note
      });
      setTxnId("");
      setPayerName("");
      setNote("");
      clearPaymentCheckoutDraft();
      setSelectedPlanId("");
      setCheckoutStep(1);
      setSuccess("充值申请已提交，管理员审核通过后套餐生效。");
      await load();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    plansNoticeOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PlansNoticeDialog,
      {
        suppressChecked: suppressPlansNotice,
        onSuppressChange: setSuppressPlansNotice,
        onClose: () => setPlansNoticeOpen(false),
        onConfirm: confirmPlansNotice
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-[1180px] space-y-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-6 shadow-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[22px] font-semibold text-slate-950", children: "充值套餐" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[14px] text-slate-500", children: "三步完成：选套餐 → 扫码付款 → 提交交易单号，管理员审核后开通。" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-3xl text-[13px] leading-relaxed text-slate-600", children: "充值会累加权益：小时版增加实际使用时长；日历套餐从当前有效截止时间继续延长，已到期则从审核通过时起算。优先使用日历套餐，到期后再扣独立保留的小时余额。" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 max-w-3xl text-[12px] leading-relaxed text-slate-500", children: "日版增加 24 小时，周版增加 7 天；月版与双月版按自然月延长，目标月份没有对应日期时取月末。充值不累加或重置每日上限及当日已用量。" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap justify-end gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => {
                  setCheckoutStep(3);
                  setError("");
                  setSuccess("");
                },
                className: "h-9 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700",
                children: "已付款？提交支付单号"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
              void load();
              onRefresh();
            }, className: "h-9 rounded-lg border border-slate-200 px-4 text-[13px] text-slate-700 hover:bg-slate-50", children: "刷新" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6 grid gap-3 md:grid-cols-3", children: [
          [1, "选套餐"],
          [2, "扫码付款"],
          [3, "提交单号"]
        ].map(([index2, title]) => {
          const enabled2 = canEnterCheckoutStep({
            targetStep: index2,
            hasSelectedPlan: Boolean(selectedPlan)
          });
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            StepCard,
            {
              index: index2,
              title,
              state: stepState(index2),
              enabled: enabled2,
              onClick: () => {
                if (!enabled2) return;
                setCheckoutStep(index2);
                setError("");
              }
            },
            index2
          );
        }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-6 shadow-sm", children: [
        loading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-10 text-center text-[13px] text-slate-500", children: "加载中..." }),
        error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700", children: error2 }),
        success && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700", children: success }),
        !loading && checkoutStep === 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[18px] font-semibold text-slate-950", children: "第 1 步 · 选择套餐" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[13px] text-slate-500", children: "按面试时长选择，付款金额以下方标价为准。" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-8 grid gap-3 md:grid-cols-3 xl:grid-cols-5", children: (config?.plans ?? []).map((plan) => {
            const active = selectedPlanId === plan.id;
            return /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => {
                  setSelectedPlanId(plan.id);
                  setCheckoutStep(2);
                  setError("");
                  setSuccess("");
                },
                className: `relative min-h-[150px] rounded-xl border p-5 text-center transition ${active ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`,
                children: [
                  plan.badge && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute left-1/2 top-[-10px] -translate-x-1/2 rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white", children: plan.badge }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[22px] font-semibold text-slate-950", children: plan.name.replace("版", "") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-[13px] text-slate-500", children: plan.description ?? formatPlanDuration(plan) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 text-[28px] font-semibold text-blue-700", children: [
                    "¥",
                    formatPlanPrice(plan.price)
                  ] })
                ]
              },
              plan.id
            );
          }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-8 text-[13px] text-slate-500", children: "付款后请保留账单，下一步需要填写交易单号（不是备注）。" })
        ] }),
        !loading && checkoutStep === 2 && selectedPlan && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[18px] font-semibold text-slate-950", children: "第 2 步 · 扫码付款" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => setCheckoutStep(1), className: "text-[13px] font-semibold text-slate-700 hover:text-blue-700", children: [
              "重选套餐 ",
              selectedPlan.name.replace("版", ""),
              " · ¥",
              formatPlanPrice(selectedPlan.price)
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-7 grid gap-8 lg:grid-cols-[420px_1fr] lg:items-center", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-5 flex gap-3", children: config?.methods.map((m2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => setMethod(m2.id),
                  className: `h-10 rounded-lg border px-5 text-[14px] font-semibold ${method === m2.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`,
                  children: m2.name
                },
                m2.id
              )) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex aspect-square max-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50", children: qrSrc ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: qrSrc, alt: "付款二维码", className: "max-h-full max-w-full rounded-lg object-contain" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] text-slate-400", children: "暂无二维码" }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[18px] leading-9 text-slate-700", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                "请用",
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-950", children: method === "alipay" ? "支付宝" : "微信" }),
                "扫左侧二维码"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                "应付金额：",
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[26px] font-semibold text-blue-700", children: [
                  "¥",
                  formatPlanPrice(selectedPlan.price)
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("ol", { className: "mt-5 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-slate-600", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "扫码完成付款（备注留空即可）" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "打开账单，复制完整交易单号" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "点击下方按钮进入第 3 步粘贴提交" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    setCheckoutStep(3);
                    setError("");
                  },
                  className: "mt-7 h-11 rounded-lg bg-blue-600 px-6 text-[14px] font-semibold text-white hover:bg-blue-700",
                  children: "我已完成付款，提交单号"
                }
              )
            ] })
          ] })
        ] }),
        !loading && checkoutStep === 3 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[18px] font-semibold text-slate-950", children: "第 3 步 · 提交单号" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => setCheckoutStep(selectedPlan ? 2 : 1),
                className: "text-[13px] font-semibold text-slate-700 hover:text-blue-700",
                children: selectedPlan ? "返回扫码付款" : "先选择套餐"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] leading-6 text-blue-900", children: "即使付款后关闭过页面，也可以从这里重新选择实际付款的套餐并提交交易单号。系统只会在提交后创建充值申请。" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 grid gap-6 lg:grid-cols-[1fr_320px]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "grid gap-1 text-[13px] font-medium text-slate-700", children: [
                "已付款套餐",
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "select",
                  {
                    value: selectedPlanId,
                    onChange: (event) => {
                      setSelectedPlanId(event.target.value);
                      setError("");
                    },
                    className: "h-11 rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-400",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "请选择与付款金额一致的套餐" }),
                      (config?.plans ?? []).map((plan) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: plan.id, children: [
                        plan.name,
                        " · ¥",
                        formatPlanPrice(plan.price)
                      ] }, plan.id))
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  value: txnId,
                  onChange: (e2) => setTxnId(e2.target.value),
                  placeholder: "交易号 / 订单号",
                  className: "h-11 rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-400"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  value: payerName,
                  onChange: (e2) => setPayerName(e2.target.value),
                  placeholder: "付款人姓名（可选）",
                  className: "h-11 rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-400"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  value: note,
                  onChange: (e2) => setNote(e2.target.value),
                  placeholder: "备注（可选）",
                  rows: 4,
                  className: "rounded-lg border border-slate-200 p-3 text-[13px] outline-none focus:border-blue-400"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  disabled: submitting || !selectedPlan || !txnId.trim(),
                  onClick: () => void submit(),
                  className: "h-11 rounded-lg bg-blue-600 px-5 text-[14px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60",
                  children: submitting ? "提交中..." : "提交充值申请"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-slate-100 bg-slate-50 p-5 text-[14px] leading-7 text-slate-600", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold text-slate-950", children: selectedPlan ? "已选套餐" : "等待选择套餐" }),
              selectedPlan ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-[20px] font-semibold text-slate-950", children: selectedPlan.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-blue-700", children: [
                  "¥",
                  formatPlanPrice(selectedPlan.price)
                ] })
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-[13px] text-slate-500", children: "请按实际付款金额选择，避免审核时套餐不匹配。" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 text-[13px] text-slate-500", children: "提交后进入待审核状态，管理员审核通过后套餐生效。" })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-6 shadow-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[18px] font-semibold text-slate-950", children: "充值记录" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 divide-y divide-slate-100", children: [
          submissions.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-4 text-[13px] text-slate-500", children: "暂无充值记录" }),
          submissions.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2 py-3 text-[13px] md:grid-cols-[1fr_120px_120px_120px] md:items-center", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium text-slate-900", children: formatPaymentPlanName(item) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-slate-500", children: item.txnId })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-slate-600", children: [
              "¥",
              item.amount
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-slate-600", children: paymentStatusLabel(item.status) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-slate-500", children: item.createdAt.slice(0, 10) })
          ] }, item.id))
        ] })
      ] })
    ] })
  ] });
};
function paymentStatusLabel(status) {
  if (status === "approved") return "已生效";
  if (status === "rejected") return "未通过";
  return "待审核";
}
function formatPaymentPlanName(item) {
  const label = formatPlanLabel(item.planId);
  if (label !== item.planId) return label;
  if (/plus|juice|refreshing/i.test(item.planName)) return "历史套餐";
  return item.planName;
}
const resumeInputClass = "mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const resumeUploadAccept = ".pdf,.png,.jpg,.jpeg,.txt,.md,.markdown,application/pdf,image/png,image/jpeg,text/plain,text/markdown";
const ResumePage = ({
  resumes,
  loading,
  loadError,
  onResumeChanged,
  onResumeDeleted,
  onRetry,
  onBack
}) => {
  const [selectedResumeId, setSelectedResumeId] = reactExports.useState(() => resumes[0]?.id ?? null);
  const resume = resumes.find((item) => item.id === selectedResumeId) ?? resumes[0] ?? null;
  const resumeLibraryFull = resumes.length >= 10;
  const [profile, setProfile] = reactExports.useState(() => cloneResumeProfile(EMPTY_RESUME_PROFILE));
  const [busy, setBusy] = reactExports.useState(false);
  const [error2, setError] = reactExports.useState("");
  const [saved, setSaved] = reactExports.useState(false);
  const [pendingResume, setPendingResume] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (pendingResume) return;
    if (resume) {
      if (selectedResumeId !== resume.id) setSelectedResumeId(resume.id);
      setProfile(cloneResumeProfile(resume.profile));
    } else {
      setSelectedResumeId(null);
      setProfile(cloneResumeProfile(EMPTY_RESUME_PROFILE));
    }
  }, [pendingResume, resume, selectedResumeId]);
  const updateProfile = (patch2) => {
    setProfile((current) => ({ ...current, ...patch2 }));
  };
  const handleUpload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const preview = await parsePracticeResumeDocument(file);
      setPendingResume({
        fileName: file.name,
        fileMime: file.type || "application/octet-stream",
        parserModel: preview.parserModel || null
      });
      setProfile(cloneResumeProfile(preview.document.profile));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const handleSave = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const next = pendingResume ? await createResumeItem({ ...pendingResume, profile }) : resume ? await saveResumeItem(resume.id, profile) : null;
      if (!next) throw new Error("请先上传并解析一份简历");
      onResumeChanged(next);
      setSelectedResumeId(next.id);
      setPendingResume(null);
      setProfile(cloneResumeProfile(next.profile));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const handleDelete2 = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (!resume) return;
      await deleteResumeItem(resume.id);
      onResumeDeleted(resume.id);
      const next = resumes.find((item) => item.id !== resume.id) ?? null;
      setSelectedResumeId(next?.id ?? null);
      setPendingResume(null);
      setProfile(cloneResumeProfile(next?.profile ?? EMPTY_RESUME_PROFILE));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(PageCard, { title: "简历上下文", subtitle: "保存多份简历，并在每次任务启动检查时选择本次使用的一份。", onBack, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-6 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[18px] font-semibold text-slate-950", children: "简历资料" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[13px] text-slate-500", children: "支持 PDF、PNG、JPG、TXT、Markdown；每个账号最多保存 10 份，上传新文件不会覆盖已有简历。" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[12px] text-slate-400", children: "上传后会进行 AI 解析，通常需要 5～15 秒；扫描版 PDF 可能更久。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
          resume && !pendingResume && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              disabled: busy,
              onClick: () => void handleDelete2(),
              className: "h-9 rounded-lg border border-slate-200 px-4 text-[13px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
              children: "删除"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: `inline-flex h-9 items-center rounded-lg px-4 text-[13px] font-semibold text-white ${busy || loading || resumeLibraryFull ? "cursor-not-allowed bg-slate-300" : "cursor-pointer bg-blue-600 hover:bg-blue-700"}`, children: [
            busy ? "上传并解析中..." : loading ? "正在加载列表..." : resumeLibraryFull ? "已达到 10 份上限" : "上传简历",
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "file",
                accept: resumeUploadAccept,
                disabled: busy || loading || resumeLibraryFull,
                className: "hidden",
                onChange: (event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void handleUpload(file);
                }
              }
            )
          ] })
        ] })
      ] }),
      loading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-4 text-[13px] text-slate-500", children: "加载中..." }),
      loadError && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "alert", className: "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "简历状态暂不可用，请检查网络后重试。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onRetry, className: "h-8 rounded-lg border border-amber-300 bg-white px-3 text-[12px] font-medium text-amber-900 hover:bg-amber-100", children: "重新检查" })
      ] }),
      error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700", children: error2 }),
      saved && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700", children: "已保存" }),
      pendingResume && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-6 text-amber-900", children: "已完成解析但尚未保存。请核对下方结构化内容，然后点击“确认并保存”。原文件不会写入 Climb。" }),
      !loading && resumes.length > 0 && !pendingResume && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 text-[12px] font-medium text-slate-500", children: [
          "已保存 ",
          resumes.length,
          " 份简历"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: resumes.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            disabled: busy,
            onClick: () => {
              setSelectedResumeId(item.id);
              setPendingResume(null);
              setProfile(cloneResumeProfile(item.profile));
              setError("");
            },
            className: `rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${item.id === resume?.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-[13px] font-semibold text-slate-900", children: item.fileName }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[11px] text-slate-500", children: item.parsedAt?.slice(0, 10) ?? item.updatedAt.slice(0, 10) })
            ]
          },
          item.id
        )) })
      ] }),
      !loading && resume && !pendingResume && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-[13px] text-slate-600", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-900", children: resume.fileName }),
        resume.parsedAt && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mx-2 text-slate-300", children: "/" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: resume.parsedAt.slice(0, 10) })
        ] })
      ] }),
      !loading && !resume && !pendingResume && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6 flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FileIcon, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 text-[16px] font-semibold text-slate-900", children: "上传简历" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-[440px] text-[13px] leading-relaxed text-slate-500", children: "上传后会提取候选人经历、技能、项目和面试提醒，后续实时语音面试只在问题相关时参考。" })
      ] }) })
    ] }),
    (resume || hasResumeProfileContent(profile)) && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-6 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[18px] font-semibold text-slate-950", children: "提取信息" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            disabled: busy,
            onClick: () => void handleSave(),
            className: "h-9 rounded-lg bg-blue-600 px-5 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60",
            children: pendingResume ? "确认并保存" : "保存修改"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 grid gap-4 lg:grid-cols-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(ResumeEditorSection, { title: "基础信息", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ResumeTextInput,
              {
                label: "姓名",
                value: profile.name,
                onChange: (name2) => updateProfile({ name: name2 })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ResumeListInput,
              {
                label: "目标岗位",
                value: profile.targetRoles,
                onChange: (targetRoles) => updateProfile({ targetRoles }),
                rows: 3
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ResumeTextArea,
            {
              label: "候选人摘要",
              value: profile.summary,
              onChange: (summary) => updateProfile({ summary }),
              rows: 4
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ResumeListInput,
            {
              label: "面试提醒",
              value: profile.interviewNotes,
              onChange: (interviewNotes) => updateProfile({ interviewNotes }),
              rows: 4
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeEditorSection, { title: "核心技能", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          ResumeListInput,
          {
            label: "技能关键词",
            value: profile.skills,
            onChange: (skills) => updateProfile({ skills }),
            rows: 8
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResumeEducationEditor,
        {
          items: profile.education,
          onChange: (education) => updateProfile({ education })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResumeWorkEditor,
        {
          items: profile.workExperience,
          onChange: (workExperience) => updateProfile({ workExperience })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResumeProjectsEditor,
        {
          projects: profile.projects,
          onChange: (projects) => updateProfile({ projects })
        }
      )
    ] })
  ] });
};
const ResumeTextInput = ({ label, value, onChange }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] font-semibold text-slate-900", children: label }),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      value,
      onChange: (event) => onChange(event.target.value),
      className: `${resumeInputClass} h-10 py-0`
    }
  )
] });
const ResumeTextArea = ({ label, value, rows = 3, onChange }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "mt-4 block", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] font-semibold text-slate-900", children: label }),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "textarea",
    {
      value,
      rows,
      onChange: (event) => onChange(event.target.value),
      className: resumeInputClass
    }
  )
] });
const ResumeListInput = ({ label, value, rows = 3, onChange }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  ResumeTextArea,
  {
    label,
    value: value.join("\n"),
    rows,
    onChange: (next) => onChange(splitResumeLines(next))
  }
);
const ResumeEditorSection = ({ title, children }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-lg border border-slate-200 bg-slate-50 p-4", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-[15px] font-semibold text-slate-950", children: title }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4", children })
] });
const ResumeProjectsEditor = ({ projects, onChange }) => {
  const update = (index2, patch2) => {
    onChange(projects.map((item, i) => i === index2 ? { ...item, ...patch2 } : item));
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    ResumeEditableList,
    {
      title: "项目经历",
      emptyLabel: "暂无项目",
      addLabel: "添加项目",
      onAdd: () => onChange([...projects, { name: "", role: "", description: "", actions: [], results: [], technologies: [] }]),
      children: projects.length === 0 ? null : projects.map((project, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-slate-200 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[13px] font-semibold text-slate-900", children: [
            "项目 ",
            index2 + 1
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onChange(projects.filter((_, i) => i !== index2)), className: "text-[12px] font-medium text-red-600 hover:text-red-700", children: "移除" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 md:grid-cols-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextInput, { label: "项目名称", value: project.name, onChange: (name2) => update(index2, { name: name2 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextInput, { label: "个人角色", value: project.role, onChange: (role) => update(index2, { role }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextArea, { label: "项目背景", value: project.description, onChange: (description) => update(index2, { description }), rows: 3 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeListInput, { label: "行动", value: project.actions, onChange: (actions) => update(index2, { actions }), rows: 3 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeListInput, { label: "结果", value: project.results, onChange: (results) => update(index2, { results }), rows: 3 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeListInput, { label: "技术栈", value: project.technologies, onChange: (technologies) => update(index2, { technologies }), rows: 3 })
      ] }, index2))
    }
  );
};
const ResumeWorkEditor = ({ items, onChange }) => {
  const update = (index2, patch2) => {
    onChange(items.map((item, i) => i === index2 ? { ...item, ...patch2 } : item));
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    ResumeEditableList,
    {
      title: "工作经历",
      emptyLabel: "暂无工作经历",
      addLabel: "添加经历",
      onAdd: () => onChange([...items, { company: "", title: "", period: "", responsibilities: [], achievements: [] }]),
      children: items.length === 0 ? null : items.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-slate-200 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[13px] font-semibold text-slate-900", children: [
            "经历 ",
            index2 + 1
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onChange(items.filter((_, i) => i !== index2)), className: "text-[12px] font-medium text-red-600 hover:text-red-700", children: "移除" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 md:grid-cols-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextInput, { label: "公司", value: item.company, onChange: (company) => update(index2, { company }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextInput, { label: "职位", value: item.title, onChange: (title) => update(index2, { title }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextInput, { label: "时间", value: item.period, onChange: (period) => update(index2, { period }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeListInput, { label: "职责", value: item.responsibilities, onChange: (responsibilities) => update(index2, { responsibilities }), rows: 3 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeListInput, { label: "成果", value: item.achievements, onChange: (achievements) => update(index2, { achievements }), rows: 3 })
      ] }, index2))
    }
  );
};
const ResumeEducationEditor = ({ items, onChange }) => {
  const update = (index2, patch2) => {
    onChange(items.map((item, i) => i === index2 ? { ...item, ...patch2 } : item));
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    ResumeEditableList,
    {
      title: "教育经历",
      emptyLabel: "暂无教育经历",
      addLabel: "添加教育",
      onAdd: () => onChange([...items, { school: "", degree: "", major: "", period: "" }]),
      children: items.length === 0 ? null : items.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-slate-200 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[13px] font-semibold text-slate-900", children: [
            "教育 ",
            index2 + 1
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onChange(items.filter((_, i) => i !== index2)), className: "text-[12px] font-medium text-red-600 hover:text-red-700", children: "移除" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 md:grid-cols-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextInput, { label: "学校", value: item.school, onChange: (school) => update(index2, { school }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextInput, { label: "学历", value: item.degree, onChange: (degree) => update(index2, { degree }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextInput, { label: "专业", value: item.major, onChange: (major) => update(index2, { major }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ResumeTextInput, { label: "时间", value: item.period, onChange: (period) => update(index2, { period }) })
        ] })
      ] }, index2))
    }
  );
};
const ResumeEditableList = ({ title, emptyLabel, addLabel, onAdd, children }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex items-center justify-between gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-[15px] font-semibold text-slate-950", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onAdd, className: "h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-50", children: addLabel })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: children || /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[13px] text-slate-400", children: emptyLabel }) })
] });
function cloneResumeProfile(profile) {
  return {
    name: profile.name,
    targetRoles: [...profile.targetRoles],
    summary: profile.summary,
    skills: [...profile.skills],
    projects: profile.projects.map((project) => ({
      ...project,
      actions: [...project.actions],
      results: [...project.results],
      technologies: [...project.technologies]
    })),
    workExperience: profile.workExperience.map((item) => ({
      ...item,
      responsibilities: [...item.responsibilities],
      achievements: [...item.achievements]
    })),
    education: profile.education.map((item) => ({ ...item })),
    interviewNotes: [...profile.interviewNotes]
  };
}
function splitResumeLines(text2) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const line of text2.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}
function hasResumeProfileContent(profile) {
  return Boolean(
    profile.name || profile.summary || profile.targetRoles.length || profile.skills.length || profile.projects.length || profile.workExperience.length || profile.education.length || profile.interviewNotes.length
  );
}
const KnowledgePage = ({ accountKey, initialIndexes, loading, loadError, onIndexesChange, onReload, onBack }) => {
  const [indexes, setIndexes] = reactExports.useState(initialIndexes);
  const [selectedIndexId, setSelectedIndexId] = reactExports.useState(initialIndexes[0]?.id ?? null);
  const index2 = indexes.find((item) => item.id === selectedIndexId) ?? indexes[0] ?? null;
  const libraryFull = indexes.length >= MAX_LOCAL_KNOWLEDGE_INDEXES;
  const [query, setQuery] = reactExports.useState("");
  const [results, setResults] = reactExports.useState([]);
  const [busy, setBusy] = reactExports.useState(false);
  const [error2, setError] = reactExports.useState("");
  const [notice, setNotice] = reactExports.useState("");
  const [searching, setSearching] = reactExports.useState(false);
  const [searchError, setSearchError] = reactExports.useState("");
  const [searchCompleted, setSearchCompleted] = reactExports.useState(false);
  const [searchModel, setSearchModel] = reactExports.useState("");
  const searchRequestSequenceRef = reactExports.useRef(0);
  const activeSearchRequestRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setIndexes(initialIndexes);
    setSelectedIndexId((current) => current && initialIndexes.some((item) => item.id === current) ? current : initialIndexes[0]?.id ?? null);
  }, [initialIndexes]);
  reactExports.useEffect(() => {
    return () => {
      searchRequestSequenceRef.current += 1;
      activeSearchRequestRef.current?.controller.abort("knowledge-page-unmounted");
      activeSearchRequestRef.current = null;
    };
  }, []);
  const resetSemanticPreview = (nextQuery) => {
    searchRequestSequenceRef.current += 1;
    activeSearchRequestRef.current?.controller.abort("knowledge-preview-reset");
    activeSearchRequestRef.current = null;
    if (nextQuery !== void 0) setQuery(nextQuery);
    setResults([]);
    setSearching(false);
    setSearchError("");
    setSearchCompleted(false);
    setSearchModel("");
  };
  const updateSearchQuery = (value) => {
    resetSemanticPreview(value);
  };
  const publishIndexes = (nextIndexes) => {
    const sorted = [...nextIndexes].sort((a2, b) => b.updatedAt - a2.updatedAt);
    setIndexes(sorted);
    onIndexesChange(sorted);
  };
  const selectIndex = (id2) => {
    if (id2 === index2?.id) return;
    setSelectedIndexId(id2);
    resetSemanticPreview("");
    setNotice("");
    setError("");
  };
  const runSemanticPreview = async () => {
    if (activeSearchRequestRef.current) return;
    const currentIndex = index2;
    const cleanQuery = query.trim();
    if (!currentIndex || !hasSemanticKnowledgeIndex(currentIndex) || !cleanQuery) return;
    const requestId = ++searchRequestSequenceRef.current;
    const controller = new AbortController();
    activeSearchRequestRef.current = { id: requestId, controller };
    setSearching(true);
    setSearchError("");
    setSearchCompleted(false);
    setSearchModel("");
    setResults([]);
    try {
      const queryEmbedding = await fetchRemoteKnowledgeQueryEmbedding(
        currentIndex,
        cleanQuery,
        { signal: controller.signal }
      );
      if (activeSearchRequestRef.current?.id !== requestId || controller.signal.aborted) return;
      const nextResults = searchSemanticLocalKnowledge(currentIndex, queryEmbedding, 4);
      setResults(nextResults);
      setSearchModel(queryEmbedding.modelId);
      setSearchCompleted(true);
    } catch (searchFailure) {
      if (activeSearchRequestRef.current?.id !== requestId || controller.signal.aborted) return;
      setResults([]);
      setSearchCompleted(false);
      setSearchError(searchFailure instanceof Error ? searchFailure.message : "语义检索失败，请稍后重试");
    } finally {
      if (activeSearchRequestRef.current?.id === requestId) {
        activeSearchRequestRef.current = null;
        setSearching(false);
      }
    }
  };
  const upload = async (file) => {
    if (!file) return;
    if (!accountKey) {
      setError("请先登录后再上传知识库。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const localIndex = await buildLocalKnowledgeIndexFromFile(file, accountKey);
      const nextLocalIndexes = [localIndex, ...indexes.filter((item) => item.id !== localIndex.id)];
      publishIndexes(nextLocalIndexes);
      setSelectedIndexId(localIndex.id);
      resetSemanticPreview("");
      try {
        const semanticIndex = await buildRemoteKnowledgeEmbeddingIndex(localIndex);
        await saveLocalKnowledgeIndexForAccount(accountKey, semanticIndex);
        publishIndexes(nextLocalIndexes.map((item) => item.id === semanticIndex.id ? semanticIndex : item));
        setNotice("语义索引已构建并保存在本机，实时面试无需再次为该文件生成向量。");
      } catch (embeddingError) {
        setNotice(
          embeddingError instanceof Error ? `文件已保存在本机，但${embeddingError.message}` : "文件已保存在本机，但语义索引构建失败；实时面试将使用本地快速检索。"
        );
      }
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (!index2 || !accountKey) return;
    setBusy(true);
    setError("");
    try {
      await deleteLocalKnowledgeIndex(accountKey, index2.id);
      const nextIndexes = indexes.filter((item) => item.id !== index2.id);
      publishIndexes(nextIndexes);
      setSelectedIndexId(nextIndexes[0]?.id ?? null);
      resetSemanticPreview("");
      setNotice("");
      await onReload();
    } catch (error22) {
      setError(error22 instanceof Error ? error22.message : String(error22));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PageCard, { title: "本地知识库", subtitle: "可保存多份本地知识库，并在每次面试启动前选择本次使用的资料。", onBack, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-6 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[18px] font-semibold text-slate-950", children: "本地知识库文件" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-[13px] text-slate-500", children: [
          "每个账号最多保存 ",
          MAX_LOCAL_KNOWLEDGE_INDEXES,
          " 份；单文件不超过 3MB，仅支持 TXT / MD / Markdown / CSV / JSON。索引仅保存在当前电脑。"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        index2 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
          void clear();
        }, disabled: busy || loading, className: "h-9 rounded-lg border border-slate-200 px-4 text-[13px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50", children: "删除" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: `inline-flex h-9 items-center rounded-lg px-4 text-[13px] font-semibold text-white ${busy || loading || libraryFull || !accountKey ? "cursor-not-allowed bg-slate-300" : "cursor-pointer bg-blue-600 hover:bg-blue-700"}`, children: [
          loading ? "正在读取..." : busy ? "正在构建索引..." : libraryFull ? "已达到 10 份上限" : "上传文件",
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "file",
              accept: ".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,application/json,text/csv",
              disabled: busy || loading || libraryFull || !accountKey,
              className: "hidden",
              onChange: (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void upload(file);
              }
            }
          )
        ] })
      ] })
    ] }),
    (loadError || error2) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700", children: loadError || error2 }),
    notice && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mt-4 rounded-lg border px-3 py-2 text-[13px] ${hasSemanticKnowledgeIndex(index2) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`, children: notice }),
    indexes.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 text-[13px] font-medium text-slate-700", children: [
        "已保存知识库（",
        indexes.length,
        "/",
        MAX_LOCAL_KNOWLEDGE_INDEXES,
        "）"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3", children: indexes.map((item) => {
        const selected = item.id === index2?.id;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            "aria-pressed": selected,
            onClick: () => selectIndex(item.id),
            disabled: busy,
            className: `min-w-0 rounded-lg border px-3 py-2 text-left transition-colors ${selected ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-60`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-[13px] font-medium text-slate-900", children: item.fileName }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[11px] text-slate-500", children: [
                item.chunks.length,
                " 个片段 · ",
                hasSemanticKnowledgeIndex(item) ? "语义索引已就绪" : "本地快速索引"
              ] })
            ]
          },
          item.id
        );
      }) })
    ] }),
    index2 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 grid gap-4 lg:grid-cols-[280px_1fr]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-slate-200 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] text-slate-500", children: "当前文件" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 break-all text-[15px] font-semibold text-slate-950", children: index2.fileName }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 text-[13px] text-slate-500", children: [
          index2.chunks.length,
          " 个片段 · ",
          (index2.fileSize / 1024).toFixed(1),
          " KB"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mt-3 text-[12px] font-medium ${hasSemanticKnowledgeIndex(index2) ? "text-emerald-600" : "text-amber-600"}`, children: hasSemanticKnowledgeIndex(index2) ? `语义索引已就绪 · ${index2.embeddingMeta?.modelId}` : "仅本地快速索引 · 可重新上传以构建语义索引" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 text-[12px] leading-relaxed text-slate-500", children: "文件文本按语义边界切片，向量索引保存在本机。实时面试时只为校正后的当前问题生成向量；向量服务不可用时自动使用本地快速检索。" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-slate-200 bg-white p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[13px] font-medium text-slate-700", children: "语义检索预览" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: query,
              onChange: (event) => updateSearchQuery(event.target.value),
              onKeyDown: (event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                void runSemanticPreview();
              },
              placeholder: hasSemanticKnowledgeIndex(index2) ? "输入面试问题后点击语义检索" : "请先重新上传文件以构建语义索引",
              disabled: !hasSemanticKnowledgeIndex(index2) || busy,
              className: "h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => void runSemanticPreview(),
              disabled: !hasSemanticKnowledgeIndex(index2) || !query.trim() || searching || busy,
              className: "h-10 shrink-0 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300",
              children: searching ? "检索中..." : "语义检索"
            }
          )
        ] }),
        !hasSemanticKnowledgeIndex(index2) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700", children: "当前文件只有本地快速索引。请重新上传文件，语义索引构建成功后再进行预览。" }),
        searchError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700", children: searchError }),
        searchCompleted && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 text-[12px] font-medium text-emerald-600", children: [
          "语义检索完成 · ",
          searchModel
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 space-y-3", children: [
          searchCompleted && results.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-dashed border-slate-200 px-3 py-4 text-[13px] text-slate-400", children: "暂无命中片段" }),
          results.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-slate-200 bg-slate-50 p-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 text-[12px] text-slate-400", children: [
              "cosine score ",
              item.score.toFixed(3)
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700", children: item.text })
          ] }, item.id))
        ] })
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6 flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx(BookIcon, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 text-[16px] font-semibold text-slate-900", children: "上传第一份知识库文件" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-[420px] text-[13px] leading-relaxed text-slate-500", children: "上传后会按段落、句子和列表边界切片，并通过 Climb 服务端调用向量模型；返回的向量索引只保存在本机。上传即表示同意发送这些文字片段用于生成向量。" })
    ] }) })
  ] }) });
};
const PlaceholderPage = ({ route, onRouteChange }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-[720px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500", children: /* @__PURE__ */ jsxRuntimeExports.jsx(NavIcon, { route }) }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mt-5 text-[22px] font-semibold text-slate-950", children: routeTitle(route) }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-[460px] text-[14px] leading-relaxed text-slate-500", children: "这个模块暂时作为入口占位，后续可以接入上传、语种选择、热词配置、提示词模板或帮助文档。" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onRouteChange("home"), className: "mt-6 h-10 rounded-lg bg-blue-600 px-5 text-[14px] font-semibold text-white hover:bg-blue-700", children: "返回首页" })
] });
const StatusPill = ({ listening, listenStatus, streaming }) => {
  if (streaming) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-blue-50 px-3 py-1.5 text-[12px] font-medium text-blue-700", children: "生成中" });
  }
  if (listening) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-700", children: [
      "语音 ",
      listenStatus
    ] });
  }
  return null;
};
function runtimeTaskStatusLabel(status, fallback) {
  if (status === "ready") return "准备就绪";
  if (status === "starting") return "正在启动";
  if (status === "ending") return "正在结束";
  if (status === "error") return "需要处理";
  return fallback;
}
function routeTitle(route) {
  return DASHBOARD_NAV_ITEMS.find((item) => item.id === route)?.label ?? "首页";
}
const ClimbMark = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "img",
  {
    src: climbIconUrl,
    alt: "",
    "aria-hidden": true,
    draggable: false,
    className: "h-8 w-8 shrink-0 rounded-[9px] object-contain"
  }
);
const NavIcon = ({ route }) => {
  if (route === "home") return /* @__PURE__ */ jsxRuntimeExports.jsx(HomeIcon, {});
  if (route === "preparation") return /* @__PURE__ */ jsxRuntimeExports.jsx(BookIcon, {});
  if (route === "practice") return /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeIcon, {});
  if (route === "practice-history") return /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryIcon, {});
  if (route === "local-records") return /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryIcon, {});
  if (route === "resume") return /* @__PURE__ */ jsxRuntimeExports.jsx(FileIcon, {});
  if (route === "knowledge") return /* @__PURE__ */ jsxRuntimeExports.jsx(BookIcon, {});
  if (route === "language") return /* @__PURE__ */ jsxRuntimeExports.jsx(MicIcon, {});
  if (route === "hotwords") return /* @__PURE__ */ jsxRuntimeExports.jsx(TagIcon, {});
  if (route === "prompts") return /* @__PURE__ */ jsxRuntimeExports.jsx(PenIcon, {});
  if (route === "settings") return /* @__PURE__ */ jsxRuntimeExports.jsx(SettingsIcon, {});
  if (route === "plans") return /* @__PURE__ */ jsxRuntimeExports.jsx(CardIcon, {});
  return /* @__PURE__ */ jsxRuntimeExports.jsx(HelpIcon, {});
};
const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};
const HomeIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 11l9-8 9 8" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 10v10h14V10" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 20v-6h4v6" })
] });
const FileIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 2v6h6" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 13h8" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 17h5" })
] });
const BookIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 4v15.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5" })
] });
const MicIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 19v3" })
] });
const TagIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M7.5 7.5h.01" })
] });
const PenIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m18 2 4 4-14 14H4v-4L18 2Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m14 6 4 4" })
] });
const SettingsIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.9 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" })
] });
const CardIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 10h18" })
] });
const HelpIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "10" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M9.1 9a3 3 0 1 1 5.8 1c-.6 1-1.7 1.4-2.3 2.2-.4.5-.6.9-.6 1.8" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 17h.01" })
] });
const ScanIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M7 3H5a2 2 0 0 0-2 2v2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M17 3h2a2 2 0 0 1 2 2v2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M21 17v2a2 2 0 0 1-2 2h-2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M7 21H5a2 2 0 0 1-2-2v-2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 12h8" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 8v8" })
] });
const PracticeIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 3H5a2 2 0 0 0-2 2v3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M16 3h3a2 2 0 0 1 2 2v3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 21H5a2 2 0 0 1-2-2v-3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M16 21h3a2 2 0 0 0 2-2v-3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "11", r: "3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M7 18c1.2-2.2 2.9-3 5-3s3.8.8 5 3" })
] });
const HistoryIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 12a9 9 0 1 0 3-6.7L3 8" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 3v5h5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 7v5l3 2" })
] });
const ChevronDown = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...iconProps, width: "14", height: "14", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m6 9 6 6 6-6" }) });
const CloseIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, width: "16", height: "16", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18 6 6 18" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m6 6 12 12" })
] });
const ArrowRight = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...iconProps, width: "16", height: "16", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 12h14" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m12 5 7 7-7 7" })
] });

export { DEFAULT_TIME_PLANS, getPaymentConfig, normalizePaymentPlans, resolveBackendAssetUrl, getMyPaymentSubmissions, submitPaymentRequest, PAYMENT_CHECKOUT_DRAFT_KEY, PAYMENT_CHECKOUT_DRAFT_MAX_AGE_MS, defaultStorage, readPaymentCheckoutDraft, savePaymentCheckoutDraft, clearPaymentCheckoutDraft, CHECKING_RESUME_LIBRARY_STATUS, sortResumeLibrary, createResumeLibraryStatusController, primaryResumeStatus, isTransientResumeLoadError, resumeStatusLabel, INDEX_ENDPOINT, QUERY_ENDPOINT, INDEX_TIMEOUT_MS, MAX_FILE_NAME_CHARS, MAX_CHUNKS, MAX_CHUNK_ID_CHARS, MAX_CHUNK_TEXT_CHARS, MAX_QUERY_TEXT_CHARS, KnowledgeSemanticIndexError, unicodeLength, validateIndexForUpload, LOCAL_FALLBACK_SUFFIX, messageForResponseCode, messageForResponseStatus, responseMessage, requestErrorMessage, parseResponse, parseQueryEmbeddingResponse, buildRemoteKnowledgeEmbeddingIndex, fetchRemoteKnowledgeQueryEmbedding, PLANS_NOTICE_STORAGE_KEY, PLANS_NOTICE_SUPPRESS_MS, browserStorage, shouldShowPlansNotice, dismissPlansNoticeFor24Hours, MODE_WORKSPACE_MAIN_CLASS, MODE_PANEL_GRID_CLASS, MODE_SIDE_PANEL_CLASS, MODE_ANSWER_PANEL_CLASS, PREPARATION_CHILD_ROUTES, practiceHistoryBackDestination, practiceHistoryBackLabel, DashboardShell, ONBOARDING_STEPS, OnboardingGuide, PlansNoticeDialog, HomePage, PreparationCenter, PreparationCard, PreparationSelect, ScreenshotDisplaySelect, ModeCard, OpacitySlider, ModeWorkspace, ExamModePanel, audioHealthHeadline, AudioHealthNotice, AudioHealthLiveRegion, InterviewModePanel, ModeAnswerPanel, PlanTimeCard, PrepTile, PageCard, ApiKeyManagementPage, LanguagePage, HotwordsPage, PromptsPage, HELP_MARKDOWN, HelpPage, StepCard, formatPlanPrice, formatPlanDuration, PlansPage, paymentStatusLabel, formatPaymentPlanName, resumeInputClass, resumeUploadAccept, ResumePage, ResumeTextInput, ResumeTextArea, ResumeListInput, ResumeEditorSection, ResumeProjectsEditor, ResumeWorkEditor, ResumeEducationEditor, ResumeEditableList, cloneResumeProfile, splitResumeLines, hasResumeProfileContent, KnowledgePage, PlaceholderPage, StatusPill, runtimeTaskStatusLabel, routeTitle, ClimbMark, NavIcon, iconProps, HomeIcon, FileIcon, BookIcon, MicIcon, TagIcon, PenIcon, SettingsIcon, CardIcon, HelpIcon, ScanIcon, PracticeIcon, HistoryIcon, ChevronDown, CloseIcon, ArrowRight };
