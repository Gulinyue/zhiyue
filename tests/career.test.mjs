import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeResume, resumeContext, redactResumeContacts, monthlySalary, matchJob, normalizeJobPreferences, buildJobMaterialRequest } from '../src/shared/career.mjs';
import { recruitmentUrl, jobSearchUrl, RECRUITMENT_SITES } from '../src/shared/recruitment-sites.mjs';
import { parseJobCsv, jobCsv } from '../src/shared/career-csv.mjs';
import { buildLocalRequest } from '../src/renderer/local/requests.mjs';
import { CareerStore } from '../src/main/career/store.mjs';
import { RecruitmentCampaign } from '../src/main/career/campaign.mjs';
import { RecruitmentBrowser } from '../src/main/career/browser.mjs';
const resume = { name: '示例候选人', headline: 'Java 后端开发', experience: '2023–2025 示例甲公司，负责订单服务。', projects: '主导 Redis 热点缓存改造，延迟由 200ms 降至 80ms。', rawText: '邮箱 demo@example.invalid，手机 18123456789，证件 110101199001011234。' };
const job = { platform: 'liepin', url: 'https://www.liepin.com/job/10001.shtml', title: 'Java后端开发', company: '示例甲公司', location: '北京市海淀区', salary: '15-25K·13薪', jobType: '全职', description: 'Redis 订单服务' };
const prefs = { roles: ['Java'], locations: ['北京'], salaryMin: 16000, salaryMax: 25000, defaultResumeConfirmed: true };
async function setup(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zhiyue-career-'));t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 }));
  const store = new CareerStore(path.join(directory, 'career.json'));await store.saveResume(resume);await store.savePreferences(prefs);const state = await store.saveJob({ ...job, ...options.job });
  const calls = [];
  const browser = { url: () => job.url, navigate: async () => calls.push('navigate'), probe: async (_platform, _config, action) => { calls.push(action);return action === 'inspect' ? { identityMatches: true, description: job.description } : action === 'apply' ? { clicked: true, kind: 'application' } : { outcome: 'applied', evidence: '投递成功' }; }, ...options.browser };
  const campaign = new RecruitmentCampaign({ store, browser, wait: async (_ms, signal) => { if (signal.aborted) throw new Error('任务已停止。'); }, ...options.campaign });
  return { store, campaign, calls, id: state.jobs[0].id };
}
test('resume facts are primary interview evidence, bounded and contact redacted; other modes opt out', () => {
  for (const mode of ['interview', 'practice']) {
    const request = buildLocalRequest({ question: '介绍一下你负责的项目', mode, resume });const system = request.messages[0].content;
    assert.match(system, /candidate_resume/);assert.match(system, /200ms 降至 80ms/);assert.match(system, /首要事实来源/);assert.match(system, /不得把职位要求/);assert.doesNotMatch(system, /18123456789|demo@example|110101199001011234/);
  }
  for (const mode of ['written', 'chat']) assert.doesNotMatch(buildLocalRequest({ question: '简历', mode, resume }).messages[0].content, /candidate_resume|示例甲公司/);
  assert.equal(resumeContext('项目', { ...resume, interviewEnabled: false }), '');
  assert.equal(resumeContext('自我介绍', null), '');
  assert.ok(resumeContext('你负责的项目', { rawText: '项目经历 Redis '.repeat(10000) }, 900).length <= 900);
  assert.equal(Object.hasOwn(normalizeResume({ ...resume, apiKey: 'discard' }), 'apiKey'), false);
  assert.doesNotMatch(redactResumeContacts('110101199001011234 18123456789 demo@example.invalid'), /\d{11}|example/);
});
test('job material separates resume evidence from JD and cannot claim submission', () => {
  const request = buildJobMaterialRequest(job, resume, prefs), serialized = JSON.stringify(request);
  assert.match(serialized, /candidateResume/);assert.match(serialized, /不是候选人经历/);assert.match(serialized, /不能声称已投递/);assert.doesNotMatch(serialized, /18123456789|demo@example/);assert.equal(request.maxTokens, 1800);
  assert.throws(() => buildJobMaterialRequest(job, {}, prefs), /个人简历/);
});
test('Chinese salary units and pay periods produce comparable monthly ranges', () => {
  for (const [input, expected] of [['15-25K·13薪', [15000, 25000]], ['1.5-2万/月', [15000, 20000]], ['15千-2万', [15000, 20000]], ['24-36万/年', [20000, 30000]], ['200-300元/天', [4350, 6525]]]) assert.deepEqual(Object.values(monthlySalary(input)), expected, input);
  assert.equal(monthlySalary('薪资面议'), null);assert.equal(monthlySalary('25-15K'), null);
});
test('matching enforces role, city, salary, experience, remote exceptions and exclusions', () => {
  assert.equal(matchJob(job, prefs).eligible, true);
  for (const candidate of [{ ...job, title: '销售' }, { ...job, location: '广州' }, { ...job, salary: '5-8K' }, { ...job, experience: '5-10年' }, { ...job, company: '' }, { ...job, salary: '' }, { ...job, jobType: '实习' }]) assert.equal(matchJob(candidate, { ...prefs, experienceYears: 2 }).eligible, false);
  assert.equal(matchJob({ ...job, location: '远程办公' }, { ...prefs, remote: true }).eligible, true);
  assert.equal(matchJob({ ...job, salary: '面议' }, { ...prefs, allowNegotiable: true }).eligible, true);
  assert.equal(matchJob(job, { ...prefs, requiredKeywords: ['Python'] }).eligible, false);
  assert.equal(matchJob(job, { ...prefs, excludedKeywords: ['订单'] }).eligible, false);
  assert.equal(matchJob(job, { ...prefs, excludedCompanies: ['示例甲'] }).eligible, false);
  assert.throws(() => normalizeJobPreferences({ salaryMin: 20000, salaryMax: 10000 }));
  assert.equal(normalizeJobPreferences({ batchLimit: 999, intervalSeconds: 0 }).batchLimit, 20);assert.equal(normalizeJobPreferences({ intervalSeconds: 0 }).intervalSeconds, 15);
});
test('platform URLs reject foreign domains, embedded credentials and non-detail pages', () => {
  assert.equal(RECRUITMENT_SITES.length, 6);
  assert.equal(recruitmentUrl(job.url + '?token=secret&x=1#hash', 'liepin'), job.url + '?x=1');
  for (const url of ['https://liepin.com.evil.invalid/job/1', 'https://evil.invalid/?x=liepin.com', 'http://www.liepin.com/job/1', 'https://user:pass@www.liepin.com/job/1', 'https://www.liepin.com:123/job/1', 'file:///example']) assert.throws(() => recruitmentUrl(url, 'liepin'));
  assert.throws(() => recruitmentUrl('https://www.liepin.com/zhaopin/', 'liepin', { detail: true }));
  assert.equal(new URL(jobSearchUrl('boss', 'Java & 后端')).searchParams.get('query'), 'Java & 后端');
});
test('CSV imports quoted multiline JD, whitelists platforms and neutralizes spreadsheet formulas', () => {
  const records = parseJobCsv('平台,职位,公司,链接,职位描述\n猎聘,Java后端,示例公司,https://www.liepin.com/job/1,"Redis,Java\n项目"');
  assert.equal(records[0].platform, 'liepin');assert.equal(records[0].description, 'Redis,Java\n项目');assert.equal(records[0].status, 'saved');
  assert.throws(() => parseJobCsv('平台,职位,公司,链接\n未知,Java,示例,x'));assert.throws(() => parseJobCsv('平台,职位,公司,链接\n猎聘,"broken'));
  assert.match(jobCsv([{ ...job, title: '=1+1', company: '@SUM(A1)' }]), /"'=1\+1"/);assert.match(jobCsv([{ ...job, title: '=1+1', company: '@SUM(A1)' }]), /"'@SUM/);
});
test('store serializes concurrent updates, deduplicates URLs and preserves attempt evidence', async t => {
  const { store, id } = await setup(t);await Promise.all([store.saveJob({ ...job, url: job.url.replace('10001','10002') }), store.saveJob({ ...job, url: job.url.replace('10001','10003') })]);assert.equal((await store.read()).jobs.length, 3);
  await assert.rejects(store.saveJob(job), /已经/);await assert.rejects(store.saveJob({ ...job, url: job.url+'?tracking=different' }), /已经/);
  await store.saveJob({ id, status: 'applying', attempts: 1, lastResult: '点击过' }, { trusted: true });
  await store.saveJob({ id, status: 'saved', attempts: 0, lastResult: '' });assert.equal((await store.read()).jobs.find(value => value.id === id).attempts, 1);
  await store.saveJob({ id, status: 'applying' }, { trusted: true });await store.recoverInterrupted();assert.equal((await store.read()).jobs.find(value => value.id === id).status, 'attention');
  await store.saveJob({ id, status: 'applied' });assert.equal((await store.read()).jobs.find(value => value.id === id).lastResult, '用户手动记录');
  await store.saveResume(resume);assert.equal((await store.read()).preferences.defaultResumeConfirmed, false);
});
test('batch cannot submit without a concrete preview token and fresh preferences', async t => {
  const { store, id, campaign, calls } = await setup(t);await assert.rejects(campaign.start('fake'), /失效/);assert.deepEqual(calls, []);
  const preview = await campaign.preview([id]);assert.equal(preview.jobs[0].company, job.company);
  await store.savePreferences({ ...prefs, salaryMin: 19000 });await assert.rejects(campaign.start(preview.token), /变化/);assert.deepEqual(calls, []);
  await store.savePreferences({ ...prefs, defaultResumeConfirmed: false });await assert.rejects(campaign.preview([id]), /默认简历/);
});
test('confirmed batch records only a website success receipt and will not blindly retry', async t => {
  const { store, id, campaign, calls } = await setup(t);const preview = await campaign.preview([id]);await campaign.start(preview.token);await campaign.task;
  assert.deepEqual(calls, ['navigate', 'inspect', 'apply', 'outcome']);const saved = (await store.read()).jobs[0];assert.equal(saved.status, 'applied');assert.equal(saved.attempts, 1);assert.equal(campaign.status().phase, 'completed');assert.equal((await campaign.preview([id])).jobs.length, 0);
});
test('login/captcha and identity mismatches pause without clicking and retain attention records', async t => {
  for (const inspect of [{ blocked: true, reason: '请先登录' }, { identityMatches: false }]) {
    let clicked = 0;const { store, id, campaign } = await setup(t, { browser: { probe: async (_p, _c, action) => { if (action === 'apply') clicked++;return inspect; } } });
    await campaign.start((await campaign.preview([id])).token);await campaign.task;assert.equal(clicked, 0);assert.equal(campaign.status().phase, 'paused');assert.equal((await store.read()).jobs[0].status, 'attention');assert.equal((await store.read()).jobs[0].attempts, 0);
  }
});
test('missing receipts do not count as success, stop the batch and block implicit retries', async t => {
  const { store, id, campaign } = await setup(t, { browser: { probe: async (_p, _c, action) => action === 'inspect' ? { identityMatches: true } : action === 'apply' ? { clicked: true } : { waiting: true } } });
  await campaign.start((await campaign.preview([id])).token);await campaign.task;const saved = (await store.read()).jobs[0];assert.equal(saved.status, 'attention');assert.equal(saved.attempts, 1);assert.equal(saved.submittedAt, 0);assert.match(saved.lastResult, /未收到明确/);assert.equal((await campaign.preview([id])).jobs.length, 0);
});
test('BOSS greeting requires explicit opt-in and is recorded as contacted, not applied', async t => {
  const { store, id, campaign } = await setup(t, { job: { platform: 'boss', url: 'https://www.zhipin.com/job_detail/10001.html' }, browser: { url: () => 'https://www.zhipin.com/job_detail/10001.html', probe: async (_p, _c, action) => action === 'inspect' ? { identityMatches: true } : action === 'apply' ? { clicked: true, kind: 'greeting' } : { outcome: 'contacted', evidence: '继续沟通' } } });
  assert.equal((await campaign.preview([id])).jobs.length, 0);await store.savePreferences({ ...prefs, allowGreeting: true });await campaign.start((await campaign.preview([id])).token);await campaign.task;assert.equal((await store.read()).jobs[0].status, 'contacted');
});
test('stop between navigation and submission prevents any external click', async t => {
  let entered, release;const enteredPromise = new Promise(resolve => entered = resolve), held = new Promise(resolve => release = resolve);let clicks = 0;
  const { store, campaign, id } = await setup(t, { browser: { navigate: async () => { entered();await held; }, probe: async () => { clicks++;return {}; } } });
  await campaign.start((await campaign.preview([id])).token);await enteredPromise;campaign.stop();release();await campaign.task;assert.equal(clicks, 0);assert.equal(campaign.status().active, false);assert.equal((await store.read()).jobs[0].status, 'attention');
});
test('navigation to another job URL cannot submit even when title and company match', async t => {
  let clicks = 0;
  const { store, campaign, id } = await setup(t, { browser: { url: () => job.url.replace('10001', 'different'), probe: async () => { clicks++;return { identityMatches: true }; } } });
  await campaign.start((await campaign.preview([id])).token);await campaign.task;assert.equal(clicks, 0);assert.equal((await store.read()).jobs[0].status, 'attention');assert.match(campaign.status().message, /离开确认/);
});
test('stop destroys an unresponsive recruitment page and releases its pending operation', async () => {
  let destroyed = false;const browser = new RecruitmentBrowser({ electron: {}, onStop: () => {} });
  browser.windows.set('liepin', { isDestroyed: () => destroyed, destroy: () => { destroyed = true; }, webContents: { getURL: () => job.url, executeJavaScript: () => new Promise(() => {}) } });
  const controller = new AbortController(), pending = browser.probe('liepin', {}, 'apply', {}, controller.signal);controller.abort();await assert.rejects(pending, /任务已停止/);assert.equal(destroyed, true);
});
test('changed JD exclusions halt before submit and batches enforce per-day and per-batch caps', async t => {
  let clicks = 0;const { store, id, campaign } = await setup(t, { browser: { probe: async (_p, _c, action) => { if (action === 'apply') clicks++;return { identityMatches: true, description: '劳务派遣 外包' }; } } });
  await store.savePreferences({ ...prefs, excludedKeywords: ['外包'], batchLimit: 1 });await campaign.start((await campaign.preview([id])).token);await campaign.task;assert.equal(clicks, 0);assert.match((await store.read()).jobs[0].lastResult, /外包/);
  const other = await store.saveJob({ ...job, url: job.url.replace('10001','10004') });await store.savePreferences({ ...prefs, batchLimit: 1 });const preview = await campaign.preview(other.jobs.map(value => value.id));assert.equal(preview.jobs.length, 1);
  const candidateId = preview.jobs[0].id;
  await store.update(state => ({ ...state, jobs: [...state.jobs, ...Array.from({ length: 100 }, (_, i) => ({ ...job, id: 'attempted-' + i, url: job.url.replace('10001', String(20000 + i)), status: 'attention', attempts: 1, attemptedAt: Date.now() }))] }));
  const capped = await campaign.preview([candidateId]);assert.equal(capped.daily, 100);assert.equal(capped.jobs.length, 0);
});
