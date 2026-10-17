import { React } from '../vendor/react-icons-state.mjs';
import { MODEL_PROVIDERS, MODEL_PROTOCOLS, modelProvider } from '../../shared/model-providers.mjs';
const h = React.createElement, api = window.api;
const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
const field = (label, props) => h('label', { className: 'field' }, h('span', null, label), h('input', props));

export function ChatGptAccount({ report, reload }) {
  const [state, setState] = React.useState({});
  const [pending, setPending] = React.useState(false);
  const [selectedAccount, setSelectedAccount] = React.useState('');
  const refresh = () => api.chatgpt.status().then(setState).catch((e) => report(e.message));
  React.useEffect(() => { void refresh(); }, []);
  async function login(newAccount = false, clientId) {
    setPending(true);
    try {
      const result = await api.chatgpt.signIn({ newAccount, clientId }); setState(result); await reload();
      report(result.planEnabled ? 'ChatGPT 已授权，可以获取模型列表并保存连接。' : '账号已登录，但没有获得套餐使用权限，请重新授权。', result.planEnabled);
    } catch (error) { report(error.message); await refresh(); }
    finally { setPending(false); }
  }
  return h('section', { className: 'panel account-panel' }, h('div', null,
    h('h3', null, '使用自己的 ChatGPT 账号'),
    h('p', { className: 'muted small' }, state.planEnabled ? `使用 ChatGPT 套餐 · ${state.email}` : '通过官方浏览器授权使用符合条件的 ChatGPT 套餐，无需填写 API Key。模型和额度以账号实际权限为准。')),
    h('div', { className: 'row wrap' },
      button(pending ? '等待浏览器授权…' : state.connected ? '重新授权' : 'Continue with ChatGPT', () => login(), { disabled: pending, className: 'primary' }),
      pending && button('取消登录', () => api.chatgpt.cancel()),
      state.connected && button('更换账号', () => login(true), { disabled: pending }),
      state.accounts?.length > 1 && h('select', { value: selectedAccount, 'aria-label': '已保存 ChatGPT 账号', disabled: pending, onChange: (e) => setSelectedAccount(e.target.value) }, h('option', { value: '' }, '选择已保存账号…'), ...state.accounts.map((r) => h('option', { key: r.clientId, value: r.clientId }, `${r.email || 'ChatGPT 账号'} · ${r.clientId.slice(-6)}${r.active ? '（当前）' : ''}`))),
      state.accounts?.length > 1 && button('使用所选账号', () => login(false, selectedAccount), { disabled: pending || !selectedAccount }),
      button('查看 ChatGPT 用量', () => api.chatgpt.usage()),
      state.connected && button('退出授权', async () => {
        try { const result = await api.chatgpt.logout(); setState(result); await reload(); report(result.revoked ? '已退出 ChatGPT 授权。' : '本机授权已清除，远端撤销未确认；可在 ChatGPT 设置中断开应用。', result.revoked); }
        catch (e) { report(e.message); }
      }, { disabled: pending })));
}

