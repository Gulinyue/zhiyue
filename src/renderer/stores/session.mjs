// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.
import { create$1 } from "../vendor/react-icons-state.mjs";

const IDLE_RUNTIME_TASK = { status: "idle" };
function runtimeInteractionMode(task) {
  return task.status === "idle" ? "interactive" : task.interactionMode;
}
function requiredTaskHotkeys(kind, interactionMode) {
  if (kind === "exam") {
    const core2 = ["screenshot:capture", "exam:exit"];
    return interactionMode === "passive" ? [...core2, "window:toggleMouseThrough", "window:toggle"] : core2;
  }
  return interactionMode === "passive" ? ["listen:toggle", "window:toggleMouseThrough", "window:toggle", "session:reset"] : [];
}
const DEFAULT_PCM_STALL_TIMEOUT_MS = 4e3;
const DEFAULT_LONG_SILENCE_MS = 45e3;
const DEFAULT_AUDIO_HEALTH_TICK_MS = 1e3;
const DEFAULT_PCM_ACTIVITY_RMS_THRESHOLD = 3e-3;
const DEFAULT_VAD_FORWARD_STALL_MS = 6e3;
const DEFAULT_SOCKET_SEND_STALL_MS = 2e3;
const DEFAULT_ASR_STALL_MS = 6e3;
function createIdleAudioHealthState(now = Date.now()) {
  return {
    status: "idle",
    connection: "idle",
    trackMuted: false,
    startedAt: null,
    firstPcmAt: null,
    lastPcmAt: null,
    lastSignalAt: null,
    pcmSignalActive: false,
    lastPcmRms: null,
    lastPcmPeak: null,
    unforwardedSignalAt: null,
    lastVadForwardedAt: null,
    unsentVadAt: null,
    lastSpeechSentAt: null,
    pendingTranscriptSince: null,
    lastSpeechDroppedAt: null,
    lastTranscriptAt: null,
    pipeline: {
      pcmChunks: 0,
      pcmBytes: 0,
      vadForwardedChunks: 0,
      vadForwardedBytes: 0,
      socketSentChunks: 0,
      socketSentBytes: 0,
      socketDroppedChunks: 0,
      socketDroppedBytes: 0,
      asrPartialCount: 0,
      asrFinalCount: 0
    },
    issues: [],
    updatedAt: now
  };
}
function audioHealthAfterListeningStop(state, now = Date.now()) {
  return state.status === "failed" ? state : createIdleAudioHealthState(now);
}
function normalizeThresholds(overrides) {
  const positive = (value, fallback) => Number.isFinite(value) && (value ?? 0) > 0 ? Math.max(1, value) : fallback;
  return {
    pcmStallMs: positive(overrides?.pcmStallMs, DEFAULT_PCM_STALL_TIMEOUT_MS),
    longSilenceMs: positive(overrides?.longSilenceMs, DEFAULT_LONG_SILENCE_MS),
    activityRmsThreshold: Number.isFinite(overrides?.activityRmsThreshold) && (overrides?.activityRmsThreshold ?? 0) > 0 ? Math.min(1, overrides?.activityRmsThreshold) : DEFAULT_PCM_ACTIVITY_RMS_THRESHOLD,
    vadForwardStallMs: positive(
      overrides?.vadForwardStallMs,
      DEFAULT_VAD_FORWARD_STALL_MS
    ),
    socketSendStallMs: positive(
      overrides?.socketSendStallMs,
      DEFAULT_SOCKET_SEND_STALL_MS
    ),
    asrStallMs: positive(overrides?.asrStallMs, DEFAULT_ASR_STALL_MS),
    tickMs: positive(overrides?.tickMs, DEFAULT_AUDIO_HEALTH_TICK_MS)
  };
}
function withoutIssue(issues, code2) {
  return issues.filter((issue) => issue.code !== code2);
}
function withIssue(issues, issue) {
  const existing = issues.find((candidate) => candidate.code === issue.code);
  return [
    ...issues.filter((candidate) => candidate.code !== issue.code),
    existing ? { ...issue, detectedAt: existing.detectedAt } : issue
  ];
}
function normalizedCount(value, fallback) {
  return Number.isFinite(value) && (value ?? 0) >= 0 ? Math.floor(value) : fallback;
}
function addPipelineCounters(counters, patch2) {
  const next = { ...counters };
  for (const key of Object.keys(patch2)) {
    next[key] = Math.max(0, counters[key] + normalizedCount(patch2[key], 0));
  }
  return next;
}
function audioPipelineStage(state) {
  if (state.status === "idle") return "idle";
  if (state.pipeline.pcmChunks <= 0) return "awaiting-pcm";
  if (state.pipeline.asrPartialCount > 0 || state.pipeline.asrFinalCount > 0) return "asr";
  if (state.pipeline.socketSentChunks > 0) return "socket";
  if (state.pipeline.vadForwardedChunks > 0) return "vad";
  return "pcm";
}
function formatAudioPipelineBytes(value) {
  const bytes = Math.max(0, normalizedCount(value, 0));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1048576).toFixed(1)} MiB`;
}
function statusFor(state, issues) {
  if (issues.some((issue) => issue.severity === "fatal")) return "failed";
  if (state.status === "idle") return "idle";
  if (issues.length > 0) return "degraded";
  return state.firstPcmAt === null || state.lastSignalAt === null ? "starting" : "healthy";
}
function finalize(state, patch2, issues, at) {
  const next = { ...state, ...patch2, issues, updatedAt: at };
  return { ...next, status: statusFor(next, issues) };
}
function reduceAudioHealth(state, event, thresholdOverrides) {
  const thresholds = normalizeThresholds(thresholdOverrides);
  if (event.type !== "started" && (state.status === "idle" || state.status === "failed")) {
    return state;
  }
  switch (event.type) {
    case "started": {
      const next = createIdleAudioHealthState(event.at);
      next.status = "starting";
      next.startedAt = event.at;
      next.trackMuted = Boolean(event.trackMuted);
      if (next.trackMuted) {
        next.issues = withIssue(next.issues, {
          code: "track-muted",
          severity: "warning",
          recoverable: true,
          message: "系统音频轨道暂时静音，正在等待轨道恢复。",
          detectedAt: event.at
        });
        next.status = "degraded";
      }
      return next;
    }
    case "track-muted": {
      const issues = withIssue(state.issues, {
        code: "track-muted",
        severity: "warning",
        recoverable: true,
        message: "系统音频轨道暂时静音，正在等待轨道恢复。",
        detectedAt: event.at
      });
      return finalize(state, { trackMuted: true }, issues, event.at);
    }
    case "track-unmuted":
      return finalize(
        state,
        { trackMuted: false },
        withoutIssue(state.issues, "track-muted"),
        event.at
      );
    case "track-ended": {
      const issues = withIssue(state.issues, {
        code: "track-ended",
        severity: "fatal",
        recoverable: false,
        message: "系统音频轨道已结束，请检查输出设备后重新开始。",
        detectedAt: event.at
      });
      return finalize(state, {}, issues, event.at);
    }
    case "connection": {
      const changed = event.connection !== state.connection;
      let issues = changed ? withoutIssue(
        withoutIssue(state.issues, "socket-not-sending"),
        "asr-stalled"
      ) : state.issues;
      issues = event.connection === "reconnecting" ? withIssue(issues, {
        code: "stream-reconnecting",
        severity: "warning",
        recoverable: true,
        message: "音频或语音连接正在恢复，具体阶段请查看上方恢复提示和下方链路计数。",
        detectedAt: event.at
      }) : withoutIssue(issues, "stream-reconnecting");
      return finalize(
        state,
        {
          connection: event.connection,
          unsentVadAt: changed ? null : state.unsentVadAt,
          pendingTranscriptSince: changed ? null : state.pendingTranscriptSince
        },
        issues,
        event.at
      );
    }
    case "connection-failed": {
      const issues = withIssue(withoutIssue(state.issues, "stream-reconnecting"), {
        code: "stream-reconnect-failed",
        severity: "fatal",
        recoverable: false,
        message: event.message,
        detectedAt: event.at
      });
      return finalize(state, { connection: "idle" }, issues, event.at);
    }
    case "pcm": {
      const rms = Number.isFinite(event.normalizedRms) ? Math.max(0, Math.min(1, event.normalizedRms)) : 0;
      const peak = Number.isFinite(event.normalizedPeak) ? Math.max(0, Math.min(1, event.normalizedPeak)) : rms;
      const isActive = rms >= thresholds.activityRmsThreshold;
      let issues = withoutIssue(state.issues, "pcm-stalled");
      if (isActive) issues = withoutIssue(issues, "long-silent");
      else issues = withoutIssue(issues, "vad-filtering");
      return finalize(
        state,
        {
          firstPcmAt: state.firstPcmAt ?? event.at,
          lastPcmAt: event.at,
          lastSignalAt: isActive ? event.at : state.lastSignalAt,
          pcmSignalActive: isActive,
          lastPcmRms: rms,
          lastPcmPeak: peak,
          unforwardedSignalAt: isActive ? state.unforwardedSignalAt ?? event.at : null,
          pipeline: addPipelineCounters(state.pipeline, {
            pcmChunks: 1,
            pcmBytes: normalizedCount(event.byteLength, 0)
          })
        },
        issues,
        event.at
      );
    }
    case "vad-forwarded":
      return finalize(
        state,
        {
          lastVadForwardedAt: event.at,
          unforwardedSignalAt: null,
          unsentVadAt: state.unsentVadAt ?? event.at,
          pipeline: addPipelineCounters(state.pipeline, {
            vadForwardedChunks: normalizedCount(event.chunks, 1),
            vadForwardedBytes: normalizedCount(event.byteLength, 0)
          })
        },
        withoutIssue(state.issues, "vad-filtering"),
        event.at
      );
    case "speech-sent":
      return finalize(
        state,
        {
          lastSpeechSentAt: event.at,
          unforwardedSignalAt: null,
          unsentVadAt: null,
          pendingTranscriptSince: event.expectTranscript === false ? state.pendingTranscriptSince : state.pendingTranscriptSince ?? event.at,
          pipeline: addPipelineCounters(state.pipeline, {
            socketSentChunks: normalizedCount(event.chunks, 1),
            socketSentBytes: normalizedCount(event.byteLength, 0)
          })
        },
        withoutIssue(withoutIssue(state.issues, "socket-not-sending"), "vad-filtering"),
        event.at
      );
    case "speech-dropped":
      return finalize(
        state,
        {
          lastSpeechDroppedAt: event.at,
          pipeline: addPipelineCounters(state.pipeline, {
            socketDroppedChunks: normalizedCount(event.chunks, 1),
            socketDroppedBytes: normalizedCount(event.byteLength, 0)
          })
        },
        state.issues,
        event.at
      );
    case "transcript": {
      const counter = event.kind === "final" ? { asrFinalCount: 1 } : { asrPartialCount: 1 };
      return finalize(
        state,
        {
          lastTranscriptAt: event.at,
          pendingTranscriptSince: null,
          pipeline: addPipelineCounters(state.pipeline, counter)
        },
        withoutIssue(state.issues, "asr-stalled"),
        event.at
      );
    }
    case "tick": {
      let issues = state.issues;
      if (state.lastPcmAt !== null && event.at - state.lastPcmAt >= thresholds.pcmStallMs) {
        issues = withIssue(issues, {
          code: "pcm-stalled",
          severity: "fatal",
          recoverable: false,
          message: "未继续收到 PCM 数据，音频采集已停止。",
          detectedAt: event.at
        });
      } else if (state.firstPcmAt !== null) {
        const activityAnchor = state.lastSignalAt ?? state.firstPcmAt;
        if (event.at - activityAnchor >= thresholds.longSilenceMs) {
          issues = withIssue(issues, {
            code: "long-silent",
            severity: "notice",
            recoverable: true,
            message: "PCM 信号已持续较弱；这只表示采集数据接近静音，不代表设备音量。",
            detectedAt: event.at
          });
        }
      }
      if (state.unforwardedSignalAt !== null && event.at - state.unforwardedSignalAt >= thresholds.vadForwardStallMs) {
        issues = withIssue(issues, {
          code: "vad-filtering",
          severity: "warning",
          recoverable: true,
          message: "已检测到系统声音，但语音活动检测尚未放行，请检查输入电平或语音检测设置。",
          detectedAt: event.at
        });
      }
      if (state.unsentVadAt !== null && event.at - state.unsentVadAt >= thresholds.socketSendStallMs) {
        issues = withIssue(issues, {
          code: "socket-not-sending",
          severity: "warning",
          recoverable: true,
          message: "语音活动检测已有输出，但数据未进入 WebSocket 发送队列，正在等待连接恢复。",
          detectedAt: event.at
        });
      }
      if (state.pendingTranscriptSince !== null && event.at - state.pendingTranscriptSince >= thresholds.asrStallMs) {
        issues = withIssue(issues, {
          code: "asr-stalled",
          severity: "warning",
          recoverable: true,
          message: "检测到语音输入，但识别长时间无结果，正在尝试恢复音频链路。",
          detectedAt: event.at
        });
      }
      return finalize(state, {}, issues, event.at);
    }
  }
}
function createAudioHealthMonitor(options) {
  const clock = options.clock ?? {
    now: () => Date.now(),
    setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
    clearInterval: (handle2) => globalThis.clearInterval(handle2)
  };
  const thresholds = normalizeThresholds(options.thresholds);
  let state = createIdleAudioHealthState(clock.now());
  let track = null;
  let timer2 = null;
  let fatalNotified = false;
  const notify = (next, publish2) => {
    state = next;
    if (publish2) options.onChange(next);
    if (!fatalNotified && next.status === "failed") {
      const fatal = next.issues.find((issue) => issue.severity === "fatal");
      if (fatal) {
        fatalNotified = true;
        options.onFatal?.(fatal, next);
      }
    }
  };
  const dispatch = (event) => {
    const previous2 = state;
    const next = reduceAudioHealth(state, event, thresholds);
    if (next === state) return;
    const issueSignature = (value) => value.issues.map((issue) => `${issue.code}:${issue.severity}:${issue.recoverable}`).sort().join("|");
    const semanticChange = previous2.status !== next.status || previous2.connection !== next.connection || previous2.trackMuted !== next.trackMuted || audioPipelineStage(previous2) !== audioPipelineStage(next) || issueSignature(previous2) !== issueSignature(next);
    const highFrequency = event.type === "pcm" || event.type === "vad-forwarded" || event.type === "speech-sent" || event.type === "speech-dropped" || event.type === "transcript";
    notify(next, !highFrequency || semanticChange);
  };
  const onMuted = () => dispatch({ type: "track-muted", at: clock.now() });
  const onUnmuted = () => dispatch({ type: "track-unmuted", at: clock.now() });
  const onEnded = () => dispatch({ type: "track-ended", at: clock.now() });
  const detach = () => {
    if (timer2 !== null) {
      clock.clearInterval(timer2);
      timer2 = null;
    }
    track?.removeEventListener("mute", onMuted);
    track?.removeEventListener("unmute", onUnmuted);
    track?.removeEventListener("ended", onEnded);
    track = null;
  };
  return {
    start(nextTrack) {
      detach();
      fatalNotified = false;
      track = nextTrack;
      track.addEventListener("mute", onMuted);
      track.addEventListener("unmute", onUnmuted);
      track.addEventListener("ended", onEnded);
      dispatch({ type: "started", at: clock.now(), trackMuted: track.muted });
      timer2 = clock.setInterval(() => {
        dispatch({ type: "tick", at: clock.now() });
      }, thresholds.tickMs);
      if (track.readyState === "ended") onEnded();
    },
    recordPcm(normalizedRms, normalizedPeak, byteLength) {
      dispatch({
        type: "pcm",
        at: clock.now(),
        normalizedRms,
        normalizedPeak,
        byteLength
      });
    },
    recordVadForwarded(byteLength, chunks) {
      dispatch({ type: "vad-forwarded", at: clock.now(), byteLength, chunks });
    },
    recordSpeechSent(byteLength, chunks, expectTranscript) {
      dispatch({
        type: "speech-sent",
        at: clock.now(),
        byteLength,
        chunks,
        expectTranscript
      });
    },
    recordSpeechDropped(byteLength, chunks) {
      dispatch({ type: "speech-dropped", at: clock.now(), byteLength, chunks });
    },
    recordTranscript(kind) {
      dispatch({ type: "transcript", at: clock.now(), kind });
    },
    setConnection(connection) {
      dispatch({ type: "connection", at: clock.now(), connection });
    },
    stop() {
      detach();
    },
    getState() {
      return state;
    }
  };
}
const STREAM_FLUSH_INTERVAL_MS = 40;
const useSession = create$1((set, get) => {
  let pendingStreamText = "";
  let streamFlushTimer = null;
  const cancelPendingStream = () => {
    if (streamFlushTimer) clearTimeout(streamFlushTimer);
    streamFlushTimer = null;
    pendingStreamText = "";
  };
  const flushPendingStream = () => {
    if (streamFlushTimer) clearTimeout(streamFlushTimer);
    streamFlushTimer = null;
    if (!pendingStreamText) return;
    const chunk = pendingStreamText;
    pendingStreamText = "";
    set({ streamText: get().streamText + chunk });
  };
  return {
    view: "pill",
    activeMode: "idle",
    queueMode: "chat",
    screenshotCount: 0,
    mouseThrough: false,
    examStarted: false,
    runtimeTask: IDLE_RUNTIME_TASK,
    streaming: false,
    streamText: "",
    lastError: null,
    listening: false,
    listenPartial: "",
    listenStatus: "idle",
    audioHealth: createIdleAudioHealthState(),
    taskConnectionStatus: "idle",
    taskConnectionMessage: null,
    voiceConnectionStatus: "idle",
    voiceConnectionMessage: null,
    chatHistory: [],
    solverHistory: [],
    interviewChatVisible: true,
    responseBodyVisible: true,
    setView: (v2) => set({ view: v2 }),
    setActiveMode: (mode2) => set({ activeMode: mode2 }),
    setMouseThrough: (v2) => set({ mouseThrough: v2 }),
    setExamStarted: (v2) => set({ examStarted: v2 }),
    prepareRuntimeTask: (kind, interactionMode, shortcutOverlayEnabled) => set({ runtimeTask: { status: "ready", kind, interactionMode, shortcutOverlayEnabled } }),
    setRuntimeInteractionMode: (interactionMode) => {
      const task = get().runtimeTask;
      if (task.status === "idle") return;
      set({ runtimeTask: { ...task, interactionMode } });
    },
    startRuntimeTask: () => {
      const task = get().runtimeTask;
      if (task.status !== "ready" && task.status !== "error") return;
      set({
        runtimeTask: {
          status: "starting",
          kind: task.kind,
          interactionMode: task.interactionMode,
          shortcutOverlayEnabled: task.shortcutOverlayEnabled
        }
      });
    },
    activateRuntimeTask: () => {
      const task = get().runtimeTask;
      if (task.status !== "starting") return;
      set({
        runtimeTask: {
          status: "active",
          kind: task.kind,
          interactionMode: task.interactionMode,
          shortcutOverlayEnabled: task.shortcutOverlayEnabled,
          startedAt: Date.now()
        }
      });
    },
    failRuntimeTask: (message) => {
      const task = get().runtimeTask;
      if (task.status === "idle") return;
      set({
        runtimeTask: {
          status: "error",
          kind: task.kind,
          interactionMode: task.interactionMode,
          shortcutOverlayEnabled: task.shortcutOverlayEnabled,
          error: message
        }
      });
    },
    beginEndingRuntimeTask: () => {
      const task = get().runtimeTask;
      if (task.status !== "active") return;
      set({ runtimeTask: { ...task, status: "ending" } });
    },
    resetRuntimeTask: () => set({ runtimeTask: IDLE_RUNTIME_TASK }),
    setResponseBodyVisible: (v2) => set({ responseBodyVisible: v2 }),
    setQueueMode: (m2) => set({ queueMode: m2 }),
    setScreenshotCount: (n2) => set({ screenshotCount: n2 }),
    setStreaming: (v2) => set({ streaming: v2 }),
    appendStream: (chunk) => {
      if (!chunk) return;
      if (!get().streamText && !pendingStreamText && !streamFlushTimer) {
        set({ streamText: chunk });
        return;
      }
      pendingStreamText += chunk;
      if (streamFlushTimer) return;
      streamFlushTimer = setTimeout(flushPendingStream, STREAM_FLUSH_INTERVAL_MS);
    },
    flushStream: flushPendingStream,
    setStreamText: (text2) => {
      cancelPendingStream();
      set({ streamText: text2 });
    },
    clearStream: () => {
      cancelPendingStream();
      set({ streamText: "" });
    },
    setError: (e2) => set({ lastError: e2 }),
    setListening: (v2) => set({ listening: v2 }),
    setListenStatus: (s2) => set({ listenStatus: s2 }),
    setListenPartial: (s2) => set({ listenPartial: s2 }),
    setAudioHealth: (audioHealth) => set({ audioHealth }),
    setTaskConnectionStatus: (taskConnectionStatus) => set({ taskConnectionStatus }),
    setTaskConnectionMessage: (taskConnectionMessage) => set({ taskConnectionMessage }),
    setVoiceConnection: (voiceConnectionStatus, voiceConnectionMessage = null) => set({ voiceConnectionStatus, voiceConnectionMessage }),
    pushHistory: (m2) => {
      const { queueMode } = get();
      if (queueMode === "solver") {
        set({ solverHistory: [...get().solverHistory, m2] });
      } else {
        set({ chatHistory: [...get().chatHistory, m2] });
      }
    },
    replaceHistory: (mode2, messages) => {
      if (mode2 === "solver") set({ solverHistory: messages });
      else set({ chatHistory: messages });
    },
    clearConversationContext: (preserveSharedOutput = false) => {
      const listening = get().listening;
      if (!preserveSharedOutput) cancelPendingStream();
      set({
        ...!preserveSharedOutput ? {
          streaming: false,
          streamText: "",
          lastError: null
        } : {},
        listenPartial: "",
        listenStatus: listening ? "listening" : "idle",
        chatHistory: []
      });
    },
    resetSession: () => {
      cancelPendingStream();
      set({
        view: "pill",
        queueMode: "chat",
        screenshotCount: 0,
        streaming: false,
        streamText: "",
        lastError: null,
        mouseThrough: false,
        examStarted: false,
        runtimeTask: IDLE_RUNTIME_TASK,
        listening: false,
        listenPartial: "",
        listenStatus: "idle",
        audioHealth: createIdleAudioHealthState(),
        taskConnectionStatus: "idle",
        taskConnectionMessage: null,
        voiceConnectionStatus: "idle",
        voiceConnectionMessage: null,
        activeMode: "idle",
        chatHistory: [],
        solverHistory: [],
        interviewChatVisible: true,
        responseBodyVisible: true
      });
    },
    toggleInterviewChat: () => set({ interviewChatVisible: !get().interviewChatVisible }),
    toggleResponseBody: () => {
      const next = !get().responseBodyVisible;
      set({ responseBodyVisible: next });
      if (next) set({ view: "response" });
    }
  };
});
const MOVE_FALLBACKS = {
  "window:moveUp": "Alt+Shift+Up",
  "window:moveDown": "Alt+Shift+Down",
  "window:moveLeft": "Alt+Shift+Left",
  "window:moveRight": "Alt+Shift+Right"
};
function normalizeAccelerator(accel) {
  return accel.split("+").map((p2) => p2.trim()).filter(Boolean).map((p2) => {
    const lower = p2.toLowerCase();
    if (lower === "ctrl") return "Control";
    if (lower === "control") return "Control";
    if (lower === "alt") return "Alt";
    if (lower === "shift") return "Shift";
    if (lower === "win" || lower === "meta" || lower === "super") return "Super";
    if (lower === "up" || lower === "arrowup") return "Up";
    if (lower === "down" || lower === "arrowdown") return "Down";
    if (lower === "left" || lower === "arrowleft") return "Left";
    if (lower === "right" || lower === "arrowright") return "Right";
    return p2.length === 1 ? p2.toUpperCase() : p2;
  }).join("+");
}
function getAcceleratorsForAction(action, accel) {
  const values = [normalizeAccelerator(accel)];
  const fallback = MOVE_FALLBACKS[action];
  if (fallback) values.push(normalizeAccelerator(fallback));
  return [...new Set(values.filter(Boolean))];
}

export { IDLE_RUNTIME_TASK, runtimeInteractionMode, requiredTaskHotkeys, DEFAULT_PCM_STALL_TIMEOUT_MS, DEFAULT_LONG_SILENCE_MS, DEFAULT_AUDIO_HEALTH_TICK_MS, DEFAULT_PCM_ACTIVITY_RMS_THRESHOLD, DEFAULT_VAD_FORWARD_STALL_MS, DEFAULT_SOCKET_SEND_STALL_MS, DEFAULT_ASR_STALL_MS, createIdleAudioHealthState, audioHealthAfterListeningStop, normalizeThresholds, withoutIssue, withIssue, normalizedCount, addPipelineCounters, audioPipelineStage, formatAudioPipelineBytes, statusFor, finalize, reduceAudioHealth, createAudioHealthMonitor, STREAM_FLUSH_INTERVAL_MS, useSession, MOVE_FALLBACKS, normalizeAccelerator, getAcceleratorsForAction };
