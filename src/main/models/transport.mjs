

class PersonalModelAdapterError extends Error {
  constructor(code, message, provider, status, retryable = false) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
    this.name = "PersonalModelAdapterError";
  }
}
const DEFAULT_PERSONAL_MODEL_TIMEOUT_MS = 9e4;
const DEFAULT_PERSONAL_MODEL_STREAM_INACTIVITY_TIMEOUT_MS = 45e3;
const MAX_PERSONAL_MODEL_STREAM_DURATION_MS = 3e5;
const MAX_PERSONAL_MODEL_RESPONSE_BYTES = 4 * 1024 * 1024;
function createPersonalModelAbortScope(provider, options) {
  const controller = new AbortController();
  const timeoutMs = normalizeTimeout(options?.timeoutMs);
  let timedOut = false;
  const onAbort = () => controller.abort(options?.signal?.reason);
  if (options?.signal?.aborted) onAbort();
  else options?.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
    },
    mapError: (error) => {
      if (timedOut) {
        throw new PersonalModelAdapterError(
          "PERSONAL_MODEL_TIMEOUT",
          "The personal model request timed out",
          provider,
          void 0,
          true
        );
      }
      if (options?.signal?.aborted || isAbortError(error)) {
        throw new PersonalModelAdapterError(
          "PERSONAL_MODEL_ABORTED",
          "The personal model request was cancelled",
          provider
        );
      }
      if (error instanceof PersonalModelAdapterError) throw error;
      throw new PersonalModelAdapterError(
        "PERSONAL_MODEL_UPSTREAM_UNAVAILABLE",
        "Unable to connect to the personal model provider",
        provider,
        void 0,
        true
      );
    }
  };
}
function createPersonalModelStreamAbortScope(provider, options) {
  const controller = new AbortController();
  const phaseTimeoutMs = normalizeTimeout(options?.timeoutMs);
  const overrides = options?.streamTimeouts;
  const timeouts = {
    firstResponseMs: normalizeStreamTimeout(
      overrides?.firstResponseMs,
      phaseTimeoutMs
    ),
    firstVisibleContentMs: normalizeStreamTimeout(
      overrides?.firstVisibleContentMs,
      phaseTimeoutMs
    ),
    inactivityMs: normalizeStreamTimeout(
      overrides?.inactivityMs,
      DEFAULT_PERSONAL_MODEL_STREAM_INACTIVITY_TIMEOUT_MS
    ),
    absoluteMs: normalizeStreamTimeout(
      overrides?.absoluteMs,
      MAX_PERSONAL_MODEL_STREAM_DURATION_MS
    )
  };
  let timedOut = false;
  let cleanedUp = false;
  let visibleContentReceived = false;
  let phaseTimer;
  let inactivityTimer;
  let absoluteTimer;
  const clearTimer = (timer) => {
    if (timer !== void 0) clearTimeout(timer);
  };
  const clearTimers = () => {
    clearTimer(phaseTimer);
    clearTimer(inactivityTimer);
    clearTimer(absoluteTimer);
    phaseTimer = void 0;
    inactivityTimer = void 0;
    absoluteTimer = void 0;
  };
  const abortForTimeout = () => {
    if (cleanedUp || controller.signal.aborted || options?.signal?.aborted) return;
    timedOut = true;
    clearTimers();
    controller.abort();
  };
  const armPhaseTimer = (timeoutMs) => {
    clearTimer(phaseTimer);
    phaseTimer = setTimeout(abortForTimeout, timeoutMs);
  };
  const armInactivityTimer = () => {
    clearTimer(inactivityTimer);
    inactivityTimer = setTimeout(abortForTimeout, timeouts.inactivityMs);
  };
  const onAbort = () => {
    clearTimers();
    controller.abort(options?.signal?.reason);
  };
  if (options?.signal?.aborted) onAbort();
  else options?.signal?.addEventListener("abort", onAbort, { once: true });
  if (!controller.signal.aborted) {
    armPhaseTimer(timeouts.firstResponseMs);
    absoluteTimer = setTimeout(abortForTimeout, timeouts.absoluteMs);
  }
  return {
    signal: controller.signal,
    markResponse: () => {
      if (cleanedUp || controller.signal.aborted) return;
      armPhaseTimer(timeouts.firstVisibleContentMs);
    },
    markActivity: () => {
      if (cleanedUp || controller.signal.aborted) return;
      armInactivityTimer();
    },
    markVisibleContent: () => {
      if (cleanedUp || controller.signal.aborted) return;
      if (!visibleContentReceived) {
        visibleContentReceived = true;
        clearTimer(phaseTimer);
        phaseTimer = void 0;
      }
      armInactivityTimer();
    },
    cleanup: () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimers();
      options?.signal?.removeEventListener("abort", onAbort);
    },
    mapError: (error) => {
      if (options?.signal?.aborted) {
        throw new PersonalModelAdapterError(
          "PERSONAL_MODEL_ABORTED",
          "The personal model request was cancelled",
          provider
        );
      }
      if (timedOut) {
        throw new PersonalModelAdapterError(
          "PERSONAL_MODEL_TIMEOUT",
          "The personal model request timed out",
          provider,
          void 0,
          true
        );
      }
      if (isAbortError(error)) {
        throw new PersonalModelAdapterError(
          "PERSONAL_MODEL_ABORTED",
          "The personal model request was cancelled",
          provider
        );
      }
      if (error instanceof PersonalModelAdapterError) throw error;
      throw new PersonalModelAdapterError(
        "PERSONAL_MODEL_UPSTREAM_UNAVAILABLE",
        "Unable to connect to the personal model provider",
        provider,
        void 0,
        true
      );
    }
  };
}
function assertPersonalModelResponseOk(provider, response) {
  if (response.ok) return;
  const status = response.status;
  if (status === 401 || status === 403) {
    throw new PersonalModelAdapterError(
      "PERSONAL_MODEL_CREDENTIAL_REJECTED",
      "The personal model provider rejected this credential",
      provider,
      status
    );
  }
  if (status === 429) {
    throw new PersonalModelAdapterError(
      "PERSONAL_MODEL_RATE_LIMITED",
      "The personal model provider is temporarily rate limited",
      provider,
      status,
      true
    );
  }
  if (status >= 400 && status < 500) {
    throw new PersonalModelAdapterError(
      "PERSONAL_MODEL_INVALID_REQUEST",
      "The personal model provider could not process this request",
      provider,
      status
    );
  }
  throw new PersonalModelAdapterError(
    "PERSONAL_MODEL_UPSTREAM_UNAVAILABLE",
    "The personal model provider is temporarily unavailable",
    provider,
    status,
    true
  );
}
async function readResponseJson(provider, response) {
  rejectOversizedContentLength(provider, response);
  try {
    const text = await readBoundedResponseText(provider, response);
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof PersonalModelAdapterError) throw error;
    throw new PersonalModelAdapterError(
      "PERSONAL_MODEL_STREAM_ERROR",
      "The personal model provider returned an unreadable response",
      provider,
      response.status,
      true
    );
  }
}
async function* readSseJson(provider, body, onActivity) {
  if (!body) {
    throw new PersonalModelAdapterError(
      "PERSONAL_MODEL_STREAM_ERROR",
      "The personal model provider did not return a response stream",
      provider,
      void 0,
      true
    );
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedBytes = 0;
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_PERSONAL_MODEL_RESPONSE_BYTES) {
        throw responseTooLargeError(provider);
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/u);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const value2 = parseSseFrame(provider, frame);
        if (value2 !== void 0) {
          onActivity?.();
          yield value2;
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const value = parseSseFrame(provider, buffer);
      if (value !== void 0) {
        onActivity?.();
        yield value;
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => void 0);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
async function readBoundedResponseText(provider, response) {
  if (!response.body) {
    throw new PersonalModelAdapterError(
      "PERSONAL_MODEL_STREAM_ERROR",
      "The personal model provider returned an empty response body",
      provider,
      response.status,
      true
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let receivedBytes = 0;
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_PERSONAL_MODEL_RESPONSE_BYTES) {
        throw responseTooLargeError(provider, response.status);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => void 0);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
function rejectOversizedContentLength(provider, response) {
  const raw = response.headers.get("content-length");
  if (!raw) return;
  const contentLength = Number(raw);
  if (Number.isFinite(contentLength) && contentLength > MAX_PERSONAL_MODEL_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => void 0);
    throw responseTooLargeError(provider, response.status);
  }
}
function responseTooLargeError(provider, status) {
  return new PersonalModelAdapterError(
    "PERSONAL_MODEL_RESPONSE_TOO_LARGE",
    "The personal model response exceeded the safe size limit",
    provider,
    status
  );
}
function parseSseFrame(provider, frame) {
  const payload = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
  if (!payload || payload === "[DONE]") return void 0;
  try {
    return JSON.parse(payload);
  } catch {
    throw new PersonalModelAdapterError(
      "PERSONAL_MODEL_STREAM_ERROR",
      "The personal model provider returned a malformed stream",
      provider,
      void 0,
      true
    );
  }
}
function normalizeTimeout(value) {
  if (!Number.isFinite(value) || value === void 0) return DEFAULT_PERSONAL_MODEL_TIMEOUT_MS;
  return Math.max(1e3, Math.min(3e5, Math.round(value)));
}
function normalizeStreamTimeout(value, fallback) {
  if (!Number.isFinite(value) || value === void 0) return fallback;
  return Math.max(1, Math.min(MAX_PERSONAL_MODEL_STREAM_DURATION_MS, Math.round(value)));
}
function isAbortError(error) {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export { PersonalModelAdapterError, DEFAULT_PERSONAL_MODEL_TIMEOUT_MS, DEFAULT_PERSONAL_MODEL_STREAM_INACTIVITY_TIMEOUT_MS, MAX_PERSONAL_MODEL_STREAM_DURATION_MS, MAX_PERSONAL_MODEL_RESPONSE_BYTES, createPersonalModelAbortScope, createPersonalModelStreamAbortScope, assertPersonalModelResponseOk, readResponseJson, readSseJson, readBoundedResponseText, rejectOversizedContentLength, responseTooLargeError, parseSseFrame, normalizeTimeout, normalizeStreamTimeout, isAbortError };