export function ModelCard({ slot, title, snapshot, reload, report, example }) {
  const profile = snapshot.profiles?.find((item) => item.slot === slot);
  const credential = snapshot.credentials?.find((item) => item.slot === slot);
  const [baseUrl, setBaseUrl] = React.useState(profile?.baseUrl || 'https://api.openai.com/v1');
  const [providerId, setProviderId] = React.useState(profile?.providerId || 'custom');
  const [apiMode, setApiMode] = React.useState(profile?.apiMode || 'chat-completions');
  const [model, setModel] = React.useState(profile?.model || '');
  const [apiKey, setApiKey] = React.useState('');
  const [thinkingLevel, setThinkingLevel] = React.useState(profile?.thinkingLevel);
  const [busy, setBusy] = React.useState(false);
  const [available, setAvailable] = React.useState([]);
  React.useEffect(() => {
    if (profile) { setBaseUrl(profile.baseUrl); setModel(profile.model); setProviderId(profile.providerId || 'custom'); setApiMode(profile.apiMode); setThinkingLevel(profile.thinkingLevel); setAvailable([]); }
  }, [profile?.baseUrl, profile?.model, profile?.providerId, profile?.apiMode]);
  React.useEffect(() => { if (example) { setBaseUrl(example.baseUrl); setProviderId(example.providerId); setApiMode(example.apiMode); setModel(example.model); setThinkingLevel(example.thinkingLevel); setApiKey(''); setAvailable([]); } }, [example]);
  const account = providerId === 'chatgpt';
  const input = () => ({ slot, providerId, apiMode, baseUrl: baseUrl.trim(), model: model.trim(), ...(thinkingLevel ? { thinkingLevel } : {}), ...(apiKey.trim() && !account ? { apiKey: apiKey.trim() } : {}) });
  async function save(test = false) {
    if (!model.trim()) { report('请填写模型 ID 或获取模型列表。'); return; }
    setBusy(true);
    try {
      if (test) { const result = await api.personalModels.test(input()); if (!result.ok) throw new Error(result.message); report(`连接成功，耗时 ${result.latencyMs} ms。`, true); }
      else { await api.personalModels.save(input()); report('模型连接已安全保存。', true); }
      setApiKey(''); await reload();
    } catch (error) { report(error.message); } finally { setBusy(false); }
  }
  return h('section', { className: 'panel model-card', 'data-model-slot': slot },
    h('div', { className: 'row between' }, h('h3', null, title), h('span', { className: profile?.enabled ? 'status ready' : 'status' }, profile?.enabled ? '已配置' : '未配置')),
    h('label', { className: 'field' }, h('span', null, '模型来源'), h('select', { value: providerId, 'data-model-field': 'provider', onChange: (e) => {
      const preset = modelProvider(e.target.value); setProviderId(preset.id); setBaseUrl(preset.baseUrl); setApiMode(preset.apiMode); setModel(preset.id === 'deepseek' ? 'deepseek-flash' : ''); setThinkingLevel(preset.id === 'deepseek' ? 'none' : undefined); setApiKey(''); setAvailable([]);
    } }, ...MODEL_PROVIDERS.map((p) => h('option', { value: p.id, key: p.id }, p.label)))),
    !account && field('Base URL', { value: baseUrl, 'data-model-field': 'base', onChange: (e) => { setBaseUrl(e.target.value); setApiKey(''); setAvailable([]); }, spellCheck: false }),
    providerId.startsWith('qwen-') && h('p', { className: 'muted small' }, '新账号请使用阿里云控制台提供的工作空间专属 Base URL，替换上方兼容域名。'),
    !account && h('label', { className: 'field' }, h('span', null, '接口协议'), h('select', { value: apiMode, 'data-model-field': 'protocol', onChange: (e) => { setApiMode(e.target.value); setAvailable([]); } }, ...Object.entries(MODEL_PROTOCOLS).map(([id, name]) => h('option', { value: id, key: id }, name)))),
    account && h('p', { className: 'muted small' }, '使用 ChatGPT 套餐 · 先在上方完成官方授权，然后获取当前账号的模型列表。'),
    !account && field('API Key', { type: 'password', value: apiKey, 'data-model-field': 'key', onChange: (e) => setApiKey(e.target.value), placeholder: credential?.boundBaseUrl === baseUrl ? `已保存 ····${credential.lastFour}，留空保留` : '输入此服务的 Key；本地无认证服务可留空', autoComplete: 'off' }),
    h('div', { className: 'row' }, button(busy ? '处理中…' : '获取模型列表', async () => {
      setBusy(true); try { const list = await api.personalModels.discover(input()); setAvailable(list); if (!list.length) report('服务商未返回可用模型，请手动填写模型 ID。'); else report(`已获取 ${list.length} 个模型；请选择或手动填写。`, true); }
      catch (e) { report(`${e.message}。也可以手动填写模型 ID，Azure 请填写部署名。`); } finally { setBusy(false); }
    }, { disabled: busy })),
    available.length > 0 && h('label', { className: 'field' }, h('span', null, '可用模型'), h('select', { value: available.some((m) => m.id === model) ? model : '', onChange: (e) => setModel(e.target.value) }, h('option', { value: '' }, '选择模型…'), ...available.map((m) => h('option', { key: m.id, value: m.id }, m.name === m.id ? m.id : `${m.name} · ${m.id}`)))),
    field(providerId === 'azure' ? '模型部署名称' : '模型 ID', { value: model, 'data-model-field': 'model', onChange: (e) => setModel(e.target.value), placeholder: '选择模型，或填写服务商提供的 ID', spellCheck: false }),
    h('p', { className: 'muted small' }, slot === 'screenshot' ? '请选择支持图片输入的模型。测试连接会发送一张测试图片。' : '用于文字问答和文字模拟面试。'),
    providerId === 'deepseek' && h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: thinkingLevel === 'none', 'data-model-thinking': true, onChange: e => setThinkingLevel(e.target.checked ? 'none' : undefined) }), '关闭深度思考，优先速度'),
    snapshot.credentialIssues?.[slot] && h('p', { className: 'muted small' }, snapshot.credentialIssues[slot]),
    h('div', { className: 'row' }, button('保存连接', () => save(false), { className: 'primary', disabled: busy }), button('测试并保存', () => save(true), { disabled: busy }),
      profile?.enabled && button('移除', async () => { try { await api.personalModels.remove(slot); await reload(); report('模型连接已移除。', true); } catch (e) { report(e.message); } }, { disabled: busy, className: 'danger-link' })));
}
