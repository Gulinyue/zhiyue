import { React, createRoot } from '../vendor/react-icons-state.mjs';
import { MarkdownBody } from '../vendor/markdown.mjs';
import { LOCAL_ACCOUNT } from '../../shared/local-profile.mjs';
import { buildLocalRequest, chooseModelSlot } from './requests.mjs';
import { LocalShortcutOverlay } from './overlay.mjs';

const h = React.createElement;
const api = window.api;
const uid = () => crypto.randomUUID();
const fresh = (mode = 'chat') => ({ id: uid(), title: '', updatedAt: Date.now(), mode, messages: [] });
const button = (label, onClick, options = {}) => h('button', { type: 'button', onClick, ...options }, label);
const field = (label, props) => h('label', { className: 'field' }, h('span', null, label), h('input', props));
const date = (value) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const paint = () => new Promise((resolve) => { const timeout = setTimeout(resolve, 150); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timeout); resolve(); })); });

function ModelCard({ slot, title, snapshot, reload, report }) {
  const profile = snapshot.profiles?.find((item) => item.slot === slot);
  const credential = snapshot.credentials?.find((item) => item.slot === slot);
  const [baseUrl, setBaseUrl] = React.useState(profile?.baseUrl || 'https://api.openai.com/v1');
  const [model, setModel] = React.useState(profile?.model || '');
  const [apiKey, setApiKey] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (profile) { setBaseUrl(profile.baseUrl); setModel(profile.model); }
  }, [profile?.baseUrl, profile?.model]);
  async function save(test = false) {
    if (!model.trim()) { report('请填写模型名称。'); return; }
    setBusy(true);
    try {
      const input = { slot, baseUrl: baseUrl.trim(), model: model.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) };
      if (test) {
        const result = await api.personalModels.test(input);
        if (!result.ok) throw new Error(result.message);
        report(`连接成功，耗时 ${result.latencyMs} ms。`, true);
      } else {
        await api.personalModels.save(input);
        report('模型连接已安全保存。', true);
      }
      setApiKey('');
      await reload();
    } catch (error) { report(error.message); }
    finally { setBusy(false); }
  }
  return h('section', { className: 'panel model-card' },
    h('div', { className: 'row between' }, h('h3', null, title), h('span', { className: profile?.enabled ? 'status ready' : 'status' }, profile?.enabled ? '已连接' : '未配置')),
    field('Base URL', { value: baseUrl, onChange: (e) => setBaseUrl(e.target.value), placeholder: 'https://你的模型接口/v1', spellCheck: false }),
    field('模型名称', { value: model, onChange: (e) => setModel(e.target.value), placeholder: '填写服务商提供的模型 ID', spellCheck: false }),
    field('API Key', { type: 'password', value: apiKey, onChange: (e) => setApiKey(e.target.value), placeholder: credential ? `已保存 ····${credential.lastFour}，留空保留` : '输入 API Key；本地无认证服务可留空', autoComplete: 'off' }),
    h('p', { className: 'muted small' }, slot === 'screenshot' ? '截图模型需要支持图片输入。测试连接会发送一张测试图片。' : '用于文字问答和文字模拟面试。'),
    h('div', { className: 'row' }, button(busy ? '处理中…' : '保存连接', () => save(false), { className: 'primary', disabled: busy }), button('测试并保存', () => save(true), { disabled: busy }),
      profile?.enabled && button('移除', async () => { try { await api.personalModels.remove(slot); await reload(); report('模型连接已移除。', true); } catch (error) { report(error.message); } }, { disabled: busy, className: 'danger-link' })));
}

