const { app, BrowserWindow, session, ipcMain } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
process.env.CLIMB_USER_DATA_DIR = fs.mkdtempSync(path.join(root, '.runtime', 'local-smoke-'));
const requests = [];
const unexpectedNetwork = [];
const errors = [];
let baseUrl;
let aborted = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (!baseUrl || !String(url).startsWith(baseUrl + '/')) {
    unexpectedNetwork.push(String(url));
    return Promise.reject(new Error('Unexpected network in standalone test'));
  }
  return originalFetch(url, options);
};
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');
  requests.push({ path: req.url, body });
  if (req.url !== '/v1/chat/completions') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const last = body.messages?.at(-1)?.content;
  const text = typeof last === 'string' ? last : last?.find((part) => part.type === 'text')?.text || '';
  const vision = Array.isArray(last) && last.some((part) => part.type === 'image_url');
  const delta = (content) => res.write('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n');
  if (text.includes('取消测试')) {
    delta('部分回答');
    const timeout = setTimeout(() => { delta('不应继续显示'); res.end('data: [DONE]\n\n'); }, 12000);
    res.on('close', () => { clearTimeout(timeout); aborted = true; });
    return;
  }
  delta(vision ? '截图模型回答：已收到图片。' : '本地模型回答：你好，独立运行正常。');
  res.end('data: [DONE]\n\n');
});
function waitFor(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    async function tick() {
      try { const value = await fn(); if (value) { resolve(value); return; } } catch {}
      if (Date.now() >= end) { reject(new Error(`Timed out: ${label}`)); return; }
      setTimeout(tick, 80);
    }
    tick();
  });
}
let finished = false;
function finish(code, detail) {
  if (finished) return;
  finished = true;
  // Never write provider credentials or full test image payloads to the report.
  fs.writeFileSync(path.join(artifacts, 'local-smoke-report.json'), JSON.stringify({ ok: code === 0, detail, errors, unexpectedNetwork, providerRequestCount: requests.length, providerPaths: requests.map((item) => item.path), mode: 'Real Electron; local mock model; simulated screenshot; all other networking rejected' }, null, 2));
  console.log(code === 0 ? 'LOCAL SMOKE PASS: ' + detail : 'LOCAL SMOKE FAIL: ' + detail);
  server.close();
  app.exit(code);
}
process.on('uncaughtException', (error) => finish(1, error.stack));
process.on('unhandledRejection', (error) => finish(1, error?.stack || String(error)));
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  contents.on('preload-error', (_event, _file, error) => errors.push(error.stack));
});
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (/^(https?|wss?):/i.test(details.url)) { unexpectedNetwork.push(details.url); callback({ cancel: true }); }
    else callback({});
  });
  const main = await waitFor(() => BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()), 'main window');
  const evaluate = (script) => main.webContents.executeJavaScript(script);
  const click = (label) => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Button missing'); button.click(); })()`);
  const setValue = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw new Error('Input missing'); Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(() => evaluate('!!document.querySelector("[data-local-app]")'), 'local workspace');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await evaluate('!!document.querySelector("input[type=password]")'), false);
  assert.equal(await evaluate('window.api.auth.status().then(s => s.local)'), true);
  assert.equal(await evaluate('window.api.auth.getTokens().then(s => Object.keys(s).length)'), 0);
  assert.equal(requests.length, 0);
  fs.writeFileSync(path.join(artifacts, 'local-workspace.png'), (await main.webContents.capturePage()).toPNG());

  await evaluate('document.querySelector("[data-page=settings]").click()');
  await waitFor(() => evaluate('document.querySelectorAll(".model-card").length === 2'), 'model settings');
  for (const index of [1, 2]) {
    await setValue(`.model-card:nth-child(${index}) input`, baseUrl + '/v1');
    await setValue(`.model-card:nth-child(${index}) .field:nth-of-type(2) input`, 'smoke-model');
    await evaluate(`document.querySelector('.model-card:nth-child(${index}) button.primary').click()`);
    await waitFor(() => evaluate(`!!document.querySelector('.model-card:nth-child(${index}) .status.ready')`), 'saved model without API key');
  }
  assert.equal(requests.length, 0);
  fs.writeFileSync(path.join(artifacts, 'local-settings.png'), (await main.webContents.capturePage()).toPNG());

  await evaluate('document.querySelector("[data-page=knowledge]").click()');
  await waitFor(() => evaluate('!!document.querySelector(".knowledge-grid")'), 'knowledge editor');
  await setValue('.knowledge-grid .field input', '本地项目');
  await setValue('.knowledge-grid textarea', '本地项目使用 Redis 缓存，配合过期策略提高查询性能。');
  await click('保存资料');
  await waitFor(() => evaluate('document.querySelector(".document-list")?.innerText.includes("本地项目")'), 'saved local document');

  await evaluate('document.querySelector("[data-page=chat]").click()');
  await setValue('.composer textarea', '解释本地项目 Redis 缓存的设计');
  await evaluate('document.querySelector(".composer").requestSubmit()');
  await waitFor(() => evaluate('document.querySelector(".chat-thread")?.innerText.includes("独立运行正常") && ![...document.querySelectorAll("button")].some(el => el.textContent === "停止生成")'), 'streamed local model answer');
  await waitFor(() => evaluate('window.api.workspace.list().then(items => items.length === 1)'), 'persisted conversation');
  assert.match(requests[0].body.messages[0].content, /配合过期策略/);
  assert.equal('entitlement' in requests[0].body, false);
  const saved = await evaluate('window.api.workspace.list().then(items => window.api.workspace.read(items[0].id))');
  assert.equal(saved.messages.at(-1).text, '本地模型回答：你好，独立运行正常。');
  fs.writeFileSync(path.join(artifacts, 'local-chat.png'), (await main.webContents.capturePage()).toPNG());

  // Exercise the screenshot UI and vision routing with an image of this app only.
  // The native desktop capture pipeline remains covered by the capture tests.
  const png = (await main.webContents.capturePage()).toDataURL();
  ipcMain.removeHandler('screenshot:capture');
  ipcMain.handle('screenshot:capture', () => ({ url: png, count: 1 }));
  await click('＋ 添加截图');
  await waitFor(() => evaluate('!!document.querySelector(".attachments img")'), 'screenshot attachment');
  await setValue('.composer textarea', '图片问题');
  await evaluate('document.querySelector(".composer").requestSubmit()');
  await waitFor(() => evaluate('document.querySelector(".chat-thread")?.innerText.includes("已收到图片")'), 'vision model answer');
  await waitFor(() => evaluate('![...document.querySelectorAll("button")].some(el => el.textContent === "停止生成")'), 'vision complete');
  const vision = requests.find((entry) => entry.body.messages.at(-1)?.content?.some?.((part) => part.type === 'image_url'));
  assert.ok(vision);
  const afterVision = await evaluate(`window.api.workspace.read(${JSON.stringify(saved.id)})`);
  assert.equal(JSON.stringify(afterVision).includes('data:image'), false);

  await setValue('.composer textarea', '取消测试');
  await evaluate('document.querySelector(".composer").requestSubmit()');
  await waitFor(() => evaluate('document.querySelector(".chat-thread")?.innerText.includes("部分回答")'), 'partial answer');
  await click('停止生成');
  await waitFor(() => aborted, 'provider connection aborted');
  await waitFor(() => evaluate(`window.api.workspace.read(${JSON.stringify(saved.id)}).then(item => item.messages.at(-1).status === 'cancelled')`), 'cancel persisted');
  assert.equal(await evaluate('document.body.innerText.includes("不应继续显示")'), false);

  await evaluate('document.querySelector("[data-page=history]").click()');
  await waitFor(() => evaluate('!!document.querySelector(".history-item")'), 'history view');
  await click('继续会话');
  await waitFor(() => evaluate('document.querySelector(".chat-thread")?.innerText.includes("部分回答")'), 'reopened local history');

  const beforeHotkey = requests.length;
  main.webContents.send('hotkey:triggered', 'screenshot:capture');
  await waitFor(() => requests.length > beforeHotkey, 'capture-and-send hotkey');
  await waitFor(() => evaluate('![...document.querySelectorAll("button")].some(el => el.textContent === "停止生成")'), 'hotkey request completed');
  await click('专注窗口');
  await waitFor(() => evaluate('!!document.querySelector(".is-focus")'), 'focus UI');
  await waitFor(() => main.isVisible(), 'focus reveal');
  await click('退出专注');
  await waitFor(() => evaluate('!document.querySelector(".is-focus")'), 'exit focus UI');

  const token = await evaluate('window.api.window.setTaskSurface("exam", "focus", true)');
  assert.equal(main.isVisible(), false);
  assert.equal(await evaluate(`window.api.window.commitTaskSurface(${token + 1})`), false);
  assert.equal(await evaluate(`window.api.window.commitTaskSurface(${token})`), true);
  const overlay = await waitFor(() => BrowserWindow.getAllWindows().find((win) => win !== main && !win.isDestroyed() && win.isVisible()), 'shortcut overlay');
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.workspace.list()'));
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.personalModels.load()'));
  const restore = await evaluate('window.api.window.setTaskSurface("idle", "preparation", false)');
  assert.equal(await evaluate(`window.api.window.commitTaskSurface(${restore})`), true);
  assert.equal(await evaluate('window.api.app.downloadUpdate("https://workclimb.top/old.exe").then(r => r.status)'), 'unavailable');
  assert.deepEqual(unexpectedNetwork, []);
  assert.deepEqual(errors, []);
  finish(0, 'No-login startup, local model settings, knowledge retrieval, text/vision streaming, cancellation, saved/reopened history, capture-and-send hotkey, focus UI, task tokens, overlay access restrictions; no Climb server requests');
}).catch((error) => finish(1, error.stack));
setTimeout(() => finish(1, 'Overall local smoke timeout'), 45000).unref();
require('../out/main/index.js');
