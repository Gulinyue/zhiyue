// Real Electron; all recruitment HTTPS responses replaced with synthetic fixtures.
const { app, BrowserWindow, session, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const JSZip = require('jszip');
const http = require('node:http');
const fixtures = require('./career-fixtures.cjs');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.runtime'), { recursive: true });fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
const data = fs.mkdtempSync(path.join(root, '.runtime', 'career-smoke-'));
process.env.ZHIYUE_USER_DATA_DIR = data;
let nextOpen, nextSave, baseUrl, finished = false;const errors = [], requests = [], unexpected = [], platforms = [];
dialog.showOpenDialog = async () => ({ canceled: !nextOpen, filePaths: nextOpen ? [nextOpen] : [] });
dialog.showSaveDialog = async () => ({ canceled: !nextSave, filePath: nextSave });
const server = http.createServer(async (req, res) => { let raw = '';for await (const chunk of req) raw += chunk;if(req.url==='/v1/audio/transcriptions'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({text:'请结合简历介绍一下你负责的 Redis 订单项目。'}));return;}requests.push(JSON.parse(raw));res.writeHead(200, { 'Content-Type': 'text/event-stream' });res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: '匹配优势：候选人有 Redis 订单服务经历。\n\n请本人核对后使用。' } }] }) + '\n\ndata: [DONE]\n\n'); });
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => { if (baseUrl && String(url).startsWith(baseUrl + '/')) return originalFetch(url, options);unexpected.push(String(url));throw new Error('No real network allowed in career smoke'); };
const waitFor = async (fn, label, timeout = 18000) => { const end = Date.now() + timeout;while (Date.now() < end) { const result = await fn();if (result) return result;await new Promise(resolve => setTimeout(resolve, 70)); }throw new Error('Timed out: ' + label); };
function finish(code, detail) { if (finished) return;finished = true;fs.writeFileSync(path.join(root, 'artifacts/career-smoke-report.json'), JSON.stringify({ ok: !code, detail, errors, platforms, modelRequests: requests.length, unexpectedNetwork: unexpected, validation: 'Synthetic resume and intercepted recruitment DOM fixtures. No real account or application used; live-site compatibility not verified.' }, null, 2));console.log((code ? 'CAREER SMOKE FAIL: ' : 'CAREER SMOKE PASS: ') + detail);server.close();app.exit(code); }
process.on('uncaughtException', error => finish(1, error.stack));process.on('unhandledRejection', error => finish(1, error.stack || String(error)));
app.on('web-contents-created', (_event, contents) => { contents.on('console-message', event => { if(event.level==='error') errors.push(event.message); });contents.on('preload-error', (_event, _file, error) => errors.push(error.message)); });
app.whenReady().then(async () => {
  const { RECRUITMENT_SITES } = await import(pathToFileURL(path.join(root, 'src/shared/recruitment-sites.mjs')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const site of RECRUITMENT_SITES) {
    const ses = session.fromPartition('persist:zhiyue-recruitment-' + site.id);
    ses.protocol.handle('https', request => { const url = new URL(request.url);if (!(url.hostname === site.host || url.hostname.endsWith('.' + site.host))) { unexpected.push(request.url);return new Response('blocked', { status: 403 }); }return new Response(fixtures.page(site, request.url), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); });
    ses.protocol.handle('http', () => new Response('blocked', { status: 403 }));
  }
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }));
  const main = await waitFor(() => BrowserWindow.getAllWindows().find(win => !win.isDestroyed()), 'main');
  const evaluate = code => main.webContents.executeJavaScript(code, true);
  const call = (method, ...args) => evaluate(`window.api.career.${method}(...${JSON.stringify(args)})`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const setValue = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.constructor.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(() => evaluate('!!document.querySelector("[data-page=resume]")'), 'career navigation');
  assert.equal((await call('load')).jobs.length, 0);await evaluate('window.addEventListener("error", e=>console.error(e.error?.stack))');
  await click('[data-page=resume]');await waitFor(() => evaluate('!!document.querySelector("[data-resume-save]:not(:disabled)")'), 'resume UI ready').catch(async error=>{console.log(await evaluate('document.querySelector(".main-area")?.textContent.slice(0,1800)'));throw error;});
  const textFile = path.join(data, 'synthetic-resume.txt');fs.writeFileSync(textFile, '示例候选人\n2023–2025 示例测试公司 Java开发\n负责 Redis 订单服务，延迟从200ms降至80ms。\n邮箱 demo@example.invalid 手机18123456789');nextOpen = textFile;
  await click('[data-resume-import]');await waitFor(() => evaluate('document.querySelector("[data-resume-field=rawText]")?.value.includes("Redis")'), 'local text import');
  assert.equal((await call('load')).resume.rawText, '', 'import must remain a draft until saved');
  await click('[data-resume-save]');await waitFor(async () => (await call('load')).resume.rawText.includes('Redis'), 'resume save');
  await evaluate('document.querySelector(".career-details.panel summary").click()');assert.equal(await evaluate('document.querySelector("[data-resume-context]").textContent.includes("18123456789")'), false);
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(root, 'artifacts/zhiyue-resume.png'), (await main.webContents.capturePage()).toPNG());
  nextSave = path.join(data, 'synthetic-resume.pdf');await call('export', { format: 'pdf' });assert.equal(fs.readFileSync(nextSave).subarray(0, 5).toString(), '%PDF-');nextOpen = nextSave;
  const pdf = await call('importResume');assert.match(pdf.text, /Redis/);assert.match(pdf.text, /示例/);
  const zip = new JSZip();zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>');zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX 示例 Redis 项目</w:t></w:r></w:p></w:body></w:document>');nextOpen = path.join(data, 'synthetic-resume.docx');fs.writeFileSync(nextOpen, await zip.generateAsync({ type: 'nodebuffer' }));assert.match((await call('importResume')).text, /DOCX 示例 Redis/);
  await call('savePreferences', { roles: ['Java'], locations: ['北京'], salaryMin: 15000, salaryMax: 30000, jobType: '不限', allowGreeting: true, defaultResumeConfirmed: true, batchLimit: 1, intervalSeconds: 15 });
  await click('[data-page=jobs]');await waitFor(() => evaluate('!!document.querySelector("[data-add-job]:not(:disabled)")'), 'jobs UI');
  for (const site of RECRUITMENT_SITES) {
    await call('openSite', site.id, 'Java');const collected = await call('collect', site.id);assert.equal(collected.count, 1, site.name);
    const browser = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes(site.host));assert.ok(browser);const properties = browser.webContents.getLastWebPreferences();assert.equal(properties.sandbox, true);assert.equal(properties.contextIsolation, true);assert.equal(properties.nodeIntegration, false);assert.ok(!properties.preload);assert.equal(await browser.webContents.executeJavaScript('typeof window.api+":"+typeof require'), 'undefined:undefined');
    const saved = collected.state.jobs.find(job => job.platform === site.id);const preview = await call('previewBatch', [saved.id]);assert.equal(preview.jobs.length, 1);await call('startBatch', preview.token);
    await waitFor(async () => !(await call('campaignStatus')).active, site.name + ' fixture campaign');const result = (await call('load')).jobs.find(job => job.id === saved.id);assert.equal(result.status, site.greeting ? 'contacted' : 'applied');platforms.push({ platform: site.id, fixtureStatus: result.status });
  }
  const site = RECRUITMENT_SITES.find(value => value.id === 'liepin');
  for (const mode of ['captcha', 'login', 'wrong-job', 'ambiguous', 'no-receipt', 'old-toast', 'confirmation']) {
    const state = await call('saveJob', { platform: site.id, title: 'Java后端开发', company: '示例测试公司', location: '北京', salary: '15-25K', url: fixtures.detailUrl(site, mode), description: 'Redis' });const id = state.jobs[0].id;
    const preview = await call('previewBatch', [id]);await call('startBatch', preview.token);await waitFor(async () => !(await call('campaignStatus')).active, mode);
    const result = (await call('load')).jobs.find(job => job.id === id);assert.equal(result.status, mode === 'confirmation' ? 'applied' : 'attention', mode);if (mode !== 'confirmation') assert.equal((await call('previewBatch', [id])).jobs.length, 0);
  }
  await click('[data-add-job]');await waitFor(() => evaluate('!!document.querySelector("[data-job-field=title]")'), 'job editor');await setValue('[data-job-field=title]', 'Java后端开发');await setValue('[data-job-field=company]', '草稿测试公司');await setValue('[data-job-field=location]', '北京');await setValue('[data-job-field=salary]', '15-25K');await setValue('[data-job-field=url]', 'https://www.zhipin.com/job_detail/material.html');await setValue('[data-job-field=description]', '要求 Redis，未提供经历不可虚构');await click('[data-save-job]');await waitFor(() => evaluate('!!document.querySelector("[data-generate-material]:not(:disabled)")'), 'saved editor');
  await evaluate(`window.api.personalModels.save({slot:'interview',providerId:'custom',baseUrl:${JSON.stringify(baseUrl + '/v1')},model:'mock-career-model',apiKey:'local-no-key'})`);
  // Reload to refresh the actual UI model profile, then reopen the persisted job.
  main.webContents.reload();await waitFor(() => evaluate('!!document.querySelector("[data-page=jobs]")'), 'reload');await evaluate('window.api.window.show()');await click('[data-page=jobs]');await waitFor(() => evaluate('!!document.querySelector("[data-career-job]")'), 'queue');await evaluate('document.querySelector("[data-career-job] td:last-child button:nth-child(2)").click()');await click('[data-generate-material]');
  await waitFor(() => evaluate('document.querySelector(".career-material")?.textContent.includes("匹配优势")'), 'streamed tailored material');assert.equal(requests.length, 1);assert.match(JSON.stringify(requests[0]), /candidateResume/);assert.doesNotMatch(JSON.stringify(requests[0]), /18123456789|demo@example/);await waitFor(() => evaluate('!document.querySelector("[data-generate-material]").disabled'), 'material persisted');
  nextSave = path.join(data, 'queue.csv');await call('exportQueue');assert.match(fs.readFileSync(nextSave, 'utf8'), /需|attention|applied/);
  await evaluate('document.querySelector(".career-modal .row button").click()');await evaluate('document.querySelector(".career-page").scrollTop=0');await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(root, 'artifacts/zhiyue-career.png'), (await main.webContents.capturePage()).toPNG());
  await evaluate(`window.api.settings.patch({hotkeys:{'exam:exit':'Control+Alt+Shift+F12'},interviewOptions:{silenceMs:700,autoAnswer:true}})`);
  await evaluate(`window.api.interview.saveConnection({providerId:'custom',baseUrl:${JSON.stringify(baseUrl+'/v1')},model:'mock-asr',apiKey:'local-no-key'})`);
  await evaluate(`(()=>{navigator.mediaDevices.getUserMedia=()=>{throw new Error('Microphone forbidden')};navigator.mediaDevices.getDisplayMedia=async()=>{const context=new AudioContext({sampleRate:16000}),oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();gain.gain.value=0;oscillator.connect(gain);gain.connect(destination);oscillator.start();await context.resume();window.__careerAudio={context,gain};return destination.stream;};})()`);
  await click('[data-page=interview]');await waitFor(()=>evaluate('document.querySelector("[data-live-interview]")?.dataset.listening==="true"'),'resume-grounded interview starts');
  await evaluate('window.__careerAudio.gain.gain.value=.12;setTimeout(()=>window.__careerAudio.gain.gain.value=0,800)');
  await waitFor(()=>requests.some(request=>request.messages[0].content.includes('candidate_resume')),'real interview resume prompt');const spoken=requests.find(request=>request.messages[0].content.includes('candidate_resume'));assert.match(spoken.messages[0].content,/200ms/);assert.doesNotMatch(spoken.messages[0].content,/18123456789|demo@example/);await evaluate('window.api.interview.stop()');await evaluate('window.__careerAudio.context.close()');
  assert.deepEqual(errors, []);assert.deepEqual(unexpected, []);finish(0, 'Resume TXT/PDF/DOCX import and PDF export, contact-redacted model material and actual synthetic-audio interview grounding, six sandboxed fixture adapters, confirmed submissions/greeting, captcha/login/identity/ambiguous/unknown-receipt pauses and CSV export verified. Live websites not validated.');
}).catch(error => finish(1, error.stack));
setTimeout(() => finish(1, 'global timeout'), 120000).unref();
require(process.env.ZHIYUE_TEST_ARCHIVE ? path.join(path.resolve(process.env.ZHIYUE_TEST_ARCHIVE), 'out/main/index.js') : '../out/main/index.js');
