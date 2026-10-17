// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.
import { jsxRuntimeExports, reactExports } from "../vendor/react-icons-state.mjs";
import { MarkdownBody } from "../vendor/markdown.mjs";
import { useSession } from "../stores/session.mjs";

const ModeConversationBubble = ({ item, label }) => {
  const isUser = item.role === "user";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-mode-role": item.role,
      className: `rounded-xl border border-[#26251e]/[.10] bg-white/[.35] px-3.5 py-3 text-[13px] leading-6 text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)] backdrop-blur-[8px] sm:px-4 ${isUser ? "w-fit max-w-[76%] sm:max-w-[680px]" : "w-[94%] sm:w-[88%]"}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sr-only", children: [
          label,
          item.live ? " · 实时" : ""
        ] }),
        item.images.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3", children: item.images.map((imageUrl, imageIndex) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "img",
          {
            src: imageUrl,
            alt: `截图 ${imageIndex + 1}`,
            className: "h-24 w-full rounded-lg border border-slate-200 bg-white object-contain"
          },
          `${item.ts}-${imageIndex}`
        )) }),
        item.text && (isUser || item.live ? /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "whitespace-pre-wrap font-sans", children: item.text }) : /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownBody, { markdown: item.text }))
      ]
    }
  );
};
const BOTTOM_TOLERANCE = 1;
function createAnswerAutoFollow(viewport, onFollowingChange) {
  let following = true;
  let lastTop = 0;
  let lastMax = 0;
  const maximum = (element2) => Math.max(0, element2.scrollHeight - element2.clientHeight);
  const atBottom = (element2) => maximum(element2) - element2.scrollTop <= BOTTOM_TOLERANCE;
  const setFollowing = (value) => {
    if (following === value) return;
    following = value;
    onFollowingChange(value);
  };
  const remember = (element2) => {
    lastMax = maximum(element2);
    lastTop = element2.scrollTop;
  };
  const jumpToLatest = () => {
    const element2 = viewport();
    if (!element2) return;
    setFollowing(true);
    element2.scrollTop = maximum(element2);
    remember(element2);
  };
  return {
    isFollowing: () => following,
    jumpToLatest,
    contentChanged() {
      const element2 = viewport();
      if (!element2) return;
      if (following) {
        element2.scrollTop = maximum(element2);
        remember(element2);
      } else {
        lastTop = Math.min(lastTop, maximum(element2));
        lastMax = maximum(element2);
      }
    },
    scroll() {
      const element2 = viewport();
      if (!element2) return;
      const max = maximum(element2);
      const previousTop = Math.min(lastTop, max);
      if (element2.scrollTop < previousTop - BOTTOM_TOLERANCE) {
        setFollowing(false);
      } else if (max === lastMax && element2.scrollTop > previousTop && atBottom(element2)) {
        setFollowing(true);
      }
      remember(element2);
    },
    userScrollIntent(direction) {
      const element2 = viewport();
      if (!element2 || maximum(element2) <= BOTTOM_TOLERANCE) return;
      if (direction < 0) setFollowing(false);
      else if (atBottom(element2)) setFollowing(true);
    },
    scrollPage(direction) {
      const element2 = viewport();
      if (!element2) return;
      const max = maximum(element2);
      if (direction < 0 && max > BOTTOM_TOLERANCE) setFollowing(false);
      const page = Math.max(64, Math.round(element2.clientHeight * 0.2));
      element2.scrollTop = Math.min(max, Math.max(0, element2.scrollTop + direction * page));
      if (direction > 0 && atBottom(element2)) setFollowing(true);
      remember(element2);
    }
  };
}
function useAnswerAutoFollow() {
  const viewportRef = reactExports.useRef(null);
  const contentRef = reactExports.useRef(null);
  const [following, setFollowing] = reactExports.useState(true);
  const controllerRef = reactExports.useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createAnswerAutoFollow(() => viewportRef.current, setFollowing);
  }
  const controller = controllerRef.current;
  reactExports.useEffect(() => {
    const viewport = viewportRef.current;
    const content2 = contentRef.current;
    if (!viewport) return;
    let previousTouchY = null;
    const onWheel = (event) => {
      if (!event.ctrlKey && event.deltaY !== 0) controller.userScrollIntent(event.deltaY < 0 ? -1 : 1);
    };
    const onTouchStart = (event) => {
      previousTouchY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event) => {
      const nextY = event.touches[0]?.clientY ?? null;
      if (previousTouchY !== null && nextY !== null && nextY !== previousTouchY) {
        controller.userScrollIntent(nextY > previousTouchY ? -1 : 1);
      }
      previousTouchY = nextY;
    };
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) || event.key === " " && event.shiftKey) {
        controller.userScrollIntent(-1);
      } else if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) {
        controller.userScrollIntent(1);
      }
    };
    viewport.addEventListener("scroll", controller.scroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: true });
    viewport.addEventListener("keydown", onKeyDown);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(controller.contentChanged);
    observer?.observe(viewport);
    if (content2) observer?.observe(content2);
    return () => {
      observer?.disconnect();
      viewport.removeEventListener("scroll", controller.scroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("keydown", onKeyDown);
    };
  }, [controller]);
  reactExports.useEffect(() => {
    controller.contentChanged();
  });
  return { viewportRef, contentRef, following, scrollPage: controller.scrollPage, jumpToLatest: controller.jumpToLatest };
}
function canEnterCheckoutStep(params) {
  if (params.targetStep === 1) return true;
  if (params.targetStep === 3) return true;
  return params.hasSelectedPlan;
}
const LIVE_ASSISTANT_MESSAGE_TS = Number.MAX_SAFE_INTEGER;
const DASHBOARD_NAV_ITEMS = [
  { id: "home", label: "新任务", section: "main" },
  { id: "preparation", label: "准备中心", section: "main" },
  { id: "practice", label: "演练模式", section: "main" },
  { id: "practice-history", label: "模拟面试记录", section: "main" },
  { id: "local-records", label: "面试与截图记录", section: "main" },
  { id: "resume", label: "简历", section: "main" },
  { id: "knowledge", label: "知识库", section: "main" },
  { id: "language", label: "面试语种", section: "custom" },
  { id: "hotwords", label: "面试热词", section: "custom" },
  { id: "prompts", label: "提示词", section: "custom" },
  { id: "api-keys", label: "API KEY 管理", section: "custom" },
  { id: "settings", label: "设置", section: "account" },
  { id: "plans", label: "充值套餐", section: "account" },
  { id: "help", label: "帮助文档", section: "account" }
];
const DASHBOARD_PRIMARY_NAV_ITEMS = [
  { id: "home", label: "新任务", section: "main" },
  { id: "preparation", label: "准备中心", section: "main" },
  { id: "practice", label: "模拟面试", section: "main" },
  { id: "local-records", label: "面试与截图记录", section: "main" },
  { id: "settings", label: "设置", section: "account" }
];
function voicePartialDisplayKey(text2) {
  return text2.trim().toLocaleLowerCase().replace(/\s+/g, "").replace(/[。！？!?.,，；;：:"“”'‘’、（）()\[\]【】]+$/gu, "");
}
function isDuplicateVoicePartial(partial, previousUserTexts) {
  const partialKey = voicePartialDisplayKey(partial);
  if (!partialKey) return false;
  return previousUserTexts.some((text2) => voicePartialDisplayKey(text2) === partialKey);
}
function getUserDisplayName(email) {
  const trimmed = email?.trim();
  if (!trimmed) return "用户";
  const local = trimmed.split("@")[0]?.trim();
  return local || trimmed;
}
function buildQuotaSummary(sub2, now = Date.now()) {
  const isTimePlan = sub2?.accessMode === "time" || sub2?.plan?.startsWith("time-") === true;
  const rawPlanLabel = formatPlanLabel(sub2?.plan);
  const timeAllowanceSeconds = positiveNumber(sub2?.timeAllowanceSeconds);
  const timeRemainingSeconds = typeof sub2?.timeRemainingSeconds === "number" ? positiveNumber(sub2.timeRemainingSeconds) : Math.max(0, timeAllowanceSeconds - positiveNumber(sub2?.timeUsedSeconds));
  const legacyCalendarPlan = isTimePlan && sub2?.plan !== "time-hour" && sub2?.plan !== "trial";
  const calendarRenewAt = sub2?.calendarRenewAt !== void 0 ? sub2.calendarRenewAt : legacyCalendarPlan ? sub2?.renewAt : null;
  const calendarRenewMs = parseDateMs(calendarRenewAt);
  const calendarActive = Boolean(sub2?.active && sub2.calendarActive !== false && calendarRenewMs !== void 0 && calendarRenewMs > now);
  const isUsageAllowancePlan = isTimePlan && !calendarActive && (timeAllowanceSeconds > 0 || timeRemainingSeconds > 0 || sub2?.plan === "time-hour" || sub2?.plan === "trial");
  const hasUsageAllowanceWindow = isUsageAllowancePlan && timeRemainingSeconds > 0;
  const hasDisplayablePlan = Boolean(sub2?.active && (calendarRenewAt || sub2?.renewAt || hasUsageAllowanceWindow) && (rawPlanLabel !== "未开通" || isTimePlan));
  const planLabel = calendarActive && (sub2?.plan === "time-hour" || sub2?.plan === "trial") ? "日历套餐" : isUsageAllowancePlan && timeRemainingSeconds > 0 && sub2?.plan !== "trial" && sub2?.plan !== "time-hour" ? "小时余额" : hasDisplayablePlan && rawPlanLabel === "未开通" ? "当前套餐" : rawPlanLabel;
  const screenshotQuota = positiveNumber(sub2?.screenshotQuota);
  const screenshotUsed = positiveNumber(sub2?.screenshotUsed);
  const voiceQuotaMinutes = positiveNumber(sub2?.voiceMinutes);
  const voiceUsedMinutes = positiveNumber(sub2?.voiceUsed);
  const dailyImageLimit = positiveNumber(sub2?.dailyImageLimit || 500);
  const dailyVoiceMinutes = Math.floor(positiveNumber(sub2?.dailyVoiceSecondsLimit || 8 * 60 * 60) / 60);
  const activeTimeAccess = isTimePlan && Boolean(sub2?.active) && (calendarActive || timeRemainingSeconds > 0);
  const addonExpiresMs = parseDateMs(sub2?.juiceExpiresAt);
  const addonValid = addonExpiresMs !== void 0 && addonExpiresMs > now;
  const screenshotRemaining = activeTimeAccess ? dailyImageLimit : typeof sub2?.screenshotRemainingTotal === "number" ? Math.max(0, Math.floor(sub2.screenshotRemainingTotal)) : isTimePlan ? addonValid ? positiveNumber(sub2?.juiceScreenshotRemain) : 0 : Math.max(0, screenshotQuota - screenshotUsed);
  const voiceRemainingMinutes = activeTimeAccess ? dailyVoiceMinutes : typeof sub2?.voiceMinutesRemainingTotal === "number" ? Math.max(0, Math.floor(sub2.voiceMinutesRemainingTotal)) : isTimePlan ? addonValid ? positiveNumber(sub2?.juiceVoiceMinutesRemain) : 0 : Math.max(0, voiceQuotaMinutes - voiceUsedMinutes);
  const renewMs = calendarRenewMs ?? parseDateMs(sub2?.renewAt);
  const activatedMs = parseDateMs(sub2?.activatedAt);
  const planDuration = planDurationMs(sub2?.plan);
  const fallbackStartMs = renewMs !== void 0 && planDuration > 0 ? renewMs - planDuration : void 0;
  const startMs = activatedMs ?? fallbackStartMs;
  const totalMs = startMs !== void 0 && renewMs !== void 0 ? Math.max(0, renewMs - startMs) : 0;
  const remainingMs = renewMs !== void 0 ? Math.max(0, renewMs - now) : 0;
  const timeProgressRatio = isUsageAllowancePlan ? quotaFillRatio(timeRemainingSeconds, timeAllowanceSeconds) : hasDisplayablePlan && totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const timeRemainingLabel = isUsageAllowancePlan ? timeRemainingSeconds > 0 ? formatUsageSeconds(timeRemainingSeconds) : "已到期" : formatDurationMs(renewMs === void 0 ? void 0 : renewMs - now);
  return {
    planLabel,
    hasDisplayablePlan,
    accessMode: isTimePlan ? "time" : "quota",
    isTimePlan,
    timeRemainingLabel,
    timeProgressRatio,
    screenshotRemaining,
    screenshotQuota: activeTimeAccess ? dailyImageLimit : screenshotQuota,
    screenshotUsed: activeTimeAccess ? 0 : screenshotUsed,
    voiceRemainingMinutes,
    voiceRemainingLabel: formatVoiceMinutes(voiceRemainingMinutes),
    voiceQuotaMinutes: activeTimeAccess ? dailyVoiceMinutes : voiceQuotaMinutes,
    voiceUsedMinutes: activeTimeAccess ? 0 : voiceUsedMinutes,
    renewDateLabel: isUsageAllowancePlan ? "按实际使用时长" : calendarRenewAt ? calendarRenewAt.slice(0, 10) : sub2?.renewAt ? sub2.renewAt.slice(0, 10) : "未设置",
    calendarActive,
    calendarRenewDateLabel: calendarRenewAt ? new Date(calendarRenewAt).toLocaleString() : null,
    calendarExpired: calendarRenewMs !== void 0 && calendarRenewMs <= now,
    hourRemainingLabel: formatUsageSeconds(timeRemainingSeconds)
  };
}
function quotaFillRatio(remaining, quota) {
  if (!Number.isFinite(remaining) || !Number.isFinite(quota) || quota <= 0) return 0;
  return Math.min(1, Math.max(0, remaining / quota));
}
function parseDateMs(value) {
  if (typeof value !== "string" || !value.trim()) return void 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : void 0;
}
function planDurationMs(plan) {
  if (!plan) return 0;
  if (plan === "trial") return 24 * 60 * 60 * 1e3;
  if (plan === "time-hour") return 60 * 60 * 1e3;
  if (plan === "time-day") return 24 * 60 * 60 * 1e3;
  if (plan === "time-week") return 7 * 24 * 60 * 60 * 1e3;
  if (plan === "time-month") return 30 * 24 * 60 * 60 * 1e3;
  if (plan === "time-two-month") return 60 * 24 * 60 * 60 * 1e3;
  return 0;
}
function formatDurationMs(durationMs) {
  if (durationMs === void 0) return "未设置";
  if (durationMs <= 0) return "已到期";
  const totalMinutes = Math.ceil(durationMs / 6e4);
  if (totalMinutes < 60) return `${totalMinutes}分钟`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return minutes > 0 ? `${totalHours}小时${minutes}分钟` : `${totalHours}小时`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
}
function formatUsageSeconds(seconds) {
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}小时${rest > 0 ? `${rest}分钟` : ""}` : `${minutes}分钟`;
}
function buildModeConversationItems(history, live, options) {
  const items = history.filter((message) => message.role === "user" || message.role === "assistant").map((message) => ({
    role: message.role,
    text: messagePartsToPlain(message.parts),
    images: messagePartsToImages(message.parts),
    live: false,
    queued: false,
    ts: message.ts
  })).filter((item) => item.text.length > 0 || item.images.length > 0);
  if (options?.latestTurnOnly) {
    const latestVisibleUser = [...items].reverse().find((item) => item.role === "user" && item.text.trim().length > 0);
    const streamText2 = live.streamText.trim();
    if (streamText2) {
      const liveAnswer = {
        role: "assistant",
        text: streamText2,
        images: [],
        live: true,
        queued: false,
        ts: LIVE_ASSISTANT_MESSAGE_TS
      };
      return latestVisibleUser ? [{ ...latestVisibleUser, images: [] }, liveAnswer] : [liveAnswer];
    }
    const latestAssistant = [...items].reverse().find((item) => item.role === "assistant" && item.text.trim().length > 0);
    if (!latestAssistant) return [];
    const matchingQuestion = [...items].reverse().find((item) => item.role === "user" && item.ts <= latestAssistant.ts && item.text.trim().length > 0);
    return matchingQuestion ? [{ ...matchingQuestion, images: [] }, { ...latestAssistant, images: [] }] : [{ ...latestAssistant, images: [] }];
  }
  const queuedScreenshots = options?.queuedScreenshots ?? [];
  if (queuedScreenshots.length > 0) {
    items.push({
      role: "user",
      text: `待发送 ${queuedScreenshots.length} 张截图`,
      images: [...queuedScreenshots],
      live: true,
      queued: true,
      ts: Date.now()
    });
  }
  const partial = live.listenPartial.trim();
  const recentUserTexts = [...items].reverse().filter((item) => item.role === "user").slice(0, 4).map((item) => item.text);
  if (partial && !isDuplicateVoicePartial(partial, recentUserTexts)) {
    items.push({ role: "user", text: partial, images: [], live: true, queued: false, ts: Date.now() });
  }
  const streamText = live.streamText.trim();
  if (streamText) {
    items.push({
      role: "assistant",
      text: streamText,
      images: [],
      live: true,
      queued: false,
      ts: LIVE_ASSISTANT_MESSAGE_TS
    });
  }
  return items;
}
function messagePartsToPlain(parts) {
  return parts.map(partToPlain).filter(Boolean).join("\n").trim();
}
function messagePartsToImages(parts) {
  return parts.filter((part) => part.type === "image" && typeof part.imageUrl === "string" && part.imageUrl.length > 0).map((part) => part.imageUrl);
}
function formatVoiceMinutes(minutes) {
  const m2 = Math.max(0, Math.floor(minutes));
  if (m2 >= 60) {
    const h2 = Math.floor(m2 / 60);
    const rest = m2 % 60;
    return rest > 0 ? `${h2}小时${rest}分钟` : `${h2}小时`;
  }
  return `${m2}分钟`;
}
function formatPlanLabel(plan) {
  if (!plan || plan === "none") return "未开通";
  if (plan === "trial") return "免费体验";
  if (plan === "plus-month" || plan === "juice-once" || plan === "refreshing") return "未开通";
  if (plan === "time-hour") return "1 小时版";
  if (plan === "time-day") return "1 天版";
  if (plan === "time-week") return "7 天版";
  if (plan === "time-month") return "1 个月版";
  if (plan === "time-two-month") return "2 个月版";
  if (plan === "admin") return "管理员";
  return plan;
}
function partToPlain(part) {
  if (part.type === "image") return "";
  if (part.type === "qa_results") {
    return part.qaResults?.map((item) => `${item.q}
${item.a}`).join("\n\n") ?? "";
  }
  return part.text ?? "";
}
function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
function partsToPlain(parts) {
  return parts.map((p2) => {
    if (p2.type === "image") return "[图片]";
    if (p2.type === "qa_results") {
      if (!p2.qaResults || p2.qaResults.length === 0) return "未检索到相关答案。";
      return p2.qaResults.map((r2, i) => `**[${r2.position}]**

**Q:** ${r2.q}

**A:** ${r2.a}`).join("\n\n---\n\n");
    }
    return p2.text ?? "";
  }).join("");
}
function fmtTs(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}
function extractCodeBlocks(text2) {
  if (!text2) return [];
  const out = [];
  const re2 = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g;
  let m2;
  while ((m2 = re2.exec(text2)) !== null) {
    out.push(m2[1].trim());
  }
  return out;
}
const ConversationThread = ({
  history,
  streamText,
  streaming,
  listenPartial,
  listening,
  listenStatus,
  error: error2
}) => {
  const ref = reactExports.useRef(null);
  const visibleListenPartial = reactExports.useMemo(() => {
    const partial = listenPartial.trim();
    if (!partial) return "";
    const recentUserTexts = [...history].reverse().filter((message) => message.role === "user").slice(0, 4).map((message) => partsToPlain(message.parts));
    return isDuplicateVoicePartial(partial, recentUserTexts) ? "" : partial;
  }, [history, listenPartial]);
  reactExports.useEffect(() => {
    const el2 = ref.current;
    if (el2) el2.scrollTop = el2.scrollHeight;
  }, [history.length, streamText, streaming, visibleListenPartial]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative z-10 flex-1 flex flex-col min-w-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-[0.2em] text-slate-400", children: "Interview Chat" }),
      streaming && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-blue-600 animate-pulse", children: "streaming..." })
    ] }),
    error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1 mb-2", children: error2 }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref, className: "flex-1 overflow-y-auto pr-1 space-y-3", children: [
      history.map((m2, i) => {
        const body = partsToPlain(m2.parts);
        const isUser = m2.role === "user";
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: `flex w-full ${isUser ? "justify-start" : "justify-end"}`,
            children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                className: `max-w-[min(100%,520px)] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${isUser ? "bg-slate-100 border border-slate-200 text-slate-900 text-left" : "bg-blue-50 border border-blue-100 text-slate-900 text-left"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-slate-400 mb-1", children: fmtTs(m2.ts) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownBody, { markdown: body })
                ]
              }
            )
          },
          `${m2.ts}-${m2.role}-${i}`
        );
      }),
      listening && visibleListenPartial && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex w-full justify-start", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-[min(100%,520px)] rounded-xl px-3 py-2 text-[13px] leading-relaxed bg-emerald-50 border border-emerald-200 text-slate-900 text-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "whitespace-pre-wrap font-sans text-[13px] italic", children: visibleListenPartial }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block w-2 h-4 bg-emerald-400/70 animate-pulse ml-1 align-middle" })
      ] }) }),
      streaming && streamText && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex w-full justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-[min(100%,520px)] rounded-xl px-3 py-2 text-[13px] bg-blue-50 border border-blue-100 text-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-blue-600 mb-1", children: "生成中" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "whitespace-pre-wrap font-sans text-[13px]", children: streamText }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block w-2 h-4 bg-blue-500/70 animate-pulse ml-1 align-middle" })
      ] }) }),
      streaming && !streamText && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-slate-500 text-sm animate-pulse pl-1", children: "思考中..." }),
      !streaming && history.length === 0 && !listening && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-500", children: "先从首页进入笔试模式或面试模式。使用 Ctrl+Q 一键截图并发送给 AI；面试模式使用 Ctrl+3 开关语音。" })
    ] })
  ] });
};
function buildCodeBlockSource(history, streaming, streamText) {
  const completed = history.filter((m2) => m2.role === "assistant").map((m2) => partsToPlain(m2.parts)).join("\n\n");
  if (streaming && streamText) return `${completed}

${streamText}`.trim();
  return completed;
}
const ResponsePanel = () => {
  const interviewChatVisible = useSession((s2) => s2.interviewChatVisible);
  const queueMode = useSession((s2) => s2.queueMode);
  const chatHistory = useSession((s2) => s2.chatHistory);
  const solverHistory = useSession((s2) => s2.solverHistory);
  const streamText = useSession((s2) => s2.streamText);
  const streaming = useSession((s2) => s2.streaming);
  const error2 = useSession((s2) => s2.lastError);
  const partial = useSession((s2) => s2.listenPartial);
  const listening = useSession((s2) => s2.listening);
  const listenStatus = useSession((s2) => s2.listenStatus);
  const history = queueMode === "solver" ? solverHistory : chatHistory;
  const codeBlockSource = reactExports.useMemo(
    () => buildCodeBlockSource(history, streaming, streamText),
    [history, streaming, streamText]
  );
  const codeBlocks = reactExports.useMemo(() => extractCodeBlocks(codeBlockSource), [codeBlockSource]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative h-full min-h-[520px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm no-drag flex gap-4", children: [
    interviewChatVisible && /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConversationThread,
      {
        history,
        streamText,
        streaming,
        listenPartial: partial,
        listening,
        listenStatus,
        error: error2
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `relative z-10 flex flex-col border-slate-200 pl-4 ${interviewChatVisible ? "hidden w-[40%] min-w-[260px] max-w-[440px] border-l lg:flex" : "flex min-w-0 flex-1 border-l"}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-2", children: "Questions & Notes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto space-y-2 pr-1", children: codeBlocks.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-slate-500 leading-relaxed", children: "当回答中包含代码块或高亮内容时，会在这里整理出来便于速读。" }) : codeBlocks.map((c2, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "pre",
            {
              className: "text-[11px] text-slate-100 bg-slate-950 border border-slate-800 rounded-lg p-2 overflow-x-auto",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: c2 })
            },
            i
          )) })
        ]
      }
    )
  ] });
};

export { ModeConversationBubble, BOTTOM_TOLERANCE, createAnswerAutoFollow, useAnswerAutoFollow, canEnterCheckoutStep, LIVE_ASSISTANT_MESSAGE_TS, DASHBOARD_NAV_ITEMS, DASHBOARD_PRIMARY_NAV_ITEMS, voicePartialDisplayKey, isDuplicateVoicePartial, getUserDisplayName, buildQuotaSummary, quotaFillRatio, parseDateMs, planDurationMs, formatDurationMs, formatUsageSeconds, buildModeConversationItems, messagePartsToPlain, messagePartsToImages, formatVoiceMinutes, formatPlanLabel, partToPlain, positiveNumber, partsToPlain, fmtTs, extractCodeBlocks, ConversationThread, buildCodeBlockSource, ResponsePanel };
