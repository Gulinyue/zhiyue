

import { modelProvider, MODEL_PROTOCOLS } from '../../shared/model-providers.mjs';
const PERSONAL_MODEL_PROVIDER = "custom-api";
const PERSONAL_MODEL_PROTOCOL = "openai-compatible";
const PERSONAL_MODEL_PROFILE_ID = "personal-custom-api";
const DEFAULT_PERSONAL_MODEL_ID = "gpt-5-mini";
const DEFAULT_PERSONAL_MODEL_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_PERSONAL_MODEL_API_MODE = "chat-completions";
const DEFAULT_PERSONAL_MODEL_WEB_SEARCH_ENABLED = false;
const LEGACY_GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const MAX_PERSONAL_MODEL_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PERSONAL_MODEL_IMAGES = 20;
const MAX_PERSONAL_MODEL_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_PERSONAL_MODEL_TEXT_PART_CHARS = 2e5;
const MAX_PERSONAL_MODEL_TOTAL_TEXT_CHARS = 4e5;
const MAX_PERSONAL_MODEL_STOP_SEQUENCES = 4;
const MAX_PERSONAL_MODEL_STOP_SEQUENCE_CHARS = 256;
const MAX_PERSONAL_MODEL_SOURCES = 24;
const MODEL_ID_PATTERN = /^[^\s\u0000-\u001f\u007f]{1,200}$/u;
const ALLOWED_IMAGE_MIME_TYPES = /* @__PURE__ */ new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif"
]);
class PersonalModelValidationError extends Error {
  code = "PERSONAL_MODEL_INVALID_INPUT";
  constructor(message) {
    super(message);
    this.name = "PersonalModelValidationError";
  }
}
function isPersonalModelProvider(value) {
  return value === PERSONAL_MODEL_PROVIDER;
}
function isPersonalModelConnectionSlot(value) {
  return value === "screenshot" || value === "interview";
}
function validatePersonalModelCredentialInput(value) {
  if (typeof value?.apiKey !== "string") {
    throw new PersonalModelValidationError("API key is required");
  }
  const apiKey = value.apiKey.trim();
  if (apiKey.length < 8 || apiKey.length > 512 || /[\s\u0000-\u001f\u007f]/u.test(apiKey)) {
    throw new PersonalModelValidationError("API key has an invalid format");
  }
  return { apiKey };
}
function normalizePersonalModelBaseUrl(value, options = {}) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2048 || /[\u0000-\u001f\u007f]/u.test(raw)) {
    throw new PersonalModelValidationError("Base URL has an invalid format");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new PersonalModelValidationError("Base URL must be an absolute URL");
  }
  if (url.username || url.password) {
    throw new PersonalModelValidationError("Base URL must not contain credentials");
  }
  if (isBlockedMetadataHostname(url.hostname)) {
    throw new PersonalModelValidationError(
      "Base URL must not target link-local or cloud metadata services"
    );
  }
  if (url.search || url.hash) {
    throw new PersonalModelValidationError("Base URL must not contain a query or fragment");
  }
  const insecureLocalhost = url.protocol === "http:" && options.allowInsecureLocalhost === true && isLoopbackHostname(url.hostname);
  if (url.protocol !== "https:" && !insecureLocalhost) {
    throw new PersonalModelValidationError("Base URL must use HTTPS");
  }
  let pathname = url.pathname.replace(/\/+$/u, "");
  pathname = pathname.replace(/\/(?:chat\/completions|responses)$/iu, "");
  url.pathname = pathname || "/";
  const normalized = url.toString().replace(/\/$/u, "");
  if (!normalized) throw new PersonalModelValidationError("Base URL has an invalid format");
  return normalized;
}
function personalModelChatCompletionsEndpoint(baseUrl, options = {}) {
  return `${normalizePersonalModelBaseUrl(baseUrl, options)}/chat/completions`;
}
function personalModelResponsesEndpoint(baseUrl, options = {}) {
  return `${normalizePersonalModelBaseUrl(baseUrl, options)}/responses`;
}
function isDashScopeQwen38PersonalModel(model, baseUrl) {
  const normalizedModel = model.trim().toLowerCase();
  if (!/^qwen3\.8-(?:max|flash)(?:[-:][a-z0-9._-]+)?$/u.test(normalizedModel)) {
    return false;
  }
  try {
    const url = new URL(baseUrl.trim());
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
    return hostname === "dashscope.aliyuncs.com" || hostname === "dashscope-intl.aliyuncs.com" || hostname.endsWith(".dashscope.aliyuncs.com") || hostname === "maas.aliyuncs.com" || hostname.endsWith(".maas.aliyuncs.com");
  } catch {
    return false;
  }
}
function createDefaultPersonalModelProfile(model = DEFAULT_PERSONAL_MODEL_ID, baseUrl = DEFAULT_PERSONAL_MODEL_BASE_URL, enabled = false, options = {}, generation = {}, slot = "screenshot") {
  const webSearchEnabled = generation.webSearchEnabled ?? DEFAULT_PERSONAL_MODEL_WEB_SEARCH_ENABLED;
  const thinkingLevel = generation.thinkingLevel ?? (slot === "screenshot" && isDashScopeQwen38PersonalModel(model, baseUrl) ? "none" : void 0);
  return validatePersonalModelProfile({
    id: PERSONAL_MODEL_PROFILE_ID,
    provider: PERSONAL_MODEL_PROVIDER,
    protocol: PERSONAL_MODEL_PROTOCOL,
    slot,
    model,
    baseUrl,
    enabled,
    capabilities: ["text", "vision", "streaming"],
    webSearchEnabled,
    ...generation,
    ...thinkingLevel !== void 0 ? { thinkingLevel } : {}
  }, options);
}
function personalModelApiModeForWebSearch(webSearchEnabled) {
  return webSearchEnabled ? "responses" : DEFAULT_PERSONAL_MODEL_API_MODE;
}
function validatePersonalModelProfile(value, options = {}) {
  if (!value || typeof value !== "object") {
    throw new PersonalModelValidationError("Personal model profile is required");
  }
  if (value.id !== PERSONAL_MODEL_PROFILE_ID || !isPersonalModelProvider(value.provider) || value.protocol !== PERSONAL_MODEL_PROTOCOL) {
    throw new PersonalModelValidationError("Unsupported personal model profile");
  }
  if (!isPersonalModelConnectionSlot(value.slot)) {
    throw new PersonalModelValidationError("Unsupported personal model connection slot");
  }
  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (!MODEL_ID_PATTERN.test(model)) {
    throw new PersonalModelValidationError("Model id has an invalid format");
  }
  const baseUrl = normalizePersonalModelBaseUrl(value.baseUrl, options);
  if (!Array.isArray(value.capabilities)) {
    throw new PersonalModelValidationError("At least one supported model capability is required");
  }
  const capabilities = [...new Set(value.capabilities)];
  if (!capabilities.length || capabilities.some((capability) => !["text", "vision", "streaming"].includes(capability))) {
    throw new PersonalModelValidationError("At least one supported model capability is required");
  }
  const generation = normalizePersonalModelGenerationOptions(value);
  const webSearchEnabled = normalizePersonalModelWebSearchEnabled(value.webSearchEnabled);
  const providerId = value.providerId ?? 'custom';
  if (!modelProvider(providerId)) throw new PersonalModelValidationError('Unsupported model source');
  const apiMode = value.apiMode ?? personalModelApiModeForWebSearch(webSearchEnabled);
  if (!Object.hasOwn(MODEL_PROTOCOLS, apiMode)) throw new PersonalModelValidationError('Unsupported model protocol');
  if (providerId === 'chatgpt' && (baseUrl !== 'https://api.openai.com/v1' || apiMode !== 'responses' || webSearchEnabled)) {
    throw new PersonalModelValidationError('ChatGPT authorization requires the official Responses endpoint without web search');
  }
  if (webSearchEnabled && apiMode !== 'responses') throw new PersonalModelValidationError('Web search requires Responses');
  return {
    id: PERSONAL_MODEL_PROFILE_ID,
    provider: PERSONAL_MODEL_PROVIDER,
    protocol: PERSONAL_MODEL_PROTOCOL,
    slot: value.slot,
    apiMode,
    providerId,
    model,
    baseUrl,
    label: model,
    enabled: value.enabled === true,
    capabilities,
    ...generation,
    webSearchEnabled
  };
}
function validatePersonalModelRequest(value) {
  return validatePersonalModelRequestWithMetrics(value).request;
}
function validatePersonalModelRequestWithMetrics(value) {
  if (!value || !Array.isArray(value.messages) || value.messages.length === 0 || value.messages.length > 100) {
    throw new PersonalModelValidationError("At least one model message is required");
  }
  const metrics = {
    imageCount: 0,
    totalImageBytes: 0,
    totalTextChars: 0,
    hasUserMessage: false
  };
  const messages = value.messages.map((message) => validateMessage(message, metrics));
  if (metrics.imageCount > MAX_PERSONAL_MODEL_IMAGES || metrics.totalImageBytes > MAX_PERSONAL_MODEL_TOTAL_IMAGE_BYTES) {
    throw new PersonalModelValidationError("Image request exceeds the supported size limit");
  }
  if (metrics.totalTextChars > MAX_PERSONAL_MODEL_TOTAL_TEXT_CHARS) {
    throw new PersonalModelValidationError("Text request exceeds the supported size limit");
  }
  if (!metrics.hasUserMessage) {
    throw new PersonalModelValidationError("A user message is required");
  }
  const generation = normalizePersonalModelGenerationOptions(value);
  const maxTokens = value.maxTokens === void 0 ? void 0 : Number.isInteger(value.maxTokens) && value.maxTokens >= 64 && value.maxTokens <= 4096 ? value.maxTokens : null;
  if (maxTokens === null) {
    throw new PersonalModelValidationError("Output token limit is invalid");
  }
  return {
    request: {
      messages,
      ...maxTokens !== void 0 ? { maxTokens } : {},
      ...generation
    },
    imageCount: metrics.imageCount
  };
}
function parsePersonalModelImageDataUrl(value) {
  if (typeof value !== "string") {
    throw new PersonalModelValidationError("Image must be a data URL");
  }
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/]*={0,2})$/u.exec(value);
  if (!match) {
    throw new PersonalModelValidationError("Only base64 image data URLs are supported");
  }
  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new PersonalModelValidationError("Unsupported image MIME type");
  }
  if (!base64Data || base64Data.length % 4 !== 0) {
    throw new PersonalModelValidationError("Image data URL is malformed");
  }
  const padding = base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor(base64Data.length * 3 / 4) - padding;
  if (byteLength <= 0 || byteLength > MAX_PERSONAL_MODEL_IMAGE_BYTES) {
    throw new PersonalModelValidationError("Image exceeds the supported size limit");
  }
  return { mimeType, base64Data, byteLength };
}
function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
function isBlockedMetadataHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  if (normalized === "metadata.google.internal" || normalized.endsWith(".metadata.google.internal") || normalized === "instance-data.ec2.internal" || normalized === "metadata.azure.internal" || normalized === "100.100.100.200" || normalized === "169.254.169.254" || normalized === "fd00:ec2::254") {
    return true;
  }
  const ipv4 = normalized.split(".").map((part) => Number(part));
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && ipv4[0] === 169 && ipv4[1] === 254) {
    return true;
  }
  return /^fe[89ab][0-9a-f]*:/u.test(normalized);
}
function validateMessage(message, metrics) {
  if (!message || !["system", "user", "assistant"].includes(message.role)) {
    throw new PersonalModelValidationError("Message role is invalid");
  }
  if (message.role === "user") metrics.hasUserMessage = true;
  if (typeof message.content === "string") {
    if (!message.content.trim()) throw new PersonalModelValidationError("Message content cannot be empty");
    if (message.content.length > MAX_PERSONAL_MODEL_TEXT_PART_CHARS) {
      throw new PersonalModelValidationError("Message text exceeds the supported size limit");
    }
    metrics.totalTextChars += message.content.length;
    return { role: message.role, content: message.content };
  }
  if (!Array.isArray(message.content) || message.content.length === 0 || message.content.length > 20) {
    throw new PersonalModelValidationError("Message content parts are invalid");
  }
  const content = message.content.map((part) => {
    if (part?.type === "text" && typeof part.text === "string" && part.text.trim()) {
      if (part.text.length > MAX_PERSONAL_MODEL_TEXT_PART_CHARS) {
        throw new PersonalModelValidationError("Message text exceeds the supported size limit");
      }
      metrics.totalTextChars += part.text.length;
      return { type: "text", text: part.text };
    }
    if (part?.type === "image_url") {
      const imageUrl = part.imageUrl;
      if (typeof imageUrl !== "string") {
        throw new PersonalModelValidationError("Message content part is invalid");
      }
      if (message.role !== "user") {
        throw new PersonalModelValidationError("Images are supported only in user messages");
      }
      const parsedImage = parsePersonalModelImageDataUrl(imageUrl);
      metrics.imageCount += 1;
      metrics.totalImageBytes += parsedImage.byteLength;
      return { type: "image_url", imageUrl };
    }
    throw new PersonalModelValidationError("Message content part is invalid");
  });
  return { role: message.role, content };
}
function normalizeOptionalTemperature(value) {
  if (value === void 0) return void 0;
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new PersonalModelValidationError("Temperature must be between 0 and 2");
  }
  return value;
}
function normalizePersonalModelGenerationOptions(value) {
  const temperature = normalizeOptionalTemperature(value.temperature);
  const topP = normalizeOptionalRange(value.topP, 0, 1, "topP");
  if (value.thinkingLevel !== void 0 && !["none", "minimal", "low", "medium", "high"].includes(value.thinkingLevel)) {
    throw new PersonalModelValidationError("Unsupported thinking level");
  }
  const stop = normalizeOptionalStop(value.stop);
  return {
    ...temperature !== void 0 ? { temperature } : {},
    ...value.thinkingLevel !== void 0 ? { thinkingLevel: value.thinkingLevel } : {},
    ...topP !== void 0 ? { topP } : {},
    ...stop !== void 0 ? { stop } : {}
  };
}
function normalizeOptionalRange(value, minimum, maximum, field) {
  if (value === void 0) return void 0;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new PersonalModelValidationError(`${field} is outside the supported range`);
  }
  return value;
}
function normalizeOptionalStop(value) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PERSONAL_MODEL_STOP_SEQUENCES) {
    throw new PersonalModelValidationError("stop must contain one to four sequences");
  }
  return value.map((sequence) => {
    if (typeof sequence !== "string" || sequence.length < 1 || sequence.length > MAX_PERSONAL_MODEL_STOP_SEQUENCE_CHARS || sequence.includes("\0")) {
      throw new PersonalModelValidationError("stop contains an invalid sequence");
    }
    return sequence;
  });
}
function normalizePersonalModelWebSearchEnabled(value) {
  if (value === void 0) return DEFAULT_PERSONAL_MODEL_WEB_SEARCH_ENABLED;
  if (typeof value !== "boolean") {
    throw new PersonalModelValidationError("Unsupported web search setting");
  }
  return value;
}

