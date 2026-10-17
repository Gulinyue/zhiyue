// 知跃 / Zhiyue · Developed by gulinyue.
import { React, createRoot } from '../vendor/react-icons-state.mjs';
import { MarkdownBody } from '../vendor/markdown.mjs';
import { BRAND } from '../../shared/brand.mjs';
import { CONVERSATION_LABELS, WRITTEN_CAPTURE_PROMPT } from '../../shared/conversation-modes.mjs';
import { LOCAL_ACCOUNT } from '../../shared/local-profile.mjs';
import { buildLocalRequest, chooseModelSlot } from './requests.mjs';
import { LocalShortcutOverlay } from './overlay.mjs';
import { ModelCard, ChatGptAccount } from './model-card.mjs';
import { HotkeySettings, FocusResizeHandle } from './window-controls.mjs';
import { WrittenSettings } from './written-settings.mjs';
import { normalizeWrittenOptions } from '../../shared/written-options.mjs';

const h = React.createElement;
const api = window.api;
const uid = () => crypto.randomUUID();
const fresh = (mode = 'chat') => ({ id: uid(), title: '', updatedAt: Date.now(), mode, messages: [] });
const button = (label, onClick, options = {}) => h('button', { type: 'button', onClick, ...options }, label);
const field = (label, props) => h('label', { className: 'field' }, h('span', null, label), h('input', props));
const date = (value) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const paint = () => new Promise((resolve) => { const timeout = setTimeout(resolve, 150); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timeout); resolve(); })); });

