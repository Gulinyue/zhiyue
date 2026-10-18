// Explicit preview/confirmation, bounded batches, no blind retries after submission.
import { randomUUID, createHash } from 'node:crypto';
import { matchJob, normalizeJobPreferences } from '../../shared/career.mjs';
import { recruitmentSite, recruitmentUrl, recruitmentJobKey, siteDomConfig } from '../../shared/recruitment-sites.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = job => [job.id, job.platform, job.url, job.title, job.company, job.location, job.salary, job.experience, job.jobType, job.description];
export class RecruitmentCampaign {
  constructor({ store, browser, emit = () => {}, isBlocked = () => false, now = Date.now, wait } = {}) {
    Object.assign(this, { store, browser, emit, isBlocked, now });this.previewLease = null;this.controller = null;this.state = { active: false, phase: 'idle', message: '', completed: 0, total: 0, currentJobId: '', results: [] };
    this.wait = wait || ((ms, signal) => new Promise((resolve, reject) => { const timer = setTimeout(done, ms);function done() { signal.removeEventListener('abort', abort);resolve(); }function abort() { clearTimeout(timer);reject(new Error('任务已停止。')); }signal.addEventListener('abort', abort, { once: true });if (signal.aborted) abort(); }));
  }
  status() { return { ...this.state, results: [...this.state.results] }; }
  notify(patch) { this.state = { ...this.state, ...patch };this.emit(this.status()); }
  stop(reason = '用户已停止本次批量任务。') { this.controller?.abort();this.previewLease = null;if (this.state.active) this.notify({ phase: 'stopping', message: reason }); }
  guard(signal) { if (signal.aborted) throw new Error('任务已停止。');if (this.isBlocked()) throw new Error('电脑已锁定、休眠或处于笔试/面试模式，自动投递已暂停。'); }
  async page(platform, action, expected = {}) {
    recruitmentUrl(this.browser.url(platform), platform);
    const result = await this.browser.probe(platform, siteDomConfig(platform), action, expected, this.controller?.signal);
    if (!result || typeof result !== 'object') throw new Error('招聘页面未返回有效状态。');return result;
  }
  async preview(ids) {
    if (this.state.active) throw new Error('请先停止当前投递任务。');
    if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw new Error('请选择 1–100 个待投职位。');
    const state = await this.store.read(), prefs = normalizeJobPreferences(state.preferences);
    if (!prefs.defaultResumeConfirmed) throw new Error('请先在求职偏好中确认：已登录所选网站，并核对网站默认简历。');
    const jobs = [...new Set(ids)].map(id => state.jobs.find(job => job.id === id)).filter(Boolean), eligible = [], excluded = [];
    for (const job of jobs) {
      const match = matchJob(job, prefs), reasons = [...match.reasons, ...match.unknown];
      try { recruitmentUrl(job.url, job.platform, { detail: true }); } catch (error) { reasons.push(error.message); }
      if (!['saved', 'ready'].includes(job.status)) reasons.push('该职位当前状态不允许自动提交');
      if (job.attempts || job.submittedAt) reasons.push('已有提交或尝试记录，请先人工核对，避免重复投递');
      if (recruitmentSite(job.platform)?.greeting && !prefs.allowGreeting) reasons.push('尚未允许此平台发起站内沟通');
      if (reasons.length) excluded.push({ id: job.id, title: job.title, reasons });else eligible.push(job);
    }
    const today = new Date(this.now()).toLocaleDateString('en-CA');
    const daily = state.jobs.filter(job => (job.attemptedAt || job.submittedAt) && new Date(job.attemptedAt || job.submittedAt).toLocaleDateString('en-CA') === today).length;
    const capacity = Math.max(0, Math.min(prefs.batchLimit, 100 - daily));
    const selected = eligible.slice(0, capacity);for (const job of eligible.slice(capacity)) excluded.push({ id: job.id, title: job.title, reasons: ['超过本批或当天限额，留待下批处理'] });
    if (!selected.length) { this.previewLease = null;return { token: '', jobs: [], excluded, daily, limit: prefs.batchLimit }; }
    this.previewLease = { token: randomUUID(), expiresAt: this.now() + 300000, prefsHash: digest(prefs), jobsHash: digest(selected.map(identity)), ids: selected.map(job => job.id) };
    return { token: this.previewLease.token, expiresAt: this.previewLease.expiresAt, jobs: selected.map(job => ({ id: job.id, platform: job.platform, title: job.title, company: job.company, location: job.location, salary: job.salary })), excluded, daily, limit: prefs.batchLimit };
  }
  async start(token) {
    if (this.state.active) throw new Error('已有自动投递任务在运行。');
    const lease = this.previewLease;this.previewLease = null;
    if (!lease || token !== lease.token || lease.expiresAt <= this.now()) throw new Error('本批确认已失效，请重新预览。');
    const state = await this.store.read(), prefs = normalizeJobPreferences(state.preferences), jobs = lease.ids.map(id => state.jobs.find(job => job.id === id));
    if (jobs.some(job => !job) || digest(prefs) !== lease.prefsHash || digest(jobs.map(identity)) !== lease.jobsHash || jobs.some(job => !['saved', 'ready'].includes(job.status) || job.attempts || job.submittedAt)) throw new Error('求职条件或职位已变化，请重新预览确认。');
    const controller = new AbortController();this.guard(controller.signal);this.controller = controller;
    this.notify({ active: true, phase: 'starting', message: '正在按已确认队列处理。Esc、关闭招聘浏览器或“停止任务”可暂停。', completed: 0, total: jobs.length, currentJobId: '', results: [] });
    this.task = this.run(jobs, prefs, controller).catch(async error => {
      const id = this.state.currentJobId, current = (await this.store.read()).jobs.find(job => job.id === id);
      if (current && ['saved', 'ready', 'applying'].includes(current.status)) await this.store.saveJob({ id, status: 'attention', lastResult: error.message || '任务中断，请核对官网。' }, { trusted: true }).catch(() => {});
      this.notify({ phase: 'paused', message: error.message });
    }).finally(() => { this.controller = null;this.notify({ active: false, currentJobId: '', phase: this.state.phase === 'completed' ? 'completed' : 'paused' }); });
    return this.status();
  }
  async run(jobs, prefs, controller) {
    const signal = controller.signal;
    for (const job of jobs) {
      this.guard(signal);
      const current = await this.store.read(), latest = current.jobs.find(value => value.id === job.id);
      if (!latest || digest(identity(latest)) !== digest(identity(job)) || digest(current.preferences) !== digest(prefs)) throw new Error('职位或偏好在任务运行中发生变化，已暂停。');
      this.notify({ phase: 'opening', currentJobId: job.id, message: `核对：${job.company} · ${job.title}` });
      await this.browser.navigate(job.platform, recruitmentUrl(job.url, job.platform, { detail: true }), signal);this.guard(signal);
      await this.wait(1200, signal);this.guard(signal);
      if (recruitmentJobKey(this.browser.url(job.platform), job.platform) !== recruitmentJobKey(job.url, job.platform)) throw new Error('网页已离开确认的职位，自动投递已暂停。');
      const inspect = await this.page(job.platform, 'inspect', { title: job.title, company: job.company });
      if (inspect.blocked || inspect.needsLogin) throw new Error(inspect.reason || '网站需要登录，已暂停。');
      if (inspect.outcome) { await this.record(job, inspect.outcome, inspect.evidence, false);continue; }
      if (!inspect.identityMatches) throw new Error('官网职位信息与本批队列不一致，已暂停。');
      this.guard(signal);
      const finalState = await this.store.read(), finalJob = finalState.jobs.find(value => value.id === job.id);
      if (!finalJob || digest(identity(finalJob)) !== digest(identity(job)) || digest(finalState.preferences) !== digest(prefs)) throw new Error('提交前检测到条件变化，请重新确认本批队列。');
      if (inspect.description) { const detailed = matchJob({ ...job, description: inspect.description }, prefs);if (!detailed.eligible) throw new Error('职位详情不符合筛选条件：' + [...detailed.reasons, ...detailed.unknown].join('；')); }
      await this.store.saveJob({ id: job.id, status: 'applying', attempts: job.attempts + 1, attemptedAt: this.now(), lastResult: '准备点击官网提交入口，尚未确认成功' }, { trusted: true });
      let attempted = true;
      try {
        this.guard(signal);this.notify({ phase: 'submitting', message: `提交：${job.company} · ${job.title}` });
        const click = await this.page(job.platform, 'apply', { title: job.title, company: job.company, url: job.url, allowGreeting: prefs.allowGreeting });this.guard(signal);
        if (click.blocked || !click.clicked && !click.outcome) throw new Error(click.reason || '未点击到确定的提交入口，请人工核对。');
        let outcome = click, confirmed = false;
        for (let attempt = 0; !outcome.outcome && attempt < 16; attempt++) {
          await this.wait(500, signal);this.guard(signal);
          outcome = await this.page(job.platform, 'outcome', { greeting: click.kind === 'greeting', confirm: !confirmed });
          if (outcome.kind === 'confirmation') confirmed = true;
          if (outcome.blocked) throw new Error(outcome.reason);
        }
        if (!['applied', 'contacted'].includes(outcome.outcome)) throw new Error('未收到明确的官网成功回执。请检查网站，不会自动重试此职位。');
        await this.record(job, outcome.outcome, outcome.evidence, true);attempted = false;
      } catch (error) {
        if (attempted) await this.store.saveJob({ id: job.id, status: 'attention', lastResult: error.message || '提交结果不明，请人工核对。' }, { trusted: true });
        throw error;
      }
      if (job !== jobs.at(-1)) { this.notify({ phase: 'waiting', message: `等待 ${prefs.intervalSeconds} 秒，再处理下一职位。` });await this.wait(prefs.intervalSeconds * 1000, signal); }
    }
    this.notify({ phase: 'completed', message: '本批已处理完毕。状态以记录中的官网回执为准。' });
  }
  async record(job, status, evidence, attempted) {
    const result = { id: job.id, status, evidence: String(evidence || '').slice(0, 500) };
    await this.store.saveJob({ id: job.id, status, lastResult: result.evidence, submittedAt: this.now(), ...(attempted ? { attempts: job.attempts + 1 } : {}) }, { trusted: true });
    this.notify({ completed: this.state.completed + 1, results: [...this.state.results, result], message: result.evidence });
  }
}
