import { PERSONAL_MODEL_PROVIDER, validatePersonalModelProfile, validatePersonalModelCredentialInput, personalModelChatCompletionsEndpoint, validatePersonalModelRequest, isDashScopeQwen38PersonalModel, personalModelResponsesEndpoint, MAX_PERSONAL_MODEL_SOURCES } from "./validation.mjs";
import { createPersonalModelAbortScope, assertPersonalModelResponseOk, readResponseJson, createPersonalModelStreamAbortScope, readSseJson, PersonalModelAdapterError } from "./transport.mjs";
import { NativeModelAdapter, modelHeaders } from './native-adapters.mjs';

const MAX_PERSONAL_MODEL_OUTPUT_CHARS$1 = 512e3;
class OpenAiCompatiblePersonalModelAdapter {
  provider = PERSONAL_MODEL_PROVIDER;
  profile;
  apiKey;
  fetchImpl;
  endpoint;
  constructor(options) {
    this.profile = validatePersonalModelProfile(options.profile, options.urlValidation);
    this.apiKey = validatePersonalModelCredentialInput({ apiKey: options.apiKey }).apiKey;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.endpoint = personalModelChatCompletionsEndpoint(
      this.profile.baseUrl,
      options.urlValidation
    );
  }
  async generate(rawRequest, options) {
    const request = validatePersonalModelRequest(rawRequest);
    const scope = createPersonalModelAbortScope(this.provider, options);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: this.headers(),
        body: JSON.stringify(buildOpenAiCompatibleBody(this.profile, request, false)),
        signal: scope.signal
      });
      assertPersonalModelResponseOk(this.provider, response);
      const payload = await readResponseJson(this.provider, response);
      const text = readChatCompletionText(payload);
      if (!text) throw emptyResponseError$1();
      assertSafeOutputLength$1(text);
      const usage = readChatCompletionUsage(payload);
      return {
        provider: this.provider,
        model: this.profile.model,
        text,
        ...usage ? { usage } : {}
      };
    } catch (error) {
      return scope.mapError(error);
    } finally {
      scope.cleanup();
    }
  }
  async stream(rawRequest, onEvent, options) {
    const request = validatePersonalModelRequest(rawRequest);
    const scope = createPersonalModelStreamAbortScope(this.provider, options);
    let text = "";
    let usage;
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          ...this.headers(),
          Accept: "text/event-stream"
        },
        body: JSON.stringify(buildOpenAiCompatibleBody(this.profile, request, true)),
        signal: scope.signal
      });
      scope.markResponse();
      assertPersonalModelResponseOk(this.provider, response);
      if (isJsonResponse$1(response)) {
        const payload = await readResponseJson(this.provider, response);
        scope.markActivity();
        if (hasStreamError(payload)) {
          throw streamResponseError(this.provider, response.status);
        }
        const delta = readChatCompletionText(payload);
        if (delta) {
          scope.markVisibleContent();
          assertSafeOutputLength$1(text, delta);
          text += delta;
          onEvent({ type: "delta", delta });
        }
        usage = readChatCompletionUsage(payload) ?? usage;
      } else {
        for await (const payload of readSseJson(
          this.provider,
          response.body,
          scope.markActivity
        )) {
          const delta = readChatCompletionDelta(payload);
          if (delta) {
            scope.markVisibleContent();
            assertSafeOutputLength$1(text, delta);
            text += delta;
            onEvent({ type: "delta", delta });
          }
          usage = readChatCompletionUsage(payload) ?? usage;
          if (hasStreamError(payload)) {
            throw streamResponseError(this.provider, response.status);
          }
        }
      }
      scope.signal.throwIfAborted();
      if (!text) throw emptyResponseError$1();
      if (usage) onEvent({ type: "usage", usage });
      const result = {
        provider: this.provider,
        model: this.profile.model,
        text,
        ...usage ? { usage } : {}
      };
      onEvent({ type: "done", result });
      return result;
    } catch (error) {
      return scope.mapError(error);
    } finally {
      scope.cleanup();
    }
  }
  async testConnection(options) {
    await this.generate({
      messages: [{ role: "user", content: "Reply with OK." }]
    }, options);
  }
  headers() {
    return modelHeaders(this.profile, this.apiKey);
  }
}
function buildOpenAiCompatibleBody(profile, request, stream) {
  const temperature = request.temperature ?? profile.temperature;
  const thinkingLevel = request.thinkingLevel ?? profile.thinkingLevel;
  const topP = request.topP ?? profile.topP;
  const stop = request.stop ?? profile.stop;
  const isDashScopeQwen38 = isDashScopeQwen38PersonalModel(profile.model, profile.baseUrl);
  const disablesDashScopeThinking = isDashScopeQwen38 && thinkingLevel === "none";
  return {
    model: profile.model,
    messages: request.messages.map(toChatCompletionMessage),
    stream,
    ...request.maxTokens !== void 0 ? { max_tokens: request.maxTokens } : {},
    ...temperature !== void 0 ? { temperature } : {},
    ...disablesDashScopeThinking ? { enable_thinking: false } : thinkingLevel !== void 0 ? { reasoning_effort: thinkingLevel } : {},
    ...stream && isDashScopeQwen38 ? { stream_options: { include_usage: true } } : {},
    ...topP !== void 0 ? { top_p: topP } : {},
    ...stop !== void 0 ? { stop } : {}
  };
}
function readChatCompletionText(payload) {
  if (!payload || typeof payload !== "object") return "";
  const choices = payload.choices;
  if (!Array.isArray(choices)) return "";
  return choices.map((choice) => {
    if (!choice || typeof choice !== "object") return "";
    const message = choice.message;
    if (!message || typeof message !== "object") return "";
    return visibleContentText(message.content);
  }).join("");
}
function readChatCompletionDelta(payload) {
  if (!payload || typeof payload !== "object") return "";
  const choices = payload.choices;
  if (!Array.isArray(choices)) return "";
  return choices.map((choice) => {
    if (!choice || typeof choice !== "object") return "";
    const delta = choice.delta;
    if (!delta || typeof delta !== "object") return "";
    return visibleContentText(delta.content);
  }).join("");
}
function readChatCompletionUsage(payload) {
  if (!payload || typeof payload !== "object") return void 0;
  const usage = payload.usage;
  if (!usage || typeof usage !== "object") return void 0;
  const completionDetails = usage.completion_tokens_details;
  const inputTokens = readFiniteNumber$1(usage, "prompt_tokens");
  const outputTokens = readFiniteNumber$1(usage, "completion_tokens");
  const reasoningTokens = readFiniteNumber$1(completionDetails, "reasoning_tokens");
  const totalTokens = readFiniteNumber$1(usage, "total_tokens");
  if ([inputTokens, outputTokens, reasoningTokens, totalTokens].every((value) => value === void 0)) {
    return void 0;
  }
  return {
    ...inputTokens !== void 0 ? { inputTokens } : {},
    ...outputTokens !== void 0 ? { outputTokens } : {},
    ...reasoningTokens !== void 0 ? { reasoningTokens } : {},
    ...totalTokens !== void 0 ? { totalTokens } : {}
  };
}
function toChatCompletionMessage(message) {
  return {
    role: message.role,
    content: typeof message.content === "string" ? message.content : message.content.map((part) => part.type === "text" ? { type: "text", text: part.text } : { type: "image_url", image_url: { url: part.imageUrl } })
  };
}
function visibleContentText(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part) => {
    if (!part || typeof part !== "object") return "";
    const type = part.type;
    const text = part.text;
    return (type === "text" || type === "output_text") && typeof text === "string" ? text : "";
  }).join("");
}
function hasStreamError(payload) {
  return Boolean(payload && typeof payload === "object" && "error" in payload);
}
function isJsonResponse$1(response) {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}
function streamResponseError(provider, status) {
  return new PersonalModelAdapterError(
    "PERSONAL_MODEL_STREAM_ERROR",
    "The model response stream ended with an error",
    provider,
    status,
    true
  );
}
function emptyResponseError$1() {
  return new PersonalModelAdapterError(
    "PERSONAL_MODEL_EMPTY_RESPONSE",
    "The model returned no usable answer text",
    PERSONAL_MODEL_PROVIDER,
    void 0,
    true
  );
}
function assertSafeOutputLength$1(current, addition = "") {
  if (current.length + addition.length <= MAX_PERSONAL_MODEL_OUTPUT_CHARS$1) return;
  throw new PersonalModelAdapterError(
    "PERSONAL_MODEL_RESPONSE_TOO_LARGE",
    "The personal model answer exceeded the safe text limit",
    PERSONAL_MODEL_PROVIDER
  );
}
function readFiniteNumber$1(value, key) {
  if (!value || typeof value !== "object") return void 0;
  const result = value[key];
  return typeof result === "number" && Number.isFinite(result) ? result : void 0;
}
const MAX_PERSONAL_MODEL_OUTPUT_CHARS = 512e3;
const MAX_PERSONAL_MODEL_SOURCE_URL_CHARS = 2048;
const MAX_PERSONAL_MODEL_SOURCE_TITLE_CHARS = 300;
class OpenAiResponsesPersonalModelAdapter {
  provider = PERSONAL_MODEL_PROVIDER;
  profile;
  apiKey;
  fetchImpl;
  endpoint;
  constructor(options) {
    this.profile = validatePersonalModelProfile(options.profile, options.urlValidation);
    if (this.profile.apiMode !== "responses") {
      throw new PersonalModelAdapterError(
        "PERSONAL_MODEL_INVALID_REQUEST",
        "The OpenAI Responses adapter requires Responses API mode",
        this.provider
      );
    }
    this.apiKey = validatePersonalModelCredentialInput({ apiKey: options.apiKey }).apiKey;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.endpoint = personalModelResponsesEndpoint(this.profile.baseUrl, options.urlValidation);
  }
  async generate(rawRequest, options) {
    const request = validatePersonalModelRequest(rawRequest);
    assertResponsesRequestCompatibility(request);
    const scope = createPersonalModelAbortScope(this.provider, options);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: this.headers(),
        body: JSON.stringify(buildOpenAiResponsesBody(this.profile, request, false)),
        signal: scope.signal
      });
      assertPersonalModelResponseOk(this.provider, response);
      const payload = await readResponseJson(this.provider, response);
      if (hasResponsesError(payload)) throw responsesStreamError(response.status);
      const text = readResponsesText(payload);
      if (!text) throw emptyResponseError();
      assertSafeOutputLength("", text);
      const usage = readResponsesUsage(payload);
      const sources = readResponsesSources(payload);
      return {
        provider: this.provider,
        model: this.profile.model,
        text,
        ...usage ? { usage } : {},
        ...sources.length ? { sources } : {}
      };
    } catch (error) {
      return scope.mapError(error);
    } finally {
      scope.cleanup();
    }
  }
  async stream(rawRequest, onEvent, options) {
    const request = validatePersonalModelRequest(rawRequest);
    assertResponsesRequestCompatibility(request);
    const scope = createPersonalModelStreamAbortScope(this.provider, options);
    let text = "";
    let usage;
    let sources = [];
    const consumePayload = (payload) => {
      if (hasResponsesError(payload)) throw responsesStreamError();
      const delta = readResponsesDelta(payload);
      if (delta) {
        scope.markVisibleContent();
        assertSafeOutputLength(text, delta);
        text += delta;
        onEvent({ type: "delta", delta });
      } else {
        const finalText = readResponsesText(payload);
        const missing = missingFinalText(text, finalText);
        if (missing) {
          scope.markVisibleContent();
          assertSafeOutputLength(text, missing);
          text += missing;
          onEvent({ type: "delta", delta: missing });
        }
      }
      usage = readResponsesUsage(payload) ?? usage;
      const mergedSources = mergePersonalModelSources(sources, readResponsesSources(payload));
      if (mergedSources.length !== sources.length) {
        sources = mergedSources;
        onEvent({ type: "sources", sources: [...sources] });
      }
    };
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          ...this.headers(),
          Accept: "text/event-stream"
        },
        body: JSON.stringify(buildOpenAiResponsesBody(this.profile, request, true)),
        signal: scope.signal
      });
      scope.markResponse();
      assertPersonalModelResponseOk(this.provider, response);
      if (isJsonResponse(response)) {
        const payload = await readResponseJson(this.provider, response);
        scope.markActivity();
        consumePayload(payload);
      } else {
        for await (const payload of readSseJson(
          this.provider,
          response.body,
          scope.markActivity
        )) {
          consumePayload(payload);
        }
      }
      scope.signal.throwIfAborted();
      if (!text) throw emptyResponseError();
      if (usage) onEvent({ type: "usage", usage });
      const result = {
        provider: this.provider,
        model: this.profile.model,
        text,
        ...usage ? { usage } : {},
        ...sources.length ? { sources } : {}
      };
      onEvent({ type: "done", result });
      return result;
    } catch (error) {
      return scope.mapError(error);
    } finally {
      scope.cleanup();
    }
  }
  async testConnection(options) {
    await this.generate({
      messages: [{ role: "user", content: "Reply with OK." }]
    }, options);
  }
  headers() {
    return modelHeaders(this.profile, this.apiKey);
  }
}
function buildOpenAiResponsesBody(profile, request, stream) {
  if (profile.apiMode !== "responses") {
    throw new PersonalModelAdapterError(
      "PERSONAL_MODEL_INVALID_REQUEST",
      "The selected profile is not configured for the Responses API",
      PERSONAL_MODEL_PROVIDER
    );
  }
  assertResponsesRequestCompatibility(request);
  const temperature = request.temperature ?? profile.temperature;
  const thinkingLevel = request.thinkingLevel ?? profile.thinkingLevel;
  const topP = request.topP ?? profile.topP;
  return {
    model: profile.model,
    input: request.messages.map(toResponsesInputMessage),
    stream,
    ...request.maxTokens !== void 0 ? { max_output_tokens: request.maxTokens } : {},
    ...temperature !== void 0 ? { temperature } : {},
    ...thinkingLevel !== void 0 ? { reasoning: { effort: thinkingLevel } } : {},
    ...topP !== void 0 ? { top_p: topP } : {},
    ...profile.webSearchEnabled ? {
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"]
    } : {}
  };
}
function readResponsesText(payload) {
  if (!payload || typeof payload !== "object") return "";
  const value = payload;
  if (value.type === "response.output_text.done" && typeof value.text === "string") {
    return value.text;
  }
  if (typeof value.output_text === "string") return value.output_text;
  if (value.response && typeof value.response === "object") {
    const nested = readResponsesText(value.response);
    if (nested) return nested;
  }
  if (!Array.isArray(value.output)) return "";
  return value.output.map((item) => {
    if (!item || typeof item !== "object" || item.type !== "message") {
      return "";
    }
    const content = item.content;
    if (!Array.isArray(content)) return "";
    return content.map((part) => {
      if (!part || typeof part !== "object") return "";
      return part.type === "output_text" && typeof part.text === "string" ? part.text : "";
    }).join("");
  }).join("");
}
function readResponsesDelta(payload) {
  if (!payload || typeof payload !== "object") return "";
  const value = payload;
  return value.type === "response.output_text.delta" && typeof value.delta === "string" ? value.delta : "";
}
function readResponsesUsage(payload) {
  if (!payload || typeof payload !== "object") return void 0;
  const value = payload;
  if (value.response && typeof value.response === "object") {
    const nested = readResponsesUsage(value.response);
    if (nested) return nested;
  }
  const usage = value.usage;
  if (!usage || typeof usage !== "object") return void 0;
  const outputDetails = usage.output_tokens_details;
  const inputTokens = readFiniteNumber(usage, "input_tokens");
  const outputTokens = readFiniteNumber(usage, "output_tokens");
  const reasoningTokens = readFiniteNumber(outputDetails, "reasoning_tokens");
  const totalTokens = readFiniteNumber(usage, "total_tokens");
  if ([inputTokens, outputTokens, reasoningTokens, totalTokens].every((number) => number === void 0)) {
    return void 0;
  }
  return {
    ...inputTokens !== void 0 ? { inputTokens } : {},
    ...outputTokens !== void 0 ? { outputTokens } : {},
    ...reasoningTokens !== void 0 ? { reasoningTokens } : {},
    ...totalTokens !== void 0 ? { totalTokens } : {}
  };
}
function readResponsesSources(payload) {
  if (!payload || typeof payload !== "object") return [];
  const value = payload;
  let sources = [];
  if (value.response && typeof value.response === "object") {
    sources = mergePersonalModelSources(sources, readResponsesSources(value.response));
  }
  sources = mergePersonalModelSources(sources, sourcesFromContentPart(value.part));
  if (value.item && typeof value.item === "object") {
    sources = mergePersonalModelSources(sources, sourcesFromOutputItem(value.item));
  }
  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      sources = mergePersonalModelSources(sources, sourcesFromOutputItem(item));
    }
  }
  return sources;
}
function sourcesFromOutputItem(raw) {
  if (!raw || typeof raw !== "object") return [];
  const outputItem = raw;
  let sources = [];
  if (outputItem.type === "message" && Array.isArray(outputItem.content)) {
    for (const part of outputItem.content) {
      sources = mergePersonalModelSources(sources, sourcesFromContentPart(part));
    }
  }
  if (outputItem.type === "web_search_call") {
    sources = mergePersonalModelSources(sources, sourcesFromWebSearchAction(outputItem.action));
  }
  return sources;
}
function mergePersonalModelSources(current, additions) {
  if (!additions.length || current.length >= MAX_PERSONAL_MODEL_SOURCES) return current;
  const merged = [...current];
  const seen = new Set(current.map((source) => source.url));
  for (const source of additions) {
    const normalized = normalizePersonalModelSource(source);
    if (!normalized || seen.has(normalized.url)) continue;
    seen.add(normalized.url);
    merged.push(normalized);
    if (merged.length >= MAX_PERSONAL_MODEL_SOURCES) break;
  }
  return merged;
}
function toResponsesInputMessage(message) {
  if (typeof message.content === "string") {
    return { role: message.role, content: message.content };
  }
  if (message.role !== "user") {
    return {
      role: message.role,
      content: message.content.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n")
    };
  }
  return {
    role: message.role,
    content: message.content.map((part) => part.type === "text" ? { type: "input_text", text: part.text } : { type: "input_image", image_url: part.imageUrl })
  };
}
function sourcesFromContentPart(raw) {
  if (!raw || typeof raw !== "object") return [];
  const annotations = raw.annotations;
  if (!Array.isArray(annotations)) return [];
  const sources = [];
  for (const annotation of annotations) {
    if (!annotation || typeof annotation !== "object" || annotation.type !== "url_citation") continue;
    const value = annotation;
    const nested = value.url_citation && typeof value.url_citation === "object" ? value.url_citation : void 0;
    const normalized = normalizePersonalModelSource({
      url: typeof value.url === "string" ? value.url : typeof nested?.url === "string" ? nested.url : "",
      ...typeof value.title === "string" ? { title: value.title } : typeof nested?.title === "string" ? { title: nested.title } : {}
    });
    if (normalized) sources.push(normalized);
  }
  return mergePersonalModelSources([], sources);
}
function sourcesFromWebSearchAction(raw) {
  if (!raw || typeof raw !== "object") return [];
  const sources = raw.sources;
  if (!Array.isArray(sources)) return [];
  const normalized = sources.map((source) => {
    if (!source || typeof source !== "object") return null;
    const value = source;
    if (typeof value.url !== "string") return null;
    return normalizePersonalModelSource({
      url: value.url,
      ...typeof value.title === "string" ? { title: value.title } : {}
    });
  }).filter((source) => source !== null);
  return mergePersonalModelSources([], normalized);
}
function normalizePersonalModelSource(source) {
  if (typeof source.url !== "string" || !source.url || source.url.length > MAX_PERSONAL_MODEL_SOURCE_URL_CHARS || /[\u0000-\u001f\u007f]/u.test(source.url)) return null;
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:" && url.protocol !== "http:" || !url.hostname || url.username || url.password) return null;
    const title = typeof source.title === "string" ? source.title.replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(
      0,
      MAX_PERSONAL_MODEL_SOURCE_TITLE_CHARS
    ) : "";
    return { url: url.toString(), ...title ? { title } : {} };
  } catch {
    return null;
  }
}
function assertResponsesRequestCompatibility(request) {
  if (request.stop !== void 0) {
    throw new PersonalModelAdapterError(
      "PERSONAL_MODEL_INVALID_REQUEST",
      "The Responses API request contains unsupported Chat Completions controls",
      PERSONAL_MODEL_PROVIDER
    );
  }
}
function missingFinalText(current, finalText) {
  if (!finalText || finalText === current) return "";
  return finalText.startsWith(current) ? finalText.slice(current.length) : current ? "" : finalText;
}
function hasResponsesError(payload) {
  if (!payload || typeof payload !== "object") return false;
  const value = payload;
  if (value.type === "error" || value.type === "response.failed") return true;
  if (value.error && typeof value.error === "object") return true;
  if (value.response && typeof value.response === "object") {
    const response = value.response;
    return response.status === "failed" || Boolean(response.error);
  }
  return false;
}
function isJsonResponse(response) {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}
function responsesStreamError(status) {
  return new PersonalModelAdapterError(
    "PERSONAL_MODEL_STREAM_ERROR",
    "The Responses API stream ended with an error",
    PERSONAL_MODEL_PROVIDER,
    status,
    true
  );
}
function emptyResponseError() {
  return new PersonalModelAdapterError(
    "PERSONAL_MODEL_EMPTY_RESPONSE",
    "The model returned no usable answer text",
    PERSONAL_MODEL_PROVIDER,
    void 0,
    true
  );
}
function assertSafeOutputLength(current, addition) {
  if (current.length + addition.length <= MAX_PERSONAL_MODEL_OUTPUT_CHARS) return;
  throw new PersonalModelAdapterError(
    "PERSONAL_MODEL_RESPONSE_TOO_LARGE",
    "The personal model answer exceeded the safe text limit",
    PERSONAL_MODEL_PROVIDER
  );
}
function readFiniteNumber(value, key) {
  if (!value || typeof value !== "object") return void 0;
  const number = value[key];
  return typeof number === "number" && Number.isFinite(number) ? number : void 0;
}
function createPersonalModelAdapter(options) {
  const profile = validatePersonalModelProfile(options.profile, options.urlValidation);
  const credential = validatePersonalModelCredentialInput({ apiKey: options.apiKey });
  const Adapter = ['anthropic', 'gemini'].includes(profile.apiMode) ? NativeModelAdapter : profile.apiMode === "responses" ? OpenAiResponsesPersonalModelAdapter : OpenAiCompatiblePersonalModelAdapter;
  return new Adapter({
    profile,
    apiKey: credential.apiKey,
    fetchImpl: options.fetchImpl,
    urlValidation: options.urlValidation
  });
}
function personalModelInvalidRequestMessage(status) {
  switch (status) {
    case 400:
      return "自有模型拒绝了本次请求，请检查模型名称、是否支持图片输入及高级请求参数";
    case 404:
      return "未找到自有模型接口，请检查 Base URL 和模型名称";
    case 405:
      return "自有模型接口不支持当前调用方式，请确认 Base URL 是 OpenAI 兼容 API 根地址";
    case 408:
      return "自有模型请求超时，请稍后重试";
    case 409:
      return "自有模型当前请求冲突，请稍后重试";
    case 402:
      return "自有模型账户余额不足或计费未开通，请到模型服务商检查余额与计费状态";
    case 413:
      return "发送给自有模型的截图或上下文过大，请减少截图数量或降低分辨率后重试";
    case 415:
      return "自有模型不支持当前截图或请求格式，请确认模型支持图片输入";
    case 422:
      return "自有模型无法处理本次请求参数，请检查模型名称、图片能力和高级请求参数";
    default:
      return "自有模型无法处理本次请求，请检查模型名称、图片能力和高级请求参数";
  }
}

export { MAX_PERSONAL_MODEL_OUTPUT_CHARS$1, OpenAiCompatiblePersonalModelAdapter, buildOpenAiCompatibleBody, readChatCompletionText, readChatCompletionDelta, readChatCompletionUsage, toChatCompletionMessage, visibleContentText, hasStreamError, isJsonResponse$1, streamResponseError, emptyResponseError$1, assertSafeOutputLength$1, readFiniteNumber$1, MAX_PERSONAL_MODEL_OUTPUT_CHARS, MAX_PERSONAL_MODEL_SOURCE_URL_CHARS, MAX_PERSONAL_MODEL_SOURCE_TITLE_CHARS, OpenAiResponsesPersonalModelAdapter, buildOpenAiResponsesBody, readResponsesText, readResponsesDelta, readResponsesUsage, readResponsesSources, sourcesFromOutputItem, mergePersonalModelSources, toResponsesInputMessage, sourcesFromContentPart, sourcesFromWebSearchAction, normalizePersonalModelSource, assertResponsesRequestCompatibility, missingFinalText, hasResponsesError, isJsonResponse, responsesStreamError, emptyResponseError, assertSafeOutputLength, readFiniteNumber, createPersonalModelAdapter, personalModelInvalidRequestMessage };
