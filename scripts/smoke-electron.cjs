const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
process.env.CLIMB_USER_DATA_DIR = fs.mkdtempSync(path.join(root, '.runtime', 'smoke-'));
const requests = [];
const errors = [];
const subscription = { active: true, plan: 'smoke-test', screenshotQuota: 100, screenshotUsed: 0, voiceMinutes: 100, voiceUsed: 0, accessMode: 'quota' };
const server = http.createServer((req, res) => {
  requests.push({ method: req.method, path: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const route = new URL(req.url, 'http://localhost').pathname;
  if (route === '/v1/auth/login') res.end(JSON.stringify({ accessToken: 'smoke-access-token', refreshToken: 'smoke-refresh-token', subscription, expiresAt: Date.now() + 3600000 }));
  else if (route === '/v1/subscription/status') res.end(JSON.stringify(subscription));
  else if (route === '/v1/client/version') res.end(JSON.stringify({ currentVersion: '3.0.1', latestVersion: '3.0.1', forceUpdate: false, updateAvailable: false }));
  else if (/resume|knowledge|sessions|history|jobs/.test(route)) res.end(JSON.stringify({ items: [], resumes: [], indexes: [], records: [], sessions: [], jobs: [] }));
  else { res.statusCode = 503; res.end(JSON.stringify({ message: 'Local smoke test: service not simulated' })); }
});

function waitFor(fn, description, timeout = 15000) {
  const end = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    async function tick() {
      try { const value = await fn(); if (value) { resolve(value); return; } } catch {}
      if (Date.now() >= end) { reject(new Error(`Timed out: ${description}`)); return; }
      setTimeout(tick, 100);
    }
    tick();
  });
}
let finished = false;
function finish(code, detail) {
  if (finished) return;
  finished = true;
  fs.writeFileSync(path.join(artifacts, 'smoke-report.json'), JSON.stringify({ ok: code === 0, detail, errors, requests, mode: 'Local HTTP contract stub; no real cloud login or account used' }, null, 2));
  console.log(code === 0 ? 'SMOKE PASS: ' + detail : 'SMOKE FAIL: ' + detail);
  server.close();
  app.exit(code);
}
process.on('uncaughtException', (error) => finish(1, error.stack));
process.on('unhandledRejection', (error) => finish(1, error?.stack || String(error)));
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (event) => {
    if (event.level === 'error' && !/WebSocket|ERR_FAILED|503|remote|Failed to fetch|status of 404/i.test(event.message)) errors.push(event.message);
  });
  contents.on('preload-error', (_event, _file, error) => errors.push(error.stack));
});
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  // Exercise the real renderer fetch/auth and IPC implementations against a local
  // contract stub. Never submit test credentials to the original cloud service.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (details.resourceType === 'webSocket') { callback({ cancel: true }); return; }
    if (details.url.startsWith('https://workclimb.top/')) {
      const url = new URL(details.url);
      callback({ redirectURL: `http://127.0.0.1:${port}${url.pathname}${url.search}` });
      return;
    }
    callback({});
  });
  const main = await waitFor(() => BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && !win.webContents.getURL().includes('shortcut-overlay')), 'main window');
  const evaluate = (script) => main.webContents.executeJavaScript(script);
  await waitFor(() => evaluate('!!window.api && !!document.querySelector("[data-login-shell]")'), 'login rendered');
  await new Promise((resolve) => setTimeout(resolve, 350));
  fs.writeFileSync(path.join(artifacts, 'login.png'), (await main.webContents.capturePage()).toPNG());
  assert.ok(await evaluate('document.body.innerText.includes("登录")'));
  assert.equal(await evaluate('typeof require'), 'undefined');
  assert.equal(await evaluate('document.querySelector("img").naturalWidth > 0'), true);
  await evaluate(`(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [selector, value] of [['input[type=email]', 'smoke@climb.local'], ['input[type=password]', 'local-smoke-password']]) {
      const input = document.querySelector(selector);
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await evaluate('document.querySelector("form").requestSubmit()');
  await waitFor(() => evaluate('!document.querySelector("[data-login-shell]") && document.body.innerText.includes("新任务")'), 'local mock login');
  const snapshot = await evaluate('window.api.auth.status()');
  assert.equal(snapshot.email, 'smoke@climb.local');
  const opacity = await evaluate('window.api.settings.patch({ opacity: 0.87 }).then(() => window.api.settings.get()).then(s => s.opacity)');
  assert.equal(opacity, 0.87);
  const knowledge = await evaluate('window.api.knowledgeLibrary.save("smoke@climb.local", { id: "smoke", title: "Local smoke" }).then(() => window.api.knowledgeLibrary.list("smoke@climb.local"))');
  assert.equal(knowledge.length, 1);
  await assert.rejects(evaluate('window.api.knowledgeLibrary.list("another@climb.local")'));
  await assert.rejects(evaluate('window.api.auth.openPortal("javascript:alert(1)")'));
  await evaluate('window.api.personalModels.save({ slot: "screenshot", model: "test-model", baseUrl: "https://models.example.test/v1", apiKey: "local-smoke-key-123" })');
  const models = await evaluate('window.api.personalModels.load()');
  assert.equal(models.credentials[0].configured, true);
  assert.equal(JSON.stringify(models).includes('local-smoke-key-123'), false);
  await evaluate('window.api.personalModels.remove("screenshot")');
  await new Promise((resolve) => setTimeout(resolve, 300));
  fs.writeFileSync(path.join(artifacts, 'dashboard.png'), (await main.webContents.capturePage()).toPNG());
  const token = await evaluate('window.api.window.setTaskSurface("exam", "focus", true)');
  assert.ok(Number.isSafeInteger(token));
  assert.equal(main.isVisible(), false);
  assert.equal(await evaluate(`window.api.window.commitTaskSurface(${token + 1})`), false);
  assert.equal(main.isVisible(), false);
  assert.equal(await evaluate(`window.api.window.commitTaskSurface(${token})`), true);
  assert.equal(main.getBounds().width, 1000);
  const overlay = await waitFor(() => BrowserWindow.getAllWindows().find((win) => win !== main && !win.isDestroyed() && win.isVisible()), 'protected shortcut overlay');
  const overlaySettings = await overlay.webContents.executeJavaScript('window.api.settings.get()');
  assert.equal(overlaySettings.opacity, 0.87);
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.auth.getTokens()'));
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.settings.patch({ opacity: 0.1 })'));
  if (process.platform === 'win32') {
    const koffi = require('koffi');
    const getAffinity = koffi.load('user32.dll').func('int __stdcall GetWindowDisplayAffinity(intptr_t hwnd, _Out_ uint32_t *affinity)');
    for (const win of [main, overlay]) {
      const affinity = [null];
      assert.equal(getAffinity(win.getNativeWindowHandle().readBigUInt64LE(0), affinity), 1);
      assert.equal(affinity[0], 17);
    }
  }
  const restoreToken = await evaluate('window.api.window.setTaskSurface("idle", "preparation", false)');
  assert.equal(await evaluate(`window.api.window.commitTaskSurface(${restoreToken})`), true);
  assert.equal(await evaluate(`window.api.window.commitTaskSurface(${token})`), false);
  if (errors.length) throw new Error(errors.join('\n'));
  finish(0, 'Electron startup, login UI, local auth contract, settings persistence, knowledge isolation, encrypted model credentials, portal allowlist, task reveal tokens, protected shortcut overlay, native WDA=17 readback');
}).catch((error) => finish(1, error.stack));
setTimeout(() => finish(1, 'Overall smoke timeout'), 35000).unref();
require('../out/main/index.js');
