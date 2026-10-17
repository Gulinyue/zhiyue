// 知跃 / Zhiyue · Developed by gulinyue.
import { React } from '../vendor/react-icons-state.mjs';
import { CODING_LANGUAGES, ANSWER_LANGUAGES, normalizeWrittenOptions } from '../../shared/written-options.mjs';
const h = React.createElement;
export function WrittenSettings({ settings, documents, patchSettings, start }) {
  const options = normalizeWrittenOptions(settings?.writtenOptions);
  const patch = (change) => patchSettings({ writtenOptions: change });
  const select = (label, key, choices) => h('label', { className: 'field' }, h('span', null, label), h('select', { value: options[key], 'data-written-setting': key, onChange: (e) => patch({ [key]: e.target.value }) }, ...choices.map(([value, name]) => h('option', { value, key: value }, name))));
  return h('section', { className: 'panel written-settings', 'data-written-settings': true },
    h('div', { className: 'row between' }, h('div', null, h('h3', null, '笔试定制'), h('p', { className: 'muted small' }, `开启后立即进入不可点击的半透明悬浮窗。${settings?.hotkeys?.['exam:exit'] || 'Ctrl+Shift+Z'} 退出并恢复设置界面。`)), h('button', { type: 'button', className: 'primary', onClick: start }, '开始笔试')),
    h('div', { className: 'shortcut-hints-card', 'data-written-setting': 'showShortcutHints' },
      h('div', { className: 'shortcut-hints-copy' },
        h('div', { className: 'shortcut-hints-heading' }, h('strong', { id: 'shortcut-hints-title' }, '快捷键提示栏'), h('span', { className: `shortcut-hints-status${options.showShortcutHints ? ' is-on' : ''}`, role: 'status' }, options.showShortcutHints ? '当前：已开启' : '当前：已关闭')),
        h('p', { id: 'shortcut-hints-description' }, '决定进入笔试模式后是否显示快捷键提示。关闭提示栏后，所有快捷键仍可使用。')),
      h('div', { className: 'shortcut-hints-actions', role: 'group', 'aria-labelledby': 'shortcut-hints-title', 'aria-describedby': 'shortcut-hints-description' },
        h('button', { type: 'button', className: 'shortcut-hints-choice', 'data-shortcut-hints': 'show', 'aria-pressed': options.showShortcutHints, onClick: () => patch({ showShortcutHints: true }) }, '显示提示栏'),
        h('button', { type: 'button', className: 'shortcut-hints-choice', 'data-shortcut-hints': 'hide', 'aria-pressed': !options.showShortcutHints, onClick: () => patch({ showShortcutHints: false }) }, '隐藏提示栏'))),
    h('div', { className: 'settings-grid' },
      select('默认编程语言（题目指定时优先题目）', 'codingLanguage', CODING_LANGUAGES.map((v) => [v, v === 'auto' ? '按题目自动选择' : v])),
      select('回答语言', 'answerLanguage', ANSWER_LANGUAGES.map((v) => [v, v === 'auto' ? '跟随题目语言' : v])),
      select('本地知识库', 'knowledgeMode', [['all', '使用全部已启用资料'], ['selected', '仅使用勾选资料'], ['off', '不使用本地资料']]),
      h('label', { className: 'field' }, h('span', null, `笔试窗口不透明度 ${Math.round(options.opacity * 100)}%`), h('input', { type: 'range', min: .15, max: .85, step: .01, value: options.opacity, 'data-written-setting': 'opacity', onChange: (e) => patch({ opacity: Number(e.target.value) }) }))),
    options.knowledgeMode === 'selected' && h('div', { className: 'written-document-options' }, documents.length ? documents.map((doc) => h('label', { className: 'check', key: doc.id }, h('input', { type: 'checkbox', disabled: doc.enabled === false, checked: options.documentIds.includes(doc.id), onChange: (e) => patch({ documentIds: e.target.checked ? [...options.documentIds, doc.id] : options.documentIds.filter((id) => id !== doc.id) }) }), doc.title, doc.enabled === false ? '（知识库中已禁用）' : '')) : h('p', { className: 'muted small' }, '暂无资料，请先到“本机知识库”添加。')),
    h('label', { className: 'field' }, h('span', null, '笔试回答提示词（独立于通用回答偏好，最多 4000 字）'), h('textarea', { rows: 4, maxLength: 4000, value: options.prompt, 'data-written-setting': 'prompt', placeholder: '例如：先给选项；算法题使用 ACM 输入输出格式，并补充边界情况。', onChange: (e) => patch({ prompt: e.target.value }) })),
    h('p', { className: 'muted small' }, '截图题会附加所选资料的有界文本片段；文字题按关键词匹配。只发送本次选择的资料，资料修改后下次提问生效。Windows 笔试窗口使用 WDA_EXCLUDEFROMCAPTURE；不支持该机制的捕获方式仍可能录到窗口。'));
}
