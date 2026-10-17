// 知跃 / Zhiyue · Developer: gulinyue.
// Deterministically rasterize our vector identity into desktop PNG / ICO assets.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
app.setName('Zhiyue Brand Renderer');
const data = path.join(root, '.runtime', 'brand-render');
fs.mkdirSync(data, { recursive: true }); app.setPath('userData', data);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const source = fs.readFileSync(path.join(root, 'resources', 'logo.svg'), 'utf8');
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, backgroundColor: '#00000000', useContentSize: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><head><style>html,body{margin:0;width:512px;height:512px;background:transparent;overflow:hidden}svg{display:block;width:512px;height:512px}</style></head><body>${source}</body></html>`));
  const image = (await win.webContents.capturePage()).resize({ width: 512, height: 512, quality: 'best' });
  fs.writeFileSync(path.join(root, 'resources', 'icon.png'), image.toPNG());
  const sizes = [256, 128, 64, 48, 32, 16];
  const frames = sizes.map((size) => image.resize({ width: size, height: size, quality: 'best' }).toPNG());
  const directory = Buffer.alloc(6 + 16 * frames.length); directory.writeUInt16LE(1, 2); directory.writeUInt16LE(frames.length, 4);
  let offset = directory.length;
  frames.forEach((frame, i) => {
    const at = 6 + 16 * i; directory[at] = sizes[i] === 256 ? 0 : sizes[i]; directory[at + 1] = directory[at];
    directory.writeUInt16LE(1, at + 4); directory.writeUInt16LE(32, at + 6); directory.writeUInt32LE(frame.length, at + 8); directory.writeUInt32LE(offset, at + 12); offset += frame.length;
  });
  fs.writeFileSync(path.join(root, 'resources', 'icon.ico'), Buffer.concat([directory, ...frames]));
  if (nativeImage.createFromPath(path.join(root, 'resources', 'icon.ico')).isEmpty()) throw new Error('Generated ICO cannot be loaded');
  console.log('Zhiyue SVG → 512px PNG and six-resolution ICO rendered.'); app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('Logo rendering timed out'); app.exit(1); }, 20000).unref();
