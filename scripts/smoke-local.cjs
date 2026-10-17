const { app, BrowserWindow, session, ipcMain, globalShortcut } = require('electron');
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
const shortcuts = new Map();
const register = globalShortcut.register.bind(globalShortcut);
globalShortcut.register = (accelerator, callback) => { const ok = register(accelerator, callback); if (ok) shortcuts.set(accelerator, callback); return ok; };
const trigger = (accelerator) => { assert.equal(globalShortcut.isRegistered(accelerator), true, accelerator + ' must be registered'); assert.ok(shortcuts.get(accelerator)); shortcuts.get(accelerator)(); };
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
  if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'smoke-model' }] })); return; }
  if (req.url === '/v1/messages' || req.url.startsWith('/v1/models/')) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (req.url === '/v1/messages') {
      assert.equal(req.headers['x-api-key'], 'local-no-key');
      assert.equal(body.system, '中文回答'); assert.equal(body.messages[0].content[1].type, 'image');
      res.write('data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'native answer' } }) + '\n\n');
      res.end('data: {"type":"message_stop"}\n\n');
    } else {
      assert.equal(req.headers['x-goog-api-key'], 'local-no-key');
      assert.equal(body.systemInstruction.parts[0].text, '中文回答'); assert.ok(body.contents[0].parts[1].inlineData);
      res.end('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'native answer' }] }, finishReason: 'STOP' }] }) + '\n\n');
    }
    return;
  }
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
    await setValue(`.model-card:nth-child(${index}) [data-model-field=base]`, baseUrl + '/v1');
    await setValue(`.model-card:nth-child(${index}) [data-model-field=model]`, 'smoke-model');
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
  // Run the actual callbacks that Electron registered, including the mode gate.
  const status = await evaluate('window.api.hotkey.status()');
  for (const action of ['window:show', 'window:hide', 'window:moveRight', 'window:opacityDown', 'answer:scrollUp', 'answer:scrollRight']) assert.equal(status[action], true, action);
  const bounds = main.getBounds();
  main.setPosition(80, 80);
  trigger('Control+Shift+Right');
  assert.ok(main.getBounds().x > 80, 'Window movement works in idle mode');
  trigger('Control+Shift+[');
  await waitFor(() => evaluate('Number(document.querySelector("[data-local-app]").style.opacity) < 1'), 'keyboard opacity');
  const transparent = await main.webContents.capturePage();
  const alpha = transparent.getBitmap()[(30 * transparent.getSize().width + 400) * 4 + 3];
  assert.ok(alpha > 0 && alpha < 255, 'Window pixels must actually become transparent');
  const beforeOpacity = await evaluate('Number(document.querySelector("[data-local-app]").style.opacity)');
  trigger('Control+Shift+]');
  await waitFor(() => evaluate('Number(document.querySelector("[data-local-app]").style.opacity) > ' + beforeOpacity), 'increase opacity');
  trigger('Control+Shift+H'); assert.equal(main.isVisible(), false);
  trigger('Control+Shift+E'); await waitFor(() => main.isVisible(), 'dedicated show shortcut');
  trigger('Control+Shift+X');
  await waitFor(() => evaluate('Number(document.querySelector("[data-local-app]").style.opacity) < 0.6'), 'click-through opacity');
  trigger('Control+Shift+H'); trigger('Control+Shift+E');
  await waitFor(() => evaluate('Number(document.querySelector("[data-local-app]").style.opacity) > 0.6'), 'show restores interaction and opacity');
  main.setBounds(bounds);
  // Add long fixture content without sending any provider request.
  await evaluate(`window.api.workspace.save({id:'scroll-fixture',title:'scroll',mode:'chat',updatedAt:Date.now(),messages:[{id:'fixture-user',role:'user',text:'滚动测试',status:'completed'},{id:'fixture-answer',role:'assistant',text:Array.from({length:120},(_,i)=>'第 '+i+' 行内容').join('\\n\\n')+'\\n\\n'+String.fromCharCode(96).repeat(3)+'text\\n'+'code '.repeat(300)+'\\n'+String.fromCharCode(96).repeat(3),status:'completed'}]})`);
  await evaluate('document.querySelector("[data-page=history]").click()');
  await waitFor(() => evaluate('document.querySelector(".history-item")?.innerText.includes("scroll")'), 'scroll fixture history');
  await evaluate('document.querySelector(".history-item button.primary").click()');
  await waitFor(() => evaluate('document.querySelector(".chat-thread")?.scrollTop > 100'), 'long content at bottom');
  const bottom = await evaluate('document.querySelector(".chat-thread").scrollTop');
  trigger('Control+Super+Up');
  await waitFor(() => evaluate('document.querySelector(".chat-thread").scrollTop < ' + bottom), 'content scroll up');
  trigger('Control+Super+Down');
  await waitFor(() => evaluate('document.querySelector(".chat-thread").scrollTop >= ' + bottom), 'content scroll down');
  trigger('Control+Alt+Shift+Right');
  await waitFor(() => evaluate('[...document.querySelectorAll(".chat-thread pre, .chat-thread pre code")].some(el=>el.scrollLeft > 0)'), 'horizontal code scroll');
  trigger('Control+Alt+Shift+Left');
  await waitFor(() => evaluate('[...document.querySelectorAll(".chat-thread pre, .chat-thread pre code")].every(el=>el.scrollLeft === 0)'), 'horizontal scroll back');
  await click('专注窗口');
  await waitFor(() => evaluate('!!document.querySelector(".is-focus")'), 'focus UI');
  await waitFor(() => main.isVisible(), 'focus reveal');
  const focusBounds = main.getBounds();
  await evaluate(`(() => { const el=document.querySelector('.focus-resize-handle'); if(!el)throw Error('Missing resize handle'); el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:7,screenX:100,screenY:100})); el.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:7,screenX:160,screenY:145})); el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,screenX:160,screenY:145})); })()`);
  await waitFor(() => main.getBounds().width > focusBounds.width && main.getBounds().height > focusBounds.height, 'focus resize handle');
  fs.writeFileSync(path.join(artifacts, 'local-floating-window.png'), (await main.webContents.capturePage()).toPNG());
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
  for (const [providerId, apiMode] of [['anthropic', 'anthropic'], ['google', 'gemini']]) {
    const input = { slot: 'interview', providerId, apiMode, model: 'smoke-model', baseUrl: baseUrl + '/v1' };
    const models = await evaluate(`window.api.personalModels.discover(${JSON.stringify(input)})`);
    assert.equal(models[0].id, 'smoke-model');
    const savedProfile = await evaluate(`window.api.personalModels.save(${JSON.stringify(input)})`);
    assert.equal(savedProfile.profiles.find((p) => p.slot === 'interview').apiMode, apiMode);
    const payload = { requestId: 'native-' + providerId, taskKind: 'interview', slot: 'interview', request: { messages: [{ role: 'system', content: '中文回答' }, { role: 'user', content: [{ type: 'text', text: '图片问题' }, { type: 'image_url', imageUrl: png }] }] } };
    const result = await evaluate(`window.api.personalModels.run(${JSON.stringify(payload)})`);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.result.text, 'native answer');
  }
  const persistedProfiles = JSON.parse(fs.readFileSync(path.join(process.env.CLIMB_USER_DATA_DIR, 'personal-model-profiles.json'), 'utf8'));
  assert.equal(persistedProfiles.connections.interview.apiMode, 'gemini'); assert.equal(persistedProfiles.connections.interview.providerId, 'google');
  assert.deepEqual(unexpectedNetwork, []);
  assert.deepEqual(errors, []);
  finish(0, 'No-login startup, provider settings/discovery/persistence, native Claude/Gemini text and vision IPC, knowledge retrieval, streaming/cancel/history, registered window movement/opacity/hide/show/click-through recovery/content scrolling, focus resize, task tokens and overlay access restrictions; providers mocked');
}).catch((error) => finish(1, error.stack));
setTimeout(() => finish(1, 'Overall local smoke timeout'), 70000).unref();
require('../out/main/index.js');