export { PERSONAL_MODEL_PROVIDER, PERSONAL_MODEL_PROTOCOL, PERSONAL_MODEL_PROFILE_ID, DEFAULT_PERSONAL_MODEL_ID, DEFAULT_PERSONAL_MODEL_BASE_URL, DEFAULT_PERSONAL_MODEL_API_MODE, DEFAULT_PERSONAL_MODEL_WEB_SEARCH_ENABLED, LEGACY_GEMINI_OPENAI_BASE_URL, MAX_PERSONAL_MODEL_IMAGE_BYTES, MAX_PERSONAL_MODEL_IMAGES, MAX_PERSONAL_MODEL_TOTAL_IMAGE_BYTES, MAX_PERSONAL_MODEL_TEXT_PART_CHARS, MAX_PERSONAL_MODEL_TOTAL_TEXT_CHARS, MAX_PERSONAL_MODEL_STOP_SEQUENCES, MAX_PERSONAL_MODEL_STOP_SEQUENCE_CHARS, MAX_PERSONAL_MODEL_SOURCES, MODEL_ID_PATTERN, ALLOWED_IMAGE_MIME_TYPES, PersonalModelValidationError, isPersonalModelProvider, isPersonalModelConnectionSlot, validatePersonalModelCredentialInput, normalizePersonalModelBaseUrl, personalModelChatCompletionsEndpoint, personalModelResponsesEndpoint, isDashScopeQwen38PersonalModel, createDefaultPersonalModelProfile, personalModelApiModeForWebSearch, validatePersonalModelProfile, validatePersonalModelRequest, validatePersonalModelRequestWithMetrics, parsePersonalModelImageDataUrl, isLoopbackHostname, isBlockedMetadataHostname, validateMessage, normalizeOptionalTemperature, normalizePersonalModelGenerationOptions, normalizeOptionalRange, normalizeOptionalStop, normalizePersonalModelWebSearchEnabled };
