// Pixel-level Windows capture regression. Only our solid-color fixture is captured.
const { app, BrowserWindow, screen, desktopCapturer } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), koffi = require('koffi');
const root = path.resolve(__dirname, '..');fs.mkdirSync(path.join(root, '.runtime'), { recursive: true });fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
process.env.ZHIYUE_USER_DATA_DIR = fs.mkdtempSync(path.join(root, '.runtime', 'capture-exclusion-'));
const user = koffi.load('user32.dll'), gdi = koffi.load('gdi32.dll');
const affinity = user.func('int __stdcall SetWindowDisplayAffinity(intptr_t hwnd,uint32_t affinity)');
const readAffinity = user.func('int __stdcall GetWindowDisplayAffinity(intptr_t hwnd,_Out_ uint32_t *affinity)');
const getStyle = user.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd,int index)');
const getRect = user.func('int __stdcall GetWindowRect(intptr_t hwnd,void *rect)');
const getDC = user.func('intptr_t __stdcall GetDC(intptr_t hwnd)'), releaseDC = user.func('int __stdcall ReleaseDC(intptr_t hwnd,intptr_t dc)');
const createDC = gdi.func('intptr_t __stdcall CreateCompatibleDC(intptr_t dc)'), createBitmap = gdi.func('intptr_t __stdcall CreateCompatibleBitmap(intptr_t dc,int width,int height)');
const select = gdi.func('intptr_t __stdcall SelectObject(intptr_t dc,intptr_t object)'), blt = gdi.func('int __stdcall BitBlt(intptr_t dest,int x,int y,int w,int h,intptr_t src,int sx,int sy,uint32_t flags)');
const pixel = gdi.func('uint32_t __stdcall GetPixel(intptr_t dc,int x,int y)'), deleteDC = gdi.func('int __stdcall DeleteDC(intptr_t dc)'), deleteObject = gdi.func('int __stdcall DeleteObject(intptr_t object)');
const hwnd = win => win.getNativeWindowHandle().readBigUInt64LE();
const nativeRect = win => { const bytes = Buffer.alloc(16);assert.equal(getRect(hwnd(win), bytes), 1);return { x: bytes.readInt32LE(0), y: bytes.readInt32LE(4), width: bytes.readInt32LE(8) - bytes.readInt32LE(0), height: bytes.readInt32LE(12) - bytes.readInt32LE(4) }; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, label) { const end = Date.now() + 12000;while (Date.now() < end) { const value = await fn();if (value) return value;await wait(60); }throw new Error('Timed out: ' + label); }
function captureGdi(rect, flag) {
  const dc = getDC(0), mem = createDC(dc), bitmap = createBitmap(dc, rect.width, rect.height), old = select(mem, bitmap);
  try { assert.equal(blt(mem, 0, 0, rect.width, rect.height, dc, rect.x, rect.y, flag), 1);return [0.1, 0.5, 0.9].flatMap(x => [0.1, 0.5, 0.9].map(y => pixel(mem, Math.floor(rect.width * x), Math.floor(rect.height * y)))); }
  finally { select(mem, old);deleteObject(bitmap);deleteDC(mem);releaseDC(0, dc); }
}
let finished = false;const checks = [];
function finish(code, detail) { if (finished) return;finished = true;fs.writeFileSync(path.join(root, 'artifacts/capture-exclusion-report.json'), JSON.stringify({ ok: !code, detail, checks, source: 'Generated solid-color fixture only; GDI SRCCOPY/CAPTUREBLT and Electron desktop capture. Windows Snipping Tool UI not automated.' }, null, 2));console.log((code ? 'CAPTURE EXCLUSION FAIL: ' : 'CAPTURE EXCLUSION PASS: ') + detail);app.exit(code); }
process.on('uncaughtException', error => finish(1, error.stack));process.on('unhandledRejection', error => finish(1, error.stack));
app.whenReady().then(async () => {
  const main = await waitFor(() => BrowserWindow.getAllWindows().find(win => !win.isDestroyed()), 'main window'), evaluate = code => main.webContents.executeJavaScript(code);
  await waitFor(() => evaluate('!!document.querySelector("[data-local-app]")'), 'renderer');
  await evaluate('window.api.personalModels.save({slot:"screenshot",baseUrl:"http://127.0.0.1:52991/v1",model:"unused-fixture",apiKey:"fixture-unused-key"})');
  await new Promise(resolve => { main.webContents.once('did-finish-load', resolve);main.webContents.reload(); });
  await evaluate('window.api.window.show()');
  await waitFor(() => evaluate('!!document.querySelector("[data-page=exam]") && !document.querySelector(".onboarding")'), 'model state');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await wait(200);
  const display = screen.getPrimaryDisplay();
  const background = new BrowserWindow({ ...display.bounds, frame: false, show: false, alwaysOnTop: true, skipTaskbar: true, webPreferences: { sandbox: true } });
  background.setAlwaysOnTop(true, 'screen-saver');await background.loadURL('data:text/html,<body style="margin:0;background:rgb(59,124,187);height:100vh"></body>');background.showInactive();await wait(200);
  await evaluate('document.querySelector("[data-page=exam]").click()');await waitFor(async () => await evaluate('!!document.querySelector("[data-inline-shortcuts=exam]")') && main.isVisible(), 'protected task visible');main.moveTop();
  await waitFor(() => evaluate('!!document.querySelector("[data-inline-shortcuts=exam]")'), 'inline hints');
  assert.equal(BrowserWindow.getAllWindows().filter(win => win !== main && win !== background && !win.isDestroyed()).length, 0, 'No auxiliary transparent hint window');
  const mode = [null];assert.equal(readAffinity(hwnd(main), mode), 1);assert.equal(mode[0], 17);
  const bits = BigInt(getStyle(hwnd(main), -20));assert.ok(bits & 0x20n);assert.ok(bits & 0x08000000n);
  async function hintRect() {
    const rect = await evaluate('(()=>{const r=document.querySelector("[data-inline-shortcuts]").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,viewport:innerWidth}})()');
    const bounds = nativeRect(main), scale = bounds.width / rect.viewport;
    return { x: bounds.x + Math.round(rect.x * scale), y: bounds.y + Math.round(rect.y * scale), width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) };
  }
  async function verify(label) {
    await wait(200);const rect = await hintRect();
    for (const flags of [0x00cc0020, 0x40cc0020]) assert.deepEqual(captureGdi(rect, flags), Array(9).fill(0xbb7c3b), label + ': captured background must remain visible, without text or black mask');
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) } });
    const source = sources.find(value => value.display_id === String(display.id));assert.ok(source);
    const size = source.thumbnail.getSize(), bytes = source.thumbnail.toBitmap(), origin = screen.dipToScreenPoint({ x: display.bounds.x, y: display.bounds.y });
    for (const x of [0.1, 0.5, 0.9]) for (const y of [0.1, 0.5, 0.9]) { const px = rect.x - origin.x + Math.floor(rect.width * x), py = rect.y - origin.y + Math.floor(rect.height * y), offset = (py * size.width + px) * 4;assert.deepEqual([...bytes.subarray(offset, offset + 3)], [187, 124, 59], label + ': desktop capture must show the fixture behind hints'); }
    checks.push(label);
  }
  const visibleRect = await hintRect();
  try { main.setContentProtection(false);assert.equal(affinity(hwnd(main), 0), 1);assert.ok(captureGdi(visibleRect, 0x40cc0020).some(value => value !== 0xbb7c3b), 'Positive control proves the hint pixels really cover this fixture region');checks.push('visible hint positive control'); }
  finally { main.setContentProtection(true);assert.equal(affinity(hwnd(main), 17), 1); }
  await verify('initial protected hint pixels');
  const rect = await hintRect(), dip = screen.screenToDipPoint({ x: rect.x, y: rect.y });
  const control = new BrowserWindow({ x: dip.x, y: dip.y, width: 100, height: 80, frame: false, show: false, alwaysOnTop: true, webPreferences: { sandbox: true } });
  await control.loadURL('data:text/html,<body style="margin:0;background:black;height:100vh"></body>');control.showInactive();control.setAlwaysOnTop(true, 'screen-saver');control.moveTop();await control.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await wait(150);
  const controlRect = nativeRect(control);
  assert.deepEqual(captureGdi({ x: controlRect.x + 5, y: controlRect.y + 5, width: 50, height: 40 }, 0x40cc0020), Array(9).fill(0), 'Negative control detects an actual visible black rectangle');checks.push('black-rectangle negative control');control.destroy();
  await evaluate('window.api.window.hide()');assert.equal(main.isVisible(), false);await evaluate('window.api.window.show()');await waitFor(() => main.isVisible(), 'show');await verify('hide/show hint pixels');
  const bounds = main.getBounds();main.setBounds({ ...bounds, width: Math.max(700, bounds.width - 80) });await verify('resize hint pixels');
  await evaluate('window.api.settings.patch({writtenOptions:{showShortcutHints:false}})');await waitFor(() => evaluate('!document.querySelector("[data-inline-shortcuts]")'), 'hints hidden');
  await evaluate('window.api.settings.patch({writtenOptions:{showShortcutHints:true}})');await waitFor(() => evaluate('!!document.querySelector("[data-inline-shortcuts]")'), 'hints restored');await verify('hint toggle pixels');
  fs.writeFileSync(path.join(root, 'artifacts/inline-shortcuts.png'), (await main.webContents.capturePage()).toPNG());
  await evaluate('window.api.written.exit()');await waitFor(() => main.isVisible(), 'exit restored');background.destroy();finish(0, 'Hints share the task HWND, remain click-through, and leave background pixels intact across capture, hide/show, resize and toggling.');
}).catch(error => finish(1, error.stack));
setTimeout(() => finish(1, 'global timeout'), 40000).unref();require('../out/main/index.js');
