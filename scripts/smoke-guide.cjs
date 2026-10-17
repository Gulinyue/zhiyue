// Real Electron UI with local services and intercepted browser/clipboard actions.
const { app, BrowserWindow, session, shell, clipboard } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
process.env.ZHIYUE_USER_DATA_DIR=fs.mkdtempSync(path.join(root,'.runtime','guide-smoke-'));
const errors=[], opened=[], copied=[], network=[], requests=[];
shell.openExternal=async value=>opened.push(value);clipboard.writeText=value=>copied.push(value);
let baseUrl, finished=false, stage="startup";
const originalFetch=globalThis.fetch;globalThis.fetch=(url,init)=>{if(String(url).startsWith(baseUrl+'/'))return originalFetch(url,init);network.push(String(url));return Promise.reject(new Error('Unexpected request'));};
const server=http.createServer(async(req,res)=>{try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());requests.push(body);
  assert.equal(req.url,'/v1/chat/completions');
  if(body.model==='qwen3-asr-flash'){
    assert.equal(req.headers.authorization,'Bearer mock-bailian-key');assert.equal(body.messages[0].content[0].type,'input_audio');
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'语音测试'}}]}));return;
  }
  assert.equal(body.model,'deepseek-flash');assert.equal(body.reasoning_effort,'none');assert.equal(req.headers.authorization,'Bearer mock-deepseek-key');
  if(!body.stream){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'OK，缓存是临时保存常用数据的机制。'},finish_reason:'stop'}]}));return;}
  res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: '+JSON.stringify({choices:[{delta:{content:'OK，缓存是临时保存常用数据的机制。'}}]})+'\n\ndata: [DONE]\n\n');
}catch(error){errors.push(error.message);res.writeHead(500);res.end('{}');}});
const waitFor=async(fn,label,timeout=12000)=>{const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+label);};
function finish(code,detail){if(finished)return;finished=true;fs.writeFileSync(path.join(root,'artifacts/guide-smoke-report.json'),JSON.stringify({ok:code===0,detail,stage,requests:requests.length,opened,clipboardValues:copied,errors,unexpectedNetwork:network},null,2));console.log((code?'GUIDE SMOKE FAIL: ':'GUIDE SMOKE PASS: ')+detail);server.close();app.exit(code);}
process.on('uncaughtException',e=>finish(1,e.stack));process.on('unhandledRejection',e=>finish(1,e?.stack||String(e)));
app.whenReady().then(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseUrl='http://127.0.0.1:'+server.address().port;
  session.defaultSession.webRequest.onBeforeRequest((details,cb)=>{if(/^https?:/.test(details.url)){network.push(details.url);cb({cancel:true});}else cb({});});
  const main=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()),'main');
  const evaluate=async code=>{try{return await main.webContents.executeJavaScript(code,true);}catch(error){throw Error(code+' :: '+error.message);}};
  const click=selector=>evaluate('document.querySelector('+JSON.stringify(selector)+').click()');
  const setValue=(selector,value)=>evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');Object.getOwnPropertyDescriptor(e.constructor.prototype,"value").set.call(e,'+JSON.stringify(value)+');e.dispatchEvent(new Event("input",{bubbles:true}));})()');
  const paint=()=>evaluate('new Promise(resolve=>{setTimeout(resolve,200);requestAnimationFrame(()=>requestAnimationFrame(resolve))})');
  await waitFor(()=>evaluate('!!document.querySelector("[data-page=guide]")'),'guide navigation');await click('[data-page=guide]');
  await waitFor(()=>evaluate('!!document.querySelector("[data-beginner-guide]")'),'guide');
  assert.equal(await evaluate('document.querySelectorAll("[data-guide-step]").length'),10);
  await click('[data-guide-check]');await click('[data-guide-step="1"]');await click('[data-guide-link=deepseek]');
  await waitFor(()=>opened.length===1,'official site button');assert.equal(opened[0],'https://platform.deepseek.com/');
  await assert.rejects(evaluate('window.api.tutorial.openLink("https://attacker.test")'));await assert.rejects(evaluate('window.api.tutorial.copyValue("apiKey")'));
  await click('[data-guide-step="3"]');await click('[data-guide-copy=deepseekBase]');assert.equal(copied.at(-1),'https://api.deepseek.com/v1');
  await paint();fs.writeFileSync(path.join(root,'artifacts/zhiyue-beginner-guide.png'),(await main.webContents.capturePage()).toPNG());
  const configure=async(target,step)=>{
    await click('[data-page=guide]');await waitFor(()=>evaluate('!!document.querySelector("[data-beginner-guide]")'),'return guide');await click('[data-guide-step="'+step+'"]');await click('[data-guide-configure='+target+']');
    const selector=target==='speech'?'[data-speech-settings]':'[data-model-slot='+target+']';
    await waitFor(()=>evaluate('document.activeElement?.type==="password" && !!document.querySelector('+JSON.stringify(selector)+')'),'example focused');return selector;
  };
  stage='configure text';let selector=await configure('interview',3);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector+' [data-model-field=model]')+').value'),'deepseek-flash');
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector+' [data-model-field=provider]')+').value'),'deepseek');
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector+' [data-model-thinking]')+').checked'),true);
  assert.equal(await evaluate('window.api.personalModels.load().then(s=>s.profiles.filter(p=>p.enabled).length)'),0,'Prefill cannot save before user test');
  await setValue(selector+' [data-model-field=base]',baseUrl+'/v1');await setValue(selector+' [data-model-field=key]','mock-deepseek-key');
  await evaluate('[...document.querySelector('+JSON.stringify(selector)+').querySelectorAll("button")].find(b=>b.textContent==="测试并保存").click()');
  await waitFor(()=>evaluate('window.api.personalModels.load().then(s=>s.profiles.some(p=>p.slot==="interview"&&p.enabled))'),'text connection saved');
  stage='configure image';selector=await configure('screenshot',4);await setValue(selector+' [data-model-field=base]',baseUrl+'/v1');await setValue(selector+' [data-model-field=key]','mock-deepseek-key');
  await evaluate('[...document.querySelector('+JSON.stringify(selector)+').querySelectorAll("button")].find(b=>b.textContent==="测试并保存").click()');
  await waitFor(()=>evaluate('window.api.personalModels.load().then(s=>s.profiles.some(p=>p.slot==="screenshot"&&p.enabled))'),'screenshot saved');
  assert.ok(requests.some(body=>body.messages.some(message=>Array.isArray(message.content)&&message.content.some(part=>part.type==='image_url'))),'Image connection test sends image');
  stage='configure speech';selector=await configure('speech',7);assert.equal(await evaluate('document.querySelector("[data-speech-field=provider]").value'),'dashscope');assert.equal(await evaluate('document.querySelector("[data-speech-field=language]").value'),'');
  await setValue('[data-speech-field=base]',baseUrl+'/v1');await setValue('[data-speech-field=key]','mock-bailian-key');await click('[data-speech-test]');
  await waitFor(()=>evaluate('window.api.interview.connection().then(c=>c.profile?.model==="qwen3-asr-flash")'),'speech saved');
  stage='all connections';await click('[data-page=guide]');await waitFor(()=>evaluate('document.querySelectorAll(".guide-connections .ready").length===3'),'three configured connections');
  assert.equal(await evaluate('document.querySelector("[data-guide-current]").dataset.guideCurrent'),'speech');
  stage="all steps";for(let step=0;step<10;step++){await click('[data-guide-step="'+step+'"]');assert.ok(await evaluate('document.querySelectorAll(".guide-instructions li").length>=5'));}
  stage="reload";await new Promise(resolve=>{main.webContents.once("did-finish-load",resolve);main.webContents.reload();});await waitFor(()=>evaluate('!!document.querySelector("[data-page=guide]")'),'reload');await click('[data-page=guide]');
  await waitFor(()=>evaluate('document.querySelector("[data-guide-current]")?.dataset.guideCurrent==="troubleshooting"'),'guide progress survives reload');
  assert.match(await evaluate('document.querySelector(".guide-progress").textContent'),/1 \/ 10/);
  await evaluate('window.api.window.show()');
  stage='saved settings';await click('[data-page=settings]');await waitFor(()=>evaluate('document.querySelector("[data-model-slot=interview] [data-model-field=base]")?.value==='+JSON.stringify(baseUrl+'/v1')),'saved config preserved when guide prefill expires');
  await evaluate('window.api.settings.patch({interviewOptions:{speedMode:"balanced",responseStyle:"outline",silenceMs:1300,autoAnswer:false,prompt:"保留个人偏好",opacity:.63}})');
  await waitFor(()=>evaluate('document.querySelector("[data-interview-setting=speedMode]").value==="balanced"'),'older preferences loaded');
  await click('[data-interview-fast]');
  await waitFor(()=>evaluate('window.api.settings.get().then(s=>s.interviewOptions.speedMode==="fast"&&s.interviewOptions.silenceMs===700&&s.interviewOptions.responseStyle==="spoken"&&s.interviewOptions.autoAnswer)'),'fast recommendation');
  assert.equal(await evaluate('window.api.settings.get().then(s=>s.interviewOptions.prompt)'), '保留个人偏好');
  assert.equal(await evaluate('window.api.settings.get().then(s=>s.interviewOptions.opacity)'),.63);
  assert.equal(await evaluate('document.querySelector(".page-scroll>.panel").hasAttribute("data-developer-contact")'),true);
  await paint();fs.writeFileSync(path.join(root,'artifacts/zhiyue-guide-entry.png'),(await main.webContents.capturePage()).toPNG());
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);finish(0,'Ten-step guide, official link/copy allowlists, retained progress, unsaved example prefills, key focus, DeepSeek text/image tests and Qwen speech test verified with local mocks.');
}).catch(e=>finish(1,e.stack));setTimeout(()=>finish(1,'global timeout'),50000).unref();require('../out/main/index.js');
