// 知跃 · Developed by gulinyue. Browser-only companion; no model credentials.
import { React, createRoot } from '../vendor/react-icons-state.mjs';
import { MarkdownBody } from '../vendor/markdown.mjs';
const h = React.createElement;
const tokenKey = 'zhiyue-lan-session';
const stored = () => { try { return sessionStorage.getItem(tokenKey) || ''; } catch { return ''; } };
const remember = token => { try { if (token) sessionStorage.setItem(tokenKey, token);else sessionStorage.removeItem(tokenKey); } catch {} };
const initialCode = /^#code=(\d{8})$/.exec(location.hash)?.[1] || '';
if (location.hash) window.history.replaceState(null, '', '/');
async function request(route, body, token = '', signal) {
  const response = await fetch(route, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, cache: 'no-store' });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.error || '操作失败，请重试。'), { status: response.status });
  return value;
}
function App() {
  const [token, setToken] = React.useState(stored), [code, setCode] = React.useState(initialCode), [name, setName] = React.useState('我的手机');
  const [pending, setPending] = React.useState(null), [pairing, setPairing] = React.useState(false), [connected, setConnected] = React.useState(false), [retry, setRetry] = React.useState(0);
  const [state, setState] = React.useState({ blocked: false, snapshot: { messages: [] } }), [error, setError] = React.useState(''), [command, setCommand] = React.useState(''), [following, setFollowing] = React.useState(true), [font, setFont] = React.useState(16);
  const thread = React.useRef(null), follow = React.useRef(true), pairingLease = React.useRef(false), commandLease = React.useRef(false);
  const reset = React.useCallback(message => { remember('');setToken('');setPending(null);setConnected(false);setState({ blocked: false, snapshot: { messages: [] } });setError(message); }, []);
  function setFollow(value) { follow.current = value;setFollowing(value);if (value) requestAnimationFrame(() => thread.current?.scrollTo({ top: thread.current.scrollHeight })); }
  React.useEffect(() => {
    if (!pending) return;
    const controller = new AbortController();let timer, alive = true;
    const poll = async () => {
      try {
        const value = await request('/api/pair-status', pending, '', controller.signal);
        if (!alive) return;
        if (value.state === 'approved') { remember(value.token);setToken(value.token);setPending(null);setError('');setFollow(true); }
        else if (value.state === 'rejected') { setPending(null);setError('电脑拒绝了申请。请确认设备名，再次申请。'); }
        else timer = setTimeout(poll, 1000);
      } catch (failure) { if (alive) { setPending(null);setError(failure.message); } }
    };
    void poll();return () => { alive = false;controller.abort();clearTimeout(timer); };
  }, [pending]);
  React.useEffect(() => {
    if (!token) return;
    let alive = true, timer, controller, delay = 1000;
    async function connect() {
      clearTimeout(timer);controller?.abort();const own = new AbortController();controller = own;
      try {
        const response = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` }, signal: own.signal, cache: 'no-store' });
        if (response.status === 401) { reset('连接已失效，请重新配对。');return; }
        if (!response.ok || !response.body) throw new Error('连接失败');
        if (!alive || controller !== own) return;
        setConnected(true);delay = 1000;
        const reader = response.body.getReader(), decoder = new TextDecoder();let buffer = '';
        while (alive && controller === own) {
          const { done, value } = await reader.read();if (!alive || controller !== own) return;if (done) break;
          buffer += decoder.decode(value, { stream: true });if (buffer.length > 1024 * 1024) throw new Error('同步内容过大');
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);buffer = buffer.slice(end + 2);
            const type = /^event: (.+)$/m.exec(frame)?.[1], data = /^data: (.+)$/m.exec(frame)?.[1];if (!data) continue;
            const payload = JSON.parse(data);
            if (type === 'state') setState(payload);
            else if (type === 'scroll') { setFollow(false);thread.current?.scrollBy({ top: payload.direction === 'up' ? -300 : 300, behavior: 'instant' }); }
            else if (type === 'revoked') { reset('电脑已断开此设备，请重新配对。');return; }
          }
        }
      } catch { /* Network changes and browser background suspension use the same retry path. */ }
      if (alive && controller === own) { setConnected(false);timer = setTimeout(connect, delay);delay = Math.min(5000, delay * 2); }
    }
    const resume = () => { if (!document.hidden) void connect(); };
    void connect();document.addEventListener('visibilitychange', resume);window.addEventListener('online', resume);
    return () => { alive = false;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange', resume);window.removeEventListener('online', resume); };
  }, [token, retry, reset]);
  const snapshot = state.snapshot;
  React.useEffect(() => { if (follow.current) thread.current?.scrollTo({ top: thread.current.scrollHeight }); }, [snapshot, font]);
  async function pair(event) {
    event.preventDefault();if (pairingLease.current) return;pairingLease.current = true;setPairing(true);setError('');
    try { setPending(await request('/api/pair', { code, name })); } catch (failure) { setError(failure.message); }
    finally { pairingLease.current = false;setPairing(false); }
  }
  async function act(action) {
    if (commandLease.current) return;commandLease.current = true;setCommand(action);setError('');
    try { await request('/api/command', { action }, token); } catch (failure) { if (failure.status === 401) reset(failure.message);else setError(failure.message); }
    finally { commandLease.current = false;setCommand(''); }
  }
  const disabled = !connected || state.blocked || !!command;
  const button = (text, action, extra = {}) => h('button', { type: 'button', disabled, onClick: () => act(action), 'data-command': action, ...extra }, text);
  return h('main', { className: token ? 'mobile-app paired' : 'mobile-app', 'data-mobile-app': true },
    h('header', null, h('div', { className: 'identity' }, h('img', { src: '/assets/logo.svg', alt: '' }), h('div', null, h('strong', null, '知跃'), h('span', null, '手机伴侣 · gulinyue'))), token && h('span', { className: connected ? 'status online' : 'status', 'data-connected': connected }, state.blocked ? '电脑已锁定' : connected ? '双端已连接' : '正在重连…')),
    error && h('div', { className: 'error', role: 'alert' }, error),
    !token ? h('section', { className: 'pair-card' }, h('span', { className: 'eyebrow' }, '同网配对 · 无需安装手机 App'), h('h1', null, '让答案，随手可见'), h('p', null, '手机遥控电脑截图，两端同步显示回答。请保持电脑上的知跃运行。'),
      pending ? h('div', { className: 'pending', 'data-pair-pending': true }, h('strong', null, '等待电脑确认'), h('p', null, '请在电脑“连接与设置 → 双端互通”中，核对设备名并点击“允许配对”。申请 60 秒后过期。'), h('button', { type: 'button', onClick: () => setPending(null) }, '重新填写')) : h('form', { onSubmit: pair },
        h('label', null, '设备名', h('input', { value: name, maxLength: 40, required: true, autoComplete: 'off', 'data-device-name': true, onChange: e => setName(e.target.value) })),
        h('label', null, '电脑显示的 8 位配对码', h('input', { value: code, onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8)), inputMode: 'numeric', pattern: '[0-9]{8}', maxLength: 8, required: true, autoComplete: 'off', 'data-pair-code': true })),
        h('button', { className: 'primary', disabled: pairing || code.length !== 8, 'data-pair-submit': true }, pairing ? '正在申请…' : '申请配对')),
      h('p', { className: 'fine' }, '只在可信的私人 Wi-Fi 或热点使用。网页通过局域网 HTTP 连接电脑；不向手机发送模型密钥或截图原图。')) : h(React.Fragment, null,
      h('section', { className: 'answer-toolbar' }, h('div', null, h('strong', null, ({ written: '笔试答案', interview: '面试回答', chat: '工作台回答', practice: '练习回答' })[snapshot.mode] || '同步回答'), h('span', { 'data-generation-state': true }, state.blocked ? '解锁电脑后恢复' : snapshot.capturing ? '电脑正在截图…' : snapshot.busy ? '正在生成 · 两端同步' : '与电脑保持同步')),
        h('div', { className: 'font-controls' }, h('button', { type: 'button', 'aria-label': '缩小字号', disabled: font <= 14, onClick: () => setFont(value => value - 1) }, 'A−'), h('button', { type: 'button', 'aria-label': '增大字号', disabled: font >= 24, onClick: () => setFont(value => value + 1) }, 'A+'))),
      !connected && h('div', { className: 'reconnect' }, '连接暂时中断，正在自动重连。', h('button', { type: 'button', onClick: () => setRetry(value => value + 1) }, '立即重连')),
      snapshot.error && h('div', { className: 'error', role: 'alert' }, snapshot.error),
      h('section', { className: 'answer-thread', ref: thread, style: { fontSize: font }, 'data-mobile-thread': true, onTouchStart: () => setFollow(false), onWheel: () => setFollow(false) },
        !snapshot.messages.length && h('div', { className: 'empty' }, h('strong', null, state.blocked ? '电脑已锁定或休眠' : '连接成功，等待第一条回答'), h('p', null, '点击下方“截图并解题”，或在电脑开始文字问答、笔试或实时面试。')),
        ...snapshot.messages.map(message => h('article', { className: `message ${message.role}`, key: message.id, 'data-message-role': message.role }, h('div', { className: 'message-label' }, message.role === 'user' ? '问题' : '知跃回答'), h(MarkdownBody, { markdown: message.text || (snapshot.busy ? '正在思考…' : '等待回答…') }), message.status !== 'completed' && h('span', { className: 'fine' }, message.status === 'failed' ? '回答未完成' : '已停止生成')))),
      h('div', { className: 'follow-row' }, h('span', null, '显示当前会话最近 6 条文本'), h('button', { type: 'button', onClick: () => setFollow(!following), 'data-follow': following }, following ? '● 跟随最新' : '↓ 跟随最新')),
      h('footer', null, button(command === 'capture' || snapshot.capturing ? '正在截图…' : '截图并解题', 'capture', { className: 'primary capture', disabled: disabled || snapshot.busy || snapshot.capturing }),
        h('div', { className: 'control-grid' }, button('电脑答案 ↑', 'desktop-scroll-up'), button('电脑答案 ↓', 'desktop-scroll-down'), button('显示电脑窗口', 'desktop-show'), button('隐藏电脑窗口', 'desktop-hide')),
        h('div', { className: 'bottom-row' }, button('退出当前模式', 'exit-mode'), h('button', { type: 'button', onClick: async () => { try { await request('/api/disconnect', {}, token); } catch {}reset('已断开连接。'); } }, '断开配对')))));
}
createRoot(document.getElementById('root')).render(h(App));
