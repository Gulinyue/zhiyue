// Real Electron IPC, OS credential encryption and jose verification; all provider
// endpoints and browser authorization are mocked. No real account is accessed.
const { app, BrowserWindow, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.runtime'), { recursive: true });
const dataDir = fs.mkdtempSync(path.join(root, '.runtime', 'auth-smoke-'));
process.env.CLIMB_USER_DATA_DIR = dataDir;
const originalFetch = globalThis.fetch;
const unexpected = [], errors = [], providerRequests = [];
let authorization, signingKey, publicJwk, SignJWT, failInference = false;
const response = (value) => Response.json(value);
const events = (items) => new Response(items.map((item) => 'data: ' + JSON.stringify(item) + '\n\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
globalThis.fetch = async (rawUrl, options = {}) => {
  const url = String(rawUrl);
  if (url === 'https://auth.openai.com/.well-known/openid-configuration') return response({ issuer: 'https://auth.openai.com', jwks_uri: 'https://auth.openai.com/test-jwks', revocation_endpoint: 'https://auth.openai.com/test-revoke' });
  if (url === 'https://auth.openai.com/test-jwks') return response({ keys: [publicJwk] });
  if (url === 'https://auth.openai.com/test-revoke') return new Response(null, { status: 200 });
  if (url === 'https://auth.openai.com/api/accounts/oauth/token') {
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('client_id'), 'oaiapp_electron_test');
    const idToken = await new SignJWT({ nonce: authorization.searchParams.get('nonce'), email: 'mock@example.invalid' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://auth.openai.com').setAudience('oaiapp_electron_test').setSubject('mock-user').setIssuedAt().setExpirationTime('1h').sign(signingKey);
    return response({ access_token: 'mock-oauth-access-token', refresh_token: 'mock-oauth-refresh-token', id_token: idToken, token_type: 'Bearer', expires_in: 3600, scope: 'openid profile email chatgpt.tokens.use.direct' });
  }
  if (url === 'https://api.openai.com/v1/models') {
    assert.equal(options.headers.Authorization, 'Bearer mock-oauth-access-token');
    return response({ models: [{ slug: 'mock-model', display_name: 'Mock account model', visibility: 'list' }, { slug: 'hidden-model', visibility: 'hidden' }] });
  }
  if (url === 'https://api.openai.com/v1/responses') {
    assert.equal(options.headers.Authorization, 'Bearer mock-oauth-access-token');
    const body = JSON.parse(options.body); providerRequests.push(body);
    assert.equal(body.store, false); assert.equal(body.stream, true); assert.equal(body.model, 'mock-model');
    assert.ok(!body.input.some((m) => m.role === 'system'));
    assert.ok(body.instructions);
    if (failInference) return events([{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }]);
    return events([{ type: 'response.output_text.delta', delta: 'ChatGPT 授权链路测试回答' }, { type: 'response.completed', response: { status: 'completed' } }]);
  }
  unexpected.push(url); throw new Error('Unexpected provider network');
};
shell.openExternal = async (url) => {
  authorization = new URL(url);
  assert.equal(authorization.origin, 'https://auth.openai.com');
  const callback = new URL(authorization.searchParams.get('redirect_uri'));
  assert.equal(callback.hostname, '127.0.0.1');
  callback.search = new URLSearchParams({ code: 'test-code', state: authorization.searchParams.get('state'), client_id: 'oaiapp_electron_test' });
  await originalFetch(callback);
};
let finished = false;
function finish(code, detail) {
  if (finished) return; finished = true;
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifacts', 'auth-smoke-report.json'), JSON.stringify({ ok: code === 0, detail, errors, unexpected, providerRequestCount: providerRequests.length, mode: 'Real Electron with mocked OAuth endpoints, signed JWT and OS-encrypted test tokens; no real login' }, null, 2));
  console.log(code === 0 ? 'AUTH SMOKE PASS: ' + detail : 'AUTH SMOKE FAIL: ' + detail); app.exit(code);
}
process.on('uncaughtException', (e) => finish(1, e.stack));
process.on('unhandledRejection', (e) => finish(1, e.stack || String(e)));
const wait = async (fn, label, timeout = 15000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { try { if (await fn()) return; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  throw new Error('Timed out: ' + label);
};
app.on('web-contents-created', (_e, contents) => {
  contents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  contents.on('preload-error', (_e, _file, error) => errors.push(error.message));
});
app.whenReady().then(async () => {
  const jose = await import('jose'); SignJWT = jose.SignJWT;
  const pair = await jose.generateKeyPair('RS256'); signingKey = pair.privateKey;
  publicJwk = await jose.exportJWK(pair.publicKey); publicJwk.kid = 'test';
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => { if (/^(https?|wss?):/.test(details.url)) { unexpected.push(details.url); cb({ cancel: true }); } else cb({}); });
  let main;
  await wait(() => { main = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()); return main; }, 'main window');
  const evaluate = (script) => main.webContents.executeJavaScript(script);
  const click = (label) => evaluate(`(() => {const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)});if(!el)throw Error('Missing button');el.click()})()`);
  const set = (selector, value, event = 'input') => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing field');Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}))})()`);
  await wait(() => evaluate('!!document.querySelector("[data-local-app]")'), 'local app');
  await evaluate('document.querySelector("[data-page=settings]").click()');
  await wait(() => evaluate('!!document.querySelector(".account-panel")'), 'auth UI');
  await click('Continue with ChatGPT');
  await wait(() => evaluate('document.querySelector(".account-panel").innerText.includes("mock@example.invalid")'), 'validated login');
  await set('.model-card:first-child [data-model-field=provider]', 'chatgpt', 'change');
  await wait(() => evaluate('!document.querySelector(".model-card:first-child input[type=password]")'), 'OAuth profile fields');
  await evaluate('[...document.querySelectorAll(".model-card:first-child button")].find(el=>el.textContent==="获取模型列表").click()');
  await wait(() => evaluate('document.querySelector(".model-card:first-child").innerText.includes("Mock account model")'), 'account models');
  assert.equal(await evaluate('document.querySelector(".model-card:first-child").innerText.includes("hidden-model")'), false);
  await set('.model-card:first-child [data-model-field=model]', 'mock-model');
  await evaluate('document.querySelector(".model-card:first-child button.primary").click()');
  await wait(() => evaluate('document.querySelector(".model-card:first-child .status.ready")'), 'saved OAuth profile');
  const snapshot = await evaluate('window.api.personalModels.load()');
  assert.equal(snapshot.profiles.find((p) => p.slot === 'interview').providerId, 'chatgpt');
  assert.equal(snapshot.profiles.find((p) => p.slot === 'interview').apiMode, 'responses');
  assert.equal(JSON.stringify(snapshot).includes('mock-oauth-access-token'), false);
  const encrypted = fs.readFileSync(path.join(dataDir, 'chatgpt-authorization.json'), 'utf8');
  assert.equal(encrypted.includes('mock-oauth-access-token'), false); assert.equal(encrypted.includes('mock-oauth-refresh-token'), false);
  await evaluate('document.querySelector("[data-page=chat]").click()');
  await set('.composer textarea', '测试官方授权链路');
  await evaluate('document.querySelector(".composer").requestSubmit()');
  await wait(() => evaluate('document.querySelector(".chat-thread").innerText.includes("授权链路测试回答")'), 'OAuth inference');
  await wait(() => evaluate('![...document.querySelectorAll("button")].some(el=>el.textContent === "停止生成")'), 'OAuth request complete');
  failInference = true;
  const failure = await evaluate('window.api.personalModels.run({requestId:"oauth-limit-test",taskKind:"interview",slot:"interview",request:{messages:[{role:"system",content:"test instructions"},{role:"user",content:"test"}]}})');
  assert.equal(failure.ok, false); assert.equal(failure.error.code, 'CHATGPT_USAGE_LIMIT'); assert.match(failure.error.message, /用量/);
  await evaluate('document.querySelector("[data-page=settings]").click()');
  await wait(() => evaluate('[...document.querySelectorAll("button")].some(el=>el.textContent === "退出授权")'), 'connected account UI');
  await click('退出授权');
  await wait(() => evaluate('document.querySelector(".account-panel").innerText.includes("Continue with ChatGPT")'), 'logout');
  assert.equal((await evaluate('window.api.chatgpt.status()')).connected, false);
  assert.equal((await evaluate('window.api.personalModels.load()')).profiles.find((p) => p.slot === 'interview').enabled, false);
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  finish(0, 'Official OAuth callback, signed JWT verification in Electron, encrypted token storage, account model list, saved Responses profile, streaming and logout; providers mocked');
}).catch((e) => finish(1, e.stack));
setTimeout(() => finish(1, 'Overall OAuth smoke timeout'), 60000).unref();
require('../out/main/index.js');
