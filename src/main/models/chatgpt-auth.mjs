import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { BRAND } from '../../shared/brand.mjs';

export const OPENAI_ISSUER = 'https://auth.openai.com';
export const OPENAI_RESOURCE = 'https://api.openai.com/v1';
const TOKEN_ENDPOINT = `${OPENAI_ISSUER}/api/accounts/oauth/token`;
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const random = () => randomBytes(32).toString('base64url');
const scopes = (value) => typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class ChatGptAuthError extends Error {
  code = 'CHATGPT_AUTH_REQUIRED';
  constructor(message) { super(`ChatGPT：${message}`); this.name = 'ChatGptAuthError'; }
}
const authError = (message) => new ChatGptAuthError(message);

// Only the main process owns this service. Its public status never contains tokens.
export class ChatGptAuth {
  constructor({ storage, openBrowser, fetchImpl = globalThis.fetch.bind(globalThis), verifyIdentity, now = Date.now }) {
    Object.assign(this, { storage, openBrowser, fetchImpl, now });
    this.verifyIdentity = verifyIdentity ?? this.verifyJwt.bind(this);
    this.epoch = 0;
    this.requests = new AbortController();
  }
  read() { return this.storage.read() || {}; }
  sessionSignal() { return this.requests.signal; }
  stopRequests() { this.requests.abort(); this.requests = new AbortController(); }
  status() {
    const record = this.read();
    return { connected: !!record.access_token, planEnabled: !!record.access_token && record.scopes?.includes(PLAN_SCOPE) === true, email: record.email || '', pending: !!this.pending,
      accounts: (record.registrations || []).filter((r) => r.subject).map((r) => ({ clientId: r.client_id, email: r.email || '', active: r.client_id === record.client_id })) };
  }
  async discovery() {
    if (!this.discoveryPromise) this.discoveryPromise = (async () => {
      const response = await this.fetchImpl(`${OPENAI_ISSUER}/.well-known/openid-configuration`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw authError('无法读取官方登录配置');
      const config = await response.json();
      if (config.issuer !== OPENAI_ISSUER) throw authError('登录服务身份不匹配');
      for (const key of ['jwks_uri', 'revocation_endpoint']) {
        const url = new URL(config[key]);
        if (url.origin !== OPENAI_ISSUER || url.username || url.password) throw authError('登录配置地址不匹配');
      }
      return config;
    })().catch((e) => { this.discoveryPromise = null; throw e; });
    return this.discoveryPromise;
  }
  async verifyJwt(token, { clientId, nonce, subject }) {
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    const config = await this.discovery();
    this.jwks ??= createRemoteJWKSet(new URL(config.jwks_uri));
    const { payload } = await jwtVerify(token, this.jwks, { issuer: OPENAI_ISSUER, audience: clientId, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'] });
    if (!payload.sub || (nonce && !same(payload.nonce, nonce)) || (subject && payload.sub !== subject)) throw authError('身份或登录校验失败');
    return payload;
  }
  async token(form) {
    const response = await this.fetchImpl(TOKEN_ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...form, resource: OPENAI_RESOURCE }).toString() });
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) throw authError('授权已过期或被撤销，请重新登录');
      throw authError('授权服务暂时不可用，请重试');
    }
    const data = await response.json();
    if (data.token_type?.toLowerCase() !== 'bearer' || typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw authError('授权响应不完整');
    return data;
  }
  cancel() { this.pending?.cancel(); }
  async signIn({ newAccount = false, clientId: selectedId } = {}) {
    if (this.pending) throw authError('已有登录正在进行');
    const previous = this.read();
    const host = previous.ext_agent_host_id || `urn:uuid:${randomUUID()}`;
    this.storage.write({ ...previous, ext_agent_host_id: host });
    const registrations = previous.registrations || (previous.client_id ? [{ client_id: previous.client_id, subject: previous.subject, email: previous.email }] : []);
    const selected = selectedId ? registrations.find((r) => r.client_id === selectedId) : previous;
    if (selectedId && !selected) throw authError('请选择已保存的账号');
    const clientId = newAccount ? previous.pending_registration || 'dynamic_agent_client' : selected?.client_id || 'dynamic_agent_client';
    const state = random(), nonce = random(), verifier = random();
    const epoch = ++this.epoch;
    let server, timeout, exchanging = false;
    const pending = {};
    this.pending = pending;
    try {
      return await new Promise((resolve, reject) => {
        const done = (error, value) => {
          clearTimeout(timeout);
          server?.close(); server?.closeIdleConnections();
          if (this.pending === pending) this.pending = null;
          error ? reject(error) : resolve(value);
        };
        pending.cancel = () => { this.epoch++; done(authError('已取消登录')); };
        server = createServer(async (req, res) => {
          const url = new URL(req.url, 'http://127.0.0.1');
          res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
          if (req.method !== 'GET' || url.pathname !== '/auth/callback') { res.writeHead(404); res.end(); return; }
          if (!same(url.searchParams.get('state'), state)) { res.writeHead(400); res.end('无效的登录请求。请返回 Climb。'); return; }
          if (exchanging) { res.writeHead(409); res.end(); return; }
          exchanging = true;
          if (url.searchParams.has('error')) { res.end('授权未完成，请返回 Climb。'); done(authError('未获得授权')); return; }
          try {
            const issued = url.searchParams.get('client_id') || (clientId !== 'dynamic_agent_client' ? clientId : '');
            if (!/^oaiapp_[a-zA-Z0-9_-]{1,200}$/.test(issued) || (clientId !== 'dynamic_agent_client' && issued !== clientId)) throw authError('注册信息不匹配');
            const code = url.searchParams.get('code');
            if (!code || code.length > 8192) throw authError('登录缺少授权码');
            if (epoch !== this.epoch) throw authError('登录已取消');
            // Preserve an issued registration even if this one-time code expires.
            if (clientId === 'dynamic_agent_client') this.storage.write({ ...this.read(), pending_registration: issued, ...(!previous.access_token && !previous.subject ? { client_id: issued } : {}) });
            const data = await this.token({ grant_type: 'authorization_code', client_id: issued, code, code_verifier: verifier, redirect_uri: pending.redirectUri });
            if (typeof data.id_token !== 'string') throw authError('缺少身份令牌');
            const identity = await this.verifyIdentity(data.id_token, { clientId: issued, nonce, subject: clientId !== 'dynamic_agent_client' && !newAccount ? selected?.subject : undefined });
            if (epoch !== this.epoch) throw authError('登录已取消');
            this.stopRequests();
            const registration = { client_id: issued, subject: identity.sub, email: identity.email || '' };
            this.storage.write({ client_id: issued, registrations: [...registrations.filter((r) => r.client_id !== issued), registration], ext_agent_host_id: host, subject: identity.sub, issuer: OPENAI_ISSUER, email: identity.email || '', id_token: data.id_token, access_token: data.access_token, refresh_token: data.refresh_token, scopes: scopes(data.scope), expires_at: this.now() + data.expires_in * 1000 });
            res.end('登录完成，可以关闭此页面并返回 Climb。');
            done(null, this.status());
          } catch (error) { res.end('登录未完成，请返回 Climb 查看提示。'); done(error); }
        });
        server.once('error', () => done(authError('无法启动本机登录回调')));
        server.listen(0, '127.0.0.1', async () => {
          pending.redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;
          const params = new URLSearchParams({ client_id: clientId, ext_agent_host_id: host, response_type: 'code', redirect_uri: pending.redirectUri, scope: `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`, resource: OPENAI_RESOURCE, state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
          if (clientId === 'dynamic_agent_client') params.set('agent_name_hint', BRAND.name);
          else if (previous.client_id === clientId && previous.id_token) params.set('id_token_hint', previous.id_token);
          if (clientId !== 'dynamic_agent_client' && !newAccount && selected?.email) params.set('login_hint', selected.email);
          try { await this.openBrowser(`${OPENAI_ISSUER}/api/accounts/authorize?${params}`); } catch { done(authError('无法打开浏览器')); }
        });
        timeout = setTimeout(() => { this.epoch++; done(authError('登录超时，请重试')); }, 180000);
      });
    } finally { if (this.pending === pending) this.pending = null; }
  }
  async accessToken() {
    const current = this.read();
    if (!this.status().planEnabled) throw authError('请先登录并允许使用 ChatGPT 套餐');
    if (current.expires_at > this.now() + 60000) return current.access_token;
    if (!current.refresh_token) throw authError('授权已过期，请重新登录');
    if (!this.refreshPromise) {
      const epoch = this.epoch;
      this.refreshPromise = (async () => {
        const data = await this.token({ grant_type: 'refresh_token', client_id: current.client_id, refresh_token: current.refresh_token });
        if (data.id_token) await this.verifyIdentity(data.id_token, { clientId: current.client_id, subject: current.subject });
        if (epoch !== this.epoch) throw authError('账号连接已经改变');
        const next = { ...current, access_token: data.access_token, refresh_token: data.refresh_token || current.refresh_token, id_token: data.id_token || current.id_token, scopes: data.scope === undefined ? current.scopes : scopes(data.scope), expires_at: this.now() + data.expires_in * 1000 };
        this.storage.write(next);
        if (!next.scopes.includes(PLAN_SCOPE)) throw authError('ChatGPT 套餐使用权限已关闭');
        return next.access_token;
      })().finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise;
  }
  async logout() {
    this.cancel(); this.epoch++;
    this.stopRequests();
    const record = this.read();
    this.storage.write({ ext_agent_host_id: record.ext_agent_host_id, client_id: record.client_id, subject: record.subject, email: record.email, registrations: record.registrations });
    let revoked = !record.refresh_token;
    if (record.refresh_token) {
      try {
        const config = await this.discovery();
        const response = await this.fetchImpl(config.revocation_endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: record.refresh_token, token_type_hint: 'refresh_token', client_id: record.client_id }).toString() });
        revoked = response.status === 200;
      } catch { /* Local tokens are cleared even if the network is unavailable. */ }
    }
    return { ...this.status(), revoked };
  }
}
