// 知跃 · Developed by gulinyue. Local candidate data, never app settings.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeCareer, normalizeResume, normalizeJobPreferences, normalizeJob } from '../../shared/career.mjs';
import { recruitmentJobKey } from '../../shared/recruitment-sites.mjs';
export class CareerStore {
  constructor(file) { this.file = file;this.pending = Promise.resolve(); }
  async read() { await this.pending.catch(() => {});return this.readFile(); }
  async readFile() { try { const stat = await fs.stat(this.file);if (stat.size > 32 * 1024 * 1024) throw new Error('求职资料文件过大。');return normalizeCareer(JSON.parse(await fs.readFile(this.file, 'utf8'))); } catch (error) { if (error.code === 'ENOENT') return normalizeCareer();throw new Error('求职资料读取失败，请检查本机数据文件。'); } }
  update(operation) {
    const run = this.pending.catch(() => {}).then(async () => {
      const state = await this.readFile(), next = normalizeCareer(await operation(state));const bytes = JSON.stringify(next);
      if (Buffer.byteLength(bytes) > 32 * 1024 * 1024) throw new Error('求职资料已满，请清理旧投递记录。');
      await fs.mkdir(path.dirname(this.file), { recursive: true });const temporary = this.file + '.' + randomUUID() + '.tmp';
      try { await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });await fs.rename(temporary, this.file); } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      return next;
    });this.pending = run;return run;
  }
  saveResume(raw) { return this.update(state => ({ ...state, resume: { ...normalizeResume(raw), updatedAt: Date.now() }, preferences: { ...state.preferences, defaultResumeConfirmed: false } })); }
  savePreferences(raw) { return this.update(state => ({ ...state, preferences: normalizeJobPreferences(raw) })); }
  recoverInterrupted() { return this.update(state => ({ ...state, jobs: state.jobs.map(job => job.status === 'applying' ? { ...job, status: 'attention', lastResult: '上次任务中断，提交结果未确认。请先在官网核对，不会自动重试。' } : job) })); }
  saveJob(raw, { trusted = false } = {}) { return this.update(state => {
    const old = state.jobs.find(job => job.id === raw?.id);if (raw?.id && !old) throw new Error('职位不存在，请刷新队列。');
    const job = normalizeJob({ ...old, ...raw, ...(!trusted ? { attempts: old?.attempts || 0, attemptedAt: old?.attemptedAt || 0, submittedAt: old?.submittedAt || 0, lastResult: old?.lastResult || '' } : {}), id: old?.id || randomUUID(), createdAt: old?.createdAt || Date.now(), updatedAt: Date.now() });
    if (!trusted && ['applying', 'applied', 'contacted'].includes(job.status) && old?.status !== job.status) { job.lastResult = '用户手动记录';if (job.status !== 'applying') job.submittedAt = Date.now();else throw new Error('提交中状态由投递任务维护。'); }
    if (!old && state.jobs.length >= 1000) throw new Error('最多保存 1000 个职位，请先清理。');
    if (state.jobs.some(value => value.id !== job.id && recruitmentJobKey(value.url, value.platform) === recruitmentJobKey(job.url, job.platform))) throw new Error('这个职位已经在队列中。');
    return { ...state, jobs: old ? state.jobs.map(value => value.id === old.id ? job : value) : [job, ...state.jobs] };
  }); }
  removeJob(id) { return this.update(state => ({ ...state, jobs: state.jobs.filter(job => job.id !== id) })); }
  importJobs(jobs) { return this.update(state => { for (const raw of jobs) { if (state.jobs.some(value => recruitmentJobKey(value.url, value.platform) === recruitmentJobKey(raw.url, raw.platform))) continue;if (state.jobs.length >= 1000) throw new Error('导入后超过 1000 个职位，请分批清理后再导入。');state.jobs.unshift(normalizeJob({ ...raw, id: randomUUID(), createdAt: Date.now(), updatedAt: Date.now(), status: 'saved' })); }return state; }); }
}
