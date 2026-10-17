// 知跃 · Developed by gulinyue.
import { React } from '../vendor/react-icons-state.mjs';
import { MarkdownBody } from '../vendor/markdown.mjs';
import { normalizeInterviewOptions } from '../../shared/interview-options.mjs';
import { TranscriptionQueue } from '../../shared/interview-audio.mjs';
import { buildLocalRequest, chooseModelSlot } from './requests.mjs';
import { SystemAudioCapture } from './interview-capture.mjs';
import { BRAND } from '../../shared/brand.mjs';
const h = React.createElement, api = window.api;
const uid = () => crypto.randomUUID();
const fresh = () => ({ id: uid(), title: '', mode: 'interview', updatedAt: Date.now(), messages: [] });
export function LiveInterview({ settings, models, documents, seed, report, configure, passive, onStarted }) {
  const [conversation, setConversation] = React.useState(() => seed || fresh());
  const [draft, setDraft] = React.useState('');
  const [listening, setListening] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [pending, setPending] = React.useState(0);
  const [queued, setQueued] = React.useState(0);
  const [level, setLevel] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const alive = React.useRef(true), epoch = React.useRef(0), recording = React.useRef(null), active = React.useRef(null), queue = React.useRef([]), current = React.useRef(conversation), latest = React.useRef({}), actions = React.useRef({}), thread = React.useRef(null), follow = React.useRef(true);
  const options = normalizeInterviewOptions(settings?.interviewOptions);
  latest.current = { models, documents, options, report };
  const update = (next) => { current.current = next; if (alive.current) setConversation(next); };
  const persist = async (value) => { try { await api.workspace.save(value); } catch (error) { if (alive.current) latest.current.report(error.message); } };
  function stopAudio() {
    epoch.current++;
    const old = recording.current; recording.current = null;
    old?.capture?.stop(); old?.pipeline?.stop();
    if (old?.sessionId) void api.interview.stop(old.sessionId).catch(() => {});
    if (alive.current) { setListening(false); setStarting(false); setPending(0); setLevel(0); }
  }
  function end() {
    stopAudio(); queue.current = [];
    if (active.current) { active.current.cancelled = true; void api.personalModels.cancel(active.current.id).catch(() => {}); }
    if (alive.current) setQueued(0);
  }
  async function drain() {
    if (active.current || !alive.current) return;
    while (queue.current.length && alive.current) {
      const question = queue.current.shift(); setQueued(queue.current.length);
      const { models: modelState, documents: docs, options: opts } = latest.current;
      const slot = chooseModelSlot(modelState.profiles, false);
      if (!slot) { latest.current.report('请先配置文字问答模型。'); queue.current = []; setQueued(0); configure(); return; }
      if (current.current.messages.length >= 198) { end(); latest.current.report('本次面试记录已满，请开始新面试。'); return; }
      const previous = current.current;
      const reply = { id: uid(), role: 'assistant', text: '', status: 'completed' };
      const next = { ...previous, title: previous.title || question.slice(0, 45), updatedAt: Date.now(), messages: [...previous.messages, { id: uid(), role: 'user', text: question, status: 'completed' }, reply] };
      const run = { id: `interview-${uid()}`, text: '', cancelled: false }; active.current = run;
      update(next); follow.current = true; setBusy(true);
      const request = buildLocalRequest({ question, mode: 'interview', history: previous.messages, documents: opts.useKnowledge ? docs : [], prompt: `回答语言：${opts.answerLanguage}。\n${opts.prompt}` });
      let flushTimer;
      const flush = () => { flushTimer = undefined; if (alive.current && active.current === run) update({ ...next, messages: [...next.messages.slice(0, -1), { ...reply, text: run.text }] }); };
      const unsubscribe = api.personalModels.onStreamEvent(({ requestId, event }) => { if (requestId === run.id && active.current === run && !run.cancelled && event.type === 'delta') { run.text += event.delta; if (!flushTimer) flushTimer = setTimeout(flush, 40); } });
      let status = 'completed';
      try {
        const result = await api.personalModels.run({ requestId: run.id, taskKind: 'interview', slot, request });
        if (!result.ok && result.error?.code !== 'PERSONAL_MODEL_ABORTED') throw new Error(result.error?.message || '回答生成失败。');
        if (result.ok && !run.cancelled) run.text = result.result.text || run.text;
        else status = 'cancelled';
      } catch (error) { status = run.cancelled ? 'cancelled' : 'failed'; if (status === 'failed' && alive.current) latest.current.report(error.message); if (!run.text) run.text = status === 'failed' ? `回答未完成：${error.message}` : ''; }
      finally {
        clearTimeout(flushTimer); unsubscribe();
        const saved = { ...next, updatedAt: Date.now(), messages: [...next.messages.slice(0, -1), { ...reply, text: run.text || '（已停止回答）', status: run.cancelled ? 'cancelled' : status }] };
        update(saved); active.current = null;
        if (alive.current) setBusy(false);
        await persist(saved);
      }
    }
  }
  function answer(text) {
    const question = text.trim(); if (!question || !alive.current) return;
    if (queue.current.length >= 3) { stopAudio(); setDraft(question); latest.current.report('待回答队列已满，已暂停收音。当前问题保留在输入框，可等回答完成后手动提交。'); return; }
    queue.current.push(question.slice(0, 12000)); setQueued(queue.current.length); setDraft(''); void drain();
  }
  async function start() {
    if (recording.current || starting) return;
    if (!chooseModelSlot(latest.current.models.profiles, false)) { latest.current.report('请先配置文字问答模型和语音转写服务。'); configure(); return; }
    const generation = ++epoch.current; setStarting(true);
    let sessionId;
    try {
      ({ sessionId } = await api.interview.start());
      if (!alive.current || epoch.current !== generation) { void api.interview.stop(sessionId); return; }
      let sequence = 0;
      const pipeline = new TranscriptionQueue({
        transcribe: async (audio) => (await api.interview.transcribe({ sessionId, sequence: sequence++, audio })).text,
        onPending: (count) => { if (alive.current && epoch.current === generation) setPending(count); },
        onText: (text, final) => { if (!alive.current || epoch.current !== generation) return; setDraft(text); if (final && text.trim() && latest.current.options.autoAnswer) answer(text); },
        onError: (error) => { if (alive.current && epoch.current === generation) { stopAudio(); latest.current.report(error.message); } },
      });
      const capture = new SystemAudioCapture({ ...latest.current.options, onSegment: (segment) => pipeline.push(segment), onLevel: (rms) => { if (alive.current && epoch.current === generation) setLevel(Math.min(1, rms * 8)); }, onError: (error) => { if (alive.current && epoch.current === generation) { stopAudio(); latest.current.report(error.message); } } });
      recording.current = { sessionId, capture, pipeline };
      const started = await capture.start();
      if (started && alive.current && epoch.current === generation) {
        const state = await api.interview.enterWindow(sessionId);
        if (!alive.current || epoch.current !== generation) { void api.interview.stop(sessionId); return; }
        setListening(true);
        await onStarted(state);
      }
    } catch (error) {
      if (epoch.current === generation) { end(); if (sessionId) void api.interview.stop(sessionId); latest.current.report(error.message.includes('Permission') || error.name === 'NotAllowedError' ? '系统收音未获许可，请点击开始并检查 Windows 的音频权限。' : ['NotFoundError', 'NotReadableError'].includes(error.name) ? '无法启动系统收音，请检查 Windows 默认播放设备并重新开始。' : error.message); configure(); }
    } finally { if (alive.current && epoch.current === generation) setStarting(false); }
  }
  actions.current = { start, end, answerCurrent: () => answer(draft) };
  React.useEffect(() => {
    alive.current = true;
    const unsubscribe = api.hotkey.onTriggered((action) => {
      if (action === 'listen:toggle') { if (recording.current) actions.current.end(); else void actions.current.start(); }
      else if (action === 'exam:exit' || action === 'session:reset') actions.current.end();
      else if (action === 'llm:resendHistory') actions.current.answerCurrent();
      else if (action === 'answer:scrollUp' || action === 'answer:scrollDown') { follow.current = false; thread.current?.scrollBy({ top: action.endsWith('Up') ? -240 : 240, behavior: 'instant' }); }
      else if (action === 'answer:scrollLeft' || action === 'answer:scrollRight') {
        const root = thread.current; if (!root) return;
        const candidates = [...root.querySelectorAll('pre,table,.markdown')].filter((el) => el.scrollWidth > el.clientWidth + 4), bounds = root.getBoundingClientRect();
        const target = candidates.find((el) => { const box = el.getBoundingClientRect(); return box.bottom > bounds.top && box.top < bounds.bottom; }) || candidates[0] || root;
        target.scrollBy({ left: action.endsWith('Left') ? -240 : 240, behavior: 'instant' });
      }
      else if (action === 'interview:clearContext') { actions.current.end(); update(fresh()); setDraft(''); }
    });
    void actions.current.start();
    return () => { alive.current = false; unsubscribe(); actions.current.end(); };
  }, []);
  React.useEffect(() => { if (follow.current) thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'auto' }); }, [conversation.messages]);
  return h('div', { className: 'chat-layout live-interview', 'data-live-interview': true, 'data-listening': listening },
    passive && options.showShortcutHints && h('div', { className: 'written-passive-banner' }, h('span', null, pending ? '面试中 · 正在转写' : '面试中 · 仅系统声音 · 鼠标穿透'), h('kbd', null, `${settings?.hotkeys?.['exam:exit'] || 'Ctrl+Shift+Z'} 退出`), !options.autoAnswer && h('kbd', null, `${settings?.hotkeys?.['llm:resendHistory'] || 'Alt+C'} 回答当前问题`)),
    !passive && h('div', { className: 'interview-toolbar no-drag' },
      h('div', null, h('strong', null, '实时面试'), h('p', null, listening ? pending ? '正在转写系统声音…' : '正在聆听面试官 · 仅系统声音' : starting ? '正在连接系统收音…' : '系统收音 → 分句转写 → 自动生成回答')),
      h('div', { className: 'row wrap' }, h('span', { className: listening ? 'listening-dot active' : 'listening-dot', 'aria-label': listening ? '收音中' : '未收音' }), h('meter', { min: 0, max: 1, value: level, 'aria-label': '系统声音电平' }),
        h('button', { type: 'button', className: 'primary', 'data-interview-toggle': true, onClick: () => listening || starting ? end() : start() }, listening || starting ? '结束面试' : '开始监听系统声音'),
        h('button', { type: 'button', onClick: configure }, '语音与回答设置'))),
    h('div', { className: 'chat-thread', ref: thread, onScroll: () => { const el = thread.current; if (el) follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 32; } },
      !conversation.messages.length && h('div', { className: 'interview-welcome written-welcome' }, h('img', { src: './assets/logo.svg', alt: BRAND.name, className: 'written-logo' }), h('h1', null, listening ? '正在聆听面试官' : '正在准备系统收音…'), h('p', null, '面试官说完后，问题转写和参考回答会出现在这里。'), options.showShortcutHints && h('p', { className: 'muted small' }, `${settings?.hotkeys?.['exam:exit'] || 'Ctrl+Shift+Z'} 退出并恢复设置 · 不使用麦克风`)),
      ...conversation.messages.map((message) => h('article', { className: `message ${message.role}`, key: message.id }, h('div', { className: 'message-label' }, message.role === 'user' ? '面试官问题' : '参考回答', message.status !== 'completed' && h('span', null, message.status === 'cancelled' ? ' · 已停止' : ' · 未完成')), h(MarkdownBody, { markdown: message.text || '正在组织回答…' })))),
    passive && draft && h('div', { className: 'interview-transcript' }, h('span', null, options.autoAnswer ? '问题转写' : `问题转写 · ${settings?.hotkeys?.['llm:resendHistory'] || 'Alt+C'} 生成回答`), h('p', null, draft)),
    !passive && h('div', { className: 'composer-wrap' }, h('form', { className: 'composer', onSubmit: (event) => { event.preventDefault(); answer(draft); } },
      h('textarea', { value: draft, maxLength: 12000, rows: 2, 'aria-label': '面试问题转写', onChange: (e) => setDraft(e.target.value), placeholder: '语音转写将出现在这里，也可以手动修正问题再回答…' }),
      h('div', { className: 'row between' }, h('span', { className: 'muted small' }, `${options.autoAnswer ? '已开启自动回答' : '手动确认后回答'}${queued ? ` · ${queued} 个问题等待回答` : ''}`), h('div', { className: 'row' }, busy && h('button', { type: 'button', onClick: () => { if (active.current) { active.current.cancelled = true; void api.personalModels.cancel(active.current.id); } } }, '停止当前回答'), h('button', { type: 'submit', className: 'primary', disabled: !draft.trim() }, '回答这个问题')))),
      h('p', { className: 'composer-note' }, '收音仅在点击开始后进行；语音片段发送给你配置的转写服务，问题和匹配资料发送给回答模型。文字会话保存在本机。')));
}
