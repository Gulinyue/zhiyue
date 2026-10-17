import { getGatewayAccessToken, refreshGatewaySession, CLIMB_DESKTOP_VERSION, backendWsUrl, CLIENT_UPDATE_RELEASE_NOTES, publicFetch, CLIENT_UPDATE_DOWNLOAD_URL, CLIENT_UPDATE_NOTICE_MESSAGE, setClientVersionNoticeHandler, buildClientVersionNoticeFromPolicy, ClientUpdateRequiredError, SubscriptionRequiredError, AuthRequiredError, gatewayUnavailableMessageFor, GatewayUnavailableError, toGatewayUnavailableError, CLIENT_UPDATE_FALLBACK_VERSION } from "./services/gateway.mjs";
import { parseRemoteControlServerFrame, useRemoteControl, desktopLabel, acceptAccountConnection, rejectPendingPairRequest, approvePendingPairRequest, cancelActiveScreenshotCommand, handleRemoteControlPowerState, stopRemoteControl, startRemoteControl, abortCurrentStream, endAllUsageSessions, pauseUsageSession, setVoiceUsageConnectionBlocked, retryUsageSessionConnection, setUsageSessionConnectionHandler, TASK_RECONNECT_MESSAGE, isTaskConnectionRecovering, setUsageSessionFailureHandler, startListening, stopListening, requestMobileViewportScroll, createPerfTrace, createDesktopScreenshotAnalysisMirror, executeLocalCaptureAndAnalyze, executeQueuedScreenshotAnalysis, clearInterviewContext, endUsageSession, resendHistoryToLLM, beginUsageSession } from "./services/task-runtime.mjs";
import { useSettings, normalizeWindowOpacity, resolveWindowOpacity, DEFAULT_SETTINGS } from "./stores/settings.mjs";
import { reactExports, jsxRuntimeExports, createRoot, React } from "./vendor/react-icons-state.mjs";
import { useSession, runtimeInteractionMode, requiredTaskHotkeys } from "./stores/session.mjs";
import { useAuth } from "./stores/auth.mjs";
import { LoginCard, Paywall } from "./features/auth.mjs";
import { DashboardShell } from "./features/workspace.mjs";
import { KeyCombo } from "./components/key-combo.mjs";

const OUTPUT_HOTKEYS = /* @__PURE__ */ new Set([
  "screenshot:capture",
  "screenshot:captureScrolling",
  "screenshot:analyze",
  "listen:toggle",
  "interview:clearContext",
  "llm:resendHistory"
]);
function shouldCloseSettingsForHotkey(action) {
  return OUTPUT_HOTKEYS.has(action);
}
const AUTH_TIMEOUT_MS = 1e4;
class RemotePresenceSocketError extends Error {
  code;
  constructor(message, code2) {
    super(message);
    this.name = "RemotePresenceSocketError";
    this.code = code2;
  }
}
async function connectRemotePresence(input) {
  let accessToken = await getGatewayAccessToken();
  if (!accessToken && await refreshGatewaySession()) {
    accessToken = await getGatewayAccessToken();
  }
  if (!accessToken) throw new Error("REMOTE_CONTROL_AUTH_REQUIRED");
  const authFrame = {
    type: "auth",
    mode: "presence",
    accessToken,
    desktopDeviceId: input.desktopDeviceId,
    desktopLabel: input.desktopLabel,
    clientVersion: CLIMB_DESKTOP_VERSION,
    accountConnect: true
  };
  const socket2 = new WebSocket(backendWsUrl("/v1/remote-control"));
  let authenticated = false;
  let intentionallyClosed = false;
  const handle2 = {
    close() {
      intentionallyClosed = true;
      try {
        socket2.close(1e3, "desktop stopped presence");
      } catch {
      }
    }
  };
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      intentionallyClosed = true;
      try {
        socket2.close(4e3, "remote-presence auth timeout");
      } catch {
      }
      reject(new Error("REMOTE_CONTROL_AUTH_TIMEOUT"));
    }, AUTH_TIMEOUT_MS);
    const failBeforeReady = (error2) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      reject(error2);
    };
    const failProtocol = (error2) => {
      failBeforeReady(error2);
      try {
        socket2.close(4002, "remote-presence invalid frame");
      } catch {
      }
    };
    socket2.onopen = () => {
      socket2.send(JSON.stringify(authFrame));
    };
    socket2.onmessage = (event) => {
      let decoded;
      try {
        decoded = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        failProtocol(new Error("REMOTE_CONTROL_INVALID_FRAME"));
        return;
      }
      const frame = parseRemoteControlServerFrame(decoded);
      if (!frame) {
        failProtocol(new Error("REMOTE_CONTROL_INVALID_FRAME"));
        return;
      }
      if (frame.type === "ping") {
        if (socket2.readyState === WebSocket.OPEN) socket2.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (frame.type === "error" && !authenticated) {
        failBeforeReady(new RemotePresenceSocketError(
          frame.message || frame.code || "REMOTE_CONTROL_AUTH_FAILED",
          frame.code
        ));
        try {
          socket2.close(4001, "remote-presence auth rejected");
        } catch {
        }
        return;
      }
      if (frame.type === "error") {
        input.onError?.(new RemotePresenceSocketError(
          frame.message || frame.code || "REMOTE_CONTROL_SERVER_ERROR",
          frame.code
        ));
        try {
          socket2.close(4003, "remote-presence server rejected connection");
        } catch {
        }
        return;
      }
      if (frame.type === "presence_auth_ok") {
        if (!authenticated) {
          authenticated = true;
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            resolve(handle2);
          }
        }
        return;
      }
      if (authenticated && frame.type === "account_connected") {
        if (frame.pairing.desktopDeviceId === input.desktopDeviceId) input.onAccountConnected({ pairing: frame.pairing, desktopGrant: frame.desktopGrant });
        return;
      }
      if (authenticated && frame.type === "pair_request") {
        input.onPairRequest({ pairing: frame.pairing, desktopGrant: frame.desktopGrant });
        return;
      }
    };
    socket2.onerror = () => {
      failBeforeReady(new Error("REMOTE_CONTROL_WEBSOCKET_ERROR"));
    };
    socket2.onclose = (event) => {
      window.clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(new Error(`REMOTE_CONTROL_CLOSED_${event.code}`));
        return;
      }
      if (!intentionallyClosed) input.onClose(event);
    };
  });
}
const MAX_RECONNECT_MS = 3e4;
let running = false;
let generation = 0;
let socket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let systemBlocked = false;
async function startRemotePresence() {
  if (running) return;
  running = true;
  const currentGeneration = ++generation;
  try {
    const powerState = await window.api.remoteControl.getPowerState();
    systemBlocked = powerState.blocked;
    if (!running || currentGeneration !== generation) return;
    if (systemBlocked) return;
    void connectNow(currentGeneration);
  } catch {
  }
}
function stopRemotePresence() {
  if (!running && !socket && reconnectTimer === null) return;
  running = false;
  generation += 1;
  cancelReconnectTimer();
  socket?.close();
  socket = null;
  reconnectAttempt = 0;
  useRemoteControl.getState().patch({ pendingPairRequest: null });
}
function handleRemotePresencePowerState(state) {
  systemBlocked = state.blocked;
  const currentGeneration = ++generation;
  cancelReconnectTimer();
  if (state.blocked) {
    socket?.close();
    socket = null;
    useRemoteControl.getState().patch({ pendingPairRequest: null });
    return;
  }
  if (running) {
    reconnectAttempt = 0;
    void connectNow(currentGeneration);
  }
}
async function connectNow(expectedGeneration) {
  if (!running || systemBlocked || expectedGeneration !== generation) return;
  let desktopDeviceId;
  try {
    desktopDeviceId = await window.api.remoteControl.getDeviceId();
  } catch {
    scheduleReconnect(expectedGeneration);
    return;
  }
  if (!running || expectedGeneration !== generation) return;
  try {
    const handle2 = await connectRemotePresence({
      desktopDeviceId,
      desktopLabel: desktopLabel(),
      onPairRequest: (request) => {
        useRemoteControl.getState().patch({ pendingPairRequest: request });
      },
      onAccountConnected: (connection) => {
        void acceptAccountConnection(connection, () => running && !systemBlocked && expectedGeneration === generation);
      },
      onClose: () => {
        scheduleReconnect(expectedGeneration);
      },
      onError: () => {
      }
    });
    if (!running || expectedGeneration !== generation) {
      handle2.close();
      return;
    }
    socket = handle2;
    reconnectAttempt = 0;
  } catch {
    if (!running || expectedGeneration !== generation) return;
    scheduleReconnect(expectedGeneration);
  }
}
function scheduleReconnect(expectedGeneration) {
  socket = null;
  if (!running || systemBlocked || expectedGeneration !== generation || reconnectTimer !== null) {
    return;
  }
  reconnectAttempt += 1;
  const delay = Math.min(MAX_RECONNECT_MS, 1e3 * 2 ** Math.min(5, reconnectAttempt - 1));
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    void connectNow(expectedGeneration);
  }, delay);
}
function cancelReconnectTimer() {
  if (reconnectTimer === null) return;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}
