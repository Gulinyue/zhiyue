// 知跃 · Developed by gulinyue.
import { networkInterfaces } from 'node:os';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { LanBridge } from './bridge.mjs';
import { isPrivateIpv4 } from '../../shared/lan-protocol.mjs';
export function lanAddresses() {
  return Object.entries(networkInterfaces()).flatMap(([name, entries]) => entries.filter(value => value.family === 'IPv4' && !value.internal && isPrivateIpv4(value.address)).map(value => ({ name, address: value.address }))).filter((item, index, all) => all.findIndex(other => other.address === item.address) === index);
}
export async function loadMobileAssets(root) {
  const assets = new Map([['/', { type: 'text/html; charset=utf-8', bytes: await readFile(path.join(root, 'index.html')) }]]);
  const mime = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
  for (const entry of await readdir(path.join(root, 'assets'), { withFileTypes: true })) if (entry.isFile() && /^[\w-]+\.(?:js|css|svg|ttf|woff2?)$/.test(entry.name)) assets.set('/assets/' + entry.name, { type: mime[path.extname(entry.name)], bytes: await readFile(path.join(root, 'assets', entry.name)) });
  return assets;
}
export function createLanRuntime({ mobileRoot, onChange, onCommand, isBlocked }) {
  const bridge = new LanBridge({ onCommand, onChange: () => onChange(status()) });
  let qr = '', busy = false, generation = 0;
  const status = () => ({ ...bridge.status(), addresses: lanAddresses(), qr });
  return {
    bridge, status,
    async start(address) {
      if (busy) throw new Error('互通服务正在切换，请稍候。');
      if (bridge.origin) throw new Error('互通服务已开启，请先关闭后切换网卡。');
      if (!lanAddresses().some(value => value.address === address)) throw new Error('此局域网地址已不可用，请重新选择。');
      busy = true;const epoch = ++generation;
      const current = () => { if (epoch !== generation) throw new Error('互通服务已关闭，请重新开启。'); };
      try { bridge.assets = await loadMobileAssets(mobileRoot);current();bridge.blocked = isBlocked();await bridge.start(address);current();qr = await QRCode.toDataURL(`${bridge.origin}/#code=${bridge.code}`, { width: 240, margin: 2, errorCorrectionLevel: 'M' });current();onChange(status());return status(); }
      catch (error) { await bridge.stop();throw error; } finally { busy = false; }
    },
    async stop() { if (busy) throw new Error('互通服务正在切换，请稍候。');busy = true;try { generation++;qr = '';await bridge.stop();return status(); } finally { busy = false; } },
    async dispose() { generation++;qr = '';await bridge.stop(); },
    async rotate() { if (busy) throw new Error('互通服务正在切换，请稍候。');busy = true;const epoch = generation;try { bridge.rotateCode();const nextQr = await QRCode.toDataURL(`${bridge.origin}/#code=${bridge.code}`, { width: 240, margin: 2, errorCorrectionLevel: 'M' });if (epoch !== generation) throw new Error('互通服务已关闭。');qr = nextQr;onChange(status());return status(); } finally { busy = false; } },
    approve(id, allow) { bridge.approve(id, allow);return status(); },
    revoke(id) { bridge.revoke(id);return status(); },
  };
}
