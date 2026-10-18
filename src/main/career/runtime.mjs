import path from 'node:path';
import fs from 'node:fs/promises';
import { CareerStore } from './store.mjs';
import { extractResumeFile } from './import.mjs';
import { RecruitmentBrowser } from './browser.mjs';
import { RecruitmentCampaign } from './campaign.mjs';
import { jobSearchUrl, recruitmentSite, recruitmentUrl, siteDomConfig } from '../../shared/recruitment-sites.mjs';
import { resumeText } from '../../shared/career.mjs';
import { jobCsv } from '../../shared/career-csv.mjs';
const escape = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function registerCareerIpc(ipc, { electron, owner, isBlocked, workerPath }) {
  const store = new CareerStore(path.join(electron.app.getPath('userData'), 'career-workspace.json'));
  const recovered = store.recoverInterrupted();
  void recovered.catch(() => {}); // The load handler surfaces recovery/read errors.
  const send = (channel, value) => { const win = owner();if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, value); };
  const changed = async operation => { const state = await operation;send('career:changed', state);return state; };
  const browser = new RecruitmentBrowser({ electron, onStop: reason => campaign.stop(reason), onChange: () => send('career:browsers', browser.states()) });
  const campaign = new RecruitmentCampaign({ store, browser, isBlocked, emit: status => { send('career:campaignChanged', status);void store.read().then(state => send('career:changed', state)).catch(() => {}); } });
  let importing = false;
  const editable = () => { if (campaign.status().active) throw new Error('请先停止批量任务，再修改资料或队列。'); };
  ipc.handle('career:load', async () => { await recovered;return store.read(); });
  ipc.handle('career:saveResume', (_event, value) => { editable();return changed(store.saveResume(value)); });
  ipc.handle('career:clearResume', () => { editable();return changed(store.saveResume({ interviewEnabled: false })); });
  ipc.handle('career:savePreferences', (_event, value) => { editable();return changed(store.savePreferences(value)); });
  const validateJob = value => ({ ...value, url: recruitmentUrl(value?.url, value?.platform, { detail: true }) });
  ipc.handle('career:saveJob', (_event, value) => { editable();return changed(store.saveJob(validateJob(value))); });
  ipc.handle('career:deleteJob', (_event, id) => { editable();if (typeof id !== 'string') throw new Error('无效的职位。');return changed(store.removeJob(id)); });
  ipc.handle('career:importJobs', (_event, values) => { editable();if (!Array.isArray(values) || values.length > 200) throw new Error('一次最多导入 200 个职位。');return changed(store.importJobs(values.map(validateJob))); });
  ipc.handle('career:retryJob', async (_event, id) => { editable();const state = await store.read();if (typeof id !== 'string' || !state.jobs.some(job => job.id === id && job.status === 'attention')) throw new Error('仅可重试已经人工核实的待处理职位。');return changed(store.saveJob({ id, status: 'ready', attempts: 0, submittedAt: 0, lastResult: '用户核实官网未提交，明确允许重新尝试' }, { trusted: true })); });
  ipc.handle('career:importResume', async () => {
    editable();if (importing) throw new Error('正在解析简历，请稍候。');importing = true;
    try { const selected = await electron.dialog.showOpenDialog(owner(), { title: '导入个人简历（本地解析）', properties: ['openFile'], filters: [{ name: '简历文档', extensions: ['pdf', 'docx', 'txt', 'md'] }] });if (selected.canceled || !selected.filePaths[0]) return null;return await extractResumeFile(selected.filePaths[0], workerPath); }
    finally { importing = false; }
  });
  ipc.handle('career:copy', (_event, value) => { if (typeof value !== 'string' || value.length > 100000) throw new Error('复制内容过长。');electron.clipboard.writeText(value); });
  ipc.handle('career:exportQueue', async () => {
    const selected = await electron.dialog.showSaveDialog(owner(), { title: '导出本机投递记录', defaultPath: '知跃投递记录.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (selected.canceled || !selected.filePath) return { saved: false };
    const state = await store.read();await fs.writeFile(selected.filePath, jobCsv(state.jobs), 'utf8');return { saved: true };
  });
  ipc.handle('career:export', async (_event, options) => {
    const state = await store.read(), job = options?.jobId ? state.jobs.find(value => value.id === options.jobId) : null;
    if (options?.jobId && !job) throw new Error('职位不存在。');
    const body = job ? job.material : resumeText(state.resume);if (!body?.trim()) throw new Error('没有可以导出的简历或材料。');
    const pdf = options?.format === 'pdf', selected = await electron.dialog.showSaveDialog(owner(), { title: pdf ? '导出 PDF 简历 / 材料' : '导出简历 / 材料文本', defaultPath: pdf ? '我的简历.pdf' : '求职材料.txt', filters: [{ name: pdf ? 'PDF' : '文本', extensions: [pdf ? 'pdf' : 'txt'] }] });
    if (selected.canceled || !selected.filePath) return { saved: false };
    if (!pdf) await fs.writeFile(selected.filePath, body, { encoding: 'utf8' });
    else {
      const preview = new electron.BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
      try { await preview.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:12px/1.8 sans-serif;color:#243a2c;margin:0}h1{font-size:22px;margin:0 0 18px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}footer{margin-top:24px;color:#788272;font-size:9px}</style><h1>${escape(job ? job.title + ' · 求职草稿' : state.resume.title)}</h1><pre>${escape(body)}</pre><footer>知跃 · 用户导出的求职材料</footer>`));await fs.writeFile(selected.filePath, await preview.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.55, bottom: 0.55, left: 0.6, right: 0.6 } })); }
      finally { if (!preview.isDestroyed()) preview.destroy(); }
    }
    return { saved: true };
  });
  ipc.handle('career:browsers', () => browser.states());
  ipc.handle('career:openSite', async (_event, platform, keyword) => { if (campaign.status().active) throw new Error('请先停止本批任务。');const site = recruitmentSite(platform);if (!site) throw new Error('无效的平台。');await browser.navigate(platform, typeof keyword === 'string' && keyword.trim() ? jobSearchUrl(platform, keyword) : site.home);return browser.states(); });
  ipc.handle('career:openJob', async (_event, id) => { editable();const state = await store.read(), job = state.jobs.find(value => value.id === id);if (!job) throw new Error('职位不存在。');await browser.navigate(job.platform, recruitmentUrl(job.url, job.platform, { detail: true })); });
  ipc.handle('career:collect', async (_event, platform) => {
    editable();const result = await campaign.page(platform, 'collect');if (result.blocked) throw new Error(result.reason);
    const jobs = (result.jobs || []).map(value => { try { return validateJob(value); } catch { return null; } }).filter(Boolean);
    if (!jobs.length) return { state: await store.read(), count: 0, message: result.note || '未识别到可导入的职位。' };
    const before = await store.read();const state = await changed(store.importJobs(jobs));return { state, count: state.jobs.length - before.jobs.length, message: '已采集当前网页可见职位，尚未提交。请核对城市、薪资和默认简历。' };
  });
  ipc.handle('career:campaignStatus', () => campaign.status());
  ipc.handle('career:previewBatch', (_event, ids) => campaign.preview(ids));
  ipc.handle('career:startBatch', (_event, token) => { if (typeof token !== 'string') throw new Error('无效的本批确认。');return campaign.start(token); });
  ipc.handle('career:stopBatch', () => { campaign.stop();return campaign.status(); });
  return { store, campaign, dispose: () => browser.dispose(), stop: reason => campaign.stop(reason) };
}