const RemotePairApprovalModal = () => {
  const request = useRemoteControl((s2) => s2.pendingPairRequest);
  const lastError = useRemoteControl((s2) => s2.lastError);
  const selectedDisplayId = useSettings((s2) => s2.settings.screenshotDisplayId?.trim() ?? "");
  reactExports.useEffect(() => {
    if (!request) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") void rejectPendingPairRequest();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request]);
  if (!request) return null;
  const mobileLabel = request.pairing.mobileLabel;
  const verificationCode = request.pairing.verificationCode;
  const displayMissing = !selectedDisplayId;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "no-drag fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "remote-pair-approval-title",
      className: "w-full max-w-[440px] rounded-[18px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-44px_rgba(15,23,42,0.75)]",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { id: "remote-pair-approval-title", className: "text-[17px] font-semibold text-slate-950", children: "手机请求连接这台电脑" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[12px] leading-relaxed text-slate-600", children: "请确认电脑和手机显示的验证码一致后再允许。允许后只会建立手机连接，不会自动进入笔试或面试。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[12px] text-amber-800", children: [
            "设备：",
            mobileLabel || "未命名手机"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 font-mono text-[30px] font-bold tracking-[0.18em] text-amber-950", children: verificationCode || "------" })
        ] }),
        displayMissing && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] leading-relaxed text-slate-600", children: "请先在「手机远控」中预选用于远程截屏的显示器，然后再允许连接。" }),
        lastError && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-relaxed text-red-700", children: lastError }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex justify-end gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => void rejectPendingPairRequest(),
              className: "rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] text-slate-700 hover:bg-slate-50",
              children: "拒绝"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              disabled: displayMissing,
              onClick: () => void approvePendingPairRequest(),
              className: "rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300",
              children: "确认并允许"
            }
          )
        ] })
      ]
    }
  ) });
};
function reportCleanupError(reportError2, operation, error2) {
  try {
    reportError2(operation, error2);
  } catch {
  }
}
async function runTaskExitCleanup(options) {
  try {
    options.restoreLocalState();
  } catch (error2) {
    reportCleanupError(options.reportError, "restore local task state", error2);
  }
  const usageStopPromises = options.usageStops.map(
    ({ stop }) => Promise.resolve().then(stop)
  );
  const screenshotsPromise = Promise.resolve().then(options.clearScreenshots);
  const [usageResults, screenshotResult] = await Promise.all([
    Promise.allSettled(usageStopPromises),
    Promise.allSettled([screenshotsPromise])
  ]);
  usageResults.forEach((result, index2) => {
    if (result.status === "rejected") {
      reportCleanupError(
        options.reportError,
        `stop ${options.usageStops[index2]?.label ?? "unknown"} usage session`,
        result.reason
      );
    }
  });
  const clearResult = screenshotResult[0];
  if (clearResult?.status === "rejected") {
    reportCleanupError(options.reportError, "clear screenshot queue", clearResult.reason);
  }
}
const STARTUP_CACHE_KEY = Symbol.for("climb.client-version.startup-check");
function sharedStartupCache() {
  const runtime = globalThis;
  runtime[STARTUP_CACHE_KEY] ??= {};
  return runtime[STARTUP_CACHE_KEY];
}
function isDevelopmentRenderer() {
  return Boolean(false);
}
function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}
function booleanValue(value) {
  return value === true;
}
function stringArray(value) {
  if (!Array.isArray(value)) return CLIENT_UPDATE_RELEASE_NOTES;
  const items = value.filter((item) => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items : CLIENT_UPDATE_RELEASE_NOTES;
}
async function checkClientVersion() {
  const res = await publicFetch("/v1/client/version");
  if (!res.ok) {
    throw new Error(`client version check failed: ${res.status}`);
  }
  const body = await res.json().catch(() => ({}));
  const downloadUrl = stringOrNull(body.downloadUrl) ?? CLIENT_UPDATE_DOWNLOAD_URL;
  const updateAvailable = booleanValue(body.updateAvailable);
  const forceUpdate = booleanValue(body.forceUpdate);
  return {
    currentVersion: stringOrNull(body.currentVersion) ?? CLIMB_DESKTOP_VERSION,
    latestVersion: stringOrNull(body.latestVersion) ?? CLIMB_DESKTOP_VERSION,
    updateAvailable,
    forceUpdate,
    downloadUrl,
    releaseNotes: stringArray(body.releaseNotes),
    message: stringOrNull(body.message) ?? (updateAvailable ? CLIENT_UPDATE_NOTICE_MESSAGE : null)
  };
}
function isVersionServiceUnavailable(error2) {
  if (!(error2 instanceof Error)) return false;
  if (error2.name !== "TypeError") return false;
  return /failed to fetch|fetch failed|network ?error|network request failed|load failed/iu.test(
    error2.message
  );
}
function checkClientVersionOnStartup(options = {}) {
  const cache = options.cache ?? sharedStartupCache();
  if (cache.promise) return cache.promise;
  const development = options.development ?? isDevelopmentRenderer();
  const check = options.check ?? checkClientVersion;
  cache.promise = check().catch((error2) => {
    if (development && isVersionServiceUnavailable(error2)) return null;
    throw error2;
  });
  return cache.promise;
}
const ALWAYS_ALLOWED_HOTKEYS = /* @__PURE__ */ new Set([
  "window:toggle",
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
function isHotkeyAllowedForWorkMode(mode2, action) {
  if (ALWAYS_ALLOWED_HOTKEYS.has(action)) return true;
  if (mode2 === "exam") return EXAM_ALLOWED_HOTKEYS.has(action);
  if (mode2 === "interview") return INTERVIEW_ALLOWED_HOTKEYS.has(action);
  return !MODE_GATED_HOTKEYS.has(action);
}
const TASK_SURFACE_QA_QUESTION = "请说明Transformer的架构";
const TASK_SURFACE_QA_ANSWER = `### 1. 整体结构
Transformer 由多层 Encoder 与 Decoder 组成；编码器理解输入，解码器结合上下文逐步生成输出。

### 2. 输入表示
文本先转换为词元向量，再叠加位置编码，让模型同时保留语义与顺序信息。

### 3. 多头自注意力
每个词元生成 Q、K、V，多组注意力并行捕捉不同关系，再合并为统一表示。

### 4. 层内处理与输出
注意力后接前馈网络，并配合残差连接与层归一化；解码器最后通过线性层和 Softmax 得到下一个词元。`;
function seedTaskSurfaceConversationForQa(now = Date.now()) {
  const messages = [
    {
      role: "user",
      parts: [{ type: "text", text: TASK_SURFACE_QA_QUESTION }],
      ts: now
    },
    {
      role: "assistant",
      parts: [{ type: "text", text: TASK_SURFACE_QA_ANSWER }],
      ts: now + 1
    }
  ];
  const session = useSession.getState();
  session.setQueueMode("chat");
  session.replaceHistory("chat", messages);
  session.clearStream();
  session.setStreaming(false);
  session.setListenPartial("");
  session.setError(null);
  session.setResponseBodyVisible(true);
  session.setView("response");
}
const EXAM_SCREENSHOT_ACTIONS = /* @__PURE__ */ new Set([
  "screenshot:capture",
  "screenshot:captureScrolling",
  "screenshot:analyze",
  "screenshot:popLast"
]);
function waitForRendererPaint() {
  return new Promise((resolve) => {
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      clearTimeout(fallback);
      resolve();
    };
    const fallback = setTimeout(finish, 240);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(finish);
    });
  });
}
function isAuthenticatedStatus(status) {
  return status === "loggedIn" || status === "expired";
}
function shouldRestoreShellAfterAuth(status, view) {
  return isAuthenticatedStatus(status) && view === "login";
}
function shouldRenderLogin(status, view) {
  return !isAuthenticatedStatus(status) && (status === "anon" || status === "unknown" || view === "login");
}
function shouldRenderPaywall(_status, view) {
  return view === "paywall";
}
function viewForBlockedAccess(status) {
  return status === "anon" || status === "unknown" ? "login" : "paywall";
}
function shouldPresentScreenshotCommandFailure(result) {
  if (result.ok) return false;
  return result.code === "CAPTURE_FAILED" || result.code === "REQUEST_FAILED" || result.code === "EMPTY" || result.code === "DISPLAY_REQUIRED" || result.code === "DISPLAY_UNAVAILABLE";
}
const App = () => {
  const settingsReady = useSettings((s2) => s2.ready);
  const loadSettings = useSettings((s2) => s2.load);
  const applyFromMain = useSettings((s2) => s2.applyFromMain);
  const initAuth = useAuth((s2) => s2.init);
  const authStatus = useAuth((s2) => s2.status);
  const logoutRevision = useAuth((s2) => s2.logoutRevision);
  const previousLogoutRevision = reactExports.useRef(logoutRevision);
  const authEmail = useAuth((s2) => s2.email);
  const setScreenshotCount = useSession((s2) => s2.setScreenshotCount);
  const setQueueMode = useSession((s2) => s2.setQueueMode);
  const activeMode = useSession((s2) => s2.activeMode);
  const setActiveMode = useSession((s2) => s2.setActiveMode);
  const mouseThrough = useSession((s2) => s2.mouseThrough);
  const setMouseThrough = useSession((s2) => s2.setMouseThrough);
  const setExamStarted = useSession((s2) => s2.setExamStarted);
  const prepareRuntimeTask = useSession((s2) => s2.prepareRuntimeTask);
  useSession((s2) => s2.setRuntimeInteractionMode);
  const startRuntimeTask = useSession((s2) => s2.startRuntimeTask);
  const activateRuntimeTask = useSession((s2) => s2.activateRuntimeTask);
  const failRuntimeTask = useSession((s2) => s2.failRuntimeTask);
  const beginEndingRuntimeTask = useSession((s2) => s2.beginEndingRuntimeTask);
  const resetRuntimeTask = useSession((s2) => s2.resetRuntimeTask);
  const setView = useSession((s2) => s2.setView);
  const view = useSession((s2) => s2.view);
  const runtimeTaskStatus = useSession((s2) => s2.runtimeTask.status);
  const opacity = useSettings((s2) => s2.settings.opacity);
  const mouseThroughOpacity = useSettings((s2) => s2.settings.mouseThroughOpacity);
  const remoteConnectionStatus = useRemoteControl((s2) => s2.connectionStatus);
  const remotePairingStatus = useRemoteControl((s2) => s2.pairing?.status);
  const mobileOnline = useRemoteControl((s2) => s2.mobileOnline);
  const mobileViewportReady = useRemoteControl((s2) => s2.mobileViewportReady);
  const [activeRoute, setActiveRoute] = reactExports.useState("home");
  const [clientVersionNotice, setClientVersionNotice] = reactExports.useState(null);
  const [appliedSurfaceMode, setAppliedSurfaceMode] = reactExports.useState(activeMode);
  const [rendererOpacity, setRendererOpacity] = reactExports.useState(1);
  const latestSettingsRef = reactExports.useRef(useSettings.getState().settings);
  const runtimeSettingsRef = reactExports.useRef(null);
  const runtimeInterviewMaterialsRef = reactExports.useRef(null);
  const screenshotQueueRef = reactExports.useRef([]);
  const screenshotQueueSyncRef = reactExports.useRef(0);
  const runtimeGenerationRef = reactExports.useRef(0);
  const screenshotCommandAbortRef = reactExports.useRef(null);
  const interviewStartupAbortRef = reactExports.useRef(null);
  const mouseThroughAttemptRef = reactExports.useRef(0);
  const taskExitInFlightRef = reactExports.useRef(false);
  const authenticatedEmailRef = reactExports.useRef(null);
  function cancelScreenshotCommand(reason) {
    screenshotCommandAbortRef.current?.abort(new Error(reason));
    screenshotCommandAbortRef.current = null;
    cancelActiveScreenshotCommand(reason);
  }
  function advanceRuntimeGeneration(reason) {
    cancelScreenshotCommand(reason);
    runtimeGenerationRef.current += 1;
    return runtimeGenerationRef.current;
  }
  reactExports.useEffect(() => {
    const unsub = useSettings.subscribe((st) => {
      latestSettingsRef.current = st.settings;
    });
    return unsub;
  }, []);
  reactExports.useEffect(() => {
    void loadSettings();
    void initAuth();
  }, [loadSettings, initAuth]);
  reactExports.useEffect(
    () => window.api.remoteControl.onPowerState((state) => {
      handleRemoteControlPowerState(state);
      handleRemotePresencePowerState(state);
    }),
    []
  );
  reactExports.useEffect(
    () => window.api.window.onRevealRequested(({ token }) => {
      document.documentElement.setAttribute("data-window-reveal-preparing", String(token));
      void document.documentElement.offsetHeight;
      void waitForRendererPaint().then(async () => {
        await window.api.window.commitReveal(token);
        if (document.documentElement.getAttribute("data-window-reveal-preparing") === String(token)) {
          document.documentElement.removeAttribute("data-window-reveal-preparing");
        }
      });
    }),
    []
  );
  reactExports.useEffect(
    () => window.api.qa.onTaskSurfaceSeedRequested(() => seedTaskSurfaceConversationForQa()),
    []
  );
  reactExports.useEffect(() => {
    if (!settingsReady || authStatus !== "loggedIn") {
      stopRemoteControl();
      stopRemotePresence();
      return;
    }
    void startRemoteControl();
    void startRemotePresence();
    return () => {
      stopRemoteControl();
      stopRemotePresence();
    };
  }, [authStatus, settingsReady]);
  const mobileViewportHotkeysActive = activeMode !== "idle" && runtimeTaskStatus === "active" && remoteConnectionStatus === "online" && remotePairingStatus === "active" && mobileOnline && mobileViewportReady;
  reactExports.useEffect(() => {
    void window.api.hotkey.setMobileViewportActive(mobileViewportHotkeysActive);
  }, [mobileViewportHotkeysActive]);
  reactExports.useEffect(() => () => {
    void window.api.hotkey.setMobileViewportActive(false);
  }, []);
  const answerScrollHotkeysActive = activeMode !== "idle" && runtimeTaskStatus === "active" && mouseThrough;
  reactExports.useEffect(() => {
    void window.api.hotkey.setAnswerScrollActive(answerScrollHotkeysActive);
  }, [answerScrollHotkeysActive]);
  reactExports.useEffect(() => () => {
    void window.api.hotkey.setAnswerScrollActive(false);
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    const unsubscribe2 = setClientVersionNoticeHandler((notice) => {
      if (!cancelled) setClientVersionNotice(notice);
    });
    void checkClientVersionOnStartup().then((policy) => {
      if (cancelled || !policy) return;
      const notice = buildClientVersionNoticeFromPolicy(policy);
      if (notice) setClientVersionNotice(notice);
    }).catch((err) => {
      if (cancelled) return;
      if (!(err instanceof ClientUpdateRequiredError)) {
        window.api.log.error("[zhiyue:version] startup check failed", err);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe2();
    };
  }, []);
  reactExports.useEffect(() => {
    const off = window.api.settings.onChange((s2) => {
      applyFromMain(s2);
    });
    return off;
  }, [applyFromMain]);
  reactExports.useEffect(
    () => window.api.window.onOpacityPreviewed((next) => {
      setRendererOpacity(normalizeWindowOpacity(next));
    }),
    []
  );
  reactExports.useEffect(() => {
    const off = window.api.screenshot.onChange((p2) => {
      setScreenshotCount(p2.count);
      const sync2 = ++screenshotQueueSyncRef.current;
      void window.api.screenshot.list().then((arr) => {
        if (sync2 !== screenshotQueueSyncRef.current) return;
        screenshotQueueRef.current = arr;
        setScreenshotCount(arr.length);
      }).catch((error2) => {
        window.api.log.error("[zhiyue:screenshot] failed to synchronize queue", error2);
      });
    });
    const sync = ++screenshotQueueSyncRef.current;
    void window.api.screenshot.list().then((arr) => {
      if (sync !== screenshotQueueSyncRef.current) return;
      screenshotQueueRef.current = arr;
      setScreenshotCount(arr.length);
    }).catch((error2) => {
      window.api.log.error("[zhiyue:screenshot] failed to load queue", error2);
    });
    return off;
  }, [setScreenshotCount]);
  reactExports.useEffect(() => {
    if (isAuthenticatedStatus(authStatus) && authEmail) {
      const identity2 = authEmail.trim().toLowerCase();
      const previousEmail2 = authenticatedEmailRef.current;
      authenticatedEmailRef.current = identity2;
      if (previousEmail2 === identity2) return;
      if (previousEmail2 && previousEmail2 !== identity2 && useSession.getState().activeMode !== "idle") {
        advanceRuntimeGeneration("account changed");
        abortCurrentStream();
        cancelInterviewStartupAndListening();
        void endAllUsageSessions();
        useSession.getState().resetSession();
        runtimeSettingsRef.current = null;
        runtimeInterviewMaterialsRef.current = null;
      }
    } else if (authStatus === "unknown") {
      return;
    } else {
      if (useSession.getState().activeMode !== "idle") return;
      authenticatedEmailRef.current = null;
    }
    cancelScreenshotCommand("authentication changed");
    const session = useSession.getState();
    screenshotQueueSyncRef.current += 1;
    screenshotQueueRef.current = [];
    session.setScreenshotCount(0);
    session.replaceHistory("chat", []);
    session.replaceHistory("solver", []);
    session.clearStream();
    session.setStreaming(false);
    session.setError(null);
    void window.api.screenshot.clear().catch((error2) => {
      window.api.log.error("[zhiyue:screenshot] failed to clear queue after authentication change", error2);
    });
  }, [authStatus, authEmail]);
  reactExports.useEffect(() => {
    const off = window.api.hotkey.onTriggered((action) => {
      void handleHotkey(action);
    });
    return off;
  }, []);
  reactExports.useEffect(
    () => window.api.window.onInteractionRecovered(() => {
      mouseThroughAttemptRef.current += 1;
      setMouseThrough(false);
    }),
    [setMouseThrough]
  );
  reactExports.useEffect(() => {
    if (previousLogoutRevision.current === logoutRevision) return;
    previousLogoutRevision.current = logoutRevision;
    advanceRuntimeGeneration("explicit logout");
    cancelScreenshotCommand("explicit logout");
    cancelInterviewStartupAndListening();
    abortCurrentStream();
    void endAllUsageSessions();
    useSession.getState().resetSession();
    runtimeSettingsRef.current = null;
    runtimeInterviewMaterialsRef.current = null;
  }, [logoutRevision]);
  reactExports.useEffect(() => {
    if (shouldRestoreShellAfterAuth(authStatus, view)) {
      setView("pill");
      setActiveRoute("home");
    }
    if (authStatus !== "loggedIn") {
      if (useSession.getState().activeMode !== "idle") {
        const message = authStatus === "expired" ? "套餐暂不可用，任务已保留；处理套餐后将自动恢复。" : "登录状态需要验证，任务已保留；重新登录后将自动恢复。";
        pauseUsageSession(authStatus === "expired" ? new SubscriptionRequiredError(message) : new AuthRequiredError(message));
        setVoiceUsageConnectionBlocked(true);
        useSession.getState().setTaskConnectionStatus("suspended");
        useSession.getState().setTaskConnectionMessage(message);
        return;
      }
      advanceRuntimeGeneration("authentication unavailable");
      cancelInterviewStartupAndListening();
      setActiveMode("idle");
      mouseThroughAttemptRef.current += 1;
      setMouseThrough(false);
      setExamStarted(false);
      resetRuntimeTask();
      runtimeSettingsRef.current = null;
      runtimeInterviewMaterialsRef.current = null;
      void endAllUsageSessions();
    }
  }, [authStatus, view, setView, setActiveMode, setMouseThrough, setExamStarted, resetRuntimeTask]);
  reactExports.useEffect(() => {
    if (authStatus === "loggedIn" && useSession.getState().activeMode !== "idle" && useSession.getState().taskConnectionStatus === "suspended") {
      void retryUsageSessionConnection();
    }
  }, [authStatus]);
  reactExports.useEffect(() => {
    setUsageSessionConnectionHandler((connection) => {
      const session = useSession.getState();
      session.setTaskConnectionStatus(connection.status);
      session.setTaskConnectionMessage(connection.error instanceof Error ? connection.error.message : null);
      if (connection.status === "connected" && session.lastError === TASK_RECONNECT_MESSAGE) {
        session.setError(null);
      }
      const recovering = isTaskConnectionRecovering(connection.status);
      setVoiceUsageConnectionBlocked(recovering);
      if (recovering && session.activeMode !== "idle") {
        cancelScreenshotCommand("usage connection interrupted");
        abortCurrentStream();
        session.setStreaming(false);
      }
    });
    return () => setUsageSessionConnectionHandler(null);
  }, []);
  reactExports.useEffect(() => {
    setUsageSessionFailureHandler((err) => {
      const sess = useSession.getState();
      const message = err instanceof Error ? err.message : String(err);
      cancelScreenshotCommand("usage access paused");
      abortCurrentStream();
      setVoiceUsageConnectionBlocked(true);
      sess.setStreaming(false);
      sess.setTaskConnectionStatus("suspended");
      sess.setTaskConnectionMessage("服务已暂停，任务已保留：" + message);
    });
    return () => setUsageSessionFailureHandler(null);
  }, [setActiveMode, setMouseThrough, setExamStarted, resetRuntimeTask]);
  reactExports.useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const runtimeTask = useSession.getState().runtimeTask;
        const shortcutOverlayEnabled = activeMode !== "idle" && runtimeTask.status !== "idle" && runtimeTask.kind === activeMode && runtimeTask.shortcutOverlayEnabled;
        const revealToken = await window.api.window.setTaskSurface(
          activeMode,
          activeMode === "idle" ? "preparation" : "focus",
          shortcutOverlayEnabled
        );
        if (!current) return;
        setAppliedSurfaceMode(activeMode);
        await waitForRendererPaint();
        if (current && revealToken !== null) {
          await window.api.window.commitTaskSurface(revealToken);
        }
      } catch (error2) {
        window.api.log.error("[zhiyue:surface] failed to prepare task surface", error2);
      }
    })();
    return () => {
      current = false;
    };
  }, [activeMode]);
  reactExports.useEffect(() => {
    const effectiveMouseThrough = activeMode !== "idle" && mouseThrough;
    void window.api.window.setInteractive(!effectiveMouseThrough);
    void window.api.window.setFocusable(!effectiveMouseThrough);
    void window.api.window.previewOpacity(
      resolveWindowOpacity({ opacity, mouseThroughOpacity }, effectiveMouseThrough)
    );
  }, [activeMode, mouseThrough, opacity, mouseThroughOpacity]);
  async function startInterviewSession() {
    const session = useSession.getState();
    if (session.runtimeTask.status === "starting" || session.runtimeTask.status === "active" || session.runtimeTask.status === "ending") {
      return false;
    }
    await setMouseThroughMode(false);
    const generation2 = advanceRuntimeGeneration("interview starting");
    startRuntimeTask();
    if (!await ensureRuntimeInteractionReady("interview", generation2)) return false;
    if (generation2 !== runtimeGenerationRef.current) return false;
    const startupController = new AbortController();
    interviewStartupAbortRef.current?.abort();
    interviewStartupAbortRef.current = startupController;
    try {
      await startListening(
        runtimeSettingsRef.current ?? latestSettingsRef.current,
        {
          signal: startupController.signal,
          resumeId: runtimeInterviewMaterialsRef.current?.resumeId,
          localKnowledge: runtimeInterviewMaterialsRef.current ? runtimeInterviewMaterialsRef.current.knowledgeIndex : void 0
        }
      );
    } catch (err) {
      const current2 = useSession.getState();
      if (generation2 !== runtimeGenerationRef.current || current2.activeMode !== "interview") {
        stopListening();
        return false;
      }
      const message = gatewayUnavailableMessageFor(err) ?? "开始面试失败：" + (err instanceof Error ? err.message : String(err));
      current2.setError(message);
      failRuntimeTask(message);
      current2.setResponseBodyVisible(true);
      await setMouseThroughMode(false);
      return false;
    } finally {
      if (interviewStartupAbortRef.current === startupController) {
        interviewStartupAbortRef.current = null;
      }
    }
    const current = useSession.getState();
    if (generation2 !== runtimeGenerationRef.current || current.activeMode !== "interview") {
      stopListening();
      return false;
    }
    if (current.activeMode === "interview" && current.listening) {
      activateRuntimeTask();
      await setMouseThroughMode(runtimeInteractionMode(current.runtimeTask) === "passive");
      return true;
    } else {
      const failure2 = current.lastError ?? "系统音频或实时连接未能启动，请检查后重试。";
      const message = gatewayUnavailableMessageFor(new Error(failure2)) ?? failure2;
      current.setError(message);
      failRuntimeTask(message);
      await setMouseThroughMode(false);
      return false;
    }
  }
  async function toggleInterviewSession() {
    const session = useSession.getState();
    if (session.listening) {
      advanceRuntimeGeneration("interview stopped");
      beginEndingRuntimeTask();
      cancelInterviewStartupAndListening();
      await setMouseThroughMode(false);
      const task = useSession.getState().runtimeTask;
      if (task.status !== "idle") {
        prepareRuntimeTask(
          task.kind,
          task.interactionMode,
          task.shortcutOverlayEnabled
        );
      }
      return;
    }
    await startInterviewSession();
  }
  async function handleHotkey(action) {
    const session = useSession.getState();
    const settings = session.activeMode === "idle" ? latestSettingsRef.current : runtimeSettingsRef.current ?? latestSettingsRef.current;
    const mode2 = session.activeMode;
    if (!isHotkeyAllowedForWorkMode(mode2, action)) return;
    if (isTaskConnectionRecovering(session.taskConnectionStatus) && (action === "screenshot:capture" || action === "screenshot:captureScrolling" || action === "screenshot:analyze" || action === "llm:resendHistory")) {
      session.setError(TASK_RECONNECT_MESSAGE);
      return;
    }
    if (mode2 === "exam" && !session.examStarted && EXAM_SCREENSHOT_ACTIONS.has(action)) {
      session.setError("笔试仍在启动，请等待计时确认完成后再截图并发送。");
      session.setResponseBodyVisible(true);
      session.setView("response");
      void window.api.window.setBounds(true);
      return;
    }
    if (shouldCloseSettingsForHotkey(action)) {
      setActiveRoute("home");
    }
    switch (action) {
      case "mobile:scrollUp":
        requestMobileViewportScroll("up");
        return;
      case "mobile:scrollDown":
        requestMobileViewportScroll("down");
        return;
      case "screenshot:captureScrolling":
      case "screenshot:capture": {
        cancelScreenshotCommand("replaced-by-new-screenshot");
        const generation2 = runtimeGenerationRef.current;
        const commandMode = mode2;
        const perfTrace = createPerfTrace("hotkey:ctrl-q", {
          action,
          workMode: commandMode,
          modelProfile: settings.examVisionModelProfile
        });
        perfTrace.mark("hotkey_received");
        const commandController = new AbortController();
        screenshotCommandAbortRef.current = commandController;
        const desktopMirror = createDesktopScreenshotAnalysisMirror();
        const isCurrentCommand = () => screenshotCommandAbortRef.current === commandController && !commandController.signal.aborted && generation2 === runtimeGenerationRef.current && useSession.getState().activeMode === commandMode;
        let result;
        try {
          result = await executeLocalCaptureAndAnalyze({
            settings,
            scroll: action === "screenshot:captureScrolling",
            perfTrace,
            signal: commandController.signal,
            getQueuedScreenshots: () => screenshotQueueRef.current,
            onSubmitted: () => {
              if (!isCurrentCommand()) return;
              desktopMirror?.onStarted();
            },
            onDelta: (delta) => {
              if (isCurrentCommand()) desktopMirror?.onDelta(delta);
            },
            onDone: () => {
              if (isCurrentCommand()) desktopMirror?.onDone();
            },
            onError: (error2) => {
              desktopMirror?.onError(error2);
            },
            onSucceeded: async () => {
              if (!isCurrentCommand()) throw new Error("screenshot command became stale");
              await window.api.screenshot.clear();
              if (!isCurrentCommand()) throw new Error("screenshot command became stale");
              screenshotQueueSyncRef.current += 1;
              screenshotQueueRef.current = [];
              setScreenshotCount(0);
            },
            presentLocally: true
          });
        } finally {
          if (screenshotCommandAbortRef.current === commandController) {
            screenshotCommandAbortRef.current = null;
          }
        }
        if (generation2 !== runtimeGenerationRef.current || useSession.getState().activeMode !== commandMode || commandController.signal.aborted) {
          return;
        }
        if (!result.ok) {
          perfTrace.end({ ok: false, code: result.code });
          if (result.code === "BUSY") {
            useSession.getState().setError("已有截图或 AI 请求正在处理，请稍后再试。");
            return;
          }
          if (!shouldPresentScreenshotCommandFailure(result)) return;
          const current = useSession.getState();
          current.setError(`截图并发送失败：${result.message}`);
          current.setResponseBodyVisible(true);
          current.setView("response");
        }
        return;
      }
      case "screenshot:analyze": {
        const generation2 = runtimeGenerationRef.current;
        const commandMode = mode2;
        let shots = screenshotQueueRef.current;
        if (shots.length === 0) {
          shots = await window.api.screenshot.list();
          if (generation2 !== runtimeGenerationRef.current || useSession.getState().activeMode !== commandMode) return;
          screenshotQueueRef.current = shots;
          setScreenshotCount(shots.length);
        }
        if (shots.length === 0) {
          useSession.getState().setError(
            `没有待发送截图，请按 ${settings.hotkeys["screenshot:capture"]} 一键截图并发送给 AI`
          );
          useSession.getState().setResponseBodyVisible(true);
          useSession.getState().setView("response");
          void window.api.window.setBounds(true);
          return;
        }
        const desktopMirror = createDesktopScreenshotAnalysisMirror();
        if (screenshotCommandAbortRef.current !== null) {
          useSession.getState().setError("已有截图或 AI 请求正在处理，请稍后再试。");
          return;
        }
        const commandController = new AbortController();
        screenshotCommandAbortRef.current = commandController;
        let result;
        try {
          result = await executeQueuedScreenshotAnalysis({
            settings,
            screenshots: shots,
            signal: commandController.signal,
            onSubmitted: () => {
              desktopMirror?.onStarted();
            },
            onDelta: (delta) => desktopMirror?.onDelta(delta),
            onDone: () => desktopMirror?.onDone(),
            onError: (error2) => desktopMirror?.onError(error2),
            onSucceeded: async () => {
              if (generation2 !== runtimeGenerationRef.current || useSession.getState().activeMode !== commandMode || commandController.signal.aborted) {
                throw new Error("legacy screenshot command became stale");
              }
              await window.api.screenshot.clear();
              if (generation2 !== runtimeGenerationRef.current || useSession.getState().activeMode !== commandMode || commandController.signal.aborted) {
                throw new Error("legacy screenshot command became stale");
              }
              screenshotQueueSyncRef.current += 1;
              screenshotQueueRef.current = [];
              setScreenshotCount(0);
            },
            // Keep the answer visible on the PC while forwarding the same
            // streaming deltas to the paired phone.
            presentLocally: true
          });
        } finally {
          if (screenshotCommandAbortRef.current === commandController) {
            screenshotCommandAbortRef.current = null;
          }
        }
        if (generation2 !== runtimeGenerationRef.current || useSession.getState().activeMode !== commandMode || commandController.signal.aborted) {
          return;
        }
        if (!result.ok && (result.code === "BUSY" || desktopMirror !== null)) {
          if (!shouldPresentScreenshotCommandFailure(result) && result.code !== "BUSY") return;
          const current = useSession.getState();
          current.setError(
            result.code === "BUSY" ? "已有 AI 请求正在处理，请稍后再试。" : `答案生成失败：${result.message}`
          );
          current.setResponseBodyVisible(true);
          current.setView("response");
        }
        return;
      }
      case "screenshot:popLast": {
        await window.api.screenshot.popLast();
        screenshotQueueRef.current = screenshotQueueRef.current.slice(0, -1);
        setScreenshotCount(screenshotQueueRef.current.length);
        return;
      }
      case "interview:clearContext": {
        clearInterviewContext();
        return;
      }
      case "session:reset":
      case "exam:exit": {
        if (taskExitInFlightRef.current) return;
        taskExitInFlightRef.current = true;
        let exitTransitionToken = null;
        let localStateRestored = false;
        try {
          try {
            exitTransitionToken = await window.api.window.beginTaskLaunch();
          } catch (error2) {
            window.api.log.error("[zhiyue:task-exit] failed to hide focus surface", error2);
          }
          advanceRuntimeGeneration("task exited");
          cancelInterviewStartupAndListening();
          abortCurrentStream();
          await runTaskExitCleanup({
            usageStops: [{ label: "default", stop: () => endUsageSession() }],
            clearScreenshots: () => window.api.screenshot.clear(),
            restoreLocalState: () => {
              mouseThroughAttemptRef.current += 1;
              setMouseThrough(false);
              screenshotQueueSyncRef.current += 1;
              screenshotQueueRef.current = [];
              setScreenshotCount(0);
              runtimeSettingsRef.current = null;
              runtimeInterviewMaterialsRef.current = null;
              useSession.getState().resetSession();
              localStateRestored = true;
            },
            reportError: (operation, error2) => {
              window.api.log.error(`[zhiyue:task-exit] failed to ${operation}`, error2);
            }
          });
        } finally {
          if (!localStateRestored && exitTransitionToken !== null) {
            try {
              await window.api.window.cancelTaskLaunch(exitTransitionToken);
            } catch (error2) {
              try {
                window.api.log.error("[zhiyue:task-exit] failed to restore focus surface", error2);
              } catch {
              }
            }
          }
          taskExitInFlightRef.current = false;
        }
        return;
      }
      case "mode:switchQueue": {
        const cur = useSession.getState().queueMode;
        setQueueMode(cur === "chat" ? "solver" : "chat");
        return;
      }
      case "interview:toggleChat": {
        useSession.getState().toggleResponseBody();
        return;
      }
      case "listen:toggle": {
        await toggleInterviewSession();
        return;
      }
      case "window:toggleMouseThrough": {
        await setMouseThroughMode(!useSession.getState().mouseThrough);
        return;
      }
      case "llm:resendHistory": {
        await resendHistoryToLLM(settings);
        return;
      }
      default:
        return;
    }
  }
  async function ensureModeAccess() {
    if (useAuth.getState().status === "unknown") {
      await useAuth.getState().init();
    }
    if (useAuth.getState().status === "anon") {
      useSession.getState().setView("login");
      void window.api.window.setBounds(true);
      return false;
    }
    let next;
    try {
      next = await useAuth.getState().refreshStatus(true, { throwOnTransient: true });
    } catch (error2) {
      const unavailable = error2 instanceof GatewayUnavailableError ? error2 : toGatewayUnavailableError(error2);
      const session = useSession.getState();
      session.setError(unavailable.message);
      session.setResponseBodyVisible(true);
      throw unavailable;
    }
    if (next !== "loggedIn") {
      useSession.getState().setView(viewForBlockedAccess(next));
      void window.api.window.setBounds(true);
      return false;
    }
    return true;
  }
  async function beginMeteredMode(kind, owner) {
    try {
      await beginUsageSession(kind, owner);
      return true;
    } catch (err) {
      const sess = useSession.getState();
      if (err instanceof AuthRequiredError) {
        sess.setView("login");
      } else if (err instanceof SubscriptionRequiredError) {
        sess.setView("paywall");
      } else {
        const message = err instanceof Error ? err.message : String(err);
        sess.setError("开始笔试失败：" + message);
        sess.setResponseBodyVisible(true);
        sess.setView("response");
      }
      void window.api.window.setBounds(true);
      return false;
    }
  }
  async function openExamMode(interactionMode, shortcutOverlayEnabled, signal, examModelProfile, interviewVoiceModelProfile) {
    if (!await ensureModeAccess()) return false;
    if (signal?.aborted) return false;
    await setMouseThroughMode(false);
    if (signal?.aborted) return false;
    const generation2 = advanceRuntimeGeneration("exam starting");
    runtimeSettingsRef.current = structuredClone({
      ...latestSettingsRef.current,
      ...examModelProfile ? { examVisionModelProfile: examModelProfile } : {},
      ...interviewVoiceModelProfile ? { interviewVoiceModelProfile } : {}
    });
    runtimeInterviewMaterialsRef.current = null;
    prepareRuntimeTask("exam", interactionMode, shortcutOverlayEnabled);
    startRuntimeTask();
    if (!await ensureRuntimeInteractionReady("exam", generation2)) {
      if (generation2 === runtimeGenerationRef.current) {
        resetRuntimeTask();
        runtimeSettingsRef.current = null;
      }
      return false;
    }
    if (signal?.aborted || generation2 !== runtimeGenerationRef.current) {
      if (generation2 === runtimeGenerationRef.current) {
        resetRuntimeTask();
        runtimeSettingsRef.current = null;
      }
      return false;
    }
    if (!await beginMeteredMode("exam")) {
      if (generation2 === runtimeGenerationRef.current) {
        resetRuntimeTask();
        runtimeSettingsRef.current = null;
      }
      return false;
    }
    if (signal?.aborted || generation2 !== runtimeGenerationRef.current) {
      await endUsageSession();
      if (generation2 === runtimeGenerationRef.current) {
        resetRuntimeTask();
        runtimeSettingsRef.current = null;
      }
      return false;
    }
    setQueueMode("solver");
    setActiveRoute("home");
    useSession.getState().setResponseBodyVisible(true);
    setExamStarted(true);
    setActiveMode("exam");
    setView("pill");
    activateRuntimeTask();
    await setMouseThroughMode(interactionMode === "passive");
    return true;
  }
  async function ensureRuntimeInteractionReady(kind, generation2) {
    const session = useSession.getState();
    try {
      const registration = await window.api.hotkey.status(kind);
      if (generation2 !== runtimeGenerationRef.current) return false;
      const interactionMode = runtimeInteractionMode(session.runtimeTask);
      const missing = requiredTaskHotkeys(kind, interactionMode).filter((action) => !registration[action]);
      if (missing.length === 0) return true;
      const settings = runtimeSettingsRef.current ?? latestSettingsRef.current;
      const shortcuts = missing.map((action) => settings.hotkeys[action]?.trim() || action);
      const message = `快捷键被占用或注册失败：${shortcuts.join("、")}。请退出任务并在设置中改绑。`;
      session.setError(message);
      session.setResponseBodyVisible(true);
      failRuntimeTask(message);
      return false;
    } catch (error2) {
      if (generation2 !== runtimeGenerationRef.current) return false;
      const message = "无法确认全局快捷键状态：" + (error2 instanceof Error ? error2.message : String(error2));
      session.setError(message);
      session.setResponseBodyVisible(true);
      failRuntimeTask(message);
      return false;
    }
  }
  async function enterInterviewMode(interactionMode, shortcutOverlayEnabled, signal, examModelProfile, interviewVoiceModelProfile, voiceLlmMaxTokens, materialSelection, knowledgeIndex) {
    if (!await ensureModeAccess()) return false;
    if (signal?.aborted) return false;
    await setMouseThroughMode(false);
    if (signal?.aborted) return false;
    advanceRuntimeGeneration("interview launch requested");
    runtimeSettingsRef.current = structuredClone({
      ...latestSettingsRef.current,
      ...examModelProfile ? { examVisionModelProfile: examModelProfile } : {},
      ...interviewVoiceModelProfile ? { interviewVoiceModelProfile } : {},
      ...voiceLlmMaxTokens ? { voiceLlmMaxTokens } : {}
    });
    runtimeInterviewMaterialsRef.current = materialSelection ? {
      resumeId: materialSelection.resumeId,
      knowledgeIndex: knowledgeIndex ? structuredClone(knowledgeIndex) : null
    } : null;
    prepareRuntimeTask("interview", interactionMode, shortcutOverlayEnabled);
    setQueueMode("chat");
    setActiveRoute("home");
    useSession.getState().setResponseBodyVisible(true);
    setExamStarted(false);
    setActiveMode("interview");
    setView("pill");
    return startInterviewSession();
  }
  function returnToWorkspace() {
    advanceRuntimeGeneration("returning to workspace");
    cancelInterviewStartupAndListening();
    setActiveMode("idle");
    void setMouseThroughMode(false);
    setExamStarted(false);
    resetRuntimeTask();
    runtimeSettingsRef.current = null;
    runtimeInterviewMaterialsRef.current = null;
    setActiveRoute("home");
    useSession.getState().setResponseBodyVisible(true);
    setView("pill");
  }
  function cancelInterviewStartupAndListening() {
    interviewStartupAbortRef.current?.abort();
    interviewStartupAbortRef.current = null;
    stopListening();
  }
  async function setMouseThroughMode(next) {
    const attempt = ++mouseThroughAttemptRef.current;
    const session = useSession.getState();
    const mode2 = session.activeMode;
    if (!next || mode2 === "idle") {
      setMouseThrough(false);
      return true;
    }
    try {
      const registration = await window.api.hotkey.status(mode2);
      if (attempt !== mouseThroughAttemptRef.current) return false;
      const recoveryAction = "window:toggleMouseThrough";
      if (!registration[recoveryAction]) {
        const shortcut = latestSettingsRef.current.hotkeys[recoveryAction]?.trim() || recoveryAction;
        session.setError(`无法开启穿透：恢复快捷键 ${shortcut} 被占用或注册失败。`);
        session.setResponseBodyVisible(true);
        setMouseThrough(false);
        return false;
      }
      if (useSession.getState().activeMode !== mode2) return false;
      setMouseThrough(true);
      return true;
    } catch (error2) {
      if (attempt !== mouseThroughAttemptRef.current) return false;
      session.setError("无法确认恢复快捷键状态：" + (error2 instanceof Error ? error2.message : String(error2)));
      session.setResponseBodyVisible(true);
      setMouseThrough(false);
      return false;
    }
  }
  if (!settingsReady) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-screen w-full bg-white" });
  }
  if (appliedSurfaceMode !== activeMode) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-app-surface-transition": true, className: "h-screen w-full bg-transparent" });
  }
  const loginVisible = shouldRenderLogin(authStatus, view);
  const paywallVisible = !loginVisible && shouldRenderPaywall(authStatus, view);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-app-surface": activeMode === "idle" ? "preparation" : "focus",
      className: activeMode === "idle" ? loginVisible ? "h-screen w-full bg-transparent p-0" : paywallVisible ? "h-screen w-full bg-slate-50 p-2" : "h-screen w-full bg-transparent p-0" : "h-screen w-full bg-transparent p-0",
      style: { opacity: rendererOpacity },
      children: [
        loginVisible ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoginCard, {}) : paywallVisible ? /* @__PURE__ */ jsxRuntimeExports.jsx(Paywall, { onBack: returnToWorkspace }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          DashboardShell,
          {
            activeRoute,
            responseActive: view === "response",
            onRouteChange: (route) => {
              setActiveRoute(route);
              if (view === "response") {
                useSession.getState().setResponseBodyVisible(true);
                setView("pill");
              }
            },
            onToggleInterview: () => void toggleInterviewSession(),
            onEnterExamMode: openExamMode,
            onEnterInterviewMode: enterInterviewMode,
            onToggleMouseThrough: () => void setMouseThroughMode(!useSession.getState().mouseThrough),
            onExitMode: () => void handleHotkey("session:reset")
          }
        ),
        clientVersionNotice && /* @__PURE__ */ jsxRuntimeExports.jsx(
          ClientVersionNoticeDialog,
          {
            notice: clientVersionNotice,
            onClose: () => setClientVersionNotice(null)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(RemotePairApprovalModal, {})
      ]
    }
  );
};
const ClientVersionNoticeDialog = ({ notice, onClose }) => {
  const [downloadState, setDownloadState] = reactExports.useState("idle");
  const [downloadProgress, setDownloadProgress] = reactExports.useState(0);
  const [downloadMessage, setDownloadMessage] = reactExports.useState(null);
  const latestVersion = `v${(notice.latestVersion || CLIENT_UPDATE_FALLBACK_VERSION).replace(/^v/iu, "")}`;
  const currentVersion = notice.currentVersion ? `v${notice.currentVersion}` : "未知版本";
  reactExports.useEffect(() => {
    return window.api.app.onUpdateDownloadProgress((progress) => {
      setDownloadProgress(Math.max(0, Math.min(100, Math.round(progress.percent))));
    });
  }, []);
  reactExports.useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  async function handleDownload() {
    if (downloadState === "downloaded" || downloadState === "fallback") {
      onClose();
      return;
    }
    if (downloadState === "downloading") return;
    setDownloadState("downloading");
    setDownloadProgress(0);
    setDownloadMessage("正在下载安装包，请稍候。");
    try {
      const result = await window.api.app.downloadUpdate(notice.downloadUrl);
      if (result.status === "fallback") {
        setDownloadState("fallback");
        setDownloadMessage(result.message ?? "安装包下载失败，已打开官网下载页，请手动下载安装。");
        return;
      }
      setDownloadState("downloaded");
      setDownloadProgress(100);
      setDownloadMessage(
        result.message ?? "安装包已下载到您的「下载」文件夹，文件资源管理器已自动打开。请关闭本应用后，双击安装包完成更新。"
      );
    } catch (err) {
      window.api.log.error("[zhiyue:version] update download failed", err);
      setDownloadState("fallback");
      setDownloadMessage("安装包下载失败，请前往官网下载最新版本。");
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "no-drag fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-2 sm:p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "client-version-notice-title",
      "aria-describedby": "client-version-notice-summary",
      className: "flex min-h-0 max-h-[calc(100dvh-1rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_24px_80px_-44px_rgba(15,23,42,0.75)] sm:max-h-[calc(100dvh-2rem)]",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 items-start gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[26px] sm:h-14 sm:w-14 sm:text-[30px]", children: "🚀" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { id: "client-version-notice-title", className: "text-[21px] font-semibold leading-tight text-slate-950 sm:text-[26px]", children: [
                "发现新版本 ",
                latestVersion
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-[14px] leading-relaxed text-slate-500 sm:mt-2 sm:text-[16px]", children: [
                "当前版本 ",
                currentVersion
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              "aria-label": "关闭更新公告",
              onClick: onClose,
              className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[24px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40",
              children: "×"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "p",
            {
              id: "client-version-notice-summary",
              className: [
                "rounded-lg border px-4 py-3 text-[14px] leading-relaxed",
                notice.kind === "required" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-100 bg-blue-50 text-slate-700"
              ].join(" "),
              children: notice.message
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-semibold text-slate-500", children: "更新内容" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "mt-3 space-y-2 text-[14px] leading-relaxed text-slate-700 sm:text-[15px]", children: notice.releaseNotes.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "w-5 shrink-0 text-right text-slate-500", children: [
                index2 + 1,
                "."
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 break-words", children: item })
            ] }, `${index2}-${item}`)) })
          ] }),
          downloadState === "downloading" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center justify-between text-[13px] font-medium text-slate-500", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "正在下载" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                downloadProgress,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                role: "progressbar",
                "aria-valuemin": 0,
                "aria-valuemax": 100,
                "aria-valuenow": downloadProgress,
                className: "h-3 overflow-hidden rounded-full bg-slate-100",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "div",
                  {
                    className: "h-full rounded-full bg-blue-600 transition-[width] duration-200 ease-out",
                    style: { width: `${downloadProgress}%` }
                  }
                )
              }
            )
          ] }),
          downloadMessage && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "p",
            {
              className: [
                "mt-5 rounded-lg px-4 py-3 text-center text-[14px] leading-relaxed sm:text-[15px]",
                downloadState === "downloaded" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : downloadState === "fallback" ? "border border-amber-200 bg-amber-50 text-amber-800" : "border border-slate-200 bg-slate-50 text-slate-600"
              ].join(" "),
              children: downloadMessage
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("footer", { className: "shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: downloadState === "idle" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "", children: downloadState === "idle" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: handleDownload,
              className: "h-12 rounded-xl bg-blue-600 px-5 text-[16px] font-semibold text-white shadow-[0_18px_38px_-24px_rgba(37,99,235,0.9)] hover:bg-blue-700",
              children: "立即下载"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onClose,
              className: "h-12 rounded-xl border border-slate-200 bg-white px-5 text-[16px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              children: "暂不更新"
            }
          )
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleDownload,
            disabled: downloadState === "downloading",
            className: "h-12 w-full rounded-xl bg-blue-600 px-5 text-[16px] font-semibold text-white shadow-[0_18px_38px_-24px_rgba(37,99,235,0.9)] hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400",
            children: downloadState === "downloading" ? "正在下载" : "我知道了"
          }
        ) }) })
      ]
    }
  ) });
};
const COMMON_SHORTCUTS = [
  { action: "window:toggle", label: "显示 / 隐藏悬浮窗" },
  { action: "window:toggleMouseThrough", label: "进入 / 退出穿透模式" },
  { action: "answer:scrollUp", label: "答案向上滚动（仅穿透）" },
  { action: "answer:scrollDown", label: "答案向下滚动（仅穿透）" }
];
const EXAM_SHORTCUTS = [
  { action: "screenshot:capture", label: "截图并回答" },
  { action: "screenshot:captureScrolling", label: "滚动多图并回答" },
  { action: "llm:resendHistory", label: "重新生成回答" },
  { action: "screenshot:popLast", label: "撤回上一张截图" },
  { action: "window:moveUp", combo: "Ctrl+Shift+方向键", label: "移动悬浮窗" },
  ...COMMON_SHORTCUTS,
  { action: "exam:exit", label: "结束笔试" }
];
const INTERVIEW_SHORTCUTS = [
  { action: "listen:toggle", label: "暂停 / 继续监听" },
  { action: "interview:clearContext", label: "清空上下文，重新开始" },
  { action: "interview:toggleChat", label: "显示 / 隐藏回答" },
  { action: "screenshot:capture", label: "截图并回答" },
  { action: "screenshot:captureScrolling", label: "滚动多图并回答" },
  { action: "llm:resendHistory", label: "重新生成回答" },
  ...COMMON_SHORTCUTS,
  { action: "session:reset", label: "结束面试" }
];
function parseShortcutOverlayMode(search2) {
  const mode2 = new URLSearchParams(search2).get("mode");
  return mode2 === "exam" || mode2 === "interview" ? mode2 : null;
}
function buildShortcutOverlayItems(mode2, settings) {
  const definitions = mode2 === "exam" ? EXAM_SHORTCUTS : INTERVIEW_SHORTCUTS;
  return definitions.flatMap((definition2) => {
    const combo = (definition2.combo ?? (definition2.action ? settings.hotkeys[definition2.action] : "")).trim();
    if (!combo || !definition2.action) return [];
    return [{
      action: definition2.action === "window:moveUp" ? "window:move" : definition2.action,
      combo,
      label: definition2.label
    }];
  });
}
const ShortcutOverlay = ({ mode: mode2, captureProtectionGated = false }) => {
  const [settings, setSettings] = reactExports.useState(DEFAULT_SETTINGS);
  const [layoutSettingsReady, setLayoutSettingsReady] = reactExports.useState(false);
  const [rendererOpacity, setRendererOpacity] = reactExports.useState(1);
  const [captureProtectionReady, setCaptureProtectionReady] = reactExports.useState(
    !captureProtectionGated
  );
  const rootRef = reactExports.useRef(null);
  const panelRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!captureProtectionGated) {
      setCaptureProtectionReady(true);
      return void 0;
    }
    setCaptureProtectionReady(false);
    return window.api.window.onShortcutOverlayProtectionChanged(
      setCaptureProtectionReady
    );
  }, [captureProtectionGated]);
  reactExports.useEffect(() => {
    let active = true;
    const unsubscribe2 = window.api.settings.onChange((next) => {
      if (active) setSettings(next);
    });
    void window.api.settings.get().then((next) => {
      if (active) setSettings(next);
    }).catch(() => {
    }).finally(() => {
      if (active) setLayoutSettingsReady(true);
    });
    return () => {
      active = false;
      unsubscribe2();
    };
  }, []);
  reactExports.useEffect(
    () => window.api.window.onOpacityPreviewed((next) => {
      setRendererOpacity(Math.min(1, Math.max(0.86, next)));
    }),
    []
  );
  reactExports.useEffect(() => {
    setRendererOpacity(Math.min(1, Math.max(0.86, settings.opacity)));
  }, [settings.opacity]);
  const items = reactExports.useMemo(() => buildShortcutOverlayItems(mode2, settings), [mode2, settings]);
  reactExports.useEffect(() => {
    if (!layoutSettingsReady) return void 0;
    let cancelled = false;
    let started = false;
    let animationFrame = null;
    let observer = null;
    let previous2 = "";
    const scheduleMeasurement = () => {
      if (cancelled || animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        const root2 = rootRef.current;
        const panel = panelRef.current;
        if (!root2 || !panel) return;
        const rootStyle = window.getComputedStyle(root2);
        const horizontalPadding = cssPixels(rootStyle.paddingLeft) + cssPixels(rootStyle.paddingRight);
        const verticalPadding = cssPixels(rootStyle.paddingTop) + cssPixels(rootStyle.paddingBottom);
        const borderWidth = Math.max(0, panel.offsetWidth - panel.clientWidth);
        const borderHeight = Math.max(0, panel.offsetHeight - panel.clientHeight);
        const panelBounds = panel.getBoundingClientRect();
        const width = Math.ceil(
          Math.max(panelBounds.width, panel.scrollWidth + borderWidth) + horizontalPadding
        );
        const height = Math.ceil(
          Math.max(panelBounds.height, panel.scrollHeight + borderHeight) + verticalPadding + 4
        );
        const signature = `${width}x${height}`;
        if (signature === previous2) return;
        previous2 = signature;
        window.api.window.reportShortcutOverlayLayout({ width, height });
      });
    };
    const begin = () => {
      if (cancelled || started) return;
      started = true;
      if (typeof ResizeObserver !== "undefined" && panelRef.current) {
        observer = new ResizeObserver(scheduleMeasurement);
        observer.observe(panelRef.current);
      }
      scheduleMeasurement();
    };
    const fallback = window.setTimeout(begin, 300);
    void (document.fonts?.ready ?? Promise.resolve()).then(begin, begin);
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      observer?.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [items, layoutSettingsReady]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      ref: rootRef,
      "data-shortcut-overlay-root": true,
      "data-mode": mode2,
      "data-capture-protection": captureProtectionReady ? "ready" : "pending",
      "aria-hidden": !captureProtectionReady,
      className: "pointer-events-none flex h-full w-full select-none items-end justify-start bg-transparent p-2 text-slate-800",
      style: {
        opacity: rendererOpacity,
        visibility: captureProtectionReady ? "visible" : "hidden"
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "section",
        {
          ref: panelRef,
          "data-shortcut-overlay-panel": true,
          "aria-label": "键盘快捷方式",
          className: "w-[300px] max-w-full shrink-0 overflow-hidden rounded-[22px] border border-white/80 bg-white/[.92] px-3.5 pb-3 pt-3 shadow-[0_22px_58px_-30px_rgba(15,23,42,0.62)]",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-baseline justify-between gap-3 border-b border-slate-900/[.08] px-1 pb-2.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[13px] font-semibold tracking-[-0.01em] text-slate-950", children: "键盘快捷方式" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-slate-500", children: mode2 === "exam" ? "笔试" : "面试" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1.5", children: items.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                "data-shortcut-overlay-item": true,
                "data-action": item.action,
                className: "flex min-h-9 items-center justify-between gap-3 rounded-xl px-1 py-1.5 text-[11px] text-slate-600",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 flex-1 leading-4", children: item.label }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 scale-[.88] origin-right", children: /* @__PURE__ */ jsxRuntimeExports.jsx(KeyCombo, { combo: item.combo }) })
                ]
              },
              `${item.action}-${item.label}`
            )) })
          ]
        }
      )
    }
  );
};
function cssPixels(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
const container = document.getElementById("root");
const surface = new URLSearchParams(window.location.search).get("surface");
const shortcutOverlayMode = surface === "shortcut-overlay" ? parseShortcutOverlayMode(window.location.search) : null;
const shortcutOverlayCaptureGated = surface === "shortcut-overlay" && new URLSearchParams(window.location.search).get("captureProtection") === "required";
createRoot(container).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: shortcutOverlayMode ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    ShortcutOverlay,
    {
      mode: shortcutOverlayMode,
      captureProtectionGated: shortcutOverlayCaptureGated
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx(App, {}) })
);

