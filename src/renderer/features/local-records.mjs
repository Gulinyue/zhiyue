// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.
import { jsxRuntimeExports, reactExports, p$1 } from "../vendor/react-icons-state.mjs";
import { DEFAULT_VOICE_LLM_MAX_TOKENS, normalizeVoiceLlmMaxTokens, MIN_VOICE_LLM_MAX_TOKENS, MAX_VOICE_LLM_MAX_TOKENS } from "../stores/settings.mjs";
import { KeyCombo } from "../components/key-combo.mjs";
import { isTaskConnectionRecovering, TASK_RECONNECT_MESSAGE } from "../services/task-runtime.mjs";

const DEFAULT_LOCAL_RECORDS_PREFERENCES = Object.freeze({
  saveScreenshots: false,
  saveInterviewTranscript: false,
  maxStorageMiB: 2048
});
const LOCAL_RECORDS_MAX_BYTES = DEFAULT_LOCAL_RECORDS_PREFERENCES.maxStorageMiB * 1024 * 1024;
const buttonClass = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const RECORDS_PAGE_SIZE = 50;
const TRANSCRIPT_PAGE_SIZE = 100;
const STORAGE_CAPACITY_OPTIONS = [512, 1024, 2048, 5120, 10240];
function paginateLocalRecords(items, requestedPage, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, totalPages, total: items.length };
}
function createLocalRecordsRequestGuard() {
  let active = false;
  let generation2 = 0;
  return {
    activate() {
      active = true;
      generation2 += 1;
    },
    deactivate() {
      active = false;
      generation2 += 1;
    },
    begin() {
      const current = ++generation2;
      return () => active && generation2 === current;
    }
  };
}
function formatLocalRecordBytes(bytes) {
  const safe = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (safe < 1024) return `${Math.floor(safe)} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KiB`;
  if (safe < 1024 * 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(safe / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}
function formatLocalRecordTime(value) {
  if (value === void 0 || value === null || value === "") return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "时间未知";
}
function localRecordsErrorMessage(error2) {
  const message = error2 instanceof Error ? error2.message : typeof error2 === "string" ? error2 : "";
  if (/ACCOUNT|AUTH_REQUIRED|UNAUTHORIZED/i.test(message)) return "账号状态已变化，请重新登录后刷新本机记录。";
  if (/ENOSPC/i.test(message)) return "本机磁盘空间不足，请清理磁盘后重试。";
  if (/LIMIT|CAPACITY|QUOTA|TOO_LARGE/i.test(message)) return "本机记录空间不足或已达到容量上限，请调整容量设置或删除不需要的记录后重试。";
  if (/NOT_FOUND|ENOENT/i.test(message)) return "这条本机记录已不存在，请刷新列表。";
  if (/EACCES|EPERM/i.test(message)) return "无法访问本机记录目录，请检查目录权限后重试。";
  return "本机记录操作失败，请刷新后重试。";
}
const LocalRecordsPage = ({ accountKey, onOpenPracticeHistory }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  LocalRecordsAccountPage,
  {
    accountKey,
    onOpenPracticeHistory
  },
  accountKey ?? "signed-out"
);
const LocalRecordsAccountPage = ({ accountKey, onOpenPracticeHistory }) => {
  const [snapshot, setSnapshot] = reactExports.useState(null);
  const [detail, setDetail] = reactExports.useState(null);
  const [filter, setFilter] = reactExports.useState("all");
  const [recordPage, setRecordPage] = reactExports.useState(1);
  const [transcriptPage, setTranscriptPage] = reactExports.useState(1);
  const [pendingDelete, setPendingDelete] = reactExports.useState(null);
  const [busy, setBusy] = reactExports.useState(false);
  const [error2, setError] = reactExports.useState(null);
  const busyRef = reactExports.useRef(false);
  const guard = reactExports.useRef(createLocalRecordsRequestGuard()).current;
  const runOperation = reactExports.useCallback(async (operation) => {
    if (!accountKey || busyRef.current) return;
    busyRef.current = true;
    const isCurrent = guard.begin();
    setBusy(true);
    setError(null);
    try {
      await operation(window.api.localRecords, accountKey, isCurrent);
    } catch (reason) {
      if (isCurrent()) setError(localRecordsErrorMessage(reason));
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [accountKey, guard]);
  const refresh = reactExports.useCallback(() => runOperation(async (api, owner, isCurrent) => {
    const next = await api.state(owner);
    if (isCurrent()) {
      setSnapshot(next);
      setDetail(null);
      setRecordPage(1);
    }
  }), [runOperation]);
  reactExports.useEffect(() => {
    guard.activate();
    void refresh();
    return () => {
      guard.deactivate();
      busyRef.current = false;
    };
  }, [guard, refresh]);
  const configure2 = (patch2) => {
    if (!snapshot) return;
    void runOperation(async (api, owner, isCurrent) => {
      const next = await api.configure(owner, patch2);
      if (isCurrent()) setSnapshot(next);
    });
  };
  const openRecord = (record2) => {
    setDetail(null);
    setTranscriptPage(1);
    void runOperation(async (api, owner, isCurrent) => {
      if (record2.kind === "screenshot") {
        await api.openScreenshot(owner, record2.id);
      } else {
        const next = await api.readTranscript(owner, record2.id);
        if (isCurrent()) setDetail(next);
      }
    });
  };
  const confirmDelete = () => {
    const target = pendingDelete;
    if (!target) return;
    void runOperation(async (api, owner, isCurrent) => {
      await api.delete(owner, target.id);
      if (!isCurrent()) return;
      setPendingDelete(null);
      if (detail?.summary.id === target.id) setDetail(null);
      const next = await api.state(owner);
      if (isCurrent()) setSnapshot(next);
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    LocalRecordsView,
    {
      accountKey,
      snapshot,
      detail,
      filter,
      recordPage,
      transcriptPage,
      pendingDelete,
      busy,
      error: error2,
      onRefresh: () => void refresh(),
      onConfigure: (key, enabled2) => configure2({ [key]: enabled2 }),
      onCapacityChange: (maxStorageMiB) => configure2({ maxStorageMiB }),
      onFilterChange: (next) => {
        setFilter(next);
        setRecordPage(1);
      },
      onRecordPageChange: setRecordPage,
      onTranscriptPageChange: setTranscriptPage,
      onOpenRecord: openRecord,
      onCloseDetail: () => setDetail(null),
      onOpenDirectory: () => void runOperation(async (api, owner) => {
        await api.openDirectory(owner);
      }),
      onRequestDelete: setPendingDelete,
      onCancelDelete: () => setPendingDelete(null),
      onConfirmDelete: confirmDelete,
      onOpenPracticeHistory
    }
  );
};
const LocalRecordsView = (props) => {
  const { accountKey, snapshot, detail, busy, error: error2, filter, pendingDelete } = props;
  const records = snapshot?.records.filter((record2) => filter === "all" || record2.kind === filter) ?? [];
  const recordSlice = paginateLocalRecords(records, props.recordPage, RECORDS_PAGE_SIZE);
  const transcriptSlice = paginateLocalRecords(detail?.entries ?? [], props.transcriptPage, TRANSCRIPT_PAGE_SIZE);
  const atCapacity = Boolean(snapshot && snapshot.totalBytes >= snapshot.maxBytes);
  const nearCapacity = Boolean(snapshot && snapshot.totalBytes >= snapshot.maxBytes * 0.9);
  const maxStorageMiB = snapshot?.preferences.maxStorageMiB ?? DEFAULT_LOCAL_RECORDS_PREFERENCES.maxStorageMiB;
  const capacityOptions = STORAGE_CAPACITY_OPTIONS.includes(maxStorageMiB) ? STORAGE_CAPACITY_OPTIONS : [...STORAGE_CAPACITY_OPTIONS, maxStorageMiB].sort((a2, b) => a2 - b);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "no-drag h-full min-w-0 overflow-y-auto bg-white px-5 py-7 sm:px-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-[1120px] space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[25px] font-medium tracking-tight text-slate-950", children: "面试与截图记录" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[13px] text-slate-500", children: "只保存你主动开启后的记录。默认关闭，按当前账号保存在本机。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: buttonClass, onClick: props.onOpenPracticeHistory, children: "模拟面试记录" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { "aria-labelledby": "local-records-preferences", className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "local-records-preferences", className: "text-[15px] font-semibold", children: "保存设置" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-slate-50 px-4 py-3 text-[12px] leading-6 text-slate-600", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "开启前请取得相关人员及内容的授权，并遵守所在会议或考试的规则。" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "本页记录仅保存在本机，不上传服务器；实时识别和答题本身仍使用现有在线服务。" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "语音记录只保存系统播放音频的识别文本，不保存音频或麦克风录音。系统音频可能包含其他人的声音、提示音等，无法可靠区分说话人，不能保证只识别面试官。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-3 md:grid-cols-2", children: [
          ["saveScreenshots", "保存截图", "保存之后触发的任务截图。"],
          ["saveInterviewTranscript", "保存面试官语音转写", "保存之后识别到的系统音频转写，不只保留触发 AI 回答的问题。"]
        ].map(([key, label, description]) => {
          const enabled2 = snapshot?.preferences[key] ?? false;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-[13px] font-medium", children: label }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1 block text-[12px] leading-5 text-slate-500", children: description })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "checkbox",
                role: "switch",
                "aria-label": label,
                checked: enabled2,
                disabled: !snapshot || !accountKey || busy,
                onChange: (event) => props.onConfigure(key, event.target.checked),
                className: "mt-1 h-4 w-4 shrink-0"
              }
            )
          ] }, key);
        }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-slate-500", children: "关闭只停止后续保存，不会删除已有记录。清空面试上下文不会删除本机记录；需要删除请在这里操作。" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { "aria-labelledby": "local-records-storage", className: "space-y-3 border-t border-slate-100 pt-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "local-records-storage", className: "text-[15px] font-semibold", children: "当前账号的本机存储" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: buttonClass, disabled: !accountKey || busy, onClick: props.onRefresh, children: busy ? "处理中…" : "刷新" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: buttonClass, disabled: !snapshot || busy, onClick: props.onOpenDirectory, children: "打开记录目录" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-all text-[12px] text-slate-500", children: [
          "账号：",
          accountKey ?? "未登录"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-600", children: snapshot?.directory ?? "载入后显示当前账号的记录目录" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] leading-5 text-slate-500", children: "截图存放在 screenshots / 日期；面试转写存放在 interviews / 开始日期 / 场次。日期使用本机时间，同一场面试重连不拆分，旧版记录仍可查看。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-3 text-[13px] text-slate-700", children: [
            "容量上限",
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "select",
              {
                "aria-label": "本机记录容量上限",
                "aria-describedby": "local-records-capacity-help",
                className: "rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-50",
                disabled: !snapshot || !accountKey || busy,
                value: maxStorageMiB,
                onChange: (event) => props.onCapacityChange(Number(event.target.value)),
                children: capacityOptions.map((size) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: size, children: [
                  size < 1024 ? `${size} MB` : `${size / 1024} GB`,
                  size === DEFAULT_LOCAL_RECORDS_PREFERENCES.maxStorageMiB ? "（默认）" : ""
                ] }, size))
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] text-slate-500", children: "修改后自动保存，仅当前账号生效" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { id: "local-records-capacity-help", className: "text-[12px] leading-5 text-slate-500", children: "默认 2 GB，可选 512 MB～10 GB（按 1 GB = 1024 MB 计算）。只占实际文件大小，不预分配空间。降低上限不会删除已有记录；已超出新上限时停止新增保存。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[13px] text-slate-600", children: [
          "已用 ",
          formatLocalRecordBytes(snapshot?.totalBytes ?? 0),
          " / ",
          formatLocalRecordBytes(snapshot?.maxBytes ?? LOCAL_RECORDS_MAX_BYTES),
          " · ",
          snapshot?.records.length ?? 0,
          " 条记录"
        ] }),
        snapshot && /* @__PURE__ */ jsxRuntimeExports.jsx("progress", { className: "h-2 w-full accent-blue-600", "aria-label": "本机记录存储用量", max: Math.max(1, snapshot.maxBytes), value: Math.min(snapshot.totalBytes, snapshot.maxBytes) }),
        (snapshot?.warning || nearCapacity) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: snapshot?.warning || (atCapacity ? "已达到容量上限，已停止新增保存。可提高上限或删除不需要的记录，不会自动删除旧记录。" : "本机记录空间已使用 90% 以上，即将用满。可提高上限或手动删除不需要的记录。") }),
        error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800", children: error2 }),
        !accountKey && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[13px] text-slate-500", children: "请先登录，查看当前账号的本机记录。" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { "aria-labelledby": "local-records-list", className: "space-y-3 border-t border-slate-100 pt-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "local-records-list", className: "text-[15px] font-semibold", children: "已保存记录" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-2 text-[12px] text-slate-600", children: [
            "类型",
            /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { "aria-label": "记录类型", className: "rounded-lg border border-slate-200 bg-white px-3 py-2", value: filter, onChange: (event) => props.onFilterChange(event.target.value), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: "全部" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "interview", children: "面试转写" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "screenshot", children: "截图" })
            ] })
          ] })
        ] }),
        !snapshot ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "py-6 text-[13px] text-slate-500", children: busy ? "正在加载本机记录…" : error2 ? "记录未能加载，请点击刷新重试。" : accountKey ? "正在准备本机记录…" : "登录后可查看记录。" }) : records.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "py-6 text-[13px] text-slate-500", children: filter === "all" ? "暂无本机记录。开启保存后，后续截图和面试转写会显示在这里。" : "暂无此类型的本机记录。" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "divide-y divide-slate-100", children: recordSlice.items.map((record2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex flex-wrap items-center justify-between gap-3 py-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[13px] font-medium text-slate-800", children: [
              record2.kind === "interview" ? "面试转写" : "截图",
              " · ",
              formatLocalRecordTime(record2.createdAt)
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[12px] text-slate-500", children: [
              record2.itemCount,
              " ",
              record2.kind === "interview" ? "段文本" : "张",
              " · ",
              formatLocalRecordBytes(record2.bytes),
              record2.endedAt ? ` · 结束于 ${formatLocalRecordTime(record2.endedAt)}` : ""
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: buttonClass, disabled: busy, onClick: () => props.onOpenRecord(record2), children: record2.kind === "interview" ? "查看转写" : "打开截图" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: buttonClass, disabled: busy, "aria-label": `删除${record2.kind === "interview" ? "面试转写" : "截图"} ${formatLocalRecordTime(record2.createdAt)}`, onClick: () => props.onRequestDelete(record2), children: "删除" })
          ] })
        ] }, record2.id)) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(LocalRecordsPagination, { label: "记录分页", page: recordSlice.page, totalPages: recordSlice.totalPages, total: recordSlice.total, busy, onChange: props.onRecordPageChange })
      ] }),
      detail && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { "aria-labelledby": "local-transcript-title", className: "rounded-xl border border-slate-200 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { id: "local-transcript-title", className: "text-[15px] font-semibold", children: [
            "转写详情 · ",
            formatLocalRecordTime(detail.summary.createdAt)
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: buttonClass, onClick: props.onCloseDetail, children: "关闭详情" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[12px] text-slate-500", children: "系统音频识别文本，可能有漏字、错字或其他说话人的内容；并非录音。" }),
        detail.entries.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "py-4 text-[13px] text-slate-500", children: "暂无已保存的转写文本。" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "mt-3 space-y-4", children: transcriptSlice.items.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "border-t border-slate-100 pt-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-slate-400", children: formatLocalRecordTime(entry.at) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-800", children: entry.text })
        ] }, entry.id)) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(LocalRecordsPagination, { label: "转写分页", page: transcriptSlice.page, totalPages: transcriptSlice.totalPages, total: transcriptSlice.total, busy, onChange: props.onTranscriptPageChange })
      ] })
    ] }),
    pendingDelete && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-5", onKeyDown: (event) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        props.onCancelDelete();
      }
      if (event.key === "Tab") {
        const buttons = Array.from(event.currentTarget.querySelectorAll("button:not(:disabled)"));
        if (!buttons.length) {
          event.preventDefault();
          return;
        }
        const current = buttons.indexOf(document.activeElement);
        event.preventDefault();
        buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { role: "alertdialog", "aria-modal": "true", "aria-labelledby": "local-record-delete-title", "aria-describedby": "local-record-delete-description", className: "w-full max-w-md rounded-xl bg-white p-5 shadow-xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "local-record-delete-title", className: "text-[16px] font-semibold", children: "删除这条本机记录？" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { id: "local-record-delete-description", className: "mt-3 text-[13px] leading-6 text-slate-600", children: [
        pendingDelete.kind === "interview" ? "面试转写" : "截图",
        " · ",
        formatLocalRecordTime(pendingDelete.createdAt),
        "。删除后无法从应用中恢复，不影响其他记录或模拟面试历史。"
      ] }),
      error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "mt-3 text-[13px] text-red-700", children: error2 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex justify-end gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", autoFocus: true, className: buttonClass, disabled: busy, onClick: props.onCancelDelete, children: "取消" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "rounded-lg bg-red-600 px-3 py-2 text-[13px] text-white disabled:opacity-50", disabled: busy, onClick: props.onConfirmDelete, children: busy ? "正在删除…" : "确认删除" })
      ] })
    ] }) })
  ] });
};
const LocalRecordsPagination = ({ label, page, totalPages, total, busy, onChange }) => totalPages <= 1 ? null : /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { "aria-label": label, className: "mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px] text-slate-500", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
    "第 ",
    page,
    " / ",
    totalPages,
    " 页 · 共 ",
    total,
    " 条"
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: buttonClass, disabled: busy || page <= 1, onClick: () => onChange(page - 1), children: "上一页" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: buttonClass, disabled: busy || page >= totalPages, onClick: () => onChange(page + 1), children: "下一页" })
  ] })
] });
const MAC_CAPTURE_PROTECTION_NOTICE = "macOS 内容保护仅为尽力保护：使用 ScreenCaptureKit 的共享或录屏软件仍可能捕获 Climb。请先检查共享端预览；需要保证内容不外露时，请仅共享指定业务窗口，或在共享前隐藏 Climb。";
function resolveInterviewTaskMaterialId(options, requestedId, fallback) {
  if (requestedId === null) return null;
  const normalized = requestedId?.trim() ?? "";
  if (normalized && options.some((option) => option.id === normalized)) return normalized;
  return fallback === "first" ? options[0]?.id ?? null : null;
}
const TASK_LAUNCH_COPY = {
  interview: {
    title: "开始面试",
    description: "确认本次面试信息，确认后进入到面试系统",
    interactions: {
      interactive: {
        title: "会议软件面试",
        description: "适合在常见会议软件中进行面试，你本人可以看到并点击本软件。录屏和共享中的可见性取决于系统及会议软件，请先确认共享端预览。采集系统播放的会议音频，不采集麦克风。"
      },
      passive: {
        title: "防切屏检测",
        description: "启用点击穿透，你本人可以看到本软件，但需使用快捷键操作。录屏和共享中的可见性取决于系统及会议软件，请先确认共享端预览，并遵守平台规则。采集系统播放的会议音频，不采集麦克风。"
      }
    },
    protectionNotice: "录屏保护和点击穿透受操作系统、会议软件及捕获方式影响，请先用目标会议软件的预览确认，并遵守面试平台规则。"
  },
  exam: {
    title: "开始笔试",
    description: "确认本次笔试配置，确认后进入到笔试系统",
    interactions: {
      interactive: {
        title: "普通笔试",
        description: "适合在线编程、问答题等不限制窗口操作的笔试场景。你可以直接点击，也可以使用快捷键截图并提交。录屏和共享中的可见性取决于系统及采集方式，请先确认共享端预览。"
      },
      passive: {
        title: "防切屏笔试",
        description: "启用点击穿透，窗口不会主动获取焦点；你可以看到，但需依靠快捷键操作。录屏和共享中的可见性取决于系统及采集方式，请先确认共享端预览，并遵守平台规则。",
        recommended: true
      }
    },
    protectionNotice: "录屏保护和点击穿透受操作系统、考试平台及捕获方式影响，请先在正式开始前完成检查，并遵守考试平台规则。"
  }
};
const TaskLaunchDialog = ({
  kind,
  materials,
  primaryHotkey,
  recoveryHotkey,
  initialExamModelProfile = "gemini",
  initialInterviewVoiceModelProfile = "managed",
  initialVoiceLlmMaxTokens = DEFAULT_VOICE_LLM_MAX_TOKENS,
  interviewResumeOptions = [],
  interviewKnowledgeOptions = [],
  initialInterviewMaterialSelection,
  onPreflight,
  onConfirm,
  onOpenPreparation,
  onOpenApiKeys,
  onOpenSettings,
  onClose
}) => {
  const [interactionMode, setInteractionMode] = reactExports.useState(
    () => kind === "exam" ? "passive" : "interactive"
  );
  const [shortcutOverlayEnabled, setShortcutOverlayEnabled] = reactExports.useState(true);
  const [examModelProfile, setExamModelProfile] = reactExports.useState(
    kind === "interview" && initialExamModelProfile === "doubao" ? "gemini" : initialExamModelProfile
  );
  const [interviewVoiceModelProfile, setInterviewVoiceModelProfile] = reactExports.useState(initialInterviewVoiceModelProfile);
  const [voiceLlmMaxTokens, setVoiceLlmMaxTokens] = reactExports.useState(
    () => normalizeVoiceLlmMaxTokens(initialVoiceLlmMaxTokens)
  );
  const [resumeId, setResumeId] = reactExports.useState(
    () => resolveInterviewTaskMaterialId(
      interviewResumeOptions,
      initialInterviewMaterialSelection?.resumeId,
      "first"
    )
  );
  const [knowledgeId, setKnowledgeId] = reactExports.useState(
    () => resolveInterviewTaskMaterialId(
      interviewKnowledgeOptions,
      initialInterviewMaterialSelection?.knowledgeId,
      "none"
    )
  );
  const requestedResumeIdRef = reactExports.useRef(
    resumeId ?? initialInterviewMaterialSelection?.resumeId
  );
  const resumeSelectionTouchedRef = reactExports.useRef(false);
  const requestedKnowledgeIdRef = reactExports.useRef(
    knowledgeId ?? initialInterviewMaterialSelection?.knowledgeId ?? null
  );
  const knowledgeSelectionTouchedRef = reactExports.useRef(false);
  const [personalModelsAvailability, setPersonalModelsAvailability] = reactExports.useState("loading");
  const [personalModelConfigured, setPersonalModelConfigured] = reactExports.useState({ screenshot: false, interview: false });
  const [personalModelProfiles, setPersonalModelProfiles] = reactExports.useState([]);
  const [stage, setStage] = reactExports.useState("idle");
  const [statusMessage, setStatusMessage] = reactExports.useState(null);
  const [blockedRecovery, setBlockedRecovery] = reactExports.useState("retry");
  const [blockedCode, setBlockedCode] = reactExports.useState(null);
  const mountedRef = reactExports.useRef(true);
  const attemptRef = reactExports.useRef(0);
  const attemptAbortRef = reactExports.useRef(null);
  const dialogRef = reactExports.useRef(null);
  const primaryActionRef = reactExports.useRef(null);
  const isInterview = kind === "interview";
  const launchCopy = TASK_LAUNCH_COPY[kind];
  const checking = stage === "checking";
  const launching = stage === "launching";
  const busy = checking || launching;
  const interviewResumeIdsKey = interviewResumeOptions.map((option) => option.id).join("\0");
  const interviewKnowledgeIdsKey = interviewKnowledgeOptions.map((option) => option.id).join("\0");
  const screenshotPersonalModelProfile = personalModelProfileForSlot(
    personalModelProfiles,
    "screenshot"
  );
  const interviewPersonalModelProfile = personalModelProfileForSlot(
    personalModelProfiles,
    "interview"
  );
  const screenshotPersonalModelConfigured = personalModelConfigured.screenshot;
  const interviewPersonalModelConfigured = personalModelConfigured.interview;
  reactExports.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      attemptAbortRef.current?.abort("task-launch-dialog-unmounted");
      attemptAbortRef.current = null;
    };
  }, []);
  reactExports.useEffect(() => {
    primaryActionRef.current?.focus();
  }, []);
  reactExports.useEffect(() => {
    if (!isInterview) return;
    const requestedResumeId = resumeSelectionTouchedRef.current ? requestedResumeIdRef.current : initialInterviewMaterialSelection?.resumeId !== void 0 ? initialInterviewMaterialSelection.resumeId : requestedResumeIdRef.current;
    const nextResumeId = resolveInterviewTaskMaterialId(
      interviewResumeOptions,
      requestedResumeId,
      resumeSelectionTouchedRef.current ? "none" : "first"
    );
    if (nextResumeId) requestedResumeIdRef.current = nextResumeId;
    setResumeId(nextResumeId);
    const requestedKnowledgeId = knowledgeSelectionTouchedRef.current ? requestedKnowledgeIdRef.current : initialInterviewMaterialSelection?.knowledgeId ?? requestedKnowledgeIdRef.current;
    const nextKnowledgeId = resolveInterviewTaskMaterialId(
      interviewKnowledgeOptions,
      requestedKnowledgeId,
      "none"
    );
    if (nextKnowledgeId) requestedKnowledgeIdRef.current = nextKnowledgeId;
    setKnowledgeId(nextKnowledgeId);
  }, [
    isInterview,
    interviewResumeIdsKey,
    interviewKnowledgeIdsKey,
    initialInterviewMaterialSelection?.resumeId,
    initialInterviewMaterialSelection?.knowledgeId
  ]);
  reactExports.useEffect(() => {
    let cancelled = false;
    let personalSettled = false;
    const personalClient = window.api.personalModels;
    let personalTimeout;
    if (!personalClient) {
      personalSettled = true;
      setPersonalModelsAvailability("unavailable");
      setExamModelProfile((current) => current === "personal-custom-api" ? "gemini" : current);
      setInterviewVoiceModelProfile("managed");
    } else {
      setPersonalModelsAvailability("loading");
      personalTimeout = window.setTimeout(() => {
        if (cancelled || personalSettled) return;
        personalSettled = true;
        setPersonalModelConfigured({ screenshot: false, interview: false });
        setPersonalModelProfiles([]);
        setPersonalModelsAvailability("unavailable");
        setExamModelProfile((current) => current === "personal-custom-api" ? "gemini" : current);
        setInterviewVoiceModelProfile("managed");
      }, 5e3);
      void personalClient.load().then((snapshot) => {
        if (cancelled || personalSettled) return;
        personalSettled = true;
        if (personalTimeout !== void 0) window.clearTimeout(personalTimeout);
        const configured = {
          screenshot: personalModelCredentialConfigured(snapshot.credentials, "screenshot"),
          interview: personalModelCredentialConfigured(snapshot.credentials, "interview")
        };
        setPersonalModelConfigured(configured);
        setPersonalModelProfiles(snapshot.profiles);
        setPersonalModelsAvailability("ready");
        setExamModelProfile((current) => current === "personal-custom-api" && !configured.screenshot ? "gemini" : current);
        setInterviewVoiceModelProfile((current) => current === "personal-custom-api" && !configured.interview ? "managed" : current);
      }).catch(() => {
        if (cancelled || personalSettled) return;
        personalSettled = true;
        if (personalTimeout !== void 0) window.clearTimeout(personalTimeout);
        setPersonalModelConfigured({ screenshot: false, interview: false });
        setPersonalModelProfiles([]);
        setPersonalModelsAvailability("unavailable");
        setExamModelProfile((current) => current === "personal-custom-api" ? "gemini" : current);
        setInterviewVoiceModelProfile("managed");
      });
    }
    return () => {
      cancelled = true;
      if (personalTimeout !== void 0) window.clearTimeout(personalTimeout);
    };
  }, []);
  const handleDialogKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      leaveDialog(onClose);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    ).filter((element2) => !element2.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const leaveDialog = (leave) => {
    attemptRef.current += 1;
    attemptAbortRef.current?.abort("task-launch-dialog-closed");
    attemptAbortRef.current = null;
    leave();
  };
  const start = async () => {
    if (busy || attemptAbortRef.current) return;
    const attempt = ++attemptRef.current;
    const attemptController = new AbortController();
    attemptAbortRef.current = attemptController;
    const selectedInteractionMode = interactionMode;
    const selectedShortcutOverlayEnabled = shortcutOverlayEnabled;
    const selectedExamModelProfile = examModelProfile;
    const selectedInterviewVoiceModelProfile = interviewVoiceModelProfile;
    const selectedInterviewMaterialSelection = {
      resumeId: isInterview ? resumeId : null,
      knowledgeId: isInterview ? knowledgeId : null
    };
    if (selectedExamModelProfile === "personal-custom-api" && (personalModelsAvailability !== "ready" || !screenshotPersonalModelConfigured)) {
      setBlockedRecovery("retry");
      setBlockedCode("PERSONAL_MODEL_NOT_CONFIGURED");
      setStage("blocked");
      setStatusMessage("所选模型尚未连接，请先到“准备中心 → API KEY 管理”完成配置。");
      attemptAbortRef.current = null;
      return;
    }
    if (kind === "interview" && selectedInterviewVoiceModelProfile === "personal-custom-api" && (personalModelsAvailability !== "ready" || !interviewPersonalModelConfigured)) {
      setBlockedRecovery("retry");
      setBlockedCode("PERSONAL_VOICE_MODEL_NOT_CONFIGURED");
      setStage("blocked");
      setStatusMessage("实时面试回答模型尚未连接，请先到“准备中心 → API KEY 管理”完成配置。");
      attemptAbortRef.current = null;
      return;
    }
    const isCurrentAttempt = () => mountedRef.current && attemptRef.current === attempt && !attemptController.signal.aborted;
    setBlockedRecovery("retry");
    setBlockedCode(null);
    setStage("checking");
    setStatusMessage(isInterview ? "正在获取系统音频轨道…" : "正在检查账户与任务配置…");
    let launchToken = null;
    try {
      const result = await onPreflight(selectedInteractionMode, attemptController.signal);
      if (!isCurrentAttempt()) return;
      if (!result.ok) {
        setStage("blocked");
        setStatusMessage(result.message);
        setBlockedRecovery(result.recovery ?? "retry");
        setBlockedCode(result.code ?? null);
        return;
      }
      launchToken = await window.api.window.beginTaskLaunch();
      if (!isCurrentAttempt()) {
        if (launchToken !== null) await window.api.window.cancelTaskLaunch(launchToken);
        return;
      }
      setStage("launching");
      setStatusMessage("检查通过，正在开始任务…");
      const entered = await onConfirm(
        selectedInteractionMode,
        selectedShortcutOverlayEnabled,
        attemptController.signal,
        selectedExamModelProfile,
        selectedInterviewVoiceModelProfile,
        normalizeVoiceLlmMaxTokens(voiceLlmMaxTokens),
        selectedInterviewMaterialSelection
      );
      if (!isCurrentAttempt()) {
        if (launchToken !== null) await window.api.window.cancelTaskLaunch(launchToken);
        return;
      }
      if (!entered) {
        if (launchToken !== null) await window.api.window.cancelTaskLaunch(launchToken);
        setBlockedRecovery("retry");
        setBlockedCode(null);
        setStage("blocked");
        setStatusMessage("暂时无法进入任务。请检查登录状态、套餐或设置后重试。");
        return;
      }
    } catch (error2) {
      if (launchToken !== null) await window.api.window.cancelTaskLaunch(launchToken);
      if (!isCurrentAttempt()) return;
      setBlockedRecovery("retry");
      setBlockedCode(null);
      setStage("blocked");
      setStatusMessage(
        "启动检查失败：" + (error2 instanceof Error ? error2.message : String(error2))
      );
    } finally {
      if (attemptAbortRef.current === attemptController) {
        attemptAbortRef.current = null;
      }
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "no-drag fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/35 px-4 py-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "task-launch-title",
      onKeyDown: handleDialogKeyDown,
      className: "max-h-[calc(100vh-2.5rem)] w-full max-w-[660px] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.75)] [scrollbar-gutter:stable]",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] font-semibold uppercase tracking-[0.16em] text-blue-600", children: "任务启动检查" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "task-launch-title", className: "mt-2 text-[22px] font-semibold text-slate-950", children: launchCopy.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[13px] leading-relaxed text-slate-500", children: launchCopy.description })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              "aria-label": busy ? "取消启动" : "关闭",
              onClick: () => leaveDialog(onClose),
              className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[24px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700",
              children: "×"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 grid gap-3 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            InteractionChoice,
            {
              selected: interactionMode === "interactive",
              disabled: busy,
              title: launchCopy.interactions.interactive.title,
              description: launchCopy.interactions.interactive.description,
              recommended: launchCopy.interactions.interactive.recommended,
              onClick: () => setInteractionMode("interactive")
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            InteractionChoice,
            {
              selected: interactionMode === "passive",
              disabled: busy,
              title: launchCopy.interactions.passive.title,
              description: launchCopy.interactions.passive.description,
              recommended: launchCopy.interactions.passive.recommended,
              onClick: () => setInteractionMode("passive")
            }
          )
        ] }),
        isInterview && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[14px] font-semibold text-slate-900", children: "本次面试材料" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[12px] leading-relaxed text-slate-500", children: "选择会在开始时锁定；任务进行中修改准备中心不会影响本次面试。" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[12px] font-medium text-slate-700", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1.5 block", children: "简历（可选）" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "select",
                {
                  "aria-label": "本次面试简历",
                  value: resumeId ?? "",
                  disabled: busy,
                  onPointerDown: () => {
                    resumeSelectionTouchedRef.current = true;
                    requestedResumeIdRef.current = resumeId;
                  },
                  onKeyDown: (event) => {
                    if (!["Enter", " ", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                    resumeSelectionTouchedRef.current = true;
                    requestedResumeIdRef.current = resumeId;
                  },
                  onChange: (event) => {
                    resumeSelectionTouchedRef.current = true;
                    const next = event.target.value || null;
                    requestedResumeIdRef.current = next;
                    setResumeId(next);
                  },
                  className: "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "本次不使用" }),
                    interviewResumeOptions.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: option.id, children: option.label }, option.id))
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[12px] font-medium text-slate-700", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1.5 block", children: "知识库（可选，延迟高一点）" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "select",
                {
                  "aria-label": "本次面试知识库",
                  value: knowledgeId ?? "",
                  disabled: busy,
                  onPointerDown: () => {
                    knowledgeSelectionTouchedRef.current = true;
                    requestedKnowledgeIdRef.current = knowledgeId;
                  },
                  onKeyDown: (event) => {
                    if (!["Enter", " ", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                    knowledgeSelectionTouchedRef.current = true;
                    requestedKnowledgeIdRef.current = knowledgeId;
                  },
                  onChange: (event) => {
                    knowledgeSelectionTouchedRef.current = true;
                    const next = event.target.value || null;
                    requestedKnowledgeIdRef.current = next;
                    setKnowledgeId(next);
                  },
                  className: "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "本次不使用" }),
                    interviewKnowledgeOptions.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: option.id, children: option.label }, option.id))
                  ]
                }
              )
            ] })
          ] }),
          !resumeId && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[12px] text-slate-500", children: "不使用简历也可开始实时面试；回答将不包含简历上下文。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[14px] font-semibold text-slate-900", children: kind === "exam" ? "笔试答题模型" : "面试截图模型" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-[12px] leading-relaxed text-slate-500", children: [
              "本次任务固定使用所选模型；",
              kind === "interview" ? "仅影响 Ctrl+Q 截图答题，语音链路保持不变。" : "不同模型的速度和答题风格可能不同。"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-2 sm:grid-cols-2", role: "radiogroup", "aria-label": kind === "exam" ? "笔试答题模型" : "面试截图模型", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ModelChoice,
              {
                selected: examModelProfile === "gemini",
                disabled: busy,
                title: "Gemini 3.7 Flash",
                description: "Climb 托管，适合综合题与代码截图。",
                recommended: true,
                onClick: () => setExamModelProfile("gemini")
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ModelChoice,
              {
                selected: examModelProfile === "gemini-3.8",
                disabled: busy,
                title: "Gemini 3.8 Flash",
                description: "Climb 托管，LOW 思考档，优先首字响应速度。",
                onClick: () => setExamModelProfile("gemini-3.8")
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ModelChoice,
              {
                selected: examModelProfile === "doubao",
                disabled: busy || kind === "interview",
                title: "豆包",
                description: kind === "interview" ? "当前仅支持笔试截图。" : "Climb 托管，可比较不同答题风格。",
                onClick: () => setExamModelProfile("doubao")
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ModelChoice,
              {
                selected: examModelProfile === "personal-custom-api",
                disabled: busy || !screenshotPersonalModelConfigured,
                title: personalModelChoiceTitle(
                  screenshotPersonalModelConfigured,
                  screenshotPersonalModelProfile
                ),
                description: personalModelChoiceDescription(
                  personalModelsAvailability,
                  screenshotPersonalModelConfigured,
                  screenshotPersonalModelProfile
                ),
                onClick: () => setExamModelProfile("personal-custom-api")
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => leaveDialog(onOpenApiKeys),
              disabled: busy,
              className: "mt-3 text-[12px] font-medium text-blue-700 hover:text-blue-800 disabled:cursor-wait disabled:opacity-40",
              children: "前往 API KEY 管理"
            }
          )
        ] }),
        kind === "interview" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[14px] font-semibold text-slate-900", children: "实时面试回答模型" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[12px] leading-relaxed text-slate-500", children: "系统音频识别、问题校正和套餐计时仍由 Climb 完成；选择个人 API 时，回答会在本机调用，API Key 不会发送到 Climb 服务器。" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-2 sm:grid-cols-2", role: "radiogroup", "aria-label": "实时面试回答模型", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ModelChoice,
              {
                selected: interviewVoiceModelProfile === "managed",
                disabled: busy,
                title: "Climb 托管模型",
                description: "由 Climb 完成实时回答，开箱即用。",
                recommended: true,
                onClick: () => setInterviewVoiceModelProfile("managed")
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ModelChoice,
              {
                selected: interviewVoiceModelProfile === "personal-custom-api",
                disabled: busy || !interviewPersonalModelConfigured,
                title: personalModelChoiceTitle(
                  interviewPersonalModelConfigured,
                  interviewPersonalModelProfile
                ),
                description: personalModelChoiceDescription(
                  personalModelsAvailability,
                  interviewPersonalModelConfigured,
                  interviewPersonalModelProfile
                ),
                onClick: () => setInterviewVoiceModelProfile("personal-custom-api")
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "mt-4 block text-[12px] font-medium text-slate-700", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1.5 block", children: "单次回答长度上限（Token）" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "number",
                min: MIN_VOICE_LLM_MAX_TOKENS,
                max: MAX_VOICE_LLM_MAX_TOKENS,
                step: 64,
                value: voiceLlmMaxTokens,
                disabled: busy,
                onChange: (event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) setVoiceLlmMaxTokens(value);
                },
                onBlur: () => setVoiceLlmMaxTokens(normalizeVoiceLlmMaxTokens(voiceLlmMaxTokens)),
                className: "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 disabled:cursor-wait disabled:bg-slate-100"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "mt-1.5 block font-normal leading-relaxed text-slate-500", children: [
              "范围 ",
              MIN_VOICE_LLM_MAX_TOKENS,
              "～",
              MAX_VOICE_LLM_MAX_TOKENS,
              "；越大越不易截断，但生成时间和费用可能增加。"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-semibold text-slate-900", children: "显示快捷键悬浮窗" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[12px] leading-relaxed text-slate-500", children: "进入任务后显示可用快捷键提示；关闭后快捷键仍可正常使用，本次任务不会创建该悬浮窗。" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] font-medium text-slate-600", "aria-hidden": "true", children: shortcutOverlayEnabled ? "已开启" : "已关闭" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                role: "switch",
                "aria-checked": shortcutOverlayEnabled,
                "aria-label": "显示快捷键悬浮窗",
                "data-shortcut-overlay-toggle": true,
                disabled: busy,
                onClick: () => setShortcutOverlayEnabled((enabled2) => !enabled2),
                className: `relative h-7 w-12 shrink-0 rounded-full transition ${shortcutOverlayEnabled ? "bg-blue-600" : "bg-slate-300"} disabled:cursor-wait disabled:opacity-55`,
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    "aria-hidden": "true",
                    className: `absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${shortcutOverlayEnabled ? "left-6" : "left-1"}`
                  }
                )
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[14px] font-semibold text-slate-900", children: "本次任务材料" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => leaveDialog(onOpenPreparation),
                disabled: busy,
                className: "text-[12px] font-medium text-blue-700 hover:text-blue-800 disabled:cursor-wait disabled:opacity-40",
                children: "打开准备中心"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 grid gap-2 sm:grid-cols-2", children: materials.map((material) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12px]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-500", children: material.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: material.ready === false ? "max-w-[150px] truncate font-medium text-amber-700" : "max-w-[150px] truncate font-medium text-slate-800", children: material.value })
          ] }, material.label)) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-2 rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: isInterview ? "语音开关" : "一键截图并提交" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(KeyCombo, { combo: primaryHotkey })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "恢复窗口交互" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(KeyCombo, { combo: recoveryHotkey })
          ] })
        ] }),
        statusMessage && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            role: "status",
            "aria-live": "polite",
            className: `mt-4 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed ${stage === "blocked" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-100 bg-blue-50 text-blue-800"}`,
            children: statusMessage
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 text-[12px] leading-relaxed text-slate-500", children: typeof window !== "undefined" && window.api?.runtime?.platform === "darwin" ? MAC_CAPTURE_PROTECTION_NOTICE : launchCopy.protectionNotice }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex flex-wrap items-center justify-between gap-3", children: [
          stage !== "blocked" || blockedRecovery === "hotkeys" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => leaveDialog(onOpenSettings),
              disabled: busy,
              className: "h-10 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-40",
              children: "打开窗口与快捷键设置"
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "max-w-[300px] self-center text-[12px] leading-relaxed text-slate-500", children: recoveryHint(blockedRecovery, blockedCode) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => leaveDialog(onClose), className: "h-10 rounded-lg px-4 text-[13px] font-medium text-slate-600 hover:bg-slate-100", children: busy ? "取消启动" : "取消" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                ref: primaryActionRef,
                type: "button",
                onClick: () => void start(),
                disabled: busy,
                className: `h-10 min-w-[150px] rounded-lg px-5 text-[13px] font-semibold text-white ${busy ? "cursor-wait bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`,
                children: stage === "checking" ? "正在检查…" : stage === "launching" ? "正在开始…" : stage === "blocked" ? "重新检查并开始" : isInterview ? "检查并开始" : "确认并开始"
              }
            )
          ] })
        ] })
      ]
    }
  ) });
};
const InteractionChoice = ({ selected, disabled, title, description, recommended, onClick }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "button",
  {
    type: "button",
    "aria-pressed": selected,
    onClick,
    disabled,
    className: `rounded-xl border p-4 text-left transition-colors ${selected ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/10" : "border-slate-200 bg-white hover:border-slate-300"} disabled:cursor-not-allowed disabled:opacity-55`,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2 text-[14px] font-semibold text-slate-900", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-blue-600" : "border-slate-300"}`, children: selected && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-blue-600" }) }),
        title,
        recommended && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700", children: "推荐" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-2 block text-[12px] leading-relaxed text-slate-500", children: description })
    ]
  }
);
const ModelChoice = ({ selected, disabled, title, description, recommended, onClick }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "button",
  {
    type: "button",
    role: "radio",
    "aria-checked": selected,
    onClick,
    disabled,
    className: `rounded-lg border px-3 py-3 text-left transition-colors ${selected ? "border-blue-500 bg-white ring-2 ring-blue-500/10" : "border-slate-200 bg-white hover:border-slate-300"} disabled:cursor-not-allowed disabled:opacity-55`,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2 text-[13px] font-semibold text-slate-900", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-blue-600" : "border-slate-300"}`, children: selected && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-blue-600" }) }),
        title,
        recommended && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700", children: "默认" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1.5 block text-[11px] leading-relaxed text-slate-500", children: description })
    ]
  }
);
function personalModelChoiceDescription(availability, configured, profile) {
  if (availability === "loading") return "正在读取本机连接状态…";
  if (!configured) {
    return availability === "unavailable" ? "暂时无法读取连接状态，请到准备中心检查。" : "未连接，请先到准备中心填写 Base URL、API Key 和模型名称。";
  }
  return `已连接${profile?.baseUrl ? ` · ${safeModelHost(profile.baseUrl)}` : ""}，调用费用由你的上游账号承担。`;
}
function personalModelChoiceTitle(configured, profile) {
  return configured && profile?.model ? profile.model : "自定义 API";
}
function personalModelProfileForSlot(profiles, slot) {
  const matching = profiles.filter((profile) => profile.slot === slot);
  return matching.find((profile) => profile.enabled) ?? matching[0];
}
function personalModelCredentialConfigured(credentials2, slot) {
  return credentials2.some((credential) => credential.slot === slot && credential.configured);
}
function safeModelHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "自定义地址";
  }
}
function recoveryHint(recovery, code2) {
  if (recovery === "audio") {
    if (code2 === "permission-denied") {
      return "请在系统设置中允许 Climb 进行屏幕与音频捕获，然后重试。";
    }
    if (code2 === "no-audio") {
      return "未获得音频轨道；请检查系统输出设备与屏幕共享的音频选项。";
    }
    if (code2 === "timeout") {
      return "探测超时；请处理未完成的屏幕共享选择框，再重新检查。";
    }
    if (code2 === "unsupported") {
      return "当前运行环境不支持系统音频采集，请更新 Climb 或更换受支持的系统环境。";
    }
    return "请检查系统输出、屏幕共享中的音频选项与系统权限，然后重新检查。";
  }
  if (recovery === "screen") {
    if (code2 === "CAPTURE_TIMEOUT") {
      return "屏幕捕获检查超时；窗口已恢复，请确认系统捕获权限后重试。";
    }
    if (code2 === "CAPTURE_SYSTEM_BLOCKED") {
      return "请在系统设置中允许 Climb 屏幕捕获，然后重新检查。";
    }
    if (code2 === "CAPTURE_DISPLAY_UNAVAILABLE" || code2 === "CAPTURE_SOURCE_UNAVAILABLE") {
      return "请确认主显示器已连接且可被系统捕获，然后重试。";
    }
    return "请确认主显示器可用并允许屏幕捕获，然后重新检查。";
  }
  return "请按上方提示处理后重新检查。";
}
function createFocusResizeController(api) {
  let gesture = null;
  const pump = (current) => {
    if (current.updateTask) return current.updateTask;
    current.updateTask = (async () => {
      if (!await current.accepted) {
        current.latestPoint = null;
        return;
      }
      while (current.latestPoint) {
        const point2 = current.latestPoint;
        current.latestPoint = null;
        await api.update(point2);
      }
    })().catch(() => {
      current.latestPoint = null;
    }).finally(() => {
      current.updateTask = null;
      if (current.latestPoint) void pump(current);
    });
    return current.updateTask;
  };
  const finish = (finalPoint) => {
    const current = gesture;
    if (!current) return Promise.resolve();
    if (current.finishTask) return current.finishTask;
    if (finalPoint) current.latestPoint = finalPoint;
    current.finishTask = (async () => {
      const accepted = await current.accepted.catch(() => false);
      if (!accepted) return;
      while (current.latestPoint || current.updateTask) {
        if (current.latestPoint && !current.updateTask) void pump(current);
        await current.updateTask;
      }
      await api.end();
    })().catch(() => {
    }).finally(() => {
      if (gesture === current) gesture = null;
    });
    return current.finishTask;
  };
  return {
    begin(point2) {
      if (gesture) return false;
      const accepted = Promise.resolve().then(() => api.start(point2)).catch(() => false);
      gesture = {
        accepted,
        latestPoint: null,
        updateTask: null,
        finishTask: null
      };
      return true;
    },
    update(point2) {
      const current = gesture;
      if (!current || current.finishTask) return;
      current.latestPoint = point2;
      void pump(current);
    },
    end: finish,
    dispose: () => finish()
  };
}
const FocusResizeHandle = () => {
  const [resizing, setResizing] = reactExports.useState(false);
  const pointerIdRef = reactExports.useRef(null);
  const frameRef = reactExports.useRef(null);
  const latestPointRef = reactExports.useRef(null);
  const controllerRef = reactExports.useRef(null);
  const setResizeVisualState = (active) => {
    if (active) document.documentElement.setAttribute("data-focus-resizing", "true");
    else document.documentElement.removeAttribute("data-focus-resizing");
  };
  if (!controllerRef.current) {
    controllerRef.current = createFocusResizeController({
      start: (point2) => window.api.window.focusResizeStart(point2.screenX, point2.screenY),
      update: (point2) => window.api.window.focusResizeUpdate(point2.screenX, point2.screenY),
      end: () => window.api.window.focusResizeEnd()
    });
  }
  const flushLatestPoint = reactExports.useCallback(() => {
    frameRef.current = null;
    const point2 = latestPointRef.current;
    if (!point2) return;
    latestPointRef.current = null;
    controllerRef.current?.update(point2);
  }, []);
  const finishResize = reactExports.useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const finalPoint = latestPointRef.current;
    latestPointRef.current = null;
    pointerIdRef.current = null;
    setResizing(false);
    setResizeVisualState(false);
    void controllerRef.current?.end(finalPoint ?? void 0);
  }, []);
  reactExports.useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    document.documentElement.removeAttribute("data-focus-resizing");
    void controllerRef.current?.dispose();
  }, []);
  reactExports.useEffect(() => {
    if (!resizing) return;
    const finishIfActive = () => {
      if (pointerIdRef.current !== null) finishResize();
    };
    window.addEventListener("pointerup", finishIfActive);
    window.addEventListener("pointercancel", finishIfActive);
    window.addEventListener("blur", finishIfActive);
    return () => {
      window.removeEventListener("pointerup", finishIfActive);
      window.removeEventListener("pointercancel", finishIfActive);
      window.removeEventListener("blur", finishIfActive);
    };
  }, [finishResize, resizing]);
  const resizeByKeyboard = (deltaX, deltaY) => {
    const controller = controllerRef.current;
    if (!controller?.begin({ screenX: 0, screenY: 0 })) return;
    void controller.end({ screenX: deltaX, screenY: deltaY });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-focus-resize-hotspot": true,
      className: "group no-drag absolute bottom-0 right-0 z-50 flex h-12 w-12 items-end justify-end p-1",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          "data-focus-resize-handle": true,
          type: "button",
          title: "缩放",
          "aria-label": "拖动调整任务窗口大小；也可使用方向键微调",
          className: `focus-resize-handle flex h-8 w-8 cursor-nwse-resize touch-none items-center justify-center rounded-full border border-white/80 bg-[#fafafc]/90 text-slate-600 shadow-[0_8px_22px_-12px_rgba(15,23,42,0.55)] backdrop-blur-xl transition-[opacity,background-color,color] duration-150 hover:bg-white hover:text-slate-950 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${resizing ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`,
          onPointerDown: (event) => {
            if (event.button !== 0 || pointerIdRef.current !== null) return;
            event.preventDefault();
            const accepted = controllerRef.current?.begin({
              screenX: event.screenX,
              screenY: event.screenY
            });
            if (!accepted) return;
            setResizing(true);
            setResizeVisualState(true);
            pointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
          },
          onPointerMove: (event) => {
            if (pointerIdRef.current !== event.pointerId) return;
            latestPointRef.current = { screenX: event.screenX, screenY: event.screenY };
            if (frameRef.current === null) {
              frameRef.current = window.requestAnimationFrame(flushLatestPoint);
            }
          },
          onPointerUp: (event) => {
            if (pointerIdRef.current !== event.pointerId) return;
            latestPointRef.current = { screenX: event.screenX, screenY: event.screenY };
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            finishResize();
          },
          onPointerCancel: (event) => {
            if (pointerIdRef.current === event.pointerId) finishResize();
          },
          onKeyDown: (event) => {
            const step = event.shiftKey ? 64 : 24;
            const delta = event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowDown" ? [0, step] : event.key === "ArrowUp" ? [0, -step] : null;
            if (!delta) return;
            event.preventDefault();
            resizeByKeyboard(delta[0], delta[1]);
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(p$1, { "aria-hidden": true, size: 15, weight: "bold" })
        }
      )
    }
  );
};
function TaskConnectionNotice({
  status,
  onRetry,
  message,
  accessAction
}) {
  if (!isTaskConnectionRecovering(status)) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-task-connection-notice": status,
      className: "no-drag mb-2 flex max-h-[38%] shrink-0 flex-wrap items-center gap-2 overflow-y-auto rounded-xl border border-amber-200/80 bg-amber-50/95 px-3 py-2 text-[12px] leading-5 text-amber-900",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "min-w-0 flex-1 basis-[210px]", role: "status", "aria-live": "polite", "aria-atomic": "true", children: message || TASK_RECONNECT_MESSAGE }),
        status === "suspended" && accessAction && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "no-drag rounded-lg border border-amber-300 px-2.5 py-1.5",
            onClick: accessAction.run,
            children: accessAction.label
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onRetry,
            className: "no-drag shrink-0 rounded-lg border border-amber-300 bg-white/80 px-2.5 py-1.5 font-medium text-amber-900 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700",
            children: "立即重试"
          }
        )
      ]
    }
  );
}

export { DEFAULT_LOCAL_RECORDS_PREFERENCES, LOCAL_RECORDS_MAX_BYTES, buttonClass, RECORDS_PAGE_SIZE, TRANSCRIPT_PAGE_SIZE, STORAGE_CAPACITY_OPTIONS, paginateLocalRecords, createLocalRecordsRequestGuard, formatLocalRecordBytes, formatLocalRecordTime, localRecordsErrorMessage, LocalRecordsPage, LocalRecordsAccountPage, LocalRecordsView, LocalRecordsPagination, MAC_CAPTURE_PROTECTION_NOTICE, resolveInterviewTaskMaterialId, TASK_LAUNCH_COPY, TaskLaunchDialog, InteractionChoice, ModelChoice, personalModelChoiceDescription, personalModelChoiceTitle, personalModelProfileForSlot, personalModelCredentialConfigured, safeModelHost, recoveryHint, createFocusResizeController, FocusResizeHandle, TaskConnectionNotice };
