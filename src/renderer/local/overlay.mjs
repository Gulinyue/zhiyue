import { React } from '../vendor/react-icons-state.mjs';
import { WINDOW_SHORTCUTS } from '../../shared/window-shortcuts.mjs';
import { BRAND } from '../../shared/brand.mjs';
const h = React.createElement;

export function LocalShortcutOverlay() {
  const [ready, setReady] = React.useState(false);
  const [hotkeys, setHotkeys] = React.useState({});
  const [opacity, setOpacity] = React.useState(1);
  const root = React.useRef(null);
  React.useEffect(() => {
    const unprotect = window.api.window.onShortcutOverlayProtectionChanged(setReady);
    const apply = (settings) => setHotkeys(settings.hotkeys || {});
    const unsubscribe = window.api.settings.onChange(apply);
    const unopacity = window.api.window.onOpacityPreviewed(setOpacity);
    window.api.settings.get().then(apply).catch(() => {});
    return () => { unprotect(); unsubscribe(); unopacity(); };
  }, []);
  React.useEffect(() => {
    const el = root.current; if (!el) return;
    const report = () => window.api.window.reportShortcutOverlayLayout({ width: 316, height: el.scrollHeight + 16 });
    const observer = new ResizeObserver(report); observer.observe(el); report(); return () => observer.disconnect();
  }, [ready, hotkeys]);
  const gated = new URLSearchParams(window.location.search).get('captureProtection') === 'required';
  // Keep a measurable, invisible layout before native protection is confirmed.
  // The native protection primer waits for this layout report before revealing.
  return h('div', { className: 'local-shortcuts', ref: root, style: { opacity, visibility: gated && !ready ? 'hidden' : 'visible' } },
    h('strong', null, `${BRAND.name} · 快捷键`),
    ...WINDOW_SHORTCUTS.filter(([, action]) => ['screenshot:capture', 'screenshot:captureScrolling', 'window:hide', 'window:show', 'window:moveUp', 'window:moveDown', 'answer:scrollUp', 'answer:scrollDown', 'window:opacityDown', 'window:opacityUp', 'window:toggleMouseThrough', 'exam:exit'].includes(action)).map(([label, action]) =>
      h('div', { key: action }, h('span', null, label), h('kbd', null, hotkeys[action] || '未设置'))));
}
