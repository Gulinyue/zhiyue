// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.
import { getAcceleratorsForAction } from "../stores/session.mjs";
import { React, jsxRuntimeExports } from "../vendor/react-icons-state.mjs";
import { DEFAULT_HOTKEYS, useSettings, isStealthToggleAllowed, MIN_WINDOW_OPACITY } from "../stores/settings.mjs";
import { KeyCombo } from "../components/key-combo.mjs";
import { useAuth } from "../stores/auth.mjs";

const MODIFIER_KEYS = /* @__PURE__ */ new Set(["Control", "Shift", "Alt", "Meta"]);
function mapMainKey(key) {
  if (key === " " || key === "Spacebar") return "Space";
  if (key === "ArrowUp") return "Up";
  if (key === "ArrowDown") return "Down";
  if (key === "ArrowLeft") return "Left";
  if (key === "ArrowRight") return "Right";
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  if (key.length === 1) return key.toUpperCase();
  return key;
}
function buildComboFromEvent(e2) {
  if (!e2.key || MODIFIER_KEYS.has(e2.key)) return null;
  const parts = [];
  if (e2.ctrlKey) parts.push("Ctrl");
  if (e2.shiftKey) parts.push("Shift");
  if (e2.altKey) parts.push("Alt");
  if (e2.metaKey) parts.push("Super");
  parts.push(mapMainKey(e2.key));
  return parts.join("+");
}
const MODIFIER_TOKENS = /* @__PURE__ */ new Set(["ctrl", "control", "shift", "alt", "super", "win", "meta", "cmd"]);
function validateCombo(combo) {
  const tokens = combo.split("+").map((t2) => t2.trim()).filter(Boolean);
  if (tokens.length === 0) return { ok: false, reason: "empty" };
  const hasMainKey = tokens.some((t2) => !MODIFIER_TOKENS.has(t2.toLowerCase()));
  if (!hasMainKey) return { ok: false, reason: "needsMainKey" };
  return { ok: true };
}
function isUnmodifiedCombo(combo) {
  const tokens = combo.split("+").map((t2) => t2.trim()).filter(Boolean);
  return tokens.length > 0 && tokens.some((t2) => !MODIFIER_TOKENS.has(t2.toLowerCase())) && tokens.every((t2) => !MODIFIER_TOKENS.has(t2.toLowerCase()));
}
function canonicalizeCombo(combo) {
  return combo.split("+").map((t2) => t2.trim().toLowerCase()).filter(Boolean).sort().join("+");
}
function findConflict(combo, allHotkeys, selfAction) {
  const target = expandedAcceleratorSet(selfAction, combo);
  if (target.size === 0) return null;
  for (const [action, value] of Object.entries(allHotkeys)) {
    if (action === selfAction) continue;
    if (!value) continue;
    const occupied = expandedAcceleratorSet(action, value);
    if ([...target].some((accelerator) => occupied.has(accelerator))) return action;
  }
  return null;
}
function expandedAcceleratorSet(action, combo) {
  if (!combo.trim()) return /* @__PURE__ */ new Set();
  return new Set(
    getAcceleratorsForAction(action, combo).map(canonicalizeCombo).filter(Boolean)
  );
}
function applyCapturing(v2) {
  try {
    void window.api?.hotkey?.setCapturing?.(v2);
  } catch {
  }
}
const HotkeyCaptureField = ({
  action,
  combo,
  allHotkeys,
  actionLabels,
  allowDisable = false,
  onChange
}) => {
  const [recording, setRecording] = React.useState(false);
  const [error2, setError] = React.useState(null);
  const btnRef = React.useRef(null);
  const stop = React.useCallback(() => {
    setRecording(false);
    applyCapturing(false);
  }, []);
  React.useEffect(() => () => applyCapturing(false), []);
  const start = () => {
    setError(null);
    setRecording(true);
    applyCapturing(true);
    requestAnimationFrame(() => btnRef.current?.focus());
  };
  const handleKeyDown = (e2) => {
    if (!recording) return;
    e2.preventDefault();
    e2.stopPropagation();
    if (e2.key === "Escape") {
      setError(null);
      stop();
      return;
    }
    const next = buildComboFromEvent(e2);
    if (!next) return;
    const valid2 = validateCombo(next);
    if (!valid2.ok) {
      setError("请按下一个主键，不能只使用 Ctrl / Shift / Alt / Win");
      return;
    }
    const conflict = findConflict(next, allHotkeys, action);
    if (conflict) {
      const name2 = actionLabels[conflict] ?? conflict;
      setError(`与「${name2}」冲突，请换一个组合键`);
      return;
    }
    setError(null);
    onChange(next);
    stop();
  };
  const resetDefault = () => {
    setError(null);
    onChange(DEFAULT_HOTKEYS[action]);
  };
  const isDefault = combo === DEFAULT_HOTKEYS[action];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          ref: btnRef,
          type: "button",
          onClick: () => recording ? stop() : start(),
          onKeyDown: handleKeyDown,
          onBlur: () => recording && stop(),
          title: "点击后按下新的组合键，Esc 取消",
          className: `flex h-9 min-w-[150px] items-center justify-center rounded-lg border px-3 text-[13px] outline-none transition ${recording ? "border-blue-400 bg-blue-50 text-blue-600 ring-2 ring-blue-100" : "border-slate-200 bg-white text-slate-800 hover:border-blue-300"}`,
          children: recording ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] text-blue-500", children: "按下组合键…（Esc 取消）" }) : combo ? /* @__PURE__ */ jsxRuntimeExports.jsx(KeyCombo, { combo }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] text-slate-400", children: "未设置" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: resetDefault,
          disabled: isDefault,
          className: "h-9 shrink-0 rounded-lg px-2 text-[12px] text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40",
          title: `恢复默认（${DEFAULT_HOTKEYS[action]}）`,
          children: "恢复默认"
        }
      ),
      allowDisable ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => {
            setError(null);
            onChange("");
            stop();
          },
          disabled: !combo,
          className: "h-9 shrink-0 rounded-lg px-2 text-[12px] text-slate-400 transition hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40",
          title: "关闭此快捷键",
          children: "关闭"
        }
      ) : null
    ] }),
    combo && isUnmodifiedCombo(combo) ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-amber-600", children: "单键仅在对应任务运行时全局生效，退出任务后会立即释放。" }) : null,
    error2 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-rose-500", children: error2 }) : null
  ] });
};
const HOTKEY_LABELS = [
  { id: "screenshot:capture", label: "截图并发送给 AI", hint: "笔试/面试模式内一键截图并提交" },
  { id: "screenshot:captureScrolling", label: "滚动多图截图并发送", hint: "主动向下滚动，最多 4 张按顺序一次发送；无新内容时停止，Esc 可取消", allowDisable: true },
  { id: "screenshot:popLast", label: "删除最后一张截图", hint: "清理输入队列" },
  { id: "listen:toggle", label: "语音开关", hint: "面试模式内暂停/继续系统音频监听" },
  {
    id: "interview:clearContext",
    label: "清空面试上下文",
    hint: "保留当前面试与监听状态，仅让下一次回答从空上下文重新开始",
    allowDisable: true
  },
  { id: "window:toggleMouseThrough", label: "穿透模式", hint: "窗口半透明且不可点击" },
  { id: "exam:exit", label: "退出笔试", hint: "笔试模式内退出并停止计时" },
  { id: "window:toggle", label: "显示/隐藏窗口", hint: "隐藏后可用快捷键、再次打开 Climb 或未隐藏的托盘图标重新显示" },
  { id: "session:reset", label: "结束当前任务", hint: "退出笔试或面试并清理全部任务状态" },
  { id: "window:moveUp", label: "上移窗口", hint: "穿透模式中移动窗口" },
  { id: "window:moveDown", label: "下移窗口", hint: "穿透模式中移动窗口" },
  { id: "window:moveLeft", label: "左移窗口", hint: "穿透模式中移动窗口" },
  { id: "window:moveRight", label: "右移窗口", hint: "穿透模式中移动窗口" },
  {
    id: "answer:scrollUp",
    label: "答案内容向上滚动",
    hint: "每次约 20% 可视高度；仅在任务运行且开启穿透模式时生效，不会聚焦 Climb",
    allowDisable: true
  },
  {
    id: "answer:scrollDown",
    label: "答案内容向下滚动",
    hint: "向下翻到末尾后恢复跟随新生成的回答",
    allowDisable: true
  },
  {
    id: "mobile:scrollUp",
    label: "手机结果页上滑",
    hint: "仅在手机已配对、结果页位于前台且任务运行时生效",
    allowDisable: true
  },
  {
    id: "mobile:scrollDown",
    label: "手机结果页下滑",
    hint: "每次滚动约四分之三屏；长按会自动合并和限频",
    allowDisable: true
  }
];
const HOTKEY_LABEL_MAP = Object.fromEntries(
  HOTKEY_LABELS.map((item) => [item.id, item.label])
);
const SettingsPanel = () => {
  const { settings, patch: patch2 } = useSettings();
  const email = useAuth((s2) => s2.email);
  const canToggleStealth = isStealthToggleAllowed(email);
  const [opacityDraft, setOpacityDraft] = React.useState(null);
  const opacityPct = opacityDraft ?? Math.round(settings.opacity * 100);
  const [mouseThroughOpacityDraft, setMouseThroughOpacityDraft] = React.useState(null);
  const mouseThroughOpacityPct = mouseThroughOpacityDraft ?? Math.round(settings.mouseThroughOpacity * 100);
  const commitMouseThroughOpacity = (value) => {
    const opacity = Number(value) / 100;
    setMouseThroughOpacityDraft(null);
    if (opacity !== settings.mouseThroughOpacity) void patch2({ mouseThroughOpacity: opacity });
  };
  const updateHotkey = (id2, value) => {
    void patch2({ hotkeys: { ...settings.hotkeys, [id2]: value } });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-[900px] space-y-5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[20px] font-semibold text-slate-950", children: "设置" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[13px] text-slate-500", children: "快捷键与模式窗口" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[16px] font-semibold text-slate-950", children: "托盘图标" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "mt-4 flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-medium text-slate-900", children: "隐藏托盘图标" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[12px] leading-relaxed text-slate-500", children: "默认关闭。开启后，Windows 系统托盘及“显示隐藏的图标”中不再显示 Climb；macOS 会移除菜单栏图标。 立即生效，只能按 Ctrl+E 进行隐藏与显现。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            "aria-label": "隐藏托盘图标",
            checked: settings.hideTrayIcon,
            onChange: (e2) => void patch2({ hideTrayIcon: e2.target.checked })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[16px] font-semibold text-slate-950", children: "快捷键设置" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "mt-4 flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-medium text-slate-900", children: "左键双击截图（3 秒内）" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[12px] leading-relaxed text-slate-500", children: "默认关闭，支持 Windows 和 macOS，仅在笔试或面试任务期间生效。3 秒内点击左键两次即截图并发送，不限制鼠标位置；普通双击也会触发，请按需开启。触发后冷却 1.2 秒，避免连续点击重复提交。 若同时开启长按截图，第二次点击松开后判定。不会吞掉原点击，键盘截图快捷键仍然保留。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            "aria-label": "开启左键双击截图",
            checked: settings.doubleClickScreenshotEnabled,
            onChange: (e2) => void patch2({ doubleClickScreenshotEnabled: e2.target.checked })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "mt-4 flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-medium text-slate-900", children: "左键长按截图" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[12px] leading-relaxed text-slate-500", children: "默认关闭，支持 Windows 和 macOS，仅在笔试或面试任务期间生效。按住鼠标左键至少 3 秒后松开，触发一次截图并发送；原鼠标操作仍会作用于当前页面。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            "aria-label": "开启左键长按截图",
            checked: settings.longPressScreenshotEnabled,
            onChange: (e2) => void patch2({ longPressScreenshotEnabled: e2.target.checked })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 divide-y divide-slate-100", children: HOTKEY_LABELS.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3 py-3 md:grid-cols-[1fr_280px] md:items-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-medium text-slate-900", children: item.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[12px] text-slate-500", children: item.hint })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          HotkeyCaptureField,
          {
            action: item.id,
            combo: settings.hotkeys[item.id],
            allHotkeys: settings.hotkeys,
            actionLabels: HOTKEY_LABEL_MAP,
            allowDisable: item.allowDisable,
            onChange: (combo) => updateHotkey(item.id, combo)
          }
        )
      ] }, item.id)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[16px] font-semibold text-slate-950", children: "模式窗口" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center justify-between text-[13px]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-800", children: "普通模式透明度" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-slate-500", children: [
              opacityPct,
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "range",
              "aria-label": "普通模式透明度",
              min: MIN_WINDOW_OPACITY * 100,
              max: 100,
              step: 1,
              value: opacityPct,
              onChange: (e2) => {
                const pct = Number(e2.target.value);
                setOpacityDraft(pct);
                void window.api.window.previewOpacity(pct / 100);
              },
              onPointerUp: (e2) => {
                const pct = Number(e2.target.value);
                setOpacityDraft(null);
                void patch2({ opacity: pct / 100 });
              },
              onKeyUp: (e2) => {
                const pct = Number(e2.currentTarget.value);
                setOpacityDraft(null);
                void patch2({ opacity: pct / 100 });
              },
              className: "w-full"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center justify-between text-[13px]", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-800", children: "穿透模式透明度（防切屏）" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-slate-500", children: [
                mouseThroughOpacityPct,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "range",
                "aria-label": "穿透模式透明度",
                min: MIN_WINDOW_OPACITY * 100,
                max: 100,
                step: 1,
                value: mouseThroughOpacityPct,
                onChange: (e2) => setMouseThroughOpacityDraft(Number(e2.target.value)),
                onPointerUp: (e2) => commitMouseThroughOpacity(e2.currentTarget.value),
                onKeyUp: (e2) => commitMouseThroughOpacity(e2.currentTarget.value),
                onBlur: (e2) => commitMouseThroughOpacity(e2.currentTarget.value),
                className: "w-full"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[12px] leading-relaxed text-slate-500", children: "数值越低越透明。进入穿透模式时自动使用此值，退出后恢复普通模式透明度；100% 仍保持点击穿透。" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 rounded-lg bg-[repeating-linear-gradient(135deg,#e2e8f0_0px,#e2e8f0_8px,#f8fafc_8px,#f8fafc_16px)] p-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              style: { opacity: mouseThroughOpacityPct / 100 },
              className: "rounded-md border border-slate-200 bg-white p-3 text-[13px] text-slate-800",
              children: "穿透模式预览：回答内容会以此透明度显示。"
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center justify-between text-[13px]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-800", children: "窗口缩放" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-slate-500", children: [
              Math.round(settings.zoom * 100),
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "range",
              min: 50,
              max: 200,
              value: Math.round(settings.zoom * 100),
              onChange: (e2) => {
                const next = Number(e2.target.value) / 100;
                void window.api.window.zoom(next);
                void patch2({ zoom: next });
              },
              className: "w-full"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-medium text-slate-900", children: "禁用剪贴板" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[12px] text-slate-500", children: "避免复制内容进入系统剪贴板。" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "checkbox",
              checked: settings.disableClipboard,
              onChange: (e2) => void patch2({ disableClipboard: e2.target.checked })
            }
          )
        ] }),
        canToggleStealth ? /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-medium text-slate-900", children: "录屏保护" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[12px] text-slate-500", children: "开启后会请求系统阻止常规截图或屏幕共享捕获，本地仍正常显示。不同会议、录制和远控方式可能不受支持，请先用目标软件预览确认；修改后重启应用生效。" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "checkbox",
              checked: settings.windowMode === "stealth",
              onChange: (e2) => void patch2({ windowMode: e2.target.checked ? "stealth" : "normal" })
            }
          )
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-blue-100 bg-blue-50 p-4 text-[13px] leading-relaxed text-blue-800", children: "桌面端已开启录屏保护：系统会尽量避免本窗口进入常规截图或屏幕共享画面，本地仍正常显示。实际效果取决于系统与捕获方式，请先预览确认。" })
      ] })
    ] })
  ] });
};

export { MODIFIER_KEYS, mapMainKey, buildComboFromEvent, MODIFIER_TOKENS, validateCombo, isUnmodifiedCombo, canonicalizeCombo, findConflict, expandedAcceleratorSet, applyCapturing, HotkeyCaptureField, HOTKEY_LABELS, HOTKEY_LABEL_MAP, SettingsPanel };
