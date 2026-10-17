import { jsxRuntimeExports, reactExports, s$6, s$2, s$4, s$5, n$5 } from "../vendor/react-icons-state.mjs";
import { publicFetch, WEB_PORTAL_URL } from "../services/gateway.mjs";
import { useAuth } from "../stores/auth.mjs";

const WindowControls = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-9 items-center bg-transparent", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      "aria-label": "隐藏窗口",
      title: "隐藏窗口",
      onClick: () => void window.api.window.toggle(),
      className: "flex h-9 w-11 items-center justify-center text-slate-700 transition hover:bg-slate-100",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "13", height: "13", viewBox: "0 0 13 13", "aria-hidden": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2.5 6.5h8", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }) })
    }
  ),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      "aria-label": "最大化或还原窗口",
      title: "最大化 / 还原",
      onClick: () => void window.api.window.toggleMaximize(),
      className: "flex h-9 w-11 items-center justify-center text-slate-700 transition hover:bg-slate-100",
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "13", height: "13", viewBox: "0 0 13 13", "aria-hidden": true, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "4.1", y: "2.4", width: "6", height: "6", rx: "0.8", fill: "none", stroke: "currentColor", strokeWidth: "1.2" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2.5 4.5v6h6", fill: "none", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round", strokeLinejoin: "round" })
      ] })
    }
  ),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      "aria-label": "关闭客户端",
      title: "关闭客户端",
      onClick: () => void window.api.window.close(),
      className: "flex h-9 w-11 items-center justify-center text-slate-700 transition hover:bg-red-500 hover:text-white",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "13", height: "13", viewBox: "0 0 13 13", "aria-hidden": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m3.2 3.2 6.6 6.6M9.8 3.2 3.2 9.8", stroke: "currentColor", strokeWidth: "1.35", strokeLinecap: "round" }) })
    }
  )
] });
const climbIconUrl = "" + new URL("icon-CxNa5fSW.png", import.meta.url).href;
const inputClass = "mt-2 h-12 w-full rounded-[14px] border border-slate-200 bg-slate-50/90 px-4 text-[14px] text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-200/70 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
const textareaClass = "mt-2 w-full resize-none rounded-[14px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-[13px] leading-relaxed text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-200/70";
const primaryButtonClass = "h-12 w-full rounded-[14px] bg-[#24231F] px-4 text-[14px] font-semibold text-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.7)] transition hover:bg-black focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-white disabled:shadow-none";
const secondaryButtonClass = "h-11 w-full rounded-[14px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
const linkButtonClass = "rounded-md text-[13px] font-medium text-slate-500 underline-offset-4 transition hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400";
async function postPublicJson(path2, body) {
  const res = await publicFetch(path2, {
    method: "POST",
    body: JSON.stringify(body)
  });
  let data = {};
  let message;
  try {
    data = await res.json();
    if (typeof data.message === "string") message = data.message;
  } catch {
    const text2 = await res.text().catch(() => "");
    if (text2) message = text2.slice(0, 200);
  }
  return { ok: res.ok, status: res.status, data, message };
}
function extractPasswordResetToken(value) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url2 = new URL(raw);
    return url2.searchParams.get("token")?.trim() ?? raw;
  } catch {
    return raw;
  }
}
const TextField = ({ label, hint, className = "", ...inputProps }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] font-semibold text-slate-700", children: label }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("input", { ...inputProps, className: `${inputClass} ${className}` }),
  hint && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-2 block text-[12px] leading-5 text-slate-500", children: hint })
] });
function viewCopy(view) {
  switch (view) {
    case "register":
      return {
        title: "注册 Climb",
        description: "创建账号后验证邮箱，网页端和客户端会使用同一套订阅状态。"
      };
    case "forgot":
      return {
        title: "找回密码",
        description: "输入注册邮箱，我们会发送一封重置邮件。"
      };
    case "reset":
      return {
        title: "重置密码",
        description: "粘贴邮件中的链接或 token，然后设置新的登录密码。"
      };
    case "login":
    default:
      return {
        title: "欢迎回来",
        description: "使用邮箱和密码登录，开始使用 Climb。"
      };
  }
}
const LOGIN_PREVIEW_QUESTION = "事务的四大特性是什么?";
const LOGIN_PREVIEW_ANSWER_SECTIONS = [
  {
    title: "1. 原子性（Atomicity）",
    body: "事务中的操作要么全部完成，要么全部回滚，不会停留在部分成功的状态。"
  },
  {
    title: "2. 一致性（Consistency）",
    body: "事务执行前后，数据库都必须满足完整性约束，从一个正确状态转换到另一个正确状态。"
  },
  {
    title: "3. 隔离性（Isolation）",
    body: "并发事务互不干扰，一个事务的中间状态对其他事务不可见。"
  },
  {
    title: "4. 持久性（Durability）",
    body: "事务一旦提交，结果就会被持久保存，即使系统故障也不会丢失。"
  }
];
const LOGIN_PREVIEW_FINAL_STEP = LOGIN_PREVIEW_ANSWER_SECTIONS.length + 2;
function getLoginPreviewState(timelineStep) {
  const step = Math.max(0, Math.min(timelineStep, LOGIN_PREVIEW_FINAL_STEP));
  const visibleAnswerCount = Math.max(0, Math.min(step - 2, LOGIN_PREVIEW_ANSWER_SECTIONS.length));
  if (step === 0) return { phase: "listening", visibleAnswerCount };
  if (step === 1) return { phase: "captured", visibleAnswerCount };
  if (step === 2) return { phase: "thinking", visibleAnswerCount };
  if (step >= LOGIN_PREVIEW_FINAL_STEP) return { phase: "complete", visibleAnswerCount };
  return { phase: "answering", visibleAnswerCount };
}
function getLoginPreviewInitialStep(hasPlayed, prefersReducedMotion) {
  return hasPlayed || prefersReducedMotion ? LOGIN_PREVIEW_FINAL_STEP : 0;
}
function hasLoginPreviewPlayed() {
  return typeof window !== "undefined" && Boolean(window.__climbLoginPreviewPlayed);
}
function markLoginPreviewPlayed() {
  if (typeof window !== "undefined") {
    window.__climbLoginPreviewPlayed = true;
  }
}
function readsReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const LOGIN_PREVIEW_DELAYS = [520, 900, 860, 620, 620, 620];
const LoginProductPreview = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = reactExports.useState(readsReducedMotion);
  const [timelineStep, setTimelineStep] = reactExports.useState(() => getLoginPreviewInitialStep(hasLoginPreviewPlayed(), readsReducedMotion()));
  const { phase, visibleAnswerCount } = getLoginPreviewState(timelineStep);
  const statusLabel = {
    listening: "正在监听",
    captured: "已捕获问题",
    thinking: "正在分析",
    answering: "正在生成回答",
    complete: "回答完成"
  }[phase];
  reactExports.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);
  reactExports.useEffect(() => {
    markLoginPreviewPlayed();
    if (prefersReducedMotion) {
      setTimelineStep(LOGIN_PREVIEW_FINAL_STEP);
      return;
    }
    if (timelineStep >= LOGIN_PREVIEW_FINAL_STEP) return;
    const timer2 = window.setTimeout(() => {
      setTimelineStep((current) => Math.min(current + 1, LOGIN_PREVIEW_FINAL_STEP));
    }, LOGIN_PREVIEW_DELAYS[timelineStep] ?? 620);
    return () => window.clearTimeout(timer2);
  }, [prefersReducedMotion, timelineStep]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "aside",
    {
      "data-login-product-preview": true,
      "data-login-demo-surface": true,
      "data-login-demo-phase": phase,
      "data-login-demo-step": timelineStep,
      "data-login-demo-motion": prefersReducedMotion ? "reduced" : "full",
      "aria-label": "Climb 产品场景预览",
      className: "relative hidden min-h-0 overflow-hidden border border-white/70 lg:m-3 lg:block lg:rounded-[18px]",
      style: {
        backgroundColor: "#d9e3df",
        contain: "paint"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
      @keyframes climb-login-preview-enter {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      [data-login-product-preview] .login-preview-enter {
        animation: climb-login-preview-enter 360ms cubic-bezier(.22,.8,.3,1) both;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-login-product-preview] .login-preview-enter { animation: none; }
      }
    ` }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            "aria-hidden": "true",
            className: "pointer-events-none absolute inset-0",
            style: {
              backgroundImage: [
                "radial-gradient(circle at 13% 11%, rgba(225, 238, 245, 0.95) 0, rgba(225, 238, 245, 0) 33%)",
                "radial-gradient(circle at 88% 16%, rgba(226, 214, 170, 0.78) 0, rgba(226, 214, 170, 0) 31%)",
                "radial-gradient(circle at 25% 88%, rgba(141, 181, 169, 0.72) 0, rgba(141, 181, 169, 0) 38%)",
                "linear-gradient(145deg, #c9dfe3 0%, #d9d9bf 46%, #b8c8a7 100%)"
              ].join(","),
              backgroundPosition: "center",
              backgroundSize: "cover"
            }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative flex h-full min-h-[430px] items-center justify-center px-4 py-4 xl:px-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-[610px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex h-11 w-fit max-w-full items-center gap-3 rounded-full border border-white/80 bg-white/[.88] px-3 text-[12px] text-slate-700 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.58)]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-white/65 px-3 py-1.5 tabular-nums text-slate-500", children: "08 min" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(s$6, { size: 14, weight: "bold", "aria-hidden": "true" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[15px] font-semibold text-slate-900", children: "Climb" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden whitespace-nowrap text-slate-500 xl:inline", "aria-live": "polite", children: statusLabel }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#24231F] text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx(s$2, { size: 13, weight: "fill", "aria-hidden": "true" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "grid grid-cols-2 gap-0.5 text-slate-400", "aria-hidden": "true", children: Array.from({ length: 6 }).map((_, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "h-0.5 w-0.5 rounded-full bg-current" }, index2)) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-2 overflow-hidden rounded-[20px] border border-white/80 bg-white/[.84] shadow-[0_24px_70px_-36px_rgba(15,23,42,0.62)]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-10 items-center justify-between border-b border-slate-900/10 px-4 text-[12px] text-slate-500", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "实时回答" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `inline-flex items-center gap-1 ${phase === "complete" ? "text-emerald-700" : "text-slate-500"}`, "aria-live": "polite", children: [
                phase === "thinking" || phase === "answering" ? /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { size: 14, className: "animate-spin", "aria-hidden": "true" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(s$5, { size: 14, weight: phase === "complete" ? "fill" : "regular", "aria-hidden": "true" }),
                statusLabel
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                role: "log",
                "aria-label": "Climb 登录页动态回答",
                "aria-live": "polite",
                className: "h-[360px] overflow-y-auto px-4 py-3 xl:px-5",
                children: [
                  phase === "listening" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-login-demo-listening": true, className: "flex h-[336px] items-center justify-center text-[12px] text-slate-500", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mr-2 h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400", "aria-hidden": "true" }),
                    "正在监听面试问题…"
                  ] }),
                  phase !== "listening" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-login-demo-question": true, className: "login-preview-enter w-fit max-w-[82%] rounded-[13px] border border-white/90 bg-white/60 px-3.5 py-2 text-[12px] leading-5 text-slate-700 shadow-sm", children: LOGIN_PREVIEW_QUESTION }),
                  phase === "thinking" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-login-demo-thinking": true, className: "login-preview-enter ml-auto mt-3 flex w-[94%] items-center gap-2 px-3 text-[12px] text-slate-500", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { size: 14, className: "animate-spin", "aria-hidden": "true" }),
                    "正在梳理事务特性与作用…"
                  ] }),
                  visibleAnswerCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-login-demo-answer": true, "data-answer-count": visibleAnswerCount, className: "ml-auto mt-2.5 w-[94%] rounded-[15px] border border-slate-900/5 bg-white/50 px-4 py-2.5 text-[11px] leading-[1.55] text-slate-700", children: LOGIN_PREVIEW_ANSWER_SECTIONS.slice(0, visibleAnswerCount).map((section, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: index2 === visibleAnswerCount - 1 ? "login-preview-enter" : void 0, children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: index2 === 0 ? "font-semibold text-slate-900" : "mt-2 font-semibold text-slate-900", children: section.title }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: section.body })
                  ] }, section.title)) })
                ]
              }
            )
          ] })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute bottom-5 left-5 hidden w-[190px] rounded-[16px] border border-white/80 bg-white/[.86] p-3 text-[10px] text-slate-600 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.6)] xl:block", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 font-semibold text-slate-800", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(n$5, { size: 13, "aria-hidden": "true" }),
            "快捷键"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "回答问题" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-md border border-white bg-white/60 px-1.5 py-0.5", children: "Ctrl A" })
          ] })
        ] })
      ]
    }
  );
};
const LoginCard = () => {
  const login = useAuth((s2) => s2.login);
  const loggingIn = useAuth((s2) => s2.loggingIn);
  const lastError = useAuth((s2) => s2.lastError);
  const needsVerification = useAuth((s2) => s2.needsVerification);
  const resendVerification = useAuth((s2) => s2.resendVerification);
  const resendCooldown = useAuth((s2) => s2.resendCooldown);
  const resendMessage = useAuth((s2) => s2.resendMessage);
  const [view, setView] = reactExports.useState("login");
  const [email, setEmail] = reactExports.useState("");
  const [password, setPassword] = reactExports.useState("");
  const [registerEmail, setRegisterEmail] = reactExports.useState("");
  const [registerPassword, setRegisterPassword] = reactExports.useState("");
  const [registerConfirm, setRegisterConfirm] = reactExports.useState("");
  const [registerError, setRegisterError] = reactExports.useState("");
  const [registerLoading, setRegisterLoading] = reactExports.useState(false);
  const [registeredEmail, setRegisteredEmail] = reactExports.useState("");
  const [autoVerified, setAutoVerified] = reactExports.useState(false);
  const [forgotEmail, setForgotEmail] = reactExports.useState("");
  const [forgotError, setForgotError] = reactExports.useState("");
  const [forgotLoading, setForgotLoading] = reactExports.useState(false);
  const [forgotDone, setForgotDone] = reactExports.useState(false);
  const [forgotCooldown, setForgotCooldown] = reactExports.useState(0);
  const [resetToken, setResetToken] = reactExports.useState("");
  const [resetPassword, setResetPassword] = reactExports.useState("");
  const [resetConfirm, setResetConfirm] = reactExports.useState("");
  const [resetError, setResetError] = reactExports.useState("");
  const [resetLoading, setResetLoading] = reactExports.useState(false);
  const [resetDone, setResetDone] = reactExports.useState(false);
  const onSubmit = async (e2) => {
    e2.preventDefault();
    try {
      await login(email.trim(), password);
    } catch {
    }
  };
  const showLogin = () => {
    setView("login");
    setRegisterError("");
    setForgotError("");
    setResetError("");
  };
  const onRegister = async (e2) => {
    e2.preventDefault();
    setRegisterError("");
    if (registerPassword !== registerConfirm) {
      setRegisterError("两次输入的密码不一致");
      return;
    }
    if (registerPassword.length < 8) {
      setRegisterError("密码至少 8 位");
      return;
    }
    setRegisterLoading(true);
    try {
      const res = await postPublicJson(
        "/v1/auth/register",
        { email: registerEmail.trim(), password: registerPassword }
      );
      const status = res.data.status;
      if (status === "auto_verified") {
        setAutoVerified(true);
        setRegisteredEmail(res.data.email ?? registerEmail.trim());
        return;
      }
      if (!res.ok || status !== "verification_sent") {
        setRegisterError(res.message ?? `注册失败 (${res.status})`);
        return;
      }
      setAutoVerified(false);
      setRegisteredEmail(res.data.email ?? registerEmail.trim());
    } catch {
      setRegisterError("网络错误，请确认 API 已启动");
    } finally {
      setRegisterLoading(false);
    }
  };
  const onForgotPassword = async (e2) => {
    e2.preventDefault();
    setForgotError("");
    setForgotLoading(true);
    try {
      const res = await postPublicJson(
        "/v1/auth/forgot-password",
        { email: forgotEmail.trim() }
      );
      if (res.status === 429 && typeof res.data.cooldownSec === "number") {
        setForgotCooldown(res.data.cooldownSec);
        tickLocalCooldown(res.data.cooldownSec, setForgotCooldown);
        setForgotError("请求过于频繁，请稍后再试");
        return;
      }
      if (!res.ok && res.status !== 202) {
        setForgotError(res.message ?? `请求失败 (${res.status})`);
        return;
      }
      setForgotDone(true);
    } catch {
      setForgotError("网络错误，请确认 API 已启动");
    } finally {
      setForgotLoading(false);
    }
  };
  const onResetPassword = async (e2) => {
    e2.preventDefault();
    setResetError("");
    const token = extractPasswordResetToken(resetToken);
    if (!token) {
      setResetError("请粘贴邮件中的重置链接或 token");
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError("两次输入的密码不一致");
      return;
    }
    if (resetPassword.length < 8) {
      setResetError("密码至少 8 位");
      return;
    }
    setResetLoading(true);
    try {
      const res = await postPublicJson(
        "/v1/auth/reset-password",
        { token, password: resetPassword }
      );
      if (!res.ok) {
        setResetError(res.message ?? "重置失败");
        return;
      }
      setResetDone(true);
      setPassword("");
    } catch {
      setResetError("网络错误，请确认 API 已启动");
    } finally {
      setResetLoading(false);
    }
  };
  const showError = lastError && !needsVerification;
  const copy = viewCopy(view);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-login-shell": true,
      className: "drag relative flex h-full w-full flex-col overflow-hidden rounded-[18px] bg-white text-slate-950",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex h-11 shrink-0 items-center justify-between border-b border-slate-100 bg-white", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 pl-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: climbIconUrl, alt: "", draggable: false, className: "h-6 w-6 rounded-lg object-contain" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] font-semibold text-slate-900", children: "Climb" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "no-drag", children: /* @__PURE__ */ jsxRuntimeExports.jsx(WindowControls, {}) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "no-drag grid min-h-0 flex-1 grid-cols-1 gap-0 bg-white p-0 lg:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.18fr)]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "section",
            {
              "data-login-auth-pane": true,
              "aria-labelledby": "login-view-title",
              className: "min-h-0 overflow-y-auto px-5 py-6 sm:px-9 lg:px-10 xl:px-12",
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex min-h-full w-full max-w-[480px] flex-col justify-center py-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] font-semibold tracking-[0.12em] text-slate-400", children: "CLIMB DESKTOP" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "login-view-title", className: "mt-3 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-slate-950", children: copy.title }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[14px] leading-6 text-slate-500", children: copy.description })
                ] }),
                view === "login" && /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { "aria-label": "邮箱密码登录", onSubmit, className: "mt-7 space-y-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TextField,
                    {
                      label: "邮箱",
                      type: "email",
                      required: true,
                      autoComplete: "email",
                      value: email,
                      onChange: (e2) => setEmail(e2.target.value),
                      placeholder: "邮箱"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TextField,
                    {
                      label: "密码",
                      type: "password",
                      required: true,
                      autoComplete: "current-password",
                      value: password,
                      onChange: (e2) => setPassword(e2.target.value),
                      placeholder: "密码"
                    }
                  ),
                  showError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] leading-5 text-red-700", role: "alert", children: lastError }),
                  needsVerification && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-[10px] border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] leading-5 text-amber-800", role: "alert", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                      "邮箱 ",
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: needsVerification }),
                      " 尚未验证，请先在邮箱中点击确认链接。"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center justify-between gap-3", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          onClick: () => void resendVerification(needsVerification),
                          disabled: resendCooldown > 0,
                          className: "rounded-[8px] border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60",
                          children: resendCooldown > 0 ? `重发（${resendCooldown}s）` : "重发验证邮件"
                        }
                      ),
                      resendMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] text-amber-700", children: resendMessage })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", disabled: loggingIn, className: primaryButtonClass, children: loggingIn ? "登录中..." : "登录" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between pt-1", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setView("register"), className: linkButtonClass, children: "注册账号" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setView("forgot"), className: linkButtonClass, children: "找回密码" })
                  ] })
                ] }),
                view === "register" && /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: (e2) => void onRegister(e2), className: "mt-6 space-y-4", children: registeredEmail ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 text-center", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-[18px] font-semibold text-blue-700 ring-1 ring-blue-200", children: autoVerified ? "✓" : "✉" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[17px] font-semibold text-slate-950", children: autoVerified ? "注册成功" : "验证邮件已发送" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-[13px] leading-6 text-slate-600", children: [
                      autoVerified ? "账号已激活，可以直接返回登录。" : "请前往邮箱点击确认链接，验证后即可使用密码登录。",
                      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-blue-700", children: registeredEmail })
                    ] })
                  ] }),
                  !autoVerified && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => void resendVerification(registeredEmail),
                      disabled: resendCooldown > 0,
                      className: secondaryButtonClass,
                      children: resendCooldown > 0 ? `重发（${resendCooldown}s）` : "重发验证邮件"
                    }
                  ),
                  resendMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-slate-500", children: resendMessage }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: showLogin, className: primaryButtonClass, children: "返回登录" })
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TextField,
                    {
                      label: "邮箱",
                      type: "email",
                      required: true,
                      autoComplete: "email",
                      value: registerEmail,
                      onChange: (e2) => setRegisterEmail(e2.target.value),
                      placeholder: "邮箱"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TextField,
                    {
                      label: "密码",
                      type: "password",
                      required: true,
                      autoComplete: "new-password",
                      value: registerPassword,
                      onChange: (e2) => setRegisterPassword(e2.target.value),
                      placeholder: "密码（至少 8 位）",
                      hint: "建议使用 8 位以上、包含字母和数字的密码。"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TextField,
                    {
                      label: "确认密码",
                      type: "password",
                      required: true,
                      autoComplete: "new-password",
                      value: registerConfirm,
                      onChange: (e2) => setRegisterConfirm(e2.target.value),
                      placeholder: "确认密码"
                    }
                  ),
                  registerError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] leading-5 text-red-700", role: "alert", children: registerError }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", disabled: registerLoading, className: primaryButtonClass, children: registerLoading ? "提交中..." : "注册账号" })
                ] }) }),
                view === "forgot" && /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: (e2) => void onForgotPassword(e2), className: "mt-6 space-y-4", children: forgotDone ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-[10px] border border-blue-200 bg-blue-50 px-3.5 py-3 text-[13px] leading-6 text-blue-800", children: "若该邮箱已注册，你会收到一封重置密码邮件。你可以复制邮件中的重置链接，在客户端内继续设置新密码。" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setView("reset"), className: primaryButtonClass, children: "已收到邮件，重置密码" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: showLogin, className: secondaryButtonClass, children: "返回登录" })
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TextField,
                    {
                      label: "邮箱",
                      type: "email",
                      required: true,
                      value: forgotEmail,
                      onChange: (e2) => setForgotEmail(e2.target.value),
                      disabled: forgotCooldown > 0,
                      placeholder: "邮箱"
                    }
                  ),
                  forgotError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] leading-5 text-red-700", role: "alert", children: forgotError }),
                  forgotCooldown > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[13px] text-amber-700", children: [
                    "请等待 ",
                    forgotCooldown,
                    " 秒后可重试"
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", disabled: forgotLoading || forgotCooldown > 0, className: primaryButtonClass, children: forgotLoading ? "发送中..." : "发送重置邮件" })
                ] }) }),
                view === "reset" && /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: (e2) => void onResetPassword(e2), className: "mt-6 space-y-4", children: resetDone ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 text-center", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-[18px] font-semibold text-emerald-700 ring-1 ring-emerald-200", children: "✓" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[17px] font-semibold text-slate-950", children: "密码已更新" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[13px] text-slate-600", children: "请使用新密码登录。" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: showLogin, className: primaryButtonClass, children: "返回登录" })
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] font-semibold text-slate-700", children: "重置链接或 token" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "textarea",
                      {
                        required: true,
                        value: resetToken,
                        onChange: (e2) => setResetToken(e2.target.value),
                        rows: 3,
                        className: textareaClass,
                        placeholder: "粘贴邮件中的重置链接或 token"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TextField,
                    {
                      label: "新密码",
                      type: "password",
                      required: true,
                      autoComplete: "new-password",
                      value: resetPassword,
                      onChange: (e2) => setResetPassword(e2.target.value),
                      placeholder: "新密码（至少 8 位）"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TextField,
                    {
                      label: "确认新密码",
                      type: "password",
                      required: true,
                      autoComplete: "new-password",
                      value: resetConfirm,
                      onChange: (e2) => setResetConfirm(e2.target.value),
                      placeholder: "确认新密码"
                    }
                  ),
                  resetError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] leading-5 text-red-700", role: "alert", children: resetError }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", disabled: resetLoading, className: primaryButtonClass, children: resetLoading ? "提交中..." : "重置密码" })
                ] }) }),
                view !== "login" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex items-center justify-center gap-4 border-t border-slate-200 pt-4 text-[13px] text-slate-500", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: showLogin, className: linkButtonClass, children: "返回登录" }),
                  view !== "reset" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-3 w-px bg-slate-300" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setView("reset"), className: linkButtonClass, children: "输入重置链接" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-6 border-t border-slate-100 pt-4 text-[12px] leading-5 text-slate-400", children: "使用与网页端相同账号登录，订阅状态会自动同步到桌面端。" })
              ] })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(LoginProductPreview, {})
        ] })
      ]
    }
  );
};
function tickLocalCooldown(seconds, setValue) {
  let left = seconds;
  const int = window.setInterval(() => {
    left -= 1;
    setValue(Math.max(0, left));
    if (left <= 0) window.clearInterval(int);
  }, 1e3);
}
const Paywall = ({ onBack }) => {
  const email = useAuth((s2) => s2.email);
  const sub2 = useAuth((s2) => s2.subscription);
  const refreshStatus = useAuth((s2) => s2.refreshStatus);
  const logout = useAuth((s2) => s2.logout);
  const [checking, setChecking] = reactExports.useState(false);
  const onRevalidate = async () => {
    setChecking(true);
    try {
      await refreshStatus(true);
    } finally {
      setChecking(false);
    }
  };
  const subscribeUrl = `${WEB_PORTAL_URL}/subscribe`;
  const portalUrl = sub2?.portalUrl ?? subscribeUrl;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full w-full items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50 p-8 text-slate-950 no-drag", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-[0_22px_70px_-44px_rgba(15,23,42,0.7)]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CardIcon$1, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-5 text-[24px] font-semibold text-slate-950", children: sub2?.active === false && sub2?.plan ? "订阅已过期" : "你尚未订阅 Climb" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[14px] leading-relaxed text-slate-500", children: sub2?.message ?? "AI 功能仅对有效订阅账号开放。请前往官网续费或激活订阅。" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[13px] leading-relaxed text-slate-500", children: "面试和笔试入口会在有可用额度后恢复，其他设置、知识库和账户操作仍可继续使用。" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-[13px]", children: [
      email && /* @__PURE__ */ jsxRuntimeExports.jsx(InfoLine, { label: "账号", value: email }),
      sub2?.plan && /* @__PURE__ */ jsxRuntimeExports.jsx(InfoLine, { label: "计划", value: sub2.plan }),
      sub2?.renewAt && /* @__PURE__ */ jsxRuntimeExports.jsx(InfoLine, { label: "到期", value: sub2.renewAt.slice(0, 10) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: () => void window.api.auth.openPortal(subscribeUrl),
        className: "mt-6 h-11 w-full rounded-xl bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700",
        children: "前往官网订阅 / 续费"
      }
    ),
    onBack && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: onBack,
        className: "mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-950",
        children: "返回工作台"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex items-center justify-between text-[13px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onRevalidate,
          disabled: checking,
          className: "text-blue-700 hover:underline disabled:opacity-60",
          children: checking ? "校验中..." : "我已续费，重新校验"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => void logout(),
          className: "text-slate-500 hover:text-slate-900",
          children: "退出登录"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        className: "mt-4 max-w-full truncate text-[11px] text-slate-400 hover:text-blue-700",
        onClick: () => void window.api.auth.openPortal(portalUrl),
        children: portalUrl
      }
    )
  ] }) });
};
const InfoLine = ({ label, value }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-4 py-1", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-500", children: label }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 truncate font-medium text-slate-900", children: value })
] });
const CardIcon$1 = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 10h18" })
] });

export { WindowControls, climbIconUrl, inputClass, textareaClass, primaryButtonClass, secondaryButtonClass, linkButtonClass, postPublicJson, extractPasswordResetToken, TextField, viewCopy, LOGIN_PREVIEW_QUESTION, LOGIN_PREVIEW_ANSWER_SECTIONS, LOGIN_PREVIEW_FINAL_STEP, getLoginPreviewState, getLoginPreviewInitialStep, hasLoginPreviewPlayed, markLoginPreviewPlayed, readsReducedMotion, LOGIN_PREVIEW_DELAYS, LoginProductPreview, LoginCard, tickLocalCooldown, Paywall, InfoLine, CardIcon$1 };