function App() {
  const [page, setPage] = React.useState('chat');
  const [conversation, setConversation] = React.useState(fresh);
  const [draft, setDraft] = React.useState('');
  const [images, setImages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const [through, setThrough] = React.useState(false);
  const [settings, setSettings] = React.useState(null);
  const [models, setModels] = React.useState({ profiles: [], credentials: [] });
  const [documents, setDocuments] = React.useState([]);
  const [history, setHistory] = React.useState([]);
  const [displays, setDisplays] = React.useState([]);
  const [recordState, setRecordState] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [documentTitle, setDocumentTitle] = React.useState('');
  const [documentText, setDocumentText] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);
  const active = React.useRef(null);
  const actions = React.useRef({});
  const thread = React.useRef(null);
  const mounted = React.useRef(true);
  const report = (text, success = false) => setNotice({ text, success });
  const reloadModels = async () => setModels(await api.personalModels.load());
  const reloadHistory = async () => setHistory(await api.workspace.list());
  const reloadDocuments = async () => setDocuments(await api.knowledgeLibrary.list(LOCAL_ACCOUNT));

  React.useEffect(() => {
    mounted.current = true;
    Promise.all([api.settings.get().then(setSettings), reloadModels(), reloadHistory(), reloadDocuments(), api.screenshot.displays().then(setDisplays), api.localRecords.state(LOCAL_ACCOUNT).then(setRecordState)]).catch((error) => report(error.message));
    const unsubSettings = api.settings.onChange(setSettings);
    const unsubHotkeys = api.hotkey.onTriggered((action) => actions.current.hotkey?.(action));
    const unsubReveal = api.window.onRevealRequested(async ({ token }) => { await paint(); await api.window.commitReveal(token); });
    return () => { mounted.current = false; unsubSettings(); unsubHotkeys(); unsubReveal(); if (active.current) void api.personalModels.cancel(active.current); };
  }, []);
  React.useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: busy ? 'auto' : 'smooth' }); }, [conversation.messages, busy]);
  React.useEffect(() => { document.documentElement.dataset.appSurface = focus ? 'focus' : 'preparation'; }, [focus]);

  async function saveConversation(next) {
    try { await api.workspace.save(next); await reloadHistory(); }
    catch (error) { report(`记录保存失败：${error.message}`); }
  }
  async function send(question = draft, attachments = images) {
    if (active.current || capturing || (!question.trim() && !attachments.length)) return;
    const slot = chooseModelSlot(models.profiles, attachments.length > 0);
    if (!slot) { setPage('settings'); report(attachments.length ? '请先配置截图模型。' : '请先配置一个模型连接。'); return; }
    if (conversation.messages.length >= 198) { report('本会话已满，请开始新会话。'); return; }
    const requestId = `local-${uid()}`;
    const userText = question.trim() || '请分析截图中的问题并解答。';
    const user = { id: uid(), role: 'user', text: userText + (attachments.length ? `\n\n[附 ${attachments.length} 张截图]` : ''), images: attachments, status: 'completed' };
    const reply = { id: uid(), role: 'assistant', text: '', status: 'completed' };
    const next = { ...conversation, title: conversation.title || userText.slice(0, 45), updatedAt: Date.now(), messages: [...conversation.messages, user, reply] };
    const request = buildLocalRequest({ question: userText, images: attachments, history: conversation.messages, documents, mode: conversation.mode, prompt: settings?.customPrompts || '' });
    active.current = requestId;
    setBusy(true); setDraft(''); setImages([]); setPage('chat'); setNotice(null); setConversation(next);
    let text = '';
    let flushTimer;
    const flush = () => {
      flushTimer = undefined;
      if (active.current === requestId && mounted.current) setConversation({ ...next, messages: [...next.messages.slice(0, -1), { ...reply, text }] });
    };
    const unsubscribe = api.personalModels.onStreamEvent((payload) => {
      if (payload.requestId !== requestId || active.current !== requestId) return;
      if (payload.event.type === 'delta') { text += payload.event.delta; if (!flushTimer) flushTimer = setTimeout(flush, 40); }
    });
    let status = 'completed';
    try {
      const result = await api.personalModels.run({ requestId, taskKind: attachments.length ? 'exam' : 'interview', slot, request });
      if (!result.ok) {
        if (result.error?.code === 'PERSONAL_MODEL_ABORTED') status = 'cancelled';
        else throw new Error(result.error?.message || '模型请求失败');
      } else text = result.result.text || text;
    } catch (error) { status = 'failed'; report(error.message); if (!text) text = `请求未完成：${error.message}`; }
    finally {
      clearTimeout(flushTimer); unsubscribe();
      const saved = { ...next, updatedAt: Date.now(), messages: [...next.messages.slice(0, -1), { ...reply, text: text || '（已停止生成）', status }] };
      if (mounted.current) { setConversation(saved); setBusy(false); }
      active.current = null;
      await saveConversation(saved);
    }
  }
  async function capture(submit = false, scroll = false) {
    if (active.current || capturing) return;
    if (submit && !chooseModelSlot(models.profiles, true)) { setPage('settings'); report('请先配置截图模型。'); return; }
    setCapturing(true);
    try {
      const result = await api.screenshot.capture({ origin: 'local', displayId: settings?.localScreenshotDisplayId || displays[0]?.id, scroll, enqueue: false });
      if (!result.url) throw new Error(result.error?.message || '截图失败，请检查显示器选择。');
      const captured = result.urls || [result.url];
      const nextImages = submit ? captured : [...images, ...captured];
      if (nextImages.length > 4) throw new Error('每次最多添加 4 张截图，请先移除多余图片。');
      setImages(nextImages); setPage('chat');
      if (submit) {
        // send() cannot reuse the current capturing render; release the native lease first.
        setCapturing(false);
        await actions.current.sendCaptured(draft || '请分析截图中的问题并解答。', nextImages);
      }
    } catch (error) { report(error.message); }
    finally { setCapturing(false); }
  }
  async function toggleFocus(next = !focus) {
    try {
      setFocus(next);
      const token = await api.window.setTaskSurface(next ? 'exam' : 'idle', next ? 'focus' : 'preparation', next);
      await paint();
      if (token !== null && !await api.window.commitTaskSurface(token)) throw new Error('窗口切换已过期，请重试。');
    } catch (error) { report(error.message); setFocus(false); }
  }
  async function patchSettings(patch) {
    try {
      setSettings(await api.settings.patch(patch));
      if (patch.opacity !== undefined) await api.window.previewOpacity(patch.opacity);
    }
    catch (error) { report(error.message); }
  }
  async function openConversation(id) {
    try { const item = await api.workspace.read(id); if (item) { setConversation(item); setImages([]); setDraft(''); setPage('chat'); } }
    catch (error) { report(error.message); }
  }
  async function saveDocument() {
    if (!documentTitle.trim() || !documentText.trim()) { report('请填写资料标题和正文。'); return; }
    if (documentText.length > 100000) { report('单份文本最多 10 万字，请拆分资料。'); return; }
    try {
      const previous = documents.find((doc) => doc.id === editingId);
      await api.knowledgeLibrary.save(LOCAL_ACCOUNT, { id: editingId || `doc-${uid()}`, title: documentTitle.trim(), text: documentText, enabled: previous?.enabled !== false });
      await reloadDocuments(); setDocumentText(''); setDocumentTitle(''); setEditingId(null); report('资料已保存在本机。', true);
    } catch (error) { report(error.message); }
  }
  actions.current = {
    async sendCaptured(question, captured) {
      // Wait for state to settle so hotkey capture and manual send share one path.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return actions.current.send(question, captured);
    },
    send,
    hotkey(action) {
      if (action === 'screenshot:capture') void capture(true);
      else if (action === 'screenshot:captureScrolling') void capture(true, true);
      else if (action === 'exam:exit' || action === 'session:reset') void toggleFocus(false);
      else if (action === 'window:toggleMouseThrough') {
        const next = !through; setThrough(next); void api.window.setInteractive(!next); void api.window.setFocusable(!next);
      } else if (action === 'answer:scrollUp' || action === 'answer:scrollDown') thread.current?.scrollBy({ top: action.endsWith('Up') ? -240 : 240 });
      else if (action === 'listen:toggle') report('本地版尚未接入语音识别，请使用文字或截图。');
    },
  };

  function renderChat() {
    return h('div', { className: 'chat-layout' },
      h('div', { className: 'chat-thread', ref: thread },
        !conversation.messages.length ? h('div', { className: 'welcome' },
          h('span', { className: 'eyebrow' }, 'YOUR LOCAL WORKSPACE'),
          h('h1', null, '把问题放进来，', h('br'), '让思路更清楚。'),
          h('p', { className: 'muted' }, '无需 Climb 账号。连接自己的模型，从文字、截图或本机资料开始。'),
          h('div', { className: 'start-cards' },
            button(h(React.Fragment, null, h('b', null, '✦ 自由问答'), h('span', null, '分析问题、梳理思路')), () => setConversation(fresh('chat')), { className: conversation.mode === 'chat' ? 'start-card selected' : 'start-card' }),
            button(h(React.Fragment, null, h('b', null, '▣ 截图分析'), h('span', null, '选取屏幕内容再提问')), () => capture(false), { className: 'start-card', disabled: capturing }),
            button(h(React.Fragment, null, h('b', null, '◇ 文字模拟面试'), h('span', null, '逐题交流与反馈')), () => { setConversation(fresh('practice')); setDraft('请为我开始一场模拟面试，先询问我的目标岗位。'); }, { className: conversation.mode === 'practice' ? 'start-card selected' : 'start-card' })),
          !chooseModelSlot(models.profiles, false) && h('div', { className: 'onboarding' }, h('div', null, h('strong', null, '先连接一个模型'), h('p', null, '填写模型服务商的 Base URL、模型名称和 API Key。')), button('设置模型 →', () => setPage('settings'), { className: 'primary' }))) :
          conversation.messages.map((message) => h('article', { className: `message ${message.role}`, key: message.id },
            h('div', { className: 'message-label' }, message.role === 'user' ? '你' : 'Climb', message.status !== 'completed' && h('span', null, message.status === 'cancelled' ? ' · 已停止' : ' · 请求未完成')),
            h(MarkdownBody, { markdown: message.text || '正在思考…' }),
            message.images?.length ? h('div', { className: 'message-images' }, ...message.images.map((src, i) => h('img', { src, key: i, alt: `提问截图 ${i + 1}` }))) : null))),
      h('div', { className: 'composer-wrap' },
        images.length > 0 && h('div', { className: 'attachments' }, ...images.map((src, i) => h('div', { key: i }, h('img', { src, alt: `待发送截图 ${i + 1}` }), button('×', () => setImages(images.filter((_, index) => index !== i)), { 'aria-label': `移除截图 ${i + 1}` })))),
        h('form', { className: 'composer', onSubmit: (event) => { event.preventDefault(); void send(); } },
          h('textarea', { value: draft, onChange: (event) => setDraft(event.target.value), placeholder: conversation.mode === 'practice' ? '描述目标岗位，或输入你的回答…' : '输入问题，或添加截图…', maxLength: 20000, rows: 3, 'aria-label': '提问内容', onKeyDown: (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } } }),
          h('div', { className: 'row between' }, h('div', { className: 'row' }, button(capturing ? '截取中…' : '＋ 添加截图', () => capture(false), { disabled: busy || capturing }), h('span', { className: 'muted small' }, conversation.mode === 'practice' ? '文字模拟面试' : 'Enter 发送 · Shift+Enter 换行')),
            busy ? button('停止生成', () => api.personalModels.cancel(active.current), { className: 'primary' }) : h('button', { type: 'submit', className: 'primary', disabled: capturing || (!draft.trim() && !images.length) }, '发送 ↑'))),
        h('p', { className: 'composer-note' }, '会话保存在本机；提问、截图和匹配的资料片段仅在发送时交给你配置的模型。')));
  }
  function renderKnowledge() {
    return h('div', { className: 'page-scroll' }, h('div', { className: 'page-heading' }, h('h1', null, '本机知识库'), h('p', null, '保存简历和项目资料。匹配的片段会随提问一起发送到你配置的模型。')),
      h('div', { className: 'knowledge-grid' }, h('section', { className: 'panel' },
        h('h3', null, editingId ? '编辑资料' : '添加资料'), field('标题', { value: documentTitle, onChange: (e) => setDocumentTitle(e.target.value), maxLength: 160, placeholder: '例如：个人简历 / 项目复盘' }),
        h('label', { className: 'field' }, h('span', null, '正文'), h('textarea', { rows: 13, value: documentText, onChange: (e) => setDocumentText(e.target.value), placeholder: '粘贴文本，或导入 .txt / .md 文件', maxLength: 100000 })),
        h('div', { className: 'row' }, button('保存资料', saveDocument, { className: 'primary' }), h('label', { className: 'file-button' }, '导入文本', h('input', { type: 'file', accept: '.txt,.md,.markdown', onChange: async (event) => {
          const file = event.target.files[0]; if (!file) return;
          try { if (file.size > 400000) throw new Error('文本文件过大，请拆分后导入。'); const text = await file.text(); if (text.length > 100000) throw new Error('正文超过 10 万字。'); setDocumentText(text); setDocumentTitle(file.name); } catch (error) { report(error.message); } event.target.value = '';
        } })), editingId && button('取消编辑', () => { setEditingId(null); setDocumentTitle(''); setDocumentText(''); }))),
      h('section', { className: 'document-list' }, h('p', { className: 'muted small' }, `${documents.length} / 10 份资料 · 勾选后参与本地检索`), ...documents.map((doc) => h('article', { className: 'panel', key: doc.id },
        h('div', { className: 'row between' }, h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: doc.enabled !== false, onChange: async (event) => { try { await api.knowledgeLibrary.save(LOCAL_ACCOUNT, { ...doc, enabled: event.target.checked }); await reloadDocuments(); } catch (error) { report(error.message); } } }), h('strong', null, doc.title)), h('span', { className: 'muted small' }, `${doc.text?.length || 0} 字`)),
        h('p', { className: 'document-preview' }, doc.text?.slice(0, 130)), h('div', { className: 'row' }, button('编辑', () => { setEditingId(doc.id); setDocumentTitle(doc.title); setDocumentText(doc.text); }), button('删除', async () => { try { await api.knowledgeLibrary.delete(LOCAL_ACCOUNT, doc.id); await reloadDocuments(); } catch (error) { report(error.message); } }, { className: 'danger-link' })))))));
  }
  function renderHistory() {
    return h('div', { className: 'page-scroll' }, h('div', { className: 'page-heading row between' }, h('div', null, h('h1', null, '会话记录'), h('p', null, '仅保存在当前电脑，可以随时继续交流。')), button('打开记录目录', () => api.localRecords.openDirectory(LOCAL_ACCOUNT))),
      !history.length && h('div', { className: 'empty panel' }, '还没有记录。完成一次提问后会自动保存。'),
      ...history.map((item) => h('article', { key: item.id, className: 'panel history-item row between' }, h('div', null, h('h3', null, item.title), h('p', { className: 'muted small' }, `${date(item.updatedAt)} · ${item.messageCount} 条消息 · ${item.mode === 'practice' ? '文字模拟面试' : '问答'}`)),
        h('div', { className: 'row' }, button('继续会话', () => openConversation(item.id), { disabled: busy, className: 'primary' }), button('删除', async () => { try { await api.workspace.delete(item.id); await reloadHistory(); if (conversation.id === item.id) setConversation(fresh()); } catch (error) { report(error.message); } }, { disabled: busy, className: 'danger-link' })))));
  }
  function renderSettings() {
    return h('div', { className: 'page-scroll' }, h('div', { className: 'page-heading' }, h('h1', null, '连接与设置'), h('p', null, '直接使用自己的模型接口，无需登录或套餐授权。')),
      h('div', { className: 'model-grid' }, h(ModelCard, { key: 'interview', slot: 'interview', title: '文字问答模型', snapshot: models, reload: reloadModels, report }), h(ModelCard, { key: 'screenshot', slot: 'screenshot', title: '截图分析模型', snapshot: models, reload: reloadModels, report })),
      h('section', { className: 'panel' }, h('h3', null, '窗口与本机记录'),
        h('div', { className: 'settings-grid' },
          h('label', { className: 'field' }, h('span', null, '窗口模式（重启后生效）'), h('select', { value: settings?.windowMode || 'normal', onChange: (event) => patchSettings({ windowMode: event.target.value }) }, h('option', { value: 'normal' }, '普通窗口'), h('option', { value: 'stealth' }, '隐身浮层'))),
          h('label', { className: 'field' }, h('span', null, '截图显示器'), h('select', { value: settings?.localScreenshotDisplayId || '', onChange: (event) => patchSettings({ localScreenshotDisplayId: event.target.value || null }) }, h('option', { value: '' }, '主显示器'), ...displays.map((display) => h('option', { key: display.id, value: display.id }, display.name || display.label || `显示器 ${display.id}`)))),
          h('label', { className: 'field' }, h('span', null, `窗口透明度 ${Math.round((settings?.opacity || 1) * 100)}%`), h('input', { type: 'range', min: 0.3, max: 1, step: 0.01, value: settings?.opacity || 1, onChange: (event) => patchSettings({ opacity: Number(event.target.value) }) })),
          h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: recordState?.preferences?.saveScreenshots || false, onChange: async (event) => { try { setRecordState(await api.localRecords.configure(LOCAL_ACCOUNT, { saveScreenshots: event.target.checked })); } catch (error) { report(error.message); } } }), '将截图归档到本机记录目录')),
        h('label', { className: 'field' }, h('span', null, '回答偏好（最多 700 字）'), h('textarea', { rows: 3, maxLength: 700, value: settings?.customPrompts || '', onChange: (event) => patchSettings({ customPrompts: event.target.value }), placeholder: '例如：用中文回答，优先给出结论，再解释实现和取舍。' }))),
      h('section', { className: 'panel capability-note' }, h('h3', null, '这个版本支持什么'), h('p', null, '已支持文字问答、截图分析、文字模拟面试、本机知识库和会话记录。语音识别、手机远控和原云端演练报告尚未接入。'), h('p', { className: 'muted small' }, '本地独立指不依赖 Climb 服务器。使用在线模型时仍需联网；使用本机模型服务时，请填写 localhost 或 127.0.0.1 接口。')));
  }
  const pages = [['chat', '✦', '工作台'], ['knowledge', '▤', '本机知识库'], ['history', '◷', '会话记录'], ['settings', '⚙', '连接与设置']];
  return h('div', { className: `local-app ${focus ? 'is-focus' : ''}`, 'data-local-app': true, style: { opacity: through ? settings?.mouseThroughOpacity || 0.48 : settings?.opacity || 1 } },
    !focus && h('aside', { className: 'sidebar' }, h('div', { className: 'brand drag' }, h('img', { src: './assets/icon-CxNa5fSW.png', alt: '' }), h('b', null, 'Climb'), h('span', null, 'Local')),
      button('＋ 新会话', () => { setConversation(fresh()); setImages([]); setDraft(''); setPage('chat'); }, { className: 'new-conversation', disabled: busy }),
      h('nav', null, ...pages.map(([id, icon, label]) => button(h(React.Fragment, null, h('span', null, icon), label), () => { setNotice(null); setPage(id); }, { key: id, className: page === id ? 'nav-item active' : 'nav-item', 'data-page': id }))),
      h('div', { className: 'sidebar-footer' }, h('span', { className: 'local-badge' }, '● 本地独立版'), h('p', null, '无需登录', h('br'), '数据保存在本机'))),
    h('main', { className: 'main-area' }, h('header', { className: 'topbar drag' },
      h('div', null, h('strong', null, focus ? 'Climb Local' : pages.find(([id]) => id === page)?.[2]), h('span', { className: 'topbar-caption' }, '你的模型 · 你的工作区')),
      h('div', { className: 'row no-drag' }, button(focus ? '退出专注' : '专注窗口', () => toggleFocus()), button('—', () => api.window.minimize(), { 'aria-label': '最小化' }), button('×', () => api.window.close(), { 'aria-label': '关闭窗口' }))),
      notice && h('div', { className: notice.success ? 'notice success' : 'notice', role: notice.success ? 'status' : 'alert' }, h('span', null, notice.text), button('×', () => setNotice(null), { 'aria-label': '关闭提示' })),
      page === 'chat' ? renderChat() : page === 'knowledge' ? renderKnowledge() : page === 'history' ? renderHistory() : renderSettings()));
}

const surface = new URLSearchParams(window.location.search).get('surface');
createRoot(document.getElementById('root')).render(h(surface === 'shortcut-overlay' ? LocalShortcutOverlay : App));
