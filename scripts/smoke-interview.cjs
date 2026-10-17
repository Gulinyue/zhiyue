// Real Electron + AudioWorklet; synthetic audio and local speech/model services only.
const { app, BrowserWindow, session, shell, globalShortcut } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.runtime'), { recursive: true });
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
process.env.ZHIYUE_USER_DATA_DIR = fs.mkdtempSync(path.join(root, '.runtime', 'interview-smoke-'));
const errors = [], external = [], network = [], questions = [];
const shortcuts = new Map(), register = globalShortcut.register.bind(globalShortcut);
globalShortcut.register = (key, handler) => { const ok = register(key, handler); if (ok) shortcuts.set(key, handler); return ok; };
let speechRequests = 0, holdSpeech = false, heldResponse, baseUrl, holdAnswer = false, heldAnswer;
shell.openExternal = async (url) => external.push(url);
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => { if (String(url).startsWith(baseUrl + '/')) return originalFetch(url, options); network.push(String(url)); throw new Error('Unexpected external request'); };
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if (req.url === '/v1/audio/transcriptions') {
      speechRequests++; assert.match(req.headers['content-type'], /multipart\/form-data/);
      assert.equal(req.headers.authorization, 'Bearer mock-speech-key');
      const offset = bytes.indexOf('RIFF'); assert.ok(offset > 0); assert.equal(bytes.readUInt32LE(offset + 24), 16000);
      assert.ok(bytes.includes('mock-speech-model')); assert.ok(bytes.length < 700000);
      if (holdSpeech) { heldResponse = res; return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ text: speechRequests === 1 ? '请解释 Redis 缓存击穿。' : '怎样防止缓存雪崩？' })); return;
    }
    assert.equal(req.url, '/v1/chat/completions');
    const body = JSON.parse(bytes.toString());
    assert.match(body.messages[0].content, /实时面试辅助/);
    const user = body.messages.at(-1).content; const text = typeof user === 'string' ? user : user[0].text;
    questions.push(text);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const delta = (text) => res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
    delta('面试参考回答：'); if (holdAnswer) { heldAnswer = res; return; } setTimeout(() => { delta('使用互斥锁、合理过期与限流。'); res.end('data: [DONE]\n\n'); }, 120);
  } catch (error) { errors.push(error.message); res.writeHead(500); res.end('{}'); }
});
const waitFor = async (fn, label, timeout = 15000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const value = await fn(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 60)); }
  throw new Error('Timed out: ' + label);
};
let finished = false;
function finish(code, detail) {
  if (finished) return; finished = true;
  fs.writeFileSync(path.join(root, 'artifacts/interview-smoke-report.json'), JSON.stringify({ ok: code === 0, detail, speechRequests, answerRequests: questions.length, errors, unexpectedNetwork: network, source: 'synthetic AudioContext; microphone never used; speech and model mocked' }, null, 2));
  console.log((code ? 'INTERVIEW SMOKE FAIL: ' : 'INTERVIEW SMOKE PASS: ') + detail); server.close(); app.exit(code);
}
process.on('uncaughtException', (error) => finish(1, error.stack));
process.on('unhandledRejection', (error) => finish(1, error?.stack || String(error)));
app.on('web-contents-created', (_event, contents) => { contents.on('preload-error', (_event, _file, error) => errors.push(error.message)); });
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => { if (/^(https?|wss?):/i.test(details.url)) { network.push(details.url); callback({ cancel: true }); } else callback({}); });
  const main = await waitFor(() => BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()), 'main window');
  const evaluate = (code) => main.webContents.executeJavaScript(code, true);
  const setValue = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(() => evaluate('!!document.querySelector("[data-page=settings]")'), 'renderer');
  await evaluate('document.querySelector("[data-page=settings]").click()');
  await waitFor(() => evaluate('!!document.querySelector("[data-speech-settings]")'), 'settings');
  assert.equal(await evaluate('document.querySelector(".page-scroll>.panel").hasAttribute("data-developer-contact")'), true);
  assert.equal(await evaluate('document.querySelector("[data-feedback-email]").textContent'), 'linyue_clawbot001@163.com');
  await evaluate('document.querySelector("[data-support-developer]").click();document.querySelector("[data-feedback-email]").click()');
  await waitFor(() => external.length === 2, 'contact actions');
  assert.equal(external[0], 'https://afdian.com/a/gulinyue618'); assert.equal(new URL(external[1]).pathname, 'linyue_clawbot001@163.com');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(root, 'artifacts/zhiyue-settings-contact.png'), (await main.webContents.capturePage()).toPNG());
  await setValue('[data-speech-field=base]', baseUrl + '/v1'); await setValue('[data-speech-field=model]', 'mock-speech-model'); await setValue('[data-speech-field=key]', 'mock-speech-key');
  await evaluate('document.querySelector("[data-speech-save]").click()');
  await waitFor(() => evaluate('window.api.interview.connection().then(s=>s.profile?.model==="mock-speech-model")'), 'speech save');
  const stored = fs.readFileSync(path.join(process.env.ZHIYUE_USER_DATA_DIR, 'speech-service.json'), 'utf8'); assert.equal(stored.includes('mock-speech-key'), false);
  await evaluate(`window.api.personalModels.save({slot:'interview',baseUrl:${JSON.stringify(baseUrl + '/v1')},model:'mock-answer-model',apiKey:'mock-answer-key'})`);
  // Reload UI model state before entering live interview.
  main.webContents.reload(); await waitFor(() => evaluate('!!document.querySelector("[data-page=interview]")'), 'reload');
  await evaluate('window.api.window.show()');
  await evaluate(`(()=>{
    navigator.mediaDevices.getUserMedia=()=>{throw new Error('Microphone must never be requested')};
    navigator.mediaDevices.getDisplayMedia=async()=>{
      const context=new AudioContext({sampleRate:16000}), oscillator=context.createOscillator(), gain=context.createGain(), destination=context.createMediaStreamDestination();
      gain.gain.value=0;oscillator.frequency.value=660;oscillator.connect(gain);gain.connect(destination);oscillator.start();await context.resume();
      window.__interviewAudio={context,gain,stream:destination.stream};return destination.stream;
    };
  })()`);
  await evaluate('document.querySelector("[data-page=interview]").click()');
  await waitFor(() => evaluate('!!document.querySelector("[data-interview-toggle]")'), 'interview page');
  await evaluate('document.querySelector("[data-interview-toggle]").click()');
  await waitFor(() => evaluate('document.querySelector("[data-live-interview]").dataset.listening==="true"'), 'system audio started');
  const pulse = () => evaluate('window.__interviewAudio.gain.gain.value=.12;setTimeout(()=>window.__interviewAudio.gain.gain.value=0,700)');
  await pulse(); await waitFor(() => questions.length === 1, 'first automatic answer');
  await waitFor(() => evaluate('document.querySelector(".message.assistant")?.textContent.includes("互斥锁")'), 'streamed answer');
  assert.match(questions[0], /Redis/);
  await pulse(); await waitFor(() => questions.length === 2, 'second automatic answer');
  await waitFor(() => evaluate('window.api.workspace.list().then(rows=>rows.some(row=>row.mode==="interview"&&row.messageCount===4))'), 'interview history');
  fs.writeFileSync(path.join(root, 'artifacts/zhiyue-live-interview.png'), (await main.webContents.capturePage()).toPNG());
  holdSpeech = true; await pulse(); await waitFor(() => heldResponse, 'pending transcription');
  await evaluate('document.querySelector("[data-interview-toggle]").click()');
  assert.equal(await evaluate('window.__interviewAudio.stream.getAudioTracks().every(track=>track.readyState==="ended")'), true);
  heldResponse.end(JSON.stringify({ text: '迟到问题不应被回答' }));
  await new Promise((resolve) => setTimeout(resolve, 250)); assert.equal(questions.length, 2);
  await assert.rejects(evaluate('window.api.interview.transcribe({sessionId:"stale",sequence:0,audio:new Uint8Array(3200)})'));
  holdAnswer = true;
  await setValue('textarea[aria-label="面试问题转写"]', '请解释索引。');
  await evaluate('document.querySelector(".live-interview form").requestSubmit()');
  await waitFor(() => heldAnswer, 'pending answer');
  await evaluate('[...document.querySelectorAll("button")].find(el=>el.textContent==="停止当前回答").click()');
  await waitFor(() => evaluate('window.api.workspace.list().then(async rows=>{const row=rows.find(item=>item.mode==="interview"&&item.messageCount===6);return row&&(await window.api.workspace.read(row.id)).messages.at(-1).status==="cancelled"})'), 'cancelled answer persisted');
  heldAnswer.end('data: [DONE]\n\n');
  holdSpeech = false; holdAnswer = false;
  await evaluate('document.querySelector("[data-interview-toggle]").click()');
  await waitFor(() => evaluate('document.querySelector("[data-live-interview]").dataset.listening==="true"'), 'restart listening');
  assert.equal(globalShortcut.isRegistered('Control+3'), true);
  assert.ok(shortcuts.get('Control+3')); shortcuts.get('Control+3')();
  await waitFor(() => evaluate('window.__interviewAudio.stream.getAudioTracks().every(track=>track.readyState==="ended")'), 'shortcut stops audio');
  await evaluate('document.querySelector("[data-interview-toggle]").click()');
  await waitFor(() => evaluate('document.querySelector("[data-live-interview]").dataset.listening==="true"'), 'resume after shortcut');
  await evaluate('document.querySelector("[data-page=settings]").click()');
  await waitFor(() => evaluate('window.__interviewAudio.stream.getAudioTracks().every(track=>track.readyState==="ended")'), 'navigation stops audio');
  const manifest = fs.readdirSync(process.env.ZHIYUE_USER_DATA_DIR); assert.equal(manifest.some((file) => /\.(wav|pcm|webm)$/i.test(file)), false);
  assert.deepEqual(network, []); assert.deepEqual(errors, []);
  finish(0, 'Real AudioWorklet voice gate → encrypted speech connection → WAV transcription → automatic streaming answers; multi-turn history, stop cancellation, late-result discard and top contact card verified.');
}).catch((error) => finish(1, error.stack));
setTimeout(() => finish(1, 'global timeout'), 45000).unref();
require('../out/main/index.js');
