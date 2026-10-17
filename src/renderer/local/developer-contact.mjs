// 知跃 · Developed by gulinyue.
import { React } from '../vendor/react-icons-state.mjs';
import { BRAND } from '../../shared/brand.mjs';
const h = React.createElement;
export function DeveloperContact({ report }) {
  const open = async (action) => { try { await action(); } catch { report('暂时无法打开，请稍后重试。'); } };
  return h('section', { className: 'panel developer-contact', 'data-developer-contact': true, 'aria-label': '支持开发与 Bug 反馈' },
    h('div', null, h('strong', null, '喜欢知跃？支持它继续成长'), h('p', null, '赞助完全自愿，不影响免费使用。'), h('button', { type: 'button', className: 'support-button', 'data-support-developer': true, onClick: () => open(() => window.api.app.openSupport()) }, '♥ 爱发电支持开发者 ↗')),
    h('div', { className: 'developer-feedback' }, h('strong', null, '遇到 Bug？欢迎联系我'), h('p', null, '请附上系统版本、复现步骤和错误提示。'), h('button', { type: 'button', 'data-feedback-email': true, onClick: () => open(() => window.api.app.openFeedback()), title: '用默认邮件应用撰写反馈' }, BRAND.feedbackEmail)));
}
