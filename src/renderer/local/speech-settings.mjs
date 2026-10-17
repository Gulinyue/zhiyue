// 知跃 · Developed by gulinyue.
import { React } from '../vendor/react-icons-state.mjs';
import { normalizeInterviewOptions } from '../../shared/interview-options.mjs';
const h = React.createElement;
export function SpeechSettings({ settings, patchSettings, report }) {
  const [connection, setConnection] = React.useState({});
  const [baseUrl, setBaseUrl] = React.useState('https://api.openai.com/v1');
  const [model, setModel] = React.useState('gpt-4o-mini-transcribe');
  const [apiKey, setApiKey] = React.useState('');
  const [language, setLanguage] = React.useState('zh');
  const [hotwords, setHotwords] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const options = normalizeInterviewOptions(settings?.interviewOptions);
  const patch = (value) => patchSettings({ interviewOptions: value });
  React.useEffect(() => { let alive = true; window.api.interview.connection().then((value) => { if (!alive) return; setConnection(value); if (value.profile) { setBaseUrl(value.profile.baseUrl); setModel(value.profile.model); setLanguage(value.profile.language); setHotwords(value.profile.prompt); } }).catch((error) => report(error.message)); return () => { alive = false; }; }, []);
  async function save() {
    setBusy(true);
    try { setConnection(await window.api.interview.saveConnection({ baseUrl, model, language, prompt: hotwords, apiKey })); setApiKey(''); report('语音服务已保存，密钥使用系统加密；请到实时面试页面开始监听。', true); }
    catch (error) { report(error.message); } finally { setBusy(false); }
  }
  return h('section', { className: 'panel speech-settings', 'data-speech-settings': true },
    h('div', { className: 'row between' }, h('h3', null, '实时面试 · 语音转写'), h('span', { className: connection.profile ? 'status ready' : 'status' }, connection.profile ? '已配置' : '未配置')),
    h('p', { className: 'muted small' }, '仅收录系统声音，不使用麦克风。按停顿分句转写后交给“文字问答模型”回答；可使用 OpenAI 或兼容 /audio/transcriptions 的服务、本机 Whisper 服务。语音转写单独配置，ChatGPT 账号授权不代替语音 API Key。'),
    h('div', { className: 'settings-grid' },
      h('label', { className: 'field' }, h('span', null, '语音服务 Base URL'), h('input', { value: baseUrl, 'data-speech-field': 'base', onChange: (e) => { setBaseUrl(e.target.value); setApiKey(''); }, spellCheck: false })),
      h('label', { className: 'field' }, h('span', null, '语音模型 ID'), h('input', { value: model, 'data-speech-field': 'model', onChange: (e) => setModel(e.target.value), spellCheck: false })),
      h('label', { className: 'field' }, h('span', null, '语音 API Key（本机无认证服务可留空）'), h('input', { type: 'password', value: apiKey, 'data-speech-field': 'key', placeholder: connection.credential?.boundBaseUrl === baseUrl ? `已保存 ····${connection.credential.lastFour}，留空保留` : '密钥单独加密保存在本机', onChange: (e) => setApiKey(e.target.value), autoComplete: 'off' })),
      h('label', { className: 'field' }, h('span', null, '面试官说话语言'), h('select', { value: language, 'data-speech-field': 'language', onChange: (e) => setLanguage(e.target.value) }, h('option', { value: 'zh' }, '中文'), h('option', { value: 'en' }, 'English'), h('option', { value: '' }, '自动识别')))),
    h('label', { className: 'field' }, h('span', null, '识别热词或转写提示（最多 1000 字）'), h('textarea', { rows: 2, value: hotwords, maxLength: 1000, onChange: (e) => setHotwords(e.target.value), placeholder: '例如：Redis、Spring Boot、Kubernetes、项目名称…' })),
    h('div', { className: 'row wrap' }, h('button', { type: 'button', className: 'primary', disabled: busy, 'data-speech-save': true, onClick: save }, busy ? '保存中…' : '保存语音服务'), connection.profile && h('button', { type: 'button', disabled: busy, onClick: async () => { try { setConnection(await window.api.interview.removeConnection()); setApiKey(''); report('语音服务已移除。', true); } catch (error) { report(error.message); } } }, '移除语音服务')),
    h('hr'), h('div', { className: 'settings-grid' },
      h('label', { className: 'field' }, h('span', null, `停顿 ${options.silenceMs / 1000} 秒后结束一句`), h('input', { type: 'range', min: 500, max: 2500, step: 100, value: options.silenceMs, onChange: (e) => patch({ silenceMs: Number(e.target.value) }) })),
      h('label', { className: 'field' }, h('span', null, '收音灵敏度（数字越小越灵敏）'), h('input', { type: 'number', min: .002, max: .05, step: .001, value: options.threshold, onChange: (e) => patch({ threshold: Number(e.target.value) }) })),
      h('label', { className: 'field' }, h('span', null, '回答语言'), h('input', { value: options.answerLanguage, maxLength: 40, onChange: (e) => patch({ answerLanguage: e.target.value }) })),
      h('div', { className: 'field' }, h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: options.autoAnswer, onChange: (e) => patch({ autoAnswer: e.target.checked }) }), '问题转写完成后自动回答'), h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: options.useKnowledge, onChange: (e) => patch({ useKnowledge: e.target.checked }) }), '参考本机已启用的知识库'))),
    h('label', { className: 'field' }, h('span', null, '面试回答提示词（最多 4000 字）'), h('textarea', { value: options.prompt, maxLength: 4000, rows: 3, onChange: (e) => patch({ prompt: e.target.value }), placeholder: '例如：应聘 Java 后端开发，先给 30 秒口语化回答，再补充关键技术点。' })));
}
