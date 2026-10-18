import { recruitmentSite, recruitmentUrl } from '../../shared/recruitment-sites.mjs';
import { recruitmentPageProbe } from './page-probe.mjs';
const recruitmentContents = new WeakSet();
export const isRecruitmentWebContents = contents => recruitmentContents.has(contents);
export class RecruitmentBrowser {
  constructor({ electron, onStop, onChange = () => {} }) { Object.assign(this, { electron, onStop, onChange });this.windows = new Map(); }
  states() { return [...this.windows].filter(([, win]) => !win.isDestroyed()).map(([platform, win]) => ({ platform, open: true, url: this.url(platform), title: win.getTitle().slice(0, 120) })); }
  url(platform) { const win = this.windows.get(platform);if (!win || win.isDestroyed()) throw new Error('请先打开并登录对应招聘网站。');return win.webContents.getURL(); }
  window(platform) {
    const site = recruitmentSite(platform);if (!site) throw new Error('不支持此招聘平台。');
    let win = this.windows.get(platform);if (win && !win.isDestroyed()) return win;
    const { BrowserWindow, session, Menu } = this.electron;
    const browserSession = session.fromPartition('persist:zhiyue-recruitment-' + platform);
    browserSession.setUserAgent(browserSession.getUserAgent().replace(/[^\x20-\x7E]/g, ''));
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    if (!browserSession.__zhiyueNoDownloads) { browserSession.on('will-download', event => event.preventDefault());browserSession.__zhiyueNoDownloads = true; }
    win = new BrowserWindow({ width: 1180, height: 820, minWidth: 800, minHeight: 600, title: `知跃求职 · ${site.name}`, show: false, webPreferences: { session: browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, backgroundThrottling: false } });
    recruitmentContents.add(win.webContents);
    this.windows.set(platform, win);
    win.setMenu(Menu.buildFromTemplate([{ label: '知跃求职', submenu: [{ label: '停止自动投递（也可按 Esc）', click: () => this.onStop('用户在招聘浏览器停止了任务。') }, { label: '返回平台首页', click: () => { this.onStop('用户切回平台首页。');void this.navigate(platform, site.home).catch(() => {}); } }, { label: '关闭此窗口', click: () => win.close() }] }]));
    const allowed = url => { try { recruitmentUrl(url, platform);return true; } catch { return false; } };
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.on('will-navigate', (event, url) => { if (!allowed(url)) { event.preventDefault();this.onStop('网站准备跳转到其他域名，已暂停。请手动核对登录流程。'); } });
    win.webContents.on('will-redirect', (event, url) => { if (!allowed(url)) { event.preventDefault();this.onStop('网站跳转到其他域名，自动流程已暂停。'); } });
    win.webContents.setWindowOpenHandler(({ url }) => { if (allowed(url)) void this.navigate(platform, url).catch(() => {});else this.onStop('网站请求打开其他域名，已暂停自动流程。');return { action: 'deny' }; });
    win.webContents.on('before-input-event', (_event, input) => { if (input.type === 'keyDown' && input.key === 'Escape') this.onStop('用户按 Esc 停止了自动投递。'); });
    win.on('closed', () => { if (this.windows.get(platform) === win) this.windows.delete(platform);this.onStop('招聘浏览器已关闭，任务已停止。');this.onChange(); });
    win.webContents.on('did-navigate', () => this.onChange());win.webContents.on('did-navigate-in-page', () => this.onChange());
    return win;
  }
  async navigate(platform, rawUrl, signal) {
    const url = recruitmentUrl(rawUrl, platform), win = this.window(platform);
    if (signal?.aborted) throw new Error('任务已停止。');
    win.setAlwaysOnTop(true, 'screen-saver');win.show();win.focus();win.moveTop();
    if (win.webContents.getURL() === url && !win.webContents.isLoading()) return;
    const abort = () => { if (!win.isDestroyed()) win.webContents.stop(); };
    signal?.addEventListener('abort', abort, { once: true });
    let timer;
    try { await Promise.race([win.loadURL(url), new Promise((_, reject) => { timer = setTimeout(() => { abort();reject(new Error('招聘网页加载超时，请在浏览器手动检查。')); }, 20000); })]); }
    catch { throw new Error('招聘网页未能加载完成，请检查网络、登录或网站限制。'); }
    finally { clearTimeout(timer);signal?.removeEventListener('abort', abort); }
    if (signal?.aborted) throw new Error('任务已停止。');recruitmentUrl(win.webContents.getURL(), platform);
  }
  async probe(platform, config, action, expected, signal) {
    const win = this.windows.get(platform);if (!win || win.isDestroyed()) throw new Error('招聘浏览器已关闭。');
    recruitmentUrl(win.webContents.getURL(), platform);
    if (signal?.aborted) throw new Error('任务已停止。');
    const input = { ...expected, expiresAt: Date.now() + 10000 };
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result) => { if (settled) return;settled = true;clearTimeout(timer);signal?.removeEventListener('abort', abort);if (error) reject(error);else resolve(result); };
      // Destroy an unresponsive page so a queued click cannot execute after stop.
      const cancel = message => { if (settled) return;finish(new Error(message));if (!win.isDestroyed()) win.destroy(); };
      const abort = () => cancel('任务已停止；当前网页操作结果请在官网核对。');
      const timer = setTimeout(() => cancel('招聘网页响应超时，已关闭此窗口以终止未完成操作。请核对官网记录。'), 12000);
      signal?.addEventListener('abort', abort, { once: true });
      win.webContents.executeJavaScript(`(${recruitmentPageProbe.toString()})(${JSON.stringify(config)},${JSON.stringify(action)},${JSON.stringify(input)})`).then(value => finish(null, value), () => finish(new Error('招聘网页已关闭或无法读取，请手动核对。')));
    });
  }
  dispose() { this.onStop('知跃已关闭求职浏览器。');for (const win of this.windows.values()) if (!win.isDestroyed()) win.destroy();this.windows.clear(); }
}
