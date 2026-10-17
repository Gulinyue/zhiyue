// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.


const version$3 = "3.0.1";
const desktopPackage = {
  version: version$3
};
const CLIMB_DESKTOP_VERSION = desktopPackage.version;
const CLIMB_CLIENT_VERSION_HEADER = "X-Climb-Client-Version";
function withClientVersionBody(body) {
  return {
    ...body,
    version: CLIMB_DESKTOP_VERSION
  };
}
function normalizeBackendBaseUrl(raw) {
  return raw.trim().replace(/\/$/, "");
}
function toBackendWsUrl(baseUrl, path2) {
  const base = normalizeBackendBaseUrl(baseUrl).replace(/\/$/, "");
  let wsOrigin;
  if (base.startsWith("https://")) wsOrigin = "wss://" + base.slice(8);
  else if (base.startsWith("http://")) wsOrigin = "ws://" + base.slice(7);
  else wsOrigin = base;
  const p2 = path2.startsWith("/") ? path2 : `/${path2}`;
  return `${wsOrigin}${p2}`;
}
function desktopPlatformHeaders(target) {
  if (!target) return {};
  return {
    "X-Climb-Client-Platform": target.platform,
    "X-Climb-Client-Arch": target.arch
  };
}
const CLIENT_UPDATE_FALLBACK_VERSION = "3.0.1";
const CLIENT_UPDATE_DOWNLOAD_URL = __CLIMB_WEB_URL__ + "/download";
const CLIENT_UPDATE_NOTICE_MESSAGE = "本次更新新增滚动多图截图，优化截图兼容性与实时面试阅读体验。";
const LEGACY_CLIENT_FEATURE_MESSAGE = "尊敬的客户，由于版本过低，部分功能无法使用，请前往官网安装最新版本";
const CLIENT_UPDATE_RELEASE_NOTES = [
  "设置中新增在“显示隐藏的图标”中隐藏，按ctrl+e显现"
];
let noticeHandler = null;
function setClientVersionNoticeHandler(handler) {
  noticeHandler = handler;
  return () => {
    if (noticeHandler === handler) noticeHandler = null;
  };
}
function buildClientVersionNoticeFromPolicy(policy) {
  if (!policy.updateAvailable) return null;
  if (policy.forceUpdate) {
    return {
      kind: "required",
      currentVersion: policy.currentVersion,
      latestVersion: policy.latestVersion,
      message: LEGACY_CLIENT_FEATURE_MESSAGE,
      downloadUrl: policy.downloadUrl || CLIENT_UPDATE_DOWNLOAD_URL,
      releaseNotes: normalizeReleaseNotes(policy.releaseNotes)
    };
  }
  return {
    kind: "available",
    currentVersion: policy.currentVersion,
    latestVersion: policy.latestVersion,
    message: policy.message || CLIENT_UPDATE_NOTICE_MESSAGE,
    downloadUrl: policy.downloadUrl || CLIENT_UPDATE_DOWNLOAD_URL,
    releaseNotes: normalizeReleaseNotes(policy.releaseNotes)
  };
}
function notifyClientVersionUpdateRequired(error2) {
  noticeHandler?.({
    kind: "required",
    currentVersion: null,
    // A 426 response carries the minimum compatible version, not necessarily
    // the newest release. The update dialog must continue to advertise the
    // current desktop release.
    latestVersion: CLIENT_UPDATE_FALLBACK_VERSION,
    message: LEGACY_CLIENT_FEATURE_MESSAGE,
    downloadUrl: error2?.downloadUrl || CLIENT_UPDATE_DOWNLOAD_URL,
    releaseNotes: CLIENT_UPDATE_RELEASE_NOTES
  });
}
function normalizeReleaseNotes(notes) {
  const cleaned = notes.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : CLIENT_UPDATE_RELEASE_NOTES;
}
const FALLBACK_API = "http://localhost:8787";
const FALLBACK_WEB = "http://localhost:3000";
const BACKEND_BASE_URL = (() => {
  try {
    const v2 = __CLIMB_BACKEND_URL__;
    if (v2 && typeof v2 === "string" && v2.length > 0) return normalizeBackendBaseUrl(v2);
  } catch {
  }
  return normalizeBackendBaseUrl(FALLBACK_API);
})();
function backendWsUrl(path2) {
  return toBackendWsUrl(BACKEND_BASE_URL, path2);
}
const WEB_PORTAL_URL = (() => {
  try {
    const v2 = __CLIMB_WEB_URL__;
    if (v2 && typeof v2 === "string" && v2.length > 0) return v2.replace(/\/$/, "");
  } catch {
  }
  return FALLBACK_WEB;
})();
class AuthRequiredError extends Error {
  constructor(msg = "auth required") {
    super(msg);
    this.name = "AuthRequiredError";
  }
}
class AuthRefreshUnavailableError extends Error {
  constructor(msg = "auth refresh temporarily unavailable") {
    super(msg);
    this.name = "AuthRefreshUnavailableError";
  }
}
class SubscriptionRequiredError extends Error {
  portalUrl;
  backendMessage;
  constructor(msg, portalUrl) {
    super(msg);
    this.name = "SubscriptionRequiredError";
    this.portalUrl = portalUrl;
    this.backendMessage = msg;
  }
}
class ClientUpdateRequiredError extends Error {
  minVersion;
  downloadUrl;
  constructor(msg, minVersion, downloadUrl) {
    super(msg);
    this.name = "ClientUpdateRequiredError";
    this.minVersion = minVersion;
    this.downloadUrl = downloadUrl;
  }
}
const DEFAULT_GATEWAY_REFRESH_TIMEOUT_MS = 8e3;
let tokenState = {};
let tokenLoaded = false;
let tokenEpoch = 0;
let refreshGeneration = 0;
let refreshInFlight = null;
function invalidateActiveRefresh(reason) {
  refreshGeneration += 1;
  const pending = refreshInFlight;
  refreshInFlight = null;
  pending?.controller.abort(reason);
}
async function getGatewayAccessToken() {
  const t2 = await ensureTokenState();
  return t2.accessToken ?? null;
}
async function ensureTokenState() {
  if (!tokenLoaded) {
    const loadEpoch = tokenEpoch;
    try {
      const t2 = await window.api.auth.getTokens();
      if (loadEpoch === tokenEpoch && !tokenLoaded) {
        tokenState = t2 ?? {};
        tokenLoaded = true;
      }
    } catch {
      if (loadEpoch === tokenEpoch && !tokenLoaded) {
        tokenState = {};
        tokenLoaded = true;
      }
    }
  }
  return tokenState;
}
function primeTokens(t2) {
  tokenEpoch += 1;
  invalidateActiveRefresh("gateway-tokens-replaced");
  tokenState = { ...tokenState, ...t2 };
  tokenLoaded = true;
}
function clearTokens() {
  tokenEpoch += 1;
  invalidateActiveRefresh("gateway-tokens-cleared");
  tokenState = {};
  tokenLoaded = true;
}
async function invalidateGatewaySession() {
  clearTokens();
  try {
    await window.api.auth.clearTokens();
  } catch {
  }
}
function url(path2) {
  if (/^https?:\/\//.test(path2)) return path2;
  return `${BACKEND_BASE_URL}${path2.startsWith("/") ? path2 : `/${path2}`}`;
}
async function handlePaymentRequired(res) {
  let portalUrl;
  let message = "subscription required";
  try {
    const body = await res.clone().json();
    if (body && typeof body === "object") {
      if (typeof body.portalUrl === "string") portalUrl = body.portalUrl;
      if (typeof body.message === "string") message = body.message;
    }
  } catch {
  }
  throw new SubscriptionRequiredError(message, portalUrl);
}
async function handleClientUpdateRequired(res) {
  let message = LEGACY_CLIENT_FEATURE_MESSAGE;
  let minVersion;
  let downloadUrl;
  try {
    const body = await res.clone().json();
    if (body && typeof body === "object") {
      if (typeof body.message === "string") message = body.message;
      if (typeof body.minVersion === "string") minVersion = body.minVersion;
      if (typeof body.downloadUrl === "string") downloadUrl = body.downloadUrl;
    }
  } catch {
    const text2 = await res.text().catch(() => "");
    if (text2) message = text2.slice(0, 200);
  }
  const error2 = new ClientUpdateRequiredError(message, minVersion, downloadUrl);
  notifyClientVersionUpdateRequired(error2);
  throw error2;
}
async function refreshGatewaySession(options = {}) {
  const result = await refreshGatewaySessionDetailed(options);
  return result.ok;
}
async function refreshGatewaySessionDetailed(options = {}) {
  return tryRefresh(options);
}
function normalizeGatewayRefreshTimeoutMs(value) {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return DEFAULT_GATEWAY_REFRESH_TIMEOUT_MS;
  }
  return Math.max(1, Math.floor(value));
}
async function runBoundedRefresh(generation2, controller, timeoutMs) {
  const timeoutToken = Symbol("gateway-refresh-timeout");
  const abortToken = Symbol("gateway-refresh-abort");
  let timeoutHandle = null;
  let resolveAbort;
  const timeout = new Promise((resolve) => {
    timeoutHandle = setTimeout(() => resolve(timeoutToken), timeoutMs);
  });
  const aborted = new Promise((resolve) => {
    resolveAbort = resolve;
  });
  const onAbort = () => resolveAbort(abortToken);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const outcome = await Promise.race([
      performRefresh(generation2, controller.signal),
      timeout,
      aborted
    ]);
    if (outcome === timeoutToken) {
      if (refreshGeneration === generation2) refreshGeneration += 1;
      controller.abort("gateway-refresh-timeout");
      return { ok: false, reason: "transient" };
    }
    if (outcome === abortToken) return { ok: false, reason: "transient" };
    return outcome;
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
async function tryRefresh(options = {}) {
  if (refreshInFlight) return refreshInFlight.promise;
  const generation2 = ++refreshGeneration;
  const controller = new AbortController();
  const attempt = {
    generation: generation2,
    controller,
    promise: Promise.resolve({ ok: false, reason: "transient" })
  };
  attempt.promise = runBoundedRefresh(
    generation2,
    controller,
    normalizeGatewayRefreshTimeoutMs(options.timeoutMs)
  ).finally(() => {
    if (refreshInFlight === attempt) refreshInFlight = null;
  });
  refreshInFlight = attempt;
  return attempt.promise;
}
async function performRefresh(generation2, signal) {
  const t2 = await ensureTokenState();
  const refreshToken = t2.refreshToken;
  const attemptEpoch = tokenEpoch;
  const canCommit = () => !signal.aborted && generation2 === refreshGeneration && attemptEpoch === tokenEpoch && tokenState.refreshToken === refreshToken;
  if (!refreshToken) return { ok: false, reason: "invalid" };
  if (!canCommit()) return { ok: false, reason: "transient" };
  try {
    const res = await fetch(url("/v1/auth/refresh"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CLIMB_CLIENT_VERSION_HEADER]: CLIMB_DESKTOP_VERSION,
        ...runtimeHeaders()
      },
      body: JSON.stringify(withClientVersionBody({ refreshToken })),
      signal
    });
    if (!canCommit()) return { ok: false, reason: "transient" };
    if (res.status === 426) await handleClientUpdateRequired(res);
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, reason: "invalid" };
    }
    if (!res.ok) return { ok: false, reason: "transient" };
    const body = await res.json();
    const accessToken = body?.accessToken;
    const nextRefreshToken = body?.refreshToken ?? refreshToken;
    if (!accessToken) return { ok: false, reason: "transient" };
    if (!canCommit()) return { ok: false, reason: "transient" };
    tokenState = { accessToken, refreshToken: nextRefreshToken };
    void window.api.auth.saveTokens({
      accessToken,
      refreshToken: nextRefreshToken,
      expiresAt: body?.expiresAt,
      subscription: body?.subscription
    }).catch(() => void 0);
    return { ok: true };
  } catch (err) {
    if (err instanceof ClientUpdateRequiredError) throw err;
    return { ok: false, reason: "transient" };
  }
}
function runtimeHeaders() {
  return desktopPlatformHeaders(typeof window === "undefined" ? void 0 : window.api?.runtime);
}
async function doFetch(path2, init, withAuth) {
  const headers = new Headers(init.headers ?? {});
  headers.set(CLIMB_CLIENT_VERSION_HEADER, CLIMB_DESKTOP_VERSION);
  for (const [name2, value] of Object.entries(runtimeHeaders())) headers.set(name2, value);
  if (withAuth) {
    const t2 = await ensureTokenState();
    if (t2.accessToken) headers.set("Authorization", `Bearer ${t2.accessToken}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url(path2), { ...init, headers });
}
async function authFetch(path2, init = {}) {
  const assertCurrent = (response) => {
    if (!init.signal?.aborted) return;
    void response?.body?.cancel().catch(() => void 0);
    init.signal.throwIfAborted();
  };
  assertCurrent();
  let res = await doFetch(path2, init, true);
  assertCurrent(res);
  if (res.status === 426) {
    await handleClientUpdateRequired(res);
  }
  if (res.status === 401) {
    const refreshResult = await tryRefresh();
    assertCurrent(res);
    if (refreshResult.ok) {
      res = await doFetch(path2, init, true);
      assertCurrent(res);
    }
    if (res.status === 426) {
      await handleClientUpdateRequired(res);
    }
    if (res.status === 401) {
      if (!refreshResult.ok && refreshResult.reason === "transient") {
        throw new AuthRefreshUnavailableError();
      }
      try {
        await window.api.auth.clearTokens();
      } catch {
      }
      clearTokens();
      throw new AuthRequiredError();
    }
  }
  if (res.status === 402) {
    await handlePaymentRequired(res);
  }
  return res;
}
async function publicFetch(path2, init = {}) {
  const res = await doFetch(path2, init, false);
  if (res.status === 426) {
    await handleClientUpdateRequired(res);
  }
  return res;
}
const NETWORK_FAILURE_PATTERN = /failed to fetch|fetch failed|network ?error|network request failed|load failed|econnrefused|err_connection_refused/iu;
function isDevelopmentRenderer$1() {
  return Boolean(false);
}
function gatewayUnavailableMessage(development = isDevelopmentRenderer$1()) {
  return development ? "无法连接 Climb 服务。请先启动本地 API（npm run dev:api 或 npm run dev:all），然后重试。" : "Climb 服务暂时不可用，请检查网络连接后重试。";
}
class GatewayUnavailableError extends Error {
  constructor(development = isDevelopmentRenderer$1(), options) {
    super(gatewayUnavailableMessage(development), options);
    this.name = "GatewayUnavailableError";
  }
}
function isGatewayUnavailableError(error2) {
  if (error2 instanceof GatewayUnavailableError) return true;
  if (!(error2 instanceof Error)) return false;
  return error2.name === "AuthRefreshUnavailableError" || NETWORK_FAILURE_PATTERN.test(error2.message);
}
function toGatewayUnavailableError(error2, development = isDevelopmentRenderer$1()) {
  if (error2 instanceof GatewayUnavailableError && error2.message === gatewayUnavailableMessage(development)) {
    return error2;
  }
  return new GatewayUnavailableError(development, { cause: error2 });
}
function gatewayUnavailableMessageFor(error2, development = isDevelopmentRenderer$1()) {
  return isGatewayUnavailableError(error2) ? gatewayUnavailableMessage(development) : null;
}
function isFiniteNumber(v2) {
  return typeof v2 === "number" && !Number.isNaN(v2);
}
function subscriptionNeedsSync(sub2) {
  if (!sub2) return true;
  if (!isFiniteNumber(sub2.screenshotQuota) || !isFiniteNumber(sub2.voiceMinutes)) return true;
  const isTimePlan = sub2.accessMode === "time" || sub2.plan?.startsWith("time-") === true;
  if (sub2.active && isTimePlan && (typeof sub2.calendarActive !== "boolean" || !("calendarRenewAt" in sub2) || !isFiniteNumber(sub2.timeAllowanceSeconds) || !isFiniteNumber(sub2.timeRemainingSeconds))) return true;
  if (sub2.active && sub2.plan === "time-hour" && !isFiniteNumber(sub2.timeRemainingSeconds)) return true;
  if (sub2.active && isTimePlan && sub2.renewAt && !sub2.activatedAt) return true;
  return false;
}
function mergeSubscriptionFromStatusBody(body, prev) {
  const p2 = prev ?? {};
  if (!body || typeof body !== "object") {
    return { ...p2, active: typeof p2.active === "boolean" ? p2.active : false };
  }
  const pickN = (key) => {
    const v2 = body[key];
    return isFiniteNumber(v2) ? v2 : p2[key];
  };
  return {
    active: typeof body.active === "boolean" ? body.active : p2.active ?? false,
    plan: "plan" in body ? body.plan : p2.plan,
    renewAt: "renewAt" in body ? body.renewAt : p2.renewAt,
    calendarActive: typeof body.calendarActive === "boolean" ? body.calendarActive : p2.calendarActive,
    calendarRenewAt: body.calendarRenewAt === null || typeof body.calendarRenewAt === "string" ? body.calendarRenewAt : p2.calendarRenewAt,
    activatedAt: "activatedAt" in body ? body.activatedAt : p2.activatedAt,
    message: "message" in body ? body.message ?? void 0 : p2.message,
    portalUrl: "portalUrl" in body ? body.portalUrl : p2.portalUrl,
    screenshotQuota: pickN("screenshotQuota"),
    screenshotUsed: pickN("screenshotUsed"),
    voiceMinutes: pickN("voiceMinutes"),
    voiceUsed: pickN("voiceUsed"),
    accessMode: "accessMode" in body ? body.accessMode : p2.accessMode,
    dailyImageLimit: pickN("dailyImageLimit"),
    dailyVoiceSecondsLimit: pickN("dailyVoiceSecondsLimit"),
    timeAllowanceSeconds: pickN("timeAllowanceSeconds"),
    timeUsedSeconds: pickN("timeUsedSeconds"),
    timeRemainingSeconds: pickN("timeRemainingSeconds"),
    juiceScreenshotRemain: pickN("juiceScreenshotRemain"),
    juiceVoiceMinutesRemain: pickN("juiceVoiceMinutesRemain"),
    juiceExpiresAt: "juiceExpiresAt" in body ? body.juiceExpiresAt === null ? null : typeof body.juiceExpiresAt === "string" ? body.juiceExpiresAt : p2.juiceExpiresAt : p2.juiceExpiresAt,
    screenshotRemainingTotal: pickN("screenshotRemainingTotal"),
    voiceMinutesRemainingTotal: pickN("voiceMinutesRemainingTotal")
  };
}

export { version$3, desktopPackage, CLIMB_DESKTOP_VERSION, CLIMB_CLIENT_VERSION_HEADER, withClientVersionBody, normalizeBackendBaseUrl, toBackendWsUrl, desktopPlatformHeaders, CLIENT_UPDATE_FALLBACK_VERSION, CLIENT_UPDATE_DOWNLOAD_URL, CLIENT_UPDATE_NOTICE_MESSAGE, LEGACY_CLIENT_FEATURE_MESSAGE, CLIENT_UPDATE_RELEASE_NOTES, noticeHandler, setClientVersionNoticeHandler, buildClientVersionNoticeFromPolicy, notifyClientVersionUpdateRequired, normalizeReleaseNotes, FALLBACK_API, FALLBACK_WEB, BACKEND_BASE_URL, backendWsUrl, WEB_PORTAL_URL, AuthRequiredError, AuthRefreshUnavailableError, SubscriptionRequiredError, ClientUpdateRequiredError, DEFAULT_GATEWAY_REFRESH_TIMEOUT_MS, tokenState, tokenLoaded, tokenEpoch, refreshGeneration, refreshInFlight, invalidateActiveRefresh, getGatewayAccessToken, ensureTokenState, primeTokens, clearTokens, invalidateGatewaySession, url, handlePaymentRequired, handleClientUpdateRequired, refreshGatewaySession, refreshGatewaySessionDetailed, normalizeGatewayRefreshTimeoutMs, runBoundedRefresh, tryRefresh, performRefresh, runtimeHeaders, doFetch, authFetch, publicFetch, NETWORK_FAILURE_PATTERN, isDevelopmentRenderer$1, gatewayUnavailableMessage, GatewayUnavailableError, isGatewayUnavailableError, toGatewayUnavailableError, gatewayUnavailableMessageFor, isFiniteNumber, subscriptionNeedsSync, mergeSubscriptionFromStatusBody };
