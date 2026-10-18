const { app, BrowserWindow, session, ipcMain, globalShortcut, shell } = require('electron');
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
const externalUrls = [];
shell.openExternal = async (url) => { externalUrls.push(url); };
const shortcuts = new Map();
const register = globalShortcut.register.bind(globalShortcut);
globalShortcut.register = (accelerator, callback) => { const ok = register(accelerator, callback); if (ok) shortcuts.set(accelerator, callback); return ok; };
const trigger = (accelerator) => { assert.equal(globalShortcut.isRegistered(accelerator), true, accelerator + ' must be registered'); assert.ok(shortcuts.get(accelerator)); shortcuts.get(accelerator)(); };
const user32 = process.platform === 'win32' ? require('koffi').load('user32.dll') : null;
const readAffinity = user32?.func('int __stdcall GetWindowDisplayAffinity(intptr_t hwnd, _Out_ uint32_t *affinity)');
const readStyle = user32?.func('__stdcall', 'GetWindowLongPtrW', 'intptr_t', ['intptr_t', 'int']);
function nativeState(win) {
  const bytes = win.getNativeWindowHandle(); const hwnd = bytes.length >= 8 ? bytes.readBigUInt64LE(0) : BigInt(bytes.readUInt32LE(0));
  const out = [null]; assert.equal(Number(readAffinity(hwnd, out)), 1);
  const style = BigInt(readStyle(hwnd, -20));
  return { affinity: out[0], transparent: !!(style & 0x20n), noActivate: !!(style & 0x08000000n) };
}
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
  const setValue = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw new Error('Input missing'); Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  await waitFor(() => evaluate('!!document.querySelector("[data-local-app]")'), 'local workspace');
  assert.equal(await evaluate('document.title'), '知跃');
  assert.equal(await evaluate('window.api.runtime.brand.developer'), 'gulinyue');
  await waitFor(() => evaluate('document.querySelector(".brand img")?.naturalWidth > 0'), 'new brand logo');
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
  await waitFor(async () => {
    const transparent = await main.webContents.capturePage();
    const alpha = transparent.toBitmap()[(30 * transparent.getSize().width + 400) * 4 + 3];
    return alpha > 0 && alpha < 255;
  }, 'Window pixels actually become transparent');
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
  if (process.platform === 'win32') assert.equal(await evaluate('!!document.querySelector("[data-inline-shortcuts]")'), true);
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
  const overlay = process.platform === 'win32' ? null : await waitFor(() => BrowserWindow.getAllWindows().find((win) => win !== main && !win.isDestroyed() && win.isVisible()), 'shortcut overlay');
  if (process.platform === 'win32') assert.equal(BrowserWindow.getAllWindows().filter(win=>win!==main&&!win.isDestroyed()).length, 0);
  if (overlay) {
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.workspace.list()'));
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.personalModels.load()'));
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.app.openSupport()'));
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.app.openFeedback()'));
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.interview.connection()'));
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.tutorial.openLink("deepseek")'));
  await assert.rejects(overlay.webContents.executeJavaScript('window.api.tutorial.copyValue("deepseekBase")'));
  }
  assert.equal(externalUrls.length, 0);
  const restore = await evaluate('window.api.window.setTaskSurface("idle", "preparation", false)');
  assert.equal(await evaluate(`window.api.window.commitTaskSurface(${restore})`), true);
  assert.equal(await evaluate('window.api.app.downloadUpdate("https://example.invalid/installer.exe").then(r => r.status)'), 'unavailable');
  // Configure written preferences through the real settings form.
  await evaluate('document.querySelector("[data-page=settings]").click()');
  await waitFor(() => evaluate('!!document.querySelector("[data-written-settings]")'), 'written settings');
  await evaluate('document.querySelector("[data-support-developer]").click()');
  await waitFor(() => externalUrls.length === 1, 'developer support opens browser');
  assert.deepEqual(externalUrls, ['https://afdian.com/a/gulinyue618']);
  await evaluate('document.querySelector("[data-developer-contact]").scrollIntoView({block:"center"})');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(artifacts, 'zhiyue-developer-support.png'), (await main.webContents.capturePage()).toPNG());
  await evaluate('document.querySelector("[data-feedback-email]").click()');
  await waitFor(() => externalUrls.length === 2, 'feedback opens mail client');
  assert.equal(new URL(externalUrls[1]).pathname, 'linyue_clawbot001@163.com');
  assert.equal(new URL(externalUrls[1]).protocol, 'mailto:');
  assert.equal(await evaluate('document.querySelector("[data-developer-contact]").compareDocumentPosition(document.querySelector("[data-speech-settings]")) & Node.DOCUMENT_POSITION_FOLLOWING'), 4);
  await evaluate('document.querySelector("[data-written-settings]").scrollIntoView({block:"start"})');
  await setValue('[data-written-setting=codingLanguage]', 'Go');
  await waitFor(() => evaluate('window.api.settings.get().then(s=>s.writtenOptions.codingLanguage === "Go")'), 'persisted coding language');
  await setValue('[data-written-setting=answerLanguage]', 'English');
  await waitFor(() => evaluate('window.api.settings.get().then(s=>s.writtenOptions.answerLanguage === "English")'), 'persisted answer language');
  await setValue('[data-written-setting=prompt]', '采用 ACM 输入输出格式');
  await waitFor(() => evaluate('window.api.settings.get().then(s=>s.writtenOptions.prompt.includes("ACM"))'), 'persisted written prompt');
  await setValue('[data-written-setting=knowledgeMode]', 'selected');
  await waitFor(() => evaluate('!!document.querySelector(".written-document-options input")'), 'knowledge selection');
  await evaluate('document.querySelector(".written-document-options input").click()');
  await waitFor(() => evaluate('window.api.settings.get().then(s=>s.writtenOptions.documentIds.length === 1)'), 'selected knowledge');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(artifacts, 'zhiyue-written-settings.png'), (await main.webContents.capturePage()).toPNG());
  await evaluate('window.api.settings.patch({hotkeys:{"exam:exit":""}})');
  await assert.rejects(evaluate('window.api.written.enter()'));
  assert.equal((await evaluate('window.api.written.status()')).active, false, 'Cannot enter without a registered exit key');
  assert.equal(main.isFocusable(), true);
  await evaluate('window.api.settings.patch({hotkeys:{"exam:exit":"Ctrl+Shift+Z"}})');
  await evaluate('document.querySelector("[data-page=exam]").click()');
  await waitFor(() => evaluate('!!document.querySelector(".is-written-passive") && !!document.querySelector(".written-welcome")'), 'written passive floating mode');
  await waitFor(() => main.isVisible(), 'written window revealed');
  let writtenState = await evaluate('window.api.written.status()');
  assert.equal(writtenState.active, true); assert.equal(writtenState.clickThrough, true); assert.equal(main.isFocusable(), false);
  if (process.platform === 'win32') assert.equal(writtenState.captureProtection, 'exclude', 'Actual Windows display affinity must be WDA_EXCLUDEFROMCAPTURE');
  assert.equal(await evaluate('!!document.querySelector(".composer")'), false);
  assert.ok(await evaluate('Number(document.querySelector("[data-local-app]").style.opacity) > .1 && Number(document.querySelector("[data-local-app]").style.opacity) < .9'));
  trigger('Control+Shift+X'); trigger('Control+Shift+E');
  assert.equal((await evaluate('window.api.written.status()')).clickThrough, true, 'Mouse-through toggle and show cannot unlock written mode');
  assert.equal(main.isFocusable(), false);
  await evaluate('window.api.window.setInteractive(true)'); await evaluate('window.api.window.setFocusable(true)');
  assert.equal((await evaluate('window.api.written.status()')).clickThrough, true, 'Generic IPC cannot unlock written mode');
  const writtenOverlay = process.platform === 'win32' ? null : await waitFor(() => BrowserWindow.getAllWindows().find(w=>w !== main && !w.isDestroyed() && w.isVisible()), 'protected written shortcut overlay');
  if (process.platform === 'win32') {
    assert.deepEqual(nativeState(main), { affinity: 17, transparent: true, noActivate: true });
    assert.equal(await evaluate('!!document.querySelector("[data-inline-shortcuts=exam]")'), true);
    assert.equal(BrowserWindow.getAllWindows().filter(w=>w!==main&&!w.isDestroyed()).length, 0, 'Windows hints share the protected task HWND');
    main.setContentProtection(false);
    await waitFor(() => nativeState(main).affinity === 17, 'written capture protection recovers after native state loss');
  }
  if (writtenOverlay) await assert.rejects(writtenOverlay.webContents.executeJavaScript('window.api.written.exit()'));
  fs.writeFileSync(path.join(artifacts, 'zhiyue-written-passive.png'), (await main.webContents.capturePage()).toPNG());
  await waitFor(() => evaluate('window.api.hotkey.status().then(s=>s["screenshot:capture"])'), 'written capture shortcut registration');
  const writtenRequestCount = requests.length;
  trigger('Control+Q'); trigger('Control+Q');
  await waitFor(() => requests.length > writtenRequestCount, 'written screenshot directly submits');
  await waitFor(() => evaluate('document.querySelector(".chat-thread")?.innerText.includes("已收到图片") && ![...document.querySelectorAll("button")].some(el=>el.textContent === "停止生成")'), 'written answer');
  assert.equal(requests.length, writtenRequestCount + 1, 'Rapid repeated capture shortcuts submit once');
  assert.match(requests.at(-1).body.messages[0].content, /笔试模式/);
  assert.match(requests.at(-1).body.messages[0].content, /先给出明确答案/);
  assert.match(requests.at(-1).body.messages[0].content, /默认编程语言：Go/);
  assert.match(requests.at(-1).body.messages[0].content, /回答语言：English/);
  assert.match(requests.at(-1).body.messages[0].content, /ACM 输入输出格式/);
  assert.match(requests.at(-1).body.messages[0].content, /配合过期策略/);
  const writtenRecord = await evaluate('window.api.workspace.list().then(items=>items.find(item=>item.mode==="written"))');
  assert.ok(writtenRecord);
  fs.writeFileSync(path.join(artifacts, 'zhiyue-written.png'), (await main.webContents.capturePage()).toPNG());
  const beforeScrollCapture = requests.length;
  trigger('Control+Shift+Q');
  await waitFor(() => requests.length > beforeScrollCapture, 'written scrolling screenshot submits');
  await waitFor(() => evaluate('![...document.querySelectorAll("button")].some(el=>el.textContent === "停止生成")'), 'written scrolling answer');
  assert.equal(requests.at(-1).body.messages.length, 2, 'New screenshots do not reuse the previous question');
  trigger('Control+Shift+Z');
  await waitFor(() => evaluate('!document.querySelector(".is-focus") && !!document.querySelector("[data-written-settings]")'), 'exit written restores settings');
  await waitFor(() => main.isVisible(), 'exit written reveal');
  assert.equal(main.isFocusable(), true);
  writtenState = await evaluate('window.api.written.status()');
  assert.equal(writtenState.active, false); assert.equal(writtenState.clickThrough, false);
  if (process.platform === 'win32') assert.equal(nativeState(main).transparent, false);
  if (process.platform === 'win32') assert.equal(writtenState.captureProtection, 'none', 'Normal workbench restores its previous capture policy');
  // Disabling hints hides both the inline strip and auxiliary native window,
  // while the actual capture and exit shortcuts continue to work.
  await evaluate('document.querySelector("[data-shortcut-hints=hide]").click()');
  await waitFor(() => evaluate('window.api.settings.get().then(s=>s.writtenOptions.showShortcutHints === false)'), 'hints disabled and persisted');
  await evaluate('document.querySelector("[data-page=exam]").click()');
  await waitFor(() => evaluate('!!document.querySelector(".is-written-passive")') && main.isVisible(), 'written mode without hints');
  assert.equal(await evaluate('!!document.querySelector(".written-passive-banner, .written-key, [data-inline-shortcuts]")'), false);
  assert.equal(BrowserWindow.getAllWindows().filter(w=>w !== main && !w.isDestroyed()).length, 0, 'No shortcut overlay is created when disabled');
  const beforeNoHintCapture = requests.length;
  const beforeNoHintMessages = await evaluate(`window.api.workspace.read(${JSON.stringify(writtenRecord.id)}).then(r=>r.messages.length)`);
  trigger('Control+Q');
  await waitFor(() => requests.length > beforeNoHintCapture, 'capture shortcut works without hints');
  await waitFor(() => evaluate(`window.api.workspace.read(${JSON.stringify(writtenRecord.id)}).then(r=>r.messages.length === ${beforeNoHintMessages + 2} && r.messages.at(-1).status === 'completed')`), 'answer without hints');
  trigger('Control+Shift+Z');
  await waitFor(() => evaluate('!document.querySelector(".is-written-passive") && !!document.querySelector("[data-written-settings]")'), 'exit shortcut works without hints');
  await evaluate('document.querySelector("[data-shortcut-hints=show]").click()');
  await waitFor(() => evaluate('window.api.settings.get().then(s=>s.writtenOptions.showShortcutHints === true)'), 'hints enabled again');
  await evaluate('document.querySelector("[data-page=history]").click()');
  await waitFor(() => evaluate('[...document.querySelectorAll(".history-item")].some(el=>el.innerText.includes("笔试模式"))'), 'written history label');
  await evaluate('[...document.querySelectorAll(".history-item")].find(el=>el.innerText.includes("笔试模式")).querySelector("button.primary").click()');
  await waitFor(() => evaluate('!!document.querySelector(".is-written-passive") && document.querySelector(".chat-thread").innerText.includes("已收到图片")'), 'reopened written answer');
  trigger('Control+Shift+H'); assert.equal(main.isVisible(), false);
  trigger('Control+Shift+Z');
  await waitFor(() => evaluate('!document.querySelector(".is-written-passive") && !!document.querySelector("[data-written-settings]")') && main.isVisible(), 'exit hidden written mode restores visible settings');
  await waitFor(() => evaluate('document.querySelector("[data-about-brand]")?.innerText.includes("gulinyue")'), 'developer attribution');
  // Exiting during an unfinished capture must discard its late image result.
  let releaseCapture;
  const pendingCapture = new Promise((resolve) => { releaseCapture = resolve; });
  ipcMain.removeHandler('screenshot:capture'); ipcMain.handle('screenshot:capture', () => pendingCapture);
  await evaluate('document.querySelector("[data-page=exam]").click()');
  await waitFor(() => evaluate('!!document.querySelector(".is-written-passive")'), 'written mode for cancellation');
  const beforeLateCapture = requests.length;
  trigger('Control+Q'); trigger('Control+Shift+Z');
  await waitFor(() => evaluate('!document.querySelector(".is-written-passive")'), 'exit while capture is pending');
  releaseCapture({ url: png, count: 1 });
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(requests.length, beforeLateCapture, 'Late capture cannot submit after written exit');
  ipcMain.removeHandler('screenshot:capture'); ipcMain.handle('screenshot:capture', () => ({ url: png, count: 1 }));
  // Native exit also cancels an already-started model stream.
  await evaluate('document.querySelector("[data-page=exam]").click()');
  await waitFor(() => evaluate('!!document.querySelector(".is-written-passive")'), 'written mode for stream cancellation');
  aborted = false;
  const beforeActiveStream = requests.length;
  const activeStream = evaluate('window.api.personalModels.run({requestId:"written-exit-stream",taskKind:"exam",slot:"screenshot",request:{messages:[{role:"user",content:"取消测试"}]}})');
  await waitFor(() => requests.length > beforeActiveStream, 'written stream started');
  trigger('Control+Shift+Z');
  const stoppedStream = await activeStream;
  assert.equal(stoppedStream.ok, false); assert.equal(stoppedStream.error.code, 'PERSONAL_MODEL_ABORTED');
  await waitFor(() => aborted, 'written exit disconnected provider stream');
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
  finish(0, 'Written mode atomic click-through/translucency/capture exclusion, safe hotkey exit including hidden mode, scoped preferences/knowledge, screenshot/scroll answer and history, generic window controls, native providers and restricted overlay; providers mocked');
}).catch((error) => finish(1, error.stack));
setTimeout(() => finish(1, 'Overall local smoke timeout'), 70000).unref();
require('../out/main/index.js');
