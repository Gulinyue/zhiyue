// 知跃 · Developed by gulinyue.
import { React } from '../vendor/react-icons-state.mjs';
import { normalizeInterviewOptions } from '../../shared/interview-options.mjs';
import { SPEECH_PROVIDERS, speechProvider, speechModelChoices, inferSpeechProvider } from '../../shared/speech-providers.mjs';
const h = React.createElement;
const errorText = (error) => String(error?.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
export function SpeechSettings({ settings, patchSettings, report, start, example }) {
  const [connection, setConnection] = React.useState({});
  const [providerId, setProviderId] = React.useState('openai');
  const [baseUrl, setBaseUrl] = React.useState('https://api.openai.com/v1');
  const [model, setModel] = React.useState('gpt-4o-mini-transcribe');
  const [apiKey, setApiKey] = React.useState('');
  const [language, setLanguage] = React.useState('zh');
  const [hotwords, setHotwords] = React.useState('');
  const [busy, setBusy] = React.useState('');
  const [discovered, setDiscovered] = React.useState([]);
  const [result, setResult] = React.useState('');
  const options = normalizeInterviewOptions(settings?.interviewOptions);
  const provider = speechProvider(providerId);
  const automaticLanguage = provider.minimalForm || provider.supportsLanguage === false;
  const choices = [...new Map([...speechModelChoices(providerId), ...discovered].map(item => [item.id, item])).values()];
  const patch = (value) => patchSettings({ interviewOptions: value });
  React.useEffect(() => { let alive = true; window.api.interview.connection().then((value) => { if (!alive) return; setConnection(value); if (value.profile && !example) { setProviderId(value.profile.providerId || inferSpeechProvider(value.profile.baseUrl)); setBaseUrl(value.profile.baseUrl); setModel(value.profile.model); setLanguage(value.profile.language); setHotwords(value.profile.prompt); } }).catch((error) => report(error.message)); return () => { alive = false; }; }, []);
  React.useEffect(() => { if (example) { setProviderId(example.providerId); setBaseUrl(example.baseUrl); setModel(example.model); setLanguage(example.language); setHotwords(''); setApiKey(''); setDiscovered([]); setResult('已预填百炼北京示例；请填写你自己的 Key，测试并保存后才会生效。'); } }, [example]);
  const raw = () => ({ providerId, baseUrl, model, language, prompt: hotwords, apiKey });
  const edit = (fn) => (e) => { setResult(''); fn(e.target.value); };
  async function operate(kind) {
    setBusy(kind); setResult('');
    try {
      if (kind === 'discover') {
        const models = await window.api.interview.discoverModels(raw()); setDiscovered(models);
        setResult(models.length ? `已获取 ${models.length} 个候选模型，可在下拉框选择；是否支持转写请用“测试并保存”确认。` : '服务没有返回语音模型，请使用预设或手动填写模型 ID。');
      } else {
        const tested = kind === 'test' ? await window.api.interview.testConnection(raw()) : null;
        setConnection(tested ? tested.connection : await window.api.interview.saveConnection(raw())); setApiKey('');
        setResult(tested ? `连接测试通过（${tested.latencyMs} ms），已保存。该测试只验证上传和响应，不评估真实语音识别质量。` : '语音服务已保存。可点击“开始面试”直接进入悬浮窗。');
      }
    } catch (error) { setResult(errorText(error)); report(errorText(error)); } finally { setBusy(''); }
  }
  const field = (label, child) => h('label', { className: 'field' }, h('span', null, label), child);
  return h('section', { className: 'panel speech-settings', 'data-speech-settings': true },
    h('div', { className: 'row between' }, h('h3', null, '实时面试 · 语音转写'), h('span', { className: connection.profile ? 'status ready' : 'status' }, connection.profile ? '已配置' : '未配置')),
    h('p', { className: 'muted small' }, '仅收录系统声音，不使用麦克风。转写后交给已选的“文字问答模型”回答。语音服务独立配置，密钥由系统加密保存在本机。'),
    h('fieldset', { disabled: !!busy, className: 'speech-connection-fields' },
      h('div', { className: 'settings-grid' },
        field('语音服务商', h('select', { value: providerId, 'data-speech-field': 'provider', onChange: edit((id) => { const p = speechProvider(id); setProviderId(id); setBaseUrl(p.baseUrl); setModel(speechModelChoices(id)[0]?.id || ''); setApiKey(''); setDiscovered([]); }) }, ...SPEECH_PROVIDERS.map(p => h('option', { key: p.id, value: p.id }, p.label)))),
        field('语音服务 Base URL', h('input', { value: baseUrl, 'data-speech-field': 'base', placeholder: 'https://服务地址/v1 或完整转写地址', onChange: edit((value) => { setBaseUrl(value); setApiKey(''); setDiscovered([]); }), spellCheck: false })),
        field('选择语音模型', h('select', { value: choices.some(item => item.id === model) ? model : '', 'data-speech-field': 'preset', onChange: edit(setModel) }, h('option', { value: '', disabled: true }, '手动填写或获取模型列表'), ...choices.map(item => h('option', { key: item.id, value: item.id }, `${item.name} · ${item.id}`)))),
        field('模型 ID（支持手动填写）', h('input', { value: model, 'data-speech-field': 'model', onChange: edit(setModel), spellCheck: false })),
        field('语音 API Key（本机无认证服务可留空）', h('input', { type: 'password', value: apiKey, 'data-speech-field': 'key', placeholder: connection.credential?.boundBaseUrl === baseUrl.trim().replace(/\/(?:audio\/transcriptions|chat\/completions)\/?$/i, '').replace(/\/$/, '') ? `已保存 ····${connection.credential.lastFour}，留空保留` : '此地址专用的 API Key', onChange: edit(setApiKey), autoComplete: 'off' })),
        field('面试官说话语言', h('select', { disabled: automaticLanguage, value: automaticLanguage ? '' : language, 'data-speech-field': 'language', onChange: edit(setLanguage) }, h('option', { value: 'zh' }, '中文'), h('option', { value: 'en' }, 'English'), h('option', { value: '' }, '自动识别')))),
      h('p', { className: 'muted small', 'data-speech-help': true }, provider.help),
      field('识别热词或转写提示（最多 1000 字）', h('textarea', { disabled: provider.minimalForm, rows: 2, value: hotwords, maxLength: 1000, onChange: edit(setHotwords), placeholder: '例如：Redis、Spring Boot、Kubernetes、项目名称…' })),
      h('div', { className: 'row wrap' },
        h('button', { type: 'button', 'data-speech-discover': true, onClick: () => operate('discover') }, busy === 'discover' ? '获取中…' : '获取模型列表'),
        h('button', { type: 'button', className: 'primary', 'data-speech-test': true, onClick: () => operate('test') }, busy === 'test' ? '测试中…' : '测试并保存'),
        h('button', { type: 'button', 'data-speech-save': true, onClick: () => operate('save') }, '直接保存'),
        connection.profile && h('button', { type: 'button', onClick: async () => { setBusy('remove'); try { setConnection(await window.api.interview.removeConnection()); setApiKey(''); setResult('语音服务已移除。'); } catch (error) { report(error.message); } finally { setBusy(''); } } }, '移除语音服务'))),
    h('p', { className: 'muted small' }, '连接测试发送 0.5 秒合成音，不访问麦克风或系统声音，服务商可能按调用计费。测试失败会保留原配置。'),
    result && h('p', { role: 'status', 'data-speech-result': true }, result),
    h('hr'),
    h('div', { className: 'row between' }, h('span', { className: 'muted small' }, '升级后可一键应用口述稿、快速模式、0.7 秒停顿和自动回答。'), h('button', { type: 'button', 'data-interview-fast': true, onClick: () => patch({ responseStyle: 'spoken', speedMode: 'fast', silenceMs: 700, autoAnswer: true }) }, '应用快速口述推荐')),
    h('div', { className: 'row between' }, h('div', null, h('h3', null, '面试定制'), h('p', { className: 'muted small' }, `进入后立即开始收音并显示半透明、不可点击的悬浮窗。${settings?.hotkeys?.['exam:exit'] || 'Ctrl+Shift+Z'} 结束面试并回到设置。`)), h('button', { type: 'button', className: 'primary', disabled: !!busy, 'data-start-interview': true, onClick: start }, '开始面试')),
    h('div', { className: 'shortcut-hints-card' },
      h('div', { className: 'shortcut-hints-copy' }, h('div', { className: 'shortcut-hints-heading' }, h('strong', null, '面试快捷键提示栏'), h('span', { className: `shortcut-hints-status${options.showShortcutHints ? ' is-on' : ''}` }, options.showShortcutHints ? '当前：已开启' : '当前：已关闭')), h('p', null, 'Windows 提示栏与答案同窗显示，共用穿透与捕获排除；隐藏后仍可通过快捷键退出、移动窗口和滚动回答。')),
      h('div', { className: 'shortcut-hints-actions', role: 'group', 'aria-label': '面试快捷键提示栏' }, ...[['show', true, '显示提示栏'], ['hide', false, '隐藏提示栏']].map(([id, value, label]) => h('button', { key: id, type: 'button', className: 'shortcut-hints-choice', 'data-interview-hints': id, 'aria-pressed': options.showShortcutHints === value, onClick: () => patch({ showShortcutHints: value }) }, label)))),
    h('div', { className: 'settings-grid' },
      field('回答形式', h('select', { value: options.responseStyle, 'data-interview-setting': 'responseStyle', onChange: e => patch({ responseStyle: e.target.value }) }, h('option', { value: 'spoken' }, '口述稿 · 可直接说出口（推荐）'), h('option', { value: 'outline' }, '简短回答 + 关键要点'))),
      field('响应速度', h('select', { value: options.speedMode, 'data-interview-setting': 'speedMode', onChange: e => patch({ speedMode: e.target.value, ...(e.target.value === 'fast' ? { silenceMs: 700 } : {}) }) }, h('option', { value: 'fast' }, '快速 · 提前分片转写、短回答'), h('option', { value: 'balanced' }, '稳健 · 较长上下文与回答'))),
      field(`面试窗口不透明度 ${Math.round(options.opacity * 100)}%`, h('input', { type: 'range', min: .15, max: .85, step: .01, value: options.opacity, onChange: (e) => patch({ opacity: Number(e.target.value) }) })),
      field(`停顿 ${options.silenceMs / 1000} 秒后结束一句`, h('input', { type: 'range', min: 500, max: 2500, step: 100, value: options.silenceMs, onChange: (e) => patch({ silenceMs: Number(e.target.value) }) })),
      field('收音灵敏度（数字越小越灵敏）', h('input', { type: 'number', min: .002, max: .05, step: .001, value: options.threshold, onChange: (e) => patch({ threshold: Number(e.target.value) }) })),
      field('回答语言', h('input', { value: options.answerLanguage, maxLength: 40, onChange: (e) => patch({ answerLanguage: e.target.value }) })),
      h('div', { className: 'field' }, h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: options.autoAnswer, onChange: (e) => patch({ autoAnswer: e.target.checked }) }), '问题转写完成后自动回答'), h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: options.useKnowledge, onChange: (e) => patch({ useKnowledge: e.target.checked }) }), '参考本机已启用的知识库'))),
    h('p', { className: 'muted small' }, '快速模式每 6 秒提前转写一次长问题，停顿后合并回答；缩短上下文并在 DeepSeek 文字模型上关闭深度思考。分片可能增加语音请求次数。悬浮窗显示实测转写与回答首字耗时，实际速度仍受网络和服务商影响。'),
    field('面试回答提示词（最多 4000 字）', h('textarea', { value: options.prompt, maxLength: 4000, rows: 3, onChange: (e) => patch({ prompt: e.target.value }), placeholder: '例如：应聘 Java 后端开发。像应聘者一样自然表达，先回答结论，再说做法和取舍。' })));
}
