// 知跃 · Developed by gulinyue.
import { React } from '../vendor/react-icons-state.mjs';
import { GUIDE_STEPS, GUIDE_VALUES } from '../../shared/onboarding.mjs';
const h = React.createElement;
const KEY = 'zhiyue-beginner-guide-v1';
function readProgress() { try { const data = JSON.parse(localStorage.getItem(KEY)); return { step: Math.max(0, Math.min(GUIDE_STEPS.length - 1, Number.isInteger(data?.step) ? data.step : 0)), done: Array.isArray(data?.done) ? data.done.filter(id => GUIDE_STEPS.some(step => step.id === id)) : [] }; } catch { return { step: 0, done: [] }; } }
export function BeginnerGuide({ models, onConfigure, onNavigate, report }) {
  const [progress, setProgress] = React.useState(readProgress);
  const [speechReady, setSpeechReady] = React.useState(false);
  const [copied, setCopied] = React.useState('');
  const content = React.useRef(null);
  React.useEffect(() => { let alive = true; window.api.interview.connection().then(value => { if (alive) setSpeechReady(!!value.profile); }).catch(error => report(error.message)); return () => { alive = false; }; }, []);
  React.useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch {}; content.current?.scrollTo({ top: 0 }); }, [progress]);
  const step = GUIDE_STEPS[progress.step];
  const go = value => { setCopied(''); setProgress(old => ({ ...old, step: Math.max(0, Math.min(GUIDE_STEPS.length - 1, value)) })); };
  const ready = slot => models.profiles?.some(profile => profile.slot === slot && profile.enabled);
  const copy = async id => { try { await window.api.tutorial.copyValue(id); setCopied(id); } catch (error) { report(error.message); } };
  return h('div', { className: 'beginner-guide', 'data-beginner-guide': true },
    h('div', { className: 'guide-heading' }, h('div', null, h('span', { className: 'guide-eyebrow' }, '从注册到第一次回答'), h('h1', null, '新手教程'), h('p', null, '不用写代码，跟着一步一步完成。离开设置后可从侧栏回到这里，进度会保留。')), h('span', { className: 'guide-progress', role: 'status' }, `${progress.done.length} / ${GUIDE_STEPS.length} 已确认`)),
    h('div', { className: 'guide-connections', 'aria-label': '本机连接配置状态' }, ...[['文字问答', ready('interview')], ['截图分析', ready('screenshot')], ['语音转写', speechReady]].map(([label, configured]) => h('span', { key: label, className: configured ? 'ready' : '' }, configured ? '✓ ' : '○ ', label, configured ? ' · 已保存' : ' · 待配置'))),
    h('div', { className: 'guide-layout' },
      h('nav', { className: 'guide-steps', 'aria-label': '教程步骤' }, ...GUIDE_STEPS.map((item, index) => h('button', { type: 'button', key: item.id, 'data-guide-step': index, className: progress.step === index ? 'active' : '', 'aria-current': progress.step === index ? 'step' : undefined, onClick: () => go(index) }, h('span', null, progress.done.includes(item.id) ? '✓' : String(index + 1).padStart(2, '0')), item.title))),
      h('section', { className: 'guide-content panel', ref: content, 'data-guide-current': step.id },
        h('span', { className: 'guide-eyebrow' }, `第 ${progress.step + 1} 步 / 共 ${GUIDE_STEPS.length} 步`), h('h2', null, step.title), h('p', { className: 'guide-summary' }, step.summary),
        step.links && h('div', { className: 'row wrap guide-links' }, ...step.links.map(([id, label]) => h('button', { key: id, type: 'button', 'data-guide-link': id, onClick: async () => { try { await window.api.tutorial.openLink(id); } catch (error) { report(error.message); } } }, label, ' ↗'))),
        step.target && h('div', { className: 'guide-configure' }, h('button', { type: 'button', className: 'primary', 'data-guide-configure': step.target, onClick: () => onConfigure(step.target) }, `去填写${step.target === 'interview' ? '文字' : step.target === 'screenshot' ? '截图' : '语音'}示例 →`), h('p', null, '只预填地址、协议和型号，不读取剪贴板或你的 Key。填完并测试保存后，从侧栏回到本教程。')),
        h('ol', { className: 'guide-instructions' }, ...step.items.map((text, index) => h('li', { key: index }, text))),
        step.copies && h('div', { className: 'guide-copy-fields' }, ...step.copies.map(([id, label]) => h('div', { key: id }, h('span', null, label), h('code', null, GUIDE_VALUES[id]), h('button', { type: 'button', 'data-guide-copy': id, onClick: () => copy(id) }, copied === id ? '已复制 ✓' : '复制')))),
        h('label', { className: 'guide-check' }, h('input', { type: 'checkbox', 'data-guide-check': true, checked: progress.done.includes(step.id), onChange: e => { const checked = e.target.checked; setProgress(old => ({ ...old, done: checked ? [...new Set([...old.done, step.id])] : old.done.filter(id => id !== step.id) })); } }), step.check),
        h('div', { className: 'row between guide-footer' }, h('button', { type: 'button', disabled: progress.step === 0, onClick: () => go(progress.step - 1) }, '← 上一步'), progress.step < GUIDE_STEPS.length - 1 ? h('button', { type: 'button', className: 'primary', onClick: () => go(progress.step + 1) }, '下一步 →') : h('button', { type: 'button', className: 'primary', onClick: () => onNavigate('settings') }, '回到设置开始使用')))));
}