export { OUTPUT_HOTKEYS, shouldCloseSettingsForHotkey, AUTH_TIMEOUT_MS, RemotePresenceSocketError, connectRemotePresence, MAX_RECONNECT_MS, running, generation, socket, reconnectTimer, reconnectAttempt, systemBlocked, startRemotePresence, stopRemotePresence, handleRemotePresencePowerState, connectNow, scheduleReconnect, cancelReconnectTimer, RemotePairApprovalModal, reportCleanupError, runTaskExitCleanup, STARTUP_CACHE_KEY, sharedStartupCache, isDevelopmentRenderer, stringOrNull, booleanValue, stringArray, checkClientVersion, isVersionServiceUnavailable, checkClientVersionOnStartup, ALWAYS_ALLOWED_HOTKEYS, EXAM_ALLOWED_HOTKEYS, INTERVIEW_ALLOWED_HOTKEYS, MODE_GATED_HOTKEYS, isHotkeyAllowedForWorkMode, TASK_SURFACE_QA_QUESTION, TASK_SURFACE_QA_ANSWER, seedTaskSurfaceConversationForQa, EXAM_SCREENSHOT_ACTIONS, waitForRendererPaint, isAuthenticatedStatus, shouldRestoreShellAfterAuth, shouldRenderLogin, shouldRenderPaywall, viewForBlockedAccess, shouldPresentScreenshotCommandFailure, App, ClientVersionNoticeDialog, COMMON_SHORTCUTS, EXAM_SHORTCUTS, INTERVIEW_SHORTCUTS, parseShortcutOverlayMode, buildShortcutOverlayItems, ShortcutOverlay, cssPixels, container, surface, shortcutOverlayMode, shortcutOverlayCaptureGated };
