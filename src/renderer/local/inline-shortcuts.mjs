// 知跃 · Developed by gulinyue. Share the protected task HWND on Windows.
import { React } from '../vendor/react-icons-state.mjs';
const h = React.createElement;
const format = value => (value || '未设置').replace(/CommandOrControl|Control/gi, 'Ctrl').replace(/Super|Meta/gi, 'Win').replace(/Up/g, '↑').replace(/Down/g, '↓').replace(/Left/g, '←').replace(/Right/g, '→');
export function InlineShortcutHints({ settings, mode, through }) {
  const keys = settings?.hotkeys || {};
  const items = [
    ...(mode === 'interview' ? [['退出面试', ['exam:exit']], ['回答当前问题', ['llm:resendHistory']]] : [['截图出答案', ['screenshot:capture']], ['滚动截图', ['screenshot:captureScrolling']], ['退出', ['exam:exit']]]),
    ['隐藏', ['window:hide']], ['显示', ['window:show']], ['移窗 ↑/↓', ['window:moveUp', 'window:moveDown']],
    ['电脑答案 ↑/↓', ['answer:scrollUp', 'answer:scrollDown']], ['手机答案 ↑/↓', ['mobile:scrollUp', 'mobile:scrollDown']], ['透明度 −/＋', ['window:opacityDown', 'window:opacityUp']],
  ];
  return h('aside', { className: 'inline-shortcuts', 'data-inline-shortcuts': mode, 'aria-label': '快捷键提示栏' },
    h('div', { className: 'inline-shortcuts-status' }, `${mode === 'interview' ? '实时面试' : '截图与回答'} · ${through ? '鼠标穿透 · ' : ''}随主窗口保护`),
    h('div', { className: 'inline-shortcuts-keys' }, ...items.map(([label, actions]) => h('div', { key: label }, h('span', null, label), h('kbd', null, actions.map(action => format(keys[action])).join(' / '))))));
}
