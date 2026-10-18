// 知跃 · Developed by gulinyue. Opt-in, in-memory LAN pairing; no cloud relay.
import http from 'node:http';
import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { LAN_COMMANDS, normalizeLanSnapshot, isPrivateIpv4 } from '../../shared/lan-protocol.mjs';
const secret = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const empty = () => normalizeLanSnapshot({});
const fail = (status, message) => Object.assign(new Error(message), { status });
export class LanBridge {
  constructor({ assets = new Map(), onChange = () => {}, onCommand = async () => {}, now = Date.now } = {}) {
    Object.assign(this, { assets, onChange, onCommand, now });this.server = null;this.sessions = new Map();this.pending = new Map();this.clients = new Map();this.rates = new Map();this.snapshot = empty();this.revision = 0;this.blocked = false;this.starting = false;
  }
  status() {
    this.expire();
    return { enabled: !!this.origin, address: this.address || '', url: this.origin || '', code: this.origin ? this.code : '', expiresAt: this.expiresAt || 0, blocked: this.blocked,
      pending: [...this.pending.values()].filter(value => value.state === 'pending').map(({ id, name, address, expiresAt }) => ({ id, name, address, expiresAt })),
      devices: [...this.sessions.values()].map(({ id, name, address, expiresAt }) => ({ id, name, address, expiresAt, connected: (this.clients.get(id)?.size || 0) > 0 })) };
  }
  expire() {
    for (const [id, value] of this.pending) if (value.expiresAt <= this.now()) this.pending.delete(id);
    for (const [key, value] of this.sessions) if (value.expiresAt <= this.now()) { this.sessions.delete(key);this.closeDevice(value.id); }
    for (const [key, value] of this.rates) if (value.until <= this.now()) this.rates.delete(key);
  }
  async start(address) {
    if (this.server || this.starting) throw fail(409, '互通服务已开启或正在启动。');
    if (!isPrivateIpv4(address) && address !== '127.0.0.1') throw fail(400, '请选择局域网 IPv4 地址。');
    this.starting = true;
    const server = http.createServer((req, res) => { void this.handle(req, res); });
    server.headersTimeout = 10000;server.requestTimeout = 15000;server.maxConnections = 24;
    server.on('clientError', (_error, socket) => socket.destroy());
    try { await new Promise((resolve, reject) => { server.once('error', reject);server.listen(0, address, resolve); }); }
    catch { server.close();throw fail(400, '无法监听此地址，请检查网络连接或改选网卡。'); }
    finally { this.starting = false; }
    this.server = server;this.address = address;this.origin = `http://${address}:${server.address().port}`;this.snapshot = empty();this.rotateCode();
    this.heartbeat = setInterval(() => { this.expire();for (const set of this.clients.values()) for (const res of set) if (!res.destroyed) res.write(': heartbeat\n\n'); }, 10000);this.heartbeat.unref();
    return this.status();
  }
  async stop() {
    const server = this.server;this.server = null;this.origin = '';this.code = '';this.expiresAt = 0;clearInterval(this.heartbeat);
    for (const id of this.clients.keys()) this.closeDevice(id);
    this.sessions.clear();this.pending.clear();this.rates.clear();this.snapshot = empty();this.onChange(this.status());
    if (server) await new Promise(resolve => { server.close(resolve);server.closeAllConnections(); });
  }
  rotateCode() {
    if (!this.origin) throw fail(409, '请先开启局域网互通。');
    this.code = String(randomInt(10000000, 100000000));this.expiresAt = this.now() + 120000;this.pending.clear();this.onChange(this.status());return this.status();
  }
  approve(id, allow) {
    this.expire();const pending = this.pending.get(id);
    if (!pending || pending.state !== 'pending') throw fail(404, '配对申请已过期。');
    if (this.blocked) throw fail(423, '电脑已锁定或休眠，请解锁后配对。');
    if (!allow) pending.state = 'rejected';
    else {
      if (this.sessions.size >= 4) throw fail(409, '最多配对四台设备，请先断开旧设备。');
      const token = secret();const device = { id: randomBytes(12).toString('hex'), name: pending.name, address: pending.address, expiresAt: this.now() + 8 * 3600000 };
      this.sessions.set(hash(token), device);pending.state = 'approved';pending.token = token;pending.deviceId = device.id;
    }
    this.onChange(this.status());return this.status();
  }
  revoke(id) { for (const [key, value] of this.sessions) if (value.id === id) this.sessions.delete(key);this.closeDevice(id);this.onChange(this.status());return this.status(); }
  closeDevice(id) { const set = this.clients.get(id);this.clients.delete(id);for (const res of set || []) { try { this.event(res, 'revoked', {});res.end(); } catch {} } }
  setBlocked(value) { this.blocked = !!value;if (this.blocked) this.snapshot = empty();this.broadcastState();this.onChange(this.status()); }
  publish(value) { if (!this.origin || this.blocked) return;this.snapshot = normalizeLanSnapshot(value);this.broadcastState(); }
  scrollMobile(direction) { if (!this.origin || this.blocked || !['up', 'down'].includes(direction)) return;this.send('scroll', { direction }); }
  event(res, type, value) { if (res.destroyed) return;if (res.writableLength > 256 * 1024) { res.destroy();return; }res.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`); }
  send(type, value) { for (const set of this.clients.values()) for (const res of set) this.event(res, type, value); }
  broadcastState() { this.send('state', { revision: ++this.revision, blocked: this.blocked, snapshot: this.blocked ? empty() : this.snapshot }); }
  rate(key, limit, duration) { this.expire();let entry = this.rates.get(key);if (!entry) { if (this.rates.size >= 256) throw fail(429, '请求过多，请稍后重试。');this.rates.set(key, entry = { count: 0, until: this.now() + duration }); }if (++entry.count > limit) throw fail(429, '操作过于频繁，请稍后重试。'); }
  async body(req) { if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail(415, '请求格式无效。');let size = 0, bytes = [];for await (const chunk of req) { size += chunk.length;if (size > 2048) throw fail(413, '请求过大。');bytes.push(chunk); }try { return JSON.parse(Buffer.concat(bytes).toString()); } catch { throw fail(400, '请求内容无效。'); } }
  authenticate(req, address) { const value = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1];const device = value ? this.sessions.get(hash(value)) : null;if (!device || device.address !== address || device.expiresAt <= this.now()) throw fail(401, '连接已失效，请重新配对。');return device; }
  async handle(req, res) {
    const json = (status, value) => { if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });res.end(JSON.stringify(value)); };
    try {
      res.setHeader('Cache-Control', 'no-store');res.setHeader('X-Content-Type-Options', 'nosniff');res.setHeader('Referrer-Policy', 'no-referrer');res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      if (!this.origin || req.headers.host !== new URL(this.origin).host) throw fail(403, '地址不匹配，请使用电脑显示的链接。');
      const address = req.socket.remoteAddress?.replace(/^::ffff:/, '');
      if (!isPrivateIpv4(address) && address !== '127.0.0.1') throw fail(403, '仅允许局域网连接。');
      if (req.headers.origin && req.headers.origin !== this.origin || req.method === 'POST' && req.headers.origin !== this.origin) throw fail(403, '请求来源无效。');
      const url = new URL(req.url, this.origin);if (url.search) throw fail(400, '无效请求参数。');this.expire();
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/assets/'))) {
        const asset = this.assets.get(url.pathname);if (!asset) throw fail(404, '页面不存在。');res.writeHead(200, { 'Content-Type': asset.type });res.end(asset.bytes);return;
      }
      if (req.method === 'POST' && url.pathname === '/api/pair') {
        this.rate('pair:' + address, 6, 60000);const value = await this.body(req);
        if (this.blocked) throw fail(423, '请先解锁电脑。');
        if (this.expiresAt <= this.now() || typeof value?.code !== 'string' || !/^\d{8}$/.test(value.code) || !timingSafeEqual(Buffer.from(value.code), Buffer.from(this.code))) throw fail(403, '配对码错误或已过期，请在电脑刷新。');
        if (this.pending.size >= 4) throw fail(429, '电脑有待处理的配对申请，请稍候。');
        const id = randomBytes(12).toString('hex'), pollSecret = secret();
        const name = typeof value.name === 'string' ? value.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) : '';
        this.pending.set(id, { id, pollHash: hash(pollSecret), name: name || '手机', address, expiresAt: this.now() + 60000, state: 'pending' });this.onChange(this.status());json(202, { requestId: id, pollSecret });return;
      }
      if (req.method === 'POST' && url.pathname === '/api/pair-status') {
        this.rate('poll:' + address, 120, 60000);const value = await this.body(req);const pending = this.pending.get(value?.requestId);
        if (!pending || pending.expiresAt <= this.now() || pending.address !== address || typeof value?.pollSecret !== 'string' || value.pollSecret.length > 100 || hash(value.pollSecret) !== pending.pollHash) throw fail(401, '申请已过期，请重新申请配对。');
        const response = { state: pending.state, ...(pending.state === 'approved' ? { token: pending.token, deviceId: pending.deviceId } : {}) };
        if (pending.state !== 'pending') this.pending.delete(pending.id);json(200, response);return;
      }
      const device = this.authenticate(req, address);
      if (req.method === 'GET' && url.pathname === '/api/events') {
        let set = this.clients.get(device.id);if (!set) this.clients.set(device.id, set = new Set());if (set.size >= 2) throw fail(429, '此设备连接过多，请关闭旧页面。');
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });res.flushHeaders();set.add(res);
        this.event(res, 'state', { revision: this.revision, blocked: this.blocked, snapshot: this.blocked ? empty() : this.snapshot });this.onChange(this.status());
        res.on('close', () => { set.delete(res);if (!set.size && this.clients.get(device.id) === set) this.clients.delete(device.id);this.onChange(this.status()); });return;
      }
      if (req.method === 'POST' && url.pathname === '/api/command') {
        this.rate('command:' + device.id, 10, 10000);const value = await this.body(req);this.authenticate(req, address);if (this.blocked) throw fail(423, '电脑已锁定或休眠。');
        if (!LAN_COMMANDS.includes(value?.action)) throw fail(400, '不支持此操作。');
        await this.onCommand(value.action);json(202, { accepted: true });return;
      }
      if (req.method === 'POST' && url.pathname === '/api/disconnect') { await this.body(req);this.authenticate(req, address);this.revoke(device.id);json(200, { disconnected: true });return; }
      throw fail(404, '接口不存在。');
    } catch (error) { if (!res.headersSent) json(error.status || 400, { error: error.status ? error.message : '操作未完成，请在电脑端检查后重试。' });else res.end(); }
  }
}
