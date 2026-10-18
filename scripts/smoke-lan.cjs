// Real Electron desktop + sandboxed narrow browser; mock screenshot/model only.
const { app, BrowserWindow, session, ipcMain, globalShortcut, powerMonitor } = require('electron');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.runtime'), { recursive: true });fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
process.env.ZHIYUE_USER_DATA_DIR = fs.mkdtempSync(path.join(root, '.runtime', 'lan-smoke-'));
let base, origin, phone, finished = false, captures = 0, modelCalls = 0, generationFinished = false;
const errors = [], network = [], shortcuts = new Map();const register = globalShortcut.register.bind(globalShortcut);
globalShortcut.register = (key, callback) => { const ok = register(key, callback);if (ok) shortcuts.set(key, callback);return ok; };
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, options) => { if (String(url).startsWith(base + '/') || origin && String(url).startsWith(origin + '/')) return nativeFetch(url, options);network.push(String(url));throw new Error('Unexpected networking'); };
const answer = '这是双端同步答案。\n\n' + Array.from({ length: 65 }, (_, i) => `${i + 1}. 解释实现步骤，保留清晰的回答。`).join('\n\n');
const server = http.createServer(async (req, res) => {
  let raw = '';for await (const bytes of req) raw += bytes;
  const body = JSON.parse(raw || '{}');assert.equal(req.url, '/v1/chat/completions');assert.ok(body.messages.at(-1).content.some(part => part.type === 'image_url'));modelCalls++;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const delta = content => res.write('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n');
  delta('这是双端同步答案。');setTimeout(() => { delta(answer.slice('这是双端同步答案。'.length));generationFinished = true;res.end('data: [DONE]\n\n'); }, 1500);
});
async function waitFor(fn, label, timeout = 16000) { const end = Date.now() + timeout;while (Date.now() < end) { try { const value = await fn();if (value) return value; } catch {}await new Promise(resolve => setTimeout(resolve, 70)); }throw new Error('Timed out: ' + label); }
function finish(code, detail) { if (finished) return;finished = true;fs.writeFileSync(path.join(root, 'artifacts/lan-smoke-report.json'), JSON.stringify({ ok: !code, detail, captures, modelCalls, errors, unexpectedNetwork: network, mode: 'Real Electron; desktop and isolated 390px browser on selected private IPv4; no physical phone; model and screenshot mocked' }, null, 2));console.log((code ? 'LAN SMOKE FAIL: ' : 'LAN SMOKE PASS: ') + detail);server.close();app.exit(code); }
process.on('uncaughtException', error => finish(1, error.stack));process.on('unhandledRejection', error => finish(1, error.stack || String(error)));
app.on('web-contents-created', (_event, contents) => { contents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); }); });
app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));base = `http://127.0.0.1:${server.address().port}`;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => { if (/^https?:/.test(details.url) && (!origin || !details.url.startsWith(origin + '/'))) { network.push(details.url);callback({ cancel: true }); }else callback({}); });
  const main = await waitFor(() => BrowserWindow.getAllWindows().find(win => !win.isDestroyed()), 'desktop');
  const desktop = source => main.webContents.executeJavaScript(source);
  await waitFor(() => desktop('!!document.querySelector("[data-local-app]")'), 'desktop ready');
  assert.equal((await desktop('window.api.lan.status()')).enabled, false);
  await desktop('document.querySelector("[data-page=settings]").click()');
  await waitFor(() => desktop('!!document.querySelector("[data-lan-toggle]")'), 'LAN settings');
  for (const index of [1, 2]) {
    for (const [field, value] of [['base', base + '/v1'], ['model', 'mock-vision']]) await desktop(`(()=>{const el=document.querySelector('.model-card:nth-child(${index}) [data-model-field=${field}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await desktop(`document.querySelector('.model-card:nth-child(${index}) button.primary').click()`);await waitFor(() => desktop(`!!document.querySelector('.model-card:nth-child(${index}) .status.ready')`), 'model saved');
  }
  const png = (await main.webContents.capturePage()).toDataURL();ipcMain.removeHandler('screenshot:capture');ipcMain.handle('screenshot:capture', () => { captures++;return { url: png, count: 1 }; });
  const status = await desktop('window.api.lan.status()');assert.ok(status.addresses.length, 'Private LAN adapter required for integration test');
  const started = await desktop(`window.api.lan.start(${JSON.stringify(status.addresses.find(item => !/vmware|virtual|wsl/i.test(item.name))?.address || status.addresses[0].address)})`);origin = started.url;
  await assert.rejects(desktop(`window.api.lan.start(${JSON.stringify(started.address)})`), /已开启/);assert.equal((await desktop('window.api.lan.status()')).enabled, true);
  await waitFor(() => desktop('!!document.querySelector(".lan-qr img")?.naturalWidth'), 'QR loaded');
  const phoneSession = session.fromPartition('zhiyue-lan-smoke');phoneSession.setProxy({ mode: 'direct' });
  phoneSession.webRequest.onBeforeRequest((details, callback) => { if (/^https?:/.test(details.url) && !details.url.startsWith(origin + '/')) { network.push(details.url);callback({ cancel: true }); }else callback({}); });
  phone = new BrowserWindow({ width: 390, height: 840, show: false, webPreferences: { session: phoneSession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await phone.loadURL(origin + '/#code=' + started.code);const mobile = source => phone.webContents.executeJavaScript(source);
  await waitFor(() => mobile('!!document.querySelector("[data-pair-submit]")'), 'phone pairing page');assert.equal(await mobile('typeof window.api'), 'undefined');assert.equal(await mobile('location.hash'), '');
  await mobile('document.querySelector("[data-pair-submit]").click()');await waitFor(() => desktop('!!document.querySelector("[data-lan-approve]")'), 'desktop approval request');
  assert.equal(await mobile('!!document.querySelector("[data-mobile-thread]")'), false);
  await desktop('document.querySelector("[data-lan-approve]").click()');await waitFor(() => mobile('document.querySelector("[data-connected]")?.dataset.connected==="true"'), 'paired stream');
  await mobile('document.querySelector("[data-command=capture]").click()');
  await waitFor(() => desktop('document.querySelector("[data-local-app]")?.dataset.writtenActive==="true"'), 'remote capture enters written mode');
  await waitFor(() => mobile('document.querySelector("[data-mobile-thread]")?.innerText.includes("这是双端同步答案")'), 'partial answer on phone');
  assert.equal(generationFinished, false, 'Partial answer must arrive before model completes');
  await waitFor(() => mobile('document.querySelectorAll(".assistant li").length===65 && document.querySelector("[data-generation-state]")?.innerText.includes("保持同步")'), 'complete phone answer');
  const desktopAnswer = await desktop('document.querySelector(".message.assistant .markdown").innerText');const mobileAnswer = await mobile('document.querySelector(".message.assistant .markdown").innerText');assert.equal(mobileAnswer, desktopAnswer);
  assert.equal(captures, 1);assert.equal(modelCalls, 1);
  await mobile('document.querySelector("[data-mobile-thread]").scrollTop=0');const desktopBefore = await desktop('document.querySelector(".chat-thread").scrollTop');
  assert.ok(shortcuts.has('Control+Down'));shortcuts.get('Control+Down')();await waitFor(() => mobile('document.querySelector("[data-mobile-thread]").scrollTop>0'), 'computer hotkey scrolls phone');assert.equal(await desktop('document.querySelector(".chat-thread").scrollTop'), desktopBefore);
  await desktop('document.querySelector(".chat-thread").scrollTop=0');await mobile('document.querySelector("[data-command=desktop-scroll-down]").click()');await waitFor(() => desktop('document.querySelector(".chat-thread").scrollTop>0'), 'phone scrolls desktop');
  phone.showInactive();await mobile('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(root, 'artifacts/lan-mobile.png'), (await phone.webContents.capturePage()).toPNG());
  await mobile('document.querySelector("[data-command=desktop-hide]").click()');await waitFor(() => !main.isVisible(), 'phone hides desktop');
  await waitFor(() => mobile('!document.querySelector("[data-command=desktop-show]").disabled'), 'command complete');await mobile('document.querySelector("[data-command=desktop-show]").click()');await waitFor(() => main.isVisible(), 'phone shows desktop');
  const token = await mobile('sessionStorage.getItem("zhiyue-lan-session")');
  await phone.reload();await waitFor(() => mobile('document.querySelectorAll(".assistant li").length===65'), 'reload restores latest answer');
  powerMonitor.emit('lock-screen');await waitFor(() => mobile('document.querySelector("[data-mobile-thread]")?.innerText.includes("电脑已锁定")'), 'lock clears phone answer');
  assert.equal(await mobile('document.querySelector("[data-command=capture]").disabled'), true);
  powerMonitor.emit('unlock-screen');await waitFor(() => mobile('document.querySelectorAll(".assistant li").length===65'), 'unlock restores sync');
  await mobile('document.querySelector("[data-command=exit-mode]").click()');await waitFor(() => desktop('!!document.querySelector("[data-lan-settings]")'), 'phone exits written mode');
  const paired = await desktop('window.api.lan.status()');await desktop(`window.api.lan.revoke(${JSON.stringify(paired.devices[0].id)})`);
  await waitFor(() => mobile('!!document.querySelector("[data-pair-submit]")'), 'revoke returns phone to pairing');assert.equal(await mobile('sessionStorage.getItem("zhiyue-lan-session")'), null);
  const stale = await nativeFetch(origin + '/api/command', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'capture' }) });assert.equal(stale.status, 401);
  await desktop('window.api.lan.stop()');assert.equal((await desktop('window.api.lan.status()')).devices.length, 0);
  assert.deepEqual(network, []);assert.deepEqual(errors, []);
  finish(0, 'Desktop-approved QR pairing, remote protected screenshot, partial/final answer equality, bidirectional scrolling, show/hide, reload reconnect, lock/unlock and revocation verified.');
}).catch(error => finish(1, error.stack));
setTimeout(() => finish(1, 'global timeout'), 70000).unref();require('../out/main/index.js');
