import { React } from '../vendor/react-icons-state.mjs';
const h = React.createElement;

export function LocalShortcutOverlay() {
  const [ready, setReady] = React.useState(false);
  const [hotkeys, setHotkeys] = React.useState({});
  React.useEffect(() => {
    const unprotect = window.api.window.onShortcutOverlayProtectionChanged(setReady);
    const apply = (settings) => setHotkeys(settings.hotkeys || {});
    const unsubscribe = window.api.settings.onChange(apply);
    window.api.settings.get().then(apply).catch(() => {});
    return () => { unprotect(); unsubscribe(); };
  }, []);
  React.useEffect(() => { window.api.window.reportShortcutOverlayLayout({ width: 316, height: 250 }); }, [ready]);
  const gated = new URLSearchParams(window.location.search).get('captureProtection') === 'required';
  if (gated && !ready) return null;
  return h('div', { className: 'local-shortcuts' },
    h('strong', null, 'Climb Local · 快捷键'),
    ...[['截图并提问', 'screenshot:capture'], ['滚动截图并提问', 'screenshot:captureScrolling'], ['显示 / 隐藏', 'window:toggle'], ['切换鼠标穿透', 'window:toggleMouseThrough'], ['退出专注窗口', 'exam:exit']].map(([label, action]) =>
      h('div', { key: action }, h('span', null, label), h('kbd', null, hotkeys[action] || '未设置'))));
}
