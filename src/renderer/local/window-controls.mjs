import { React } from '../vendor/react-icons-state.mjs';
import { WINDOW_SHORTCUTS } from '../../shared/window-shortcuts.mjs';
const h = React.createElement;
export function HotkeySettings({ settings, patchSettings, report }) {
  const [draft, setDraft] = React.useState(settings?.hotkeys || {});
  const [status, setStatus] = React.useState({});
  React.useEffect(() => { setDraft(settings?.hotkeys || {}); void window.api.hotkey.status().then(setStatus).catch((e) => report(e.message)); }, [settings?.hotkeys]);
  async function save() {
    if (!draft['window:show']?.trim()) { report('请保留解除隐藏快捷键，以便随时恢复窗口。'); return; }
    if (!draft['exam:exit']?.trim()) { report('请保留退出笔试快捷键，以便退出不可点击的悬浮窗。'); return; }
    const seen = new Set();
    for (const value of Object.values(draft)) {
      if (!value) continue;
      const normalized = value.toLowerCase().replace(/control|commandorcontrol/g, 'ctrl').replace(/super|meta/g, 'win').replace(/\s/g, '').split('+').sort().join('+');
      if (seen.has(normalized)) { report(`存在重复快捷键：${value}`); return; } seen.add(normalized);
    }
    await patchSettings({ hotkeys: draft });
    const next = await window.api.hotkey.status(); setStatus(next);
    const failed = WINDOW_SHORTCUTS.filter(([, action]) => action.startsWith('window:') && draft[action] && !next[action]);
    report(failed.length ? `以下快捷键未注册，可能被占用：${failed.map(([label]) => label).join('、')}。可通过托盘恢复窗口。` : '快捷键已应用。', !failed.length);
  }
  return h('section', { className: 'panel hotkey-panel' }, h('h3', null, '悬浮窗快捷键'),
    h('p', { className: 'muted small' }, '修改后点击应用。使用 Ctrl、Shift、Alt、Win 加按键；内容滚动在工作台页面生效，鼠标穿透时也能使用。'),
    h('div', { className: 'hotkey-grid' }, ...WINDOW_SHORTCUTS.map(([label, action]) => h('label', { className: 'hotkey-row', key: action },
      h('span', null, label), h('input', { 'aria-label': label, value: draft[action] || '', placeholder: '未设置', onChange: (e) => setDraft({ ...draft, [action]: e.target.value }), spellCheck: false }),
      h('span', { className: status[action] ? 'hotkey-ok' : 'muted small' }, status[action] ? '已注册' : action.startsWith('answer:') ? '问答页启用' : action.startsWith('screenshot:') ? '笔试/专注启用' : action === 'exam:exit' ? '专注时启用' : '未注册')))),
    h('button', { type: 'button', onClick: () => save().catch((e) => report(e.message)) }, '应用快捷键'));
}

export function FocusResizeHandle() {
  const active = React.useRef(false);
  const queue = React.useRef(Promise.resolve());
  const append = (fn) => { queue.current = queue.current.then(fn).catch(() => {}); };
  const end = () => { if (!active.current) return; active.current = false; append(() => window.api.window.focusResizeEnd()); };
  React.useEffect(() => end, []);
  return h('div', { className: 'focus-resize-handle no-drag', title: '拖动调整悬浮窗大小', role: 'separator', 'aria-label': '调整悬浮窗大小', onPointerDown: (e) => {
    if (e.button !== 0) return; e.preventDefault(); active.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Synthetic events do not own a pointer. */ }
    const { screenX, screenY } = e; append(() => window.api.window.focusResizeStart(screenX, screenY));
  }, onPointerMove: (e) => { if (active.current) { const { screenX, screenY } = e; append(() => window.api.window.focusResizeUpdate(screenX, screenY)); } }, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end });
}