function App() {
  const [page, setPage] = React.useState('chat');
  const [conversation, setConversation] = React.useState(fresh);
  const [draft, setDraft] = React.useState('');
  const [images, setImages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const [through, setThrough] = React.useState(false);
  const [writtenActive, setWrittenActive] = React.useState(false);
  const writtenState = React.useRef(false);
  const transition = React.useRef(false);
  const captureEpoch = React.useRef(0);
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
  const captureLease = React.useRef(false);
  const actions = React.useRef({});
  const thread = React.useRef(null);
  const follow = React.useRef(true);
  const [opacityPreview, setOpacityPreview] = React.useState(null);
  const mounted = React.useRef(true);
  const report = (text, success = false) => setNotice({ text, success });
  const reloadModels = async () => setModels(await api.personalModels.load());
  const reloadHistory = async () => setHistory(await api.workspace.list());
  const reloadDocuments = async () => setDocuments(await api.knowledgeLibrary.list(LOCAL_ACCOUNT));

  React.useEffect(() => {
    mounted.current = true;
    Promise.all([api.settings.get().then(setSettings), reloadModels(), reloadHistory(), reloadDocuments(), api.screenshot.displays().then(setDisplays), api.localRecords.state(LOCAL_ACCOUNT).then(setRecordState)]).catch((error) => report(error.message));
    const unsubWritten = api.written.onChange((state) => { void actions.current.writtenChanged?.(state); });
    const unsubSettings = api.settings.onChange((next) => { setSettings(next); setOpacityPreview(null); });
    const unsubOpacity = api.window.onOpacityPreviewed(setOpacityPreview);
    const unsubInteraction = api.window.onInteractionRecovered(() => { setThrough(false); setOpacityPreview(null); });
    const unsubHotkeys = api.hotkey.onTriggered((action) => actions.current.hotkey?.(action));
    const unsubReveal = api.window.onRevealRequested(async ({ token }) => { await paint(); await api.window.commitReveal(token); });
    return () => { mounted.current = false; unsubWritten(); unsubSettings(); unsubOpacity(); unsubInteraction(); unsubHotkeys(); unsubReveal(); if (active.current) void api.personalModels.cancel(active.current); };
  }, []);
  React.useEffect(() => { if (follow.current) thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'auto' }); }, [conversation.messages, busy]);
  React.useEffect(() => { void api.hotkey.setAnswerScrollActive(page === 'chat' || page === 'exam'); return () => { void api.hotkey.setAnswerScrollActive(false); }; }, [page]);
  React.useEffect(() => { if (!writtenState.current) void api.window.setWorkMode(focus ? 'exam' : 'idle'); }, [page]);
  React.useEffect(() => { if (page === 'history') void reloadHistory().catch((error) => report(error.message)); }, [page]);
  React.useEffect(() => { document.documentElement.dataset.appSurface = focus ? 'focus' : 'preparation'; }, [focus]);

  async function saveConversation(next) {
    try { await api.workspace.save(next); await reloadHistory(); }
    catch (error) { report(`记录保存失败：${error.message}`); }
  }
  async function send(question = draft, attachments = images) {
    if (conversation.mode === 'written' && !writtenState.current) return;
    if (active.current || capturing || (!question.trim() && !attachments.length)) return;
    const slot = chooseModelSlot(models.profiles, attachments.length > 0);
    if (!slot) { setPage('settings'); report(attachments.length ? '请先配置截图模型。' : '请先配置一个模型连接。'); return; }
    if (conversation.messages.length >= 198) { report('本会话已满，请开始新会话。'); return; }
    const requestId = `local-${uid()}`;
    const userText = question.trim() || (conversation.mode === 'written' ? WRITTEN_CAPTURE_PROMPT : '请分析截图中的问题并解答。');
    const user = { id: uid(), role: 'user', text: userText + (attachments.length ? `\n\n[附 ${attachments.length} 张截图]` : ''), images: attachments, status: 'completed' };
    const reply = { id: uid(), role: 'assistant', text: '', status: 'completed' };
    const next = { ...conversation, title: conversation.title || userText.slice(0, 45), updatedAt: Date.now(), messages: [...conversation.messages, user, reply] };
    const request = buildLocalRequest({ question: userText, images: attachments, history: conversation.messages, documents, mode: conversation.mode, prompt: settings?.customPrompts || '', writtenOptions: settings?.writtenOptions });
    active.current = requestId;
    follow.current = true;
    setBusy(true); setDraft(''); setImages([]); setPage(conversation.mode === 'written' ? 'exam' : 'chat'); setNotice(null); setConversation(next);
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
    if (active.current || captureLease.current) return;
    if (submit && !chooseModelSlot(models.profiles, true)) { setPage('settings'); report('请先配置截图模型。'); return; }
    const epoch = captureEpoch.current;
    captureLease.current = true; setCapturing(true);
    try {
      const result = await api.screenshot.capture({ origin: 'local', displayId: settings?.localScreenshotDisplayId || displays[0]?.id, scroll, enqueue: false });
      if (epoch !== captureEpoch.current) return;
      if (!result.url) throw new Error(result.error?.message || '截图失败，请检查显示器选择。');
      const captured = result.urls || [result.url];
      const nextImages = submit ? captured : [...images, ...captured];
      if (nextImages.length > 4) throw new Error('每次最多添加 4 张截图，请先移除多余图片。');
      setImages(nextImages); setPage(conversation.mode === 'written' ? 'exam' : 'chat');
      if (submit) {
        // send() cannot reuse the current capturing render; release the native lease first.
        setCapturing(false);
        await actions.current.sendCaptured(draft || (conversation.mode === 'written' ? WRITTEN_CAPTURE_PROMPT : '请分析截图中的问题并解答。'), nextImages, epoch);
      }
    } catch (error) { report(error.message); }
    finally { if (epoch === captureEpoch.current) { captureLease.current = false; setCapturing(false); } }
  }
  async function writtenChanged(state) {
    writtenState.current = state.active; setWrittenActive(state.active);
    setFocus(state.active); setThrough(state.active); setOpacityPreview(state.active ? state.opacity : null);
    if (state.active) setPage('exam');
    else { captureEpoch.current++; captureLease.current = false; setCapturing(false); setPage('settings'); }
    await paint();
    if (state.token !== null && state.token !== undefined) await api.window.commitTaskSurface(state.token);
    if (state.error) report(state.error);
  }
  async function enterWritten(item) {
    if (writtenState.current || transition.current) return;
    if (active.current || captureLease.current) { report('请先停止生成或等待截图完成。'); return; }
    if (!chooseModelSlot(models.profiles, true)) { setPage('settings'); report('请先配置一个支持图片的截图模型，再开启笔试模式。'); return; }
    transition.current = true;
    try {
      const next = item || (conversation.mode === 'written' ? conversation : fresh('written'));
      follow.current = true; setConversation(next); setDraft(''); setImages([]);
      const state = await api.written.enter();
      await writtenChanged(state);
    } catch (error) { report(error.message); }
    finally { transition.current = false; }
  }
  async function toggleFocus(next = !focus) {
    if (writtenState.current) { await api.written.exit(); return; }
    try {
      setFocus(next);
      const token = await api.window.setTaskSurface(next || page === 'exam' ? 'exam' : 'idle', next ? 'focus' : 'preparation', next);
      await paint();
      if (token !== null && !await api.window.commitTaskSurface(token)) throw new Error('窗口切换已过期，请重试。');
    } catch (error) { report(error.message); setFocus(false); }
  }
  async function patchSettings(patch) {
    try {
      setSettings(await api.settings.patch(patch));
      if (patch.opacity !== undefined) await api.window.previewOpacity(patch.opacity);
      if (patch.mouseThroughOpacity !== undefined && through) await api.window.previewOpacity(patch.mouseThroughOpacity);
    }
    catch (error) { report(error.message); }
  }
  async function openConversation(id) {
    try { const item = await api.workspace.read(id); if (item) { if (item.mode === 'written') { await enterWritten(item); return; } follow.current = true; setConversation(item); setImages([]); setDraft(''); setPage('chat'); } }
    catch (error) { report(error.message); }
  }
  function selectPage(id) {
    if (id === 'exam') { void enterWritten(); return; }
    if (id === 'chat' && conversation.mode === 'written') {
      if (active.current || captureLease.current) { report('请先停止当前生成或等待截图完成。'); return; }
      follow.current = true; setConversation(fresh()); setDraft(''); setImages([]);
    }
    setNotice(null); setPage(id);
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
    writtenChanged,
    async sendCaptured(question, captured, epoch) {
      // Wait for state to settle so hotkey capture and manual send share one path.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (epoch !== captureEpoch.current) return;
      return actions.current.send(question, captured);
    },
    send,
    hotkey(action) {
      if (action === 'screenshot:capture') void capture(true);
      else if (action === 'screenshot:captureScrolling') void capture(true, true);
      else if (action === 'exam:exit' || action === 'session:reset') { if (writtenState.current) void api.written.exit(); else void toggleFocus(false); }
      else if (action === 'window:toggleMouseThrough') {
        if (writtenState.current) return;
        const next = !through; setThrough(next); setOpacityPreview(null); void api.window.setInteractive(!next); void api.window.setFocusable(!next); void api.window.previewOpacity(next ? settings?.mouseThroughOpacity || .48 : settings?.opacity || 1);
      } else if (action.startsWith('answer:scroll')) {
        const root = thread.current; if (!root) return;
        if (action.endsWith('Up') || action.endsWith('Down')) { follow.current = false; root.scrollBy({ top: action.endsWith('Up') ? -240 : 240, behavior: 'instant' }); }
        else {
          const candidates = [...root.querySelectorAll('pre, pre code, .markdown, table')].filter((el) => el.scrollWidth > el.clientWidth + 2 && el.getBoundingClientRect().bottom > root.getBoundingClientRect().top && el.getBoundingClientRect().top < root.getBoundingClientRect().bottom);
          (candidates.at(-1) || root).scrollBy({ left: action.endsWith('Left') ? -180 : 180, behavior: 'instant' });
        }
      }
      else if (action === 'listen:toggle') report('本地版尚未接入语音识别，请使用文字或截图。');
    },
  };

  function renderChat() {
    return h('div', { className: 'chat-layout' },
      conversation.mode === 'written' && !writtenActive && h('div', { className: 'written-toolbar no-drag' },
        h('div', null, h('strong', null, '笔试模式'), h('span', { className: 'muted small' }, '截图后自动识题并生成答案')),
        h('div', { className: 'row wrap' },
          button(capturing ? '正在截图…' : '截图出答案', () => capture(true), { className: 'primary', disabled: busy || capturing, 'data-written-capture': true, title: settings?.hotkeys?.['screenshot:capture'] }),
          button('滚动截图出答案', () => capture(true, true), { disabled: busy || capturing, title: settings?.hotkeys?.['screenshot:captureScrolling'] }),
          button('新一题', () => { follow.current = true; setConversation(fresh('written')); setDraft(''); setImages([]); }, { disabled: busy || capturing }))),
      writtenActive && normalizeWrittenOptions(settings?.writtenOptions).showShortcutHints && h('div', { className: 'written-passive-banner' }, h('span', null, `笔试中 · 鼠标穿透 · ${api.runtime.platform === 'win32' ? 'Windows 捕获排除' : '非 Windows 系统'}`), h('kbd', null, `${settings?.hotkeys?.['screenshot:capture'] || '未设置'} 截图`), h('kbd', null, `${settings?.hotkeys?.['exam:exit'] || '未设置'} 退出笔试`)),
      h('div', { className: 'chat-thread', ref: thread, onScroll: () => { const el = thread.current; if (el) follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 32; } },
        !conversation.messages.length ? conversation.mode === 'written' ? h('div', { className: 'written-welcome' },
          h('img', { src: './assets/logo.svg', alt: '知跃标志', className: 'written-logo' }),
          h('span', { className: 'eyebrow' }, 'ZHIYUE · WRITTEN TEST'), h('h1', null, '看见题目，即刻解答。'),
          h('p', { className: 'muted' }, '打开题目所在页面，按快捷键截图。识题、答案、代码与解析会直接显示在这里。'),
          (!writtenActive || normalizeWrittenOptions(settings?.writtenOptions).showShortcutHints) && h('div', { className: 'written-key' }, h('kbd', null, settings?.hotkeys?.['screenshot:capture'] || '未设置'), h('span', null, '截图 → 识题 → 生成答案')),
          h('p', { className: 'muted small' }, '支持选择题、简答题、编程题；长题使用滚动截图。模糊题干会提示补充。'),
          !chooseModelSlot(models.profiles, true) && button('先配置截图模型 →', () => setPage('settings'), { className: 'primary' })) : h('div', { className: 'welcome' },
          h('span', { className: 'eyebrow' }, 'YOUR LOCAL WORKSPACE'),
          h('h1', null, '把问题放进来，', h('br'), '让思路更清楚。'),
          h('p', { className: 'muted' }, '连接自己的模型，从文字、截图或本机资料开始。'),
          h('div', { className: 'start-cards' },
            button(h(React.Fragment, null, h('b', null, '✦ 自由问答'), h('span', null, '分析问题、梳理思路')), () => setConversation(fresh('chat')), { className: conversation.mode === 'chat' ? 'start-card selected' : 'start-card' }),
            button(h(React.Fragment, null, h('b', null, '▣ 截图分析'), h('span', null, '选取屏幕内容再提问')), () => capture(false), { className: 'start-card', disabled: capturing }),
            button(h(React.Fragment, null, h('b', null, '◇ 文字模拟面试'), h('span', null, '逐题交流与反馈')), () => { setConversation(fresh('practice')); setDraft('请为我开始一场模拟面试，先询问我的目标岗位。'); }, { className: conversation.mode === 'practice' ? 'start-card selected' : 'start-card' })),
          !chooseModelSlot(models.profiles, false) && h('div', { className: 'onboarding' }, h('div', null, h('strong', null, '先连接一个模型'), h('p', null, '填写模型服务商的 Base URL、模型名称和 API Key。')), button('设置模型 →', () => setPage('settings'), { className: 'primary' }))) :
          conversation.messages.map((message) => h('article', { className: `message ${message.role}`, key: message.id },
            h('div', { className: 'message-label' }, message.role === 'user' ? '你' : BRAND.name, message.status !== 'completed' && h('span', null, message.status === 'cancelled' ? ' · 已停止' : ' · 请求未完成')),
            h(MarkdownBody, { markdown: message.text || '正在思考…' }),
            message.images?.length ? h('div', { className: 'message-images' }, ...message.images.map((src, i) => h('img', { src, key: i, alt: `提问截图 ${i + 1}` }))) : null))),
      !writtenActive && h('div', { className: 'composer-wrap' },
        images.length > 0 && h('div', { className: 'attachments' }, ...images.map((src, i) => h('div', { key: i }, h('img', { src, alt: `待发送截图 ${i + 1}` }), button('×', () => setImages(images.filter((_, index) => index !== i)), { 'aria-label': `移除截图 ${i + 1}` })))),
        h('form', { className: 'composer', onSubmit: (event) => { event.preventDefault(); void send(); } },
          h('textarea', { value: draft, onChange: (event) => setDraft(event.target.value), placeholder: conversation.mode === 'written' ? '可选：指定语言或补充要求，然后截图；也可直接粘贴题目…' : conversation.mode === 'practice' ? '描述目标岗位，或输入你的回答…' : '输入问题，或添加截图…', maxLength: 20000, rows: 3, 'aria-label': '提问内容', onKeyDown: (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } } }),
          h('div', { className: 'row between' }, h('div', { className: 'row' }, button(capturing ? '截取中…' : '＋ 添加截图', () => capture(false), { disabled: busy || capturing }), h('span', { className: 'muted small' }, conversation.mode === 'written' ? `截图出答案 ${settings?.hotkeys?.['screenshot:capture'] || '未设置快捷键'}` : conversation.mode === 'practice' ? '文字模拟面试' : 'Enter 发送 · Shift+Enter 换行')),
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
      ...history.map((item) => h('article', { key: item.id, className: 'panel history-item row between' }, h('div', null, h('h3', null, item.title), h('p', { className: 'muted small' }, `${date(item.updatedAt)} · ${item.messageCount} 条消息 · ${CONVERSATION_LABELS[item.mode]}`)),
        h('div', { className: 'row' }, button('继续会话', () => openConversation(item.id), { disabled: busy, className: 'primary' }), button('删除', async () => { try { await api.workspace.delete(item.id); await reloadHistory(); if (conversation.id === item.id) setConversation(fresh()); } catch (error) { report(error.message); } }, { disabled: busy, className: 'danger-link' })))));
  }
  function renderSettings() {
    return h('div', { className: 'page-scroll' }, h('div', { className: 'page-heading' }, h('h1', null, '连接与设置'), h('p', null, '选择模型服务商，使用 API Key 或官方 ChatGPT 账号授权。')),
      h(WrittenSettings, { settings, documents, patchSettings, start: () => enterWritten() }),
      h(ChatGptAccount, { report, reload: reloadModels }),
      h('div', { className: 'model-grid' }, h(ModelCard, { key: 'interview', slot: 'interview', title: '文字问答模型', snapshot: models, reload: reloadModels, report }), h(ModelCard, { key: 'screenshot', slot: 'screenshot', title: '截图分析模型', snapshot: models, reload: reloadModels, report })),
      h('section', { className: 'panel' }, h('h3', null, '窗口与本机记录'),
        h('div', { className: 'settings-grid' },
          h('label', { className: 'field' }, h('span', null, '窗口模式（重启后生效）'), h('select', { value: settings?.windowMode || 'normal', onChange: (event) => patchSettings({ windowMode: event.target.value }) }, h('option', { value: 'normal' }, '普通窗口'), h('option', { value: 'stealth' }, '隐身浮层'))),
          h('label', { className: 'field' }, h('span', null, '截图显示器'), h('select', { value: settings?.localScreenshotDisplayId || '', onChange: (event) => patchSettings({ localScreenshotDisplayId: event.target.value || null }) }, h('option', { value: '' }, '主显示器'), ...displays.map((display) => h('option', { key: display.id, value: display.id }, display.name || display.label || `显示器 ${display.id}`)))),
          h('label', { className: 'field' }, h('span', null, `窗口透明度 ${Math.round((settings?.opacity || 1) * 100)}%`), h('input', { type: 'range', min: 0.01, max: 1, step: 0.01, value: settings?.opacity || 1, onChange: (event) => patchSettings({ opacity: Number(event.target.value) }) })),
          h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: recordState?.preferences?.saveScreenshots || false, onChange: async (event) => { try { setRecordState(await api.localRecords.configure(LOCAL_ACCOUNT, { saveScreenshots: event.target.checked })); } catch (error) { report(error.message); } } }), '将截图归档到本机记录目录')),
        h('label', { className: 'field' }, h('span', null, '回答偏好（最多 700 字）'), h('textarea', { rows: 3, maxLength: 700, value: settings?.customPrompts || '', onChange: (event) => patchSettings({ customPrompts: event.target.value }), placeholder: '例如：用中文回答，优先给出结论，再解释实现和取舍。' }))),
      h(HotkeySettings, { settings, patchSettings, report }),
      h('section', { className: 'panel about-brand', 'data-about-brand': true },
        h('img', { src: './assets/logo.svg', alt: '知跃 Logo' }),
        h('div', { className: 'about-brand-copy' }, h('h3', null, BRAND.name + ' · ' + BRAND.englishName + ' ' + BRAND.version), h('p', null, BRAND.tagline), h('p', { className: 'developer-watermark' }, '开发者 · ' + BRAND.developer), h('p', { className: 'muted small' }, '社区免费版 · 连接自己的模型，数据保存在本机。')),
        h('div', { className: 'support-developer' },
          button('♥ 爱发电支持开发者 ↗', async () => { try { await api.app.openSupport(); } catch { report('暂时无法打开赞助页面，请稍后重试。'); } }, { className: 'support-button', 'data-support-developer': true, title: '在默认浏览器中打开爱发电赞助页' }),
          h('p', null, '请作者喝杯咖啡，支持后续开发'), h('p', { className: 'support-note' }, '赞助完全自愿，不影响免费使用。'))),
      h('section', { className: 'panel capability-note' }, h('h3', null, '这个版本支持什么'), h('p', null, '已支持文字问答、笔试截图出答案、文字模拟面试、本机知识库和会话记录。语音识别和手机远控尚未接入。'), h('p', { className: 'muted small' }, '社区版不依赖应用账号服务器。使用在线模型时仍需联网；使用本机模型服务时，请填写 localhost 或 127.0.0.1 接口。')));
  }
  const pages = [['chat', '✦', '工作台'], ['exam', '▣', '笔试模式'], ['knowledge', '▤', '本机知识库'], ['history', '◷', '会话记录'], ['settings', '⚙', '连接与设置']];
  return h('div', { className: `local-app ${focus ? 'is-focus' : ''} ${writtenActive ? 'is-written-passive' : ''}`, 'data-local-app': true, 'data-written-active': writtenActive, style: { opacity: opacityPreview ?? (writtenActive ? normalizeWrittenOptions(settings?.writtenOptions).opacity : through ? settings?.mouseThroughOpacity || 0.48 : settings?.opacity || 1) } },
    !focus && h('aside', { className: 'sidebar' }, h('div', { className: 'brand drag' }, h('img', { src: './assets/logo.svg', alt: '知跃 Logo' }), h('b', null, BRAND.name), h('span', null, '社区版')),
      button('＋ 新会话', () => { setConversation(fresh(page === 'exam' ? 'written' : 'chat')); setImages([]); setDraft(''); setPage(page === 'exam' ? 'exam' : 'chat'); }, { className: 'new-conversation', disabled: busy || capturing }),
      h('nav', null, ...pages.map(([id, icon, label]) => button(h(React.Fragment, null, h('span', null, icon), label), () => selectPage(id), { key: id, className: page === id ? 'nav-item active' : 'nav-item', 'data-page': id }))),
      h('div', { className: 'sidebar-footer' }, h('span', { className: 'local-badge' }, '● 社区免费版'), h('p', null, BRAND.tagline, h('br'), `开发者 · ${BRAND.developer}`))),
    h('main', { className: 'main-area' }, h('header', { className: 'topbar drag' },
      h('div', null, h('strong', null, focus ? `${BRAND.name} · ${conversation.mode === 'written' ? '笔试' : '专注'}` : pages.find(([id]) => id === page)?.[2]), h('span', { className: 'topbar-caption' }, '你的模型 · 你的工作区')),
      h('div', { className: 'row no-drag' },
        h('label', { className: 'toolbar-opacity', title: '不透明度；Ctrl+Shift+[ / ] 调整', 'aria-label': '悬浮窗不透明度' },
          h('span', null, Math.round((opacityPreview ?? (through ? settings?.mouseThroughOpacity || .48 : settings?.opacity || 1)) * 100) + '%'),
          h('input', { type: 'range', min: .01, max: 1, step: .01, value: opacityPreview ?? (through ? settings?.mouseThroughOpacity || .48 : settings?.opacity || 1), onChange: (e) => patchSettings(through ? { mouseThroughOpacity: Number(e.target.value) } : { opacity: Number(e.target.value) }) })),
        button('隐藏', () => api.window.hide(), { title: `${settings?.hotkeys?.['window:show'] || '托盘'} 解除隐藏`, 'aria-label': '隐藏窗口' }), button(focus ? '退出专注' : '专注窗口', () => toggleFocus()), button('—', () => api.window.minimize(), { 'aria-label': '最小化' }), button('×', () => api.window.close(), { 'aria-label': '关闭窗口' }))),
      notice && h('div', { className: notice.success ? 'notice success' : 'notice', role: notice.success ? 'status' : 'alert' }, h('span', null, notice.text), button('×', () => setNotice(null), { 'aria-label': '关闭提示' })),
      page === 'chat' || page === 'exam' ? renderChat() : page === 'knowledge' ? renderKnowledge() : page === 'history' ? renderHistory() : renderSettings()), focus && !writtenActive && h(FocusResizeHandle));
}

const surface = new URLSearchParams(window.location.search).get('surface');
createRoot(document.getElementById('root')).render(h(surface === 'shortcut-overlay' ? LocalShortcutOverlay : App));
