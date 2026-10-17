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
let qwenRequests=0, glmRequests=0, measuredTiming="", earlyTranscriptionVerified=false;
let speechRequests = 0, failSpeech = false, holdSpeech = false, heldResponse, baseUrl, holdAnswer = false, heldAnswer;
shell.openExternal = async (url) => external.push(url);
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => { if (String(url).startsWith(baseUrl + '/')) return originalFetch(url, options); network.push(String(url)); throw new Error('Unexpected external request'); };
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if(req.url==='/qwen/v1/models') {assert.equal(req.headers.authorization,'Bearer mock-qwen-key');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{id:'qwen3-asr-flash'},{id:'qwen3-asr-flash-filetrans'},{id:'qwen-plus'}]}));return;}
    if(req.url==='/qwen/v1/chat/completions') {
      qwenRequests++;assert.equal(req.headers.authorization,'Bearer mock-qwen-key');const body=JSON.parse(bytes.toString());assert.equal(body.model,'qwen3-asr-flash');assert.equal(body.stream,false);assert.equal(body.asr_options.language,'zh');
      const data=body.messages.at(-1).content[0].input_audio.data;assert.match(data,/^data:audio\/wav;base64,/);const wav=Buffer.from(data.split(',')[1],'base64');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),16000);
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'千问转写测试'}}]}));return;
    }
    if(req.url==='/glm/v4/audio/transcriptions') {
      glmRequests++;assert.equal(req.headers.authorization,'Bearer mock-glm-key');assert.ok(bytes.includes('glm-asr-2512'));assert.ok(bytes.includes('name="stream"'));assert.ok(bytes.includes('false'));assert.equal(bytes.includes('name="language"'),false);assert.equal(bytes.includes('name="response_format"'),false);
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({text:'智谱转写测试'}));return;
    }
    if (req.url === '/v1/models') { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({data:[null,{id:'mock-speech-model'},{id:'whisper-large-v3'},{id:'chat-model'}]})); return; }
    if (req.url === '/v1/audio/transcriptions') {
      if(failSpeech){res.writeHead(401);res.end('{}');return;}
      speechRequests++; assert.match(req.headers['content-type'], /multipart\/form-data/);
      assert.equal(req.headers.authorization, 'Bearer mock-speech-key');
      const offset = bytes.indexOf('RIFF'); assert.ok(offset > 0); assert.equal(bytes.readUInt32LE(offset + 24), 16000);
      assert.ok(bytes.includes('mock-speech-model')); assert.ok(bytes.length < 700000);
      if (holdSpeech) { heldResponse = res; return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ text: speechRequests === 1 ? '请解释 Redis 缓存击穿。' : speechRequests === 2 ? '怎样防止' : '缓存雪崩？' })); return;
    }
    assert.equal(req.url, '/v1/chat/completions');
    const body = JSON.parse(bytes.toString());
    assert.match(body.messages[0].content, /实时面试辅助/);assert.match(body.messages[0].content,/第一人称/);assert.equal(body.max_tokens,640);assert.equal(body.reasoning_effort,'none');
    const user = body.messages.at(-1).content; const text = typeof user === 'string' ? user : user[0].text;
    questions.push(text);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const delta = (text) => res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
    delta('我的理解是，缓存问题要先保护数据库。'); if (holdAnswer) { heldAnswer = res; return; } setTimeout(() => { delta('我会通过预热、合理过期与限流分散压力，针对热点用互斥锁限制回源，再用监控判断是否需要调整，在可用性和数据新鲜度之间做好取舍。'); res.end('data: [DONE]\n\n'); }, 120);
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
  fs.writeFileSync(path.join(root, 'artifacts/interview-smoke-report.json'), JSON.stringify({ ok: code === 0, detail, speechRequests, qwenRequests, glmRequests, measuredTiming, earlyTranscriptionVerified, answerRequests: questions.length, errors, unexpectedNetwork: network, source: 'synthetic AudioContext; microphone never used; speech and model mocked' }, null, 2));
  console.log((code ? 'INTERVIEW SMOKE FAIL: ' : 'INTERVIEW SMOKE PASS: ') + detail); server.close(); app.exit(code);
}
process.on('uncaughtException', (error) => finish(1, error.stack));
process.on('unhandledRejection', (error) => finish(1, error?.stack || String(error)));
app.on('web-contents-created', (_event, contents) => { contents.on('preload-error', (_event, _file, error) => errors.push(error.message)); });
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => { if (/^(https?|wss?):/i.test(details.url)) { network.push(details.url); callback({ cancel: true }); } else callback({}); });
  const main = await waitFor(() => BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()), 'main window');
  const evaluate = async (code) => { try { return await main.webContents.executeJavaScript(code, true); } catch(error) { throw new Error("Renderer evaluation failed: " + code + " :: " + error.message); } };
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
  const providerSelect=(id)=>evaluate('(()=>{const e=document.querySelector("[data-speech-field=provider]");e.value='+JSON.stringify(id)+';e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await providerSelect('dashscope');
  assert.equal(await evaluate('document.querySelector("[data-speech-field=base]").value'),'https://dashscope.aliyuncs.com/compatible-mode/v1');
  assert.equal(await evaluate('document.querySelector("[data-speech-field=model]").value'),'qwen3-asr-flash');
  await setValue('[data-speech-field=base]',baseUrl+'/qwen/v1/chat/completions');await setValue('[data-speech-field=key]','mock-qwen-key');
  await evaluate('document.querySelector("[data-speech-discover]").click()');
  await waitFor(()=>evaluate('document.querySelector("[data-speech-result]")?.textContent.includes("1 个候选模型")'),'Qwen model discovery filter');
  assert.equal(await evaluate('document.querySelector("[data-speech-field=preset]").textContent.includes("filetrans")'),false);
  await evaluate('document.querySelector("[data-speech-test]").click()');
  await waitFor(()=>evaluate('window.api.interview.connection().then(c=>c.profile?.providerId==="dashscope")'),'Qwen native test/save');
  await waitFor(()=>evaluate('!document.querySelector("[data-speech-test]").disabled'),'Qwen test complete');
  assert.equal(qwenRequests,1);
  await providerSelect('dashscope-intl');assert.equal(await evaluate('document.querySelector("[data-speech-field=base]").value'),'https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
  await providerSelect('zhipu');assert.equal(await evaluate('document.querySelector("[data-speech-field=language]").value'),'');assert.equal(await evaluate('document.querySelector("[data-speech-field=language]").disabled'),true);
  await setValue('[data-speech-field=base]',baseUrl+'/glm/v4/audio/transcriptions');await setValue('[data-speech-field=key]','mock-glm-key');
  await evaluate('document.querySelector("[data-speech-test]").click()');
  await waitFor(()=>evaluate('window.api.interview.connection().then(c=>c.profile?.providerId==="zhipu")'),'GLM native test/save');
  await waitFor(()=>evaluate('!document.querySelector("[data-speech-test]").disabled'),'GLM test complete');assert.equal(glmRequests,1);
  await setValue('[data-speech-field=key]','discard-this-key');
  await evaluate('(()=>{const e=document.querySelector("[data-speech-field=provider]");e.value="groq";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  assert.equal(await evaluate('document.querySelector("[data-speech-field=base]").value'),'https://api.groq.com/openai/v1');
  assert.equal(await evaluate('document.querySelector("[data-speech-field=model]").value'),'whisper-large-v3-turbo');
  assert.equal(await evaluate('document.querySelector("[data-speech-field=key]").value'),'');
  await evaluate('(()=>{const e=document.querySelector("[data-speech-field=provider]");e.value="siliconflow";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  assert.equal(await evaluate('document.querySelector("[data-speech-field=language]").disabled'),true);
  await evaluate('(()=>{const e=document.querySelector("[data-speech-field=provider]");e.value="custom";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await setValue('[data-speech-field=base]', baseUrl + '/v1'); await setValue('[data-speech-field=model]', 'mock-speech-model'); await setValue('[data-speech-field=key]', 'mock-speech-key');
  await evaluate('document.querySelector("[data-speech-discover]").click()');
  await waitFor(()=>evaluate('document.querySelector("[data-speech-result]")?.textContent.includes("候选模型")'),'discover speech models');
  assert.equal(await evaluate('document.querySelector("[data-speech-field=preset]").textContent.includes("whisper-large-v3")'),true);
  await evaluate('document.querySelector("[data-speech-test]").click()');
  await waitFor(() => evaluate('window.api.interview.connection().then(s=>s.profile?.model==="mock-speech-model")'), 'speech save');
  await waitFor(()=>evaluate('document.querySelector("[data-speech-result]")?.textContent.includes("连接测试通过")'),'test/save speech');
  failSpeech=true; await setValue('[data-speech-field=model]','bad-model');
  await evaluate('document.querySelector("[data-speech-test]").click()');
  await waitFor(()=>evaluate('document.querySelector("[data-speech-result]")?.textContent.includes("鉴权")'),'failed test');
  assert.equal(await evaluate('window.api.interview.connection().then(s=>s.profile.model)'), 'mock-speech-model');
  failSpeech=false; speechRequests=0;
  await setValue('[data-speech-field=model]','mock-speech-model');
  await evaluate('document.querySelector(".notice button")?.click()');
  await evaluate('document.querySelector("[data-speech-settings]").scrollIntoView({block:"start"})');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(root,'artifacts/zhiyue-speech-settings.png'),(await main.webContents.capturePage()).toPNG());
  const stored = fs.readFileSync(path.join(process.env.ZHIYUE_USER_DATA_DIR, 'speech-service.json'), 'utf8'); assert.equal(stored.includes('mock-speech-key'), false);
  await evaluate(`window.api.personalModels.save({slot:'interview',providerId:'deepseek',thinkingLevel:'high',baseUrl:${JSON.stringify(baseUrl + '/v1')},model:'mock-answer-model',apiKey:'mock-answer-key'})`);
  // Reload UI model state before entering live interview.
  main.webContents.reload(); await waitFor(() => evaluate('!!document.querySelector("[data-page=interview]")'), 'reload');
  await evaluate('window.api.window.show()');
  await waitFor(()=>evaluate('!document.querySelector(".onboarding")'),'model state loaded');
  await evaluate(`(()=>{
    navigator.mediaDevices.getUserMedia=()=>{throw new Error('Microphone must never be requested')};
    navigator.mediaDevices.getDisplayMedia=async()=>{
      const context=new AudioContext({sampleRate:16000}), oscillator=context.createOscillator(), gain=context.createGain(), destination=context.createMediaStreamDestination();
      gain.gain.value=0;oscillator.frequency.value=660;oscillator.connect(gain);gain.connect(destination);oscillator.start();await context.resume();
      window.__interviewAudio={context,gain,stream:destination.stream};return destination.stream;
    };
  })()`);
  await evaluate('document.querySelector("[data-page=interview]").click()');

  await waitFor(() => evaluate('document.querySelector("[data-live-interview]")?.dataset.listening==="true"'), 'system audio started');
  await waitFor(()=>main.isVisible(),'interview reveal');
  const user32=require('koffi').load('user32.dll');
  const affinity=user32.func('int __stdcall GetWindowDisplayAffinity(intptr_t hwnd, _Out_ uint32_t *affinity)');
  const style=user32.func('__stdcall','GetWindowLongPtrW','intptr_t',['intptr_t','int']);
  const native=(w)=>{const hwnd=w.getNativeWindowHandle().readBigUInt64LE(0),out=[null];assert.equal(affinity(hwnd,out),1);const bits=BigInt(style(hwnd,-20));return {affinity:out[0],transparent:!!(bits&0x20n),noActivate:!!(bits&0x08000000n)};};
  assert.deepEqual(native(main),{affinity:17,transparent:true,noActivate:true});
  assert.equal(main.isFocusable(),false);
  assert.equal(await evaluate('!!document.querySelector(".composer")'),false);
  assert.equal((await evaluate('window.api.interview.windowStatus()')).opacity,.52);
  const overlay=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w!==main&&w.isVisible()),'interview hint overlay');
  await waitFor(()=>native(overlay).affinity===17&&native(overlay).transparent,'protected hints');
  assert.equal(await overlay.webContents.executeJavaScript('document.body.textContent.includes("截图")'),false);
  await evaluate('window.api.window.setInteractive(true);window.api.window.setFocusable(true)');
  assert.equal((await evaluate('window.api.interview.windowStatus()')).clickThrough,true);
  shortcuts.get('Control+Shift+X')();shortcuts.get('Control+Shift+E')();
  assert.equal(native(main).transparent,true);
  main.setContentProtection(false);await waitFor(()=>native(main).affinity===17,'interview affinity recovery');
  shortcuts.get('Control+Q')();
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal((await evaluate('window.api.interview.windowStatus()')).active,true,'Screenshot hotkey cannot navigate out of live interview');
  const pulse = (duration=700) => evaluate('window.__interviewAudio.gain.gain.value=.12;setTimeout(()=>window.__interviewAudio.gain.gain.value=0,'+duration+')');
  await pulse(); await waitFor(() => questions.length === 1, 'first automatic answer');
  await waitFor(() => evaluate('document.querySelector(".message.assistant")?.textContent.includes("互斥锁")'), 'streamed answer');
  assert.match(questions[0], /Redis/);
  measuredTiming=await evaluate('document.querySelector("[data-interview-timing]").textContent');assert.match(measuredTiming,/回答首字/);
  await pulse(6600);await waitFor(()=>speechRequests===2,'long speech begins ASR before the question ends');assert.equal(questions.length,1);earlyTranscriptionVerified=true;
  await waitFor(() => questions.length === 2, 'second automatic answer');
  await waitFor(() => evaluate('window.api.workspace.list().then(rows=>rows.some(row=>row.mode==="interview"&&row.messageCount===4))'), 'interview history');
  fs.writeFileSync(path.join(root, 'artifacts/zhiyue-live-interview.png'), (await main.webContents.capturePage()).toPNG());
  holdSpeech = true; await pulse(); await waitFor(() => heldResponse, 'pending transcription');
  await evaluate('window.api.window.hide()');await waitFor(()=>!main.isVisible(),'hidden interview');
  shortcuts.get('Control+Shift+E')();await waitFor(()=>main.isVisible(),'restore interview');
  assert.deepEqual(native(main),{affinity:17,transparent:true,noActivate:true});
  await evaluate('window.api.window.hide()');await waitFor(()=>!main.isVisible(),'hide before exit');
  shortcuts.get('Control+Shift+Z')();
  await waitFor(()=>evaluate('!!document.querySelector("[data-speech-settings]")'),'exit restores settings');
  assert.equal(main.isFocusable(),true);assert.equal(native(main).transparent,false);
  assert.equal(await evaluate('window.__interviewAudio.stream.getAudioTracks().every(track=>track.readyState==="ended")'), true);
  heldResponse.end(JSON.stringify({ text: '迟到问题不应被回答' }));
  await new Promise((resolve) => setTimeout(resolve, 250)); assert.equal(questions.length, 2);
  await assert.rejects(evaluate('window.api.interview.transcribe({sessionId:"stale",sequence:0,audio:new Uint8Array(3200)})'));
  holdSpeech = false;
  await evaluate('window.api.settings.patch({interviewOptions:{autoAnswer:false,showShortcutHints:false}})');
  await evaluate('document.querySelector("[data-start-interview]").click()');
  await waitFor(()=>evaluate('document.querySelector("[data-live-interview]")?.dataset.listening==="true"'),'settings start interview');
  assert.equal(await evaluate('!!document.querySelector(".written-passive-banner")'),false);
  assert.equal(BrowserWindow.getAllWindows().some(w=>w!==main&&w.isVisible()),false);
  await pulse();await waitFor(()=>evaluate('!!document.querySelector(".interview-transcript")'),'manual transcript');
  assert.equal(questions.length,2);
  holdAnswer=true;shortcuts.get('Alt+C')();await waitFor(()=>heldAnswer,'manual answer shortcut');
  shortcuts.get('Control+3')();
  await waitFor(()=>evaluate('!!document.querySelector("[data-speech-settings]")'),'end shortcut restores settings');
  await waitFor(()=>evaluate('window.__interviewAudio.stream.getAudioTracks().every(track=>track.readyState==="ended")'),'shortcut releases tracks');
  heldAnswer.end('data: [DONE]\n\n');
  await waitFor(()=>evaluate('window.api.workspace.list().then(async rows=>{for(const row of rows.filter(r=>r.mode==="interview")){if((await window.api.workspace.read(row.id)).messages.at(-1)?.status==="cancelled")return true;}return false;})'),'cancelled answer persisted');
  const savedHotkeys=await evaluate('window.api.settings.get().then(s=>s.hotkeys)');
  await evaluate('window.api.settings.patch({hotkeys:{"exam:exit":"NotAValidKeyName"}})');
  await assert.rejects(evaluate('window.api.interview.start()'),/快捷键/);
  assert.equal(await evaluate('window.__interviewAudio.stream.getAudioTracks().every(track=>track.readyState==="ended")'),true);
  await evaluate('window.api.settings.patch({hotkeys:'+JSON.stringify(savedHotkeys)+'})');
  const manifest = fs.readdirSync(process.env.ZHIYUE_USER_DATA_DIR); assert.equal(manifest.some((file) => /\.(wav|pcm|webm)$/i.test(file)), false);
  assert.deepEqual(network, []); assert.deepEqual(errors, []);
  finish(0, 'Automatic protected interview overlay, native capture exclusion/click-through, recovery and shortcuts; provider discovery/test/save rollback; AudioWorklet transcription, automatic/manual answers, history and stop cancellation verified.');
}).catch((error) => finish(1, error.stack));
setTimeout(() => finish(1, 'global timeout'), 70000).unref();
require('../out/main/index.js');
