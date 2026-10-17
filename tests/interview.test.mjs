import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceSegmenter, TranscriptionQueue, encodePcm16 } from '../src/shared/interview-audio.mjs';
import { normalizeInterviewOptions } from '../src/shared/interview-options.mjs';
import { normalizeSpeechProfile, pcmToWav, transcribeAudio } from '../src/main/interview/transcription.mjs';
import { buildLocalRequest } from '../src/renderer/local/requests.mjs';
const frame = (volume = 0) => new Float32Array(1600).fill(volume);
test('voice gate ignores silence and short clicks, then emits a complete question after a pause', () => {
  const segments = [], gate = new VoiceSegmenter({ onSegment: (value) => segments.push(value), silenceMs: 600 });
  for (let i = 0; i < 10; i++) gate.push(frame());
  gate.push(frame(.1)); for (let i = 0; i < 7; i++) gate.push(frame());
  assert.equal(segments.length, 0);
  for (let i = 0; i < 8; i++) gate.push(frame(.1));
  for (let i = 0; i < 5; i++) gate.push(frame());
  assert.equal(segments.length, 0); gate.push(frame());
  assert.equal(segments.length, 1); assert.equal(segments[0].final, true);
  assert.ok(segments[0].audio.byteLength > 16000);
});
test('long speech is split without answering prematurely; trailing silence does not call ASR again', () => {
  const segments = [], gate = new VoiceSegmenter({ onSegment: (value) => segments.push(value), silenceMs: 600, maxSegmentMs: 1000 });
  for (let i = 0; i < 10; i++) gate.push(frame(.1));
  assert.equal(segments[0].final, false);
  for (let i = 0; i < 6; i++) gate.push(frame());
  assert.equal(segments[1].final, true); assert.equal(segments[1].audio.byteLength, 0);
  gate.push(frame(.1)); gate.reset(); for (let i = 0; i < 10; i++) gate.push(frame());
  assert.equal(segments.length, 2);
});
test('ASR queue preserves order, merges a long question, and ignores results after stop', async () => {
  const seen = [], calls = [];
  const pipeline = new TranscriptionQueue({ transcribe: async () => { calls.push(1); return calls.length === 1 ? '解释 Redis' : '的缓存策略？'; }, onText: (text, final) => seen.push({ text, final }), onError: assert.fail });
  pipeline.push({ audio: new Uint8Array(3200), final: false }); pipeline.push({ audio: new Uint8Array(3200), final: true });
  await pipeline.tail;
  assert.deepEqual(seen.at(-1), { text: '解释 Redis 的缓存策略？', final: true });
  let resolve;
  const stale = new TranscriptionQueue({ transcribe: () => new Promise((done) => resolve = done), onText: assert.fail, onError: assert.fail });
  stale.push({ audio: new Uint8Array(3200), final: true }); await Promise.resolve(); stale.stop(); resolve('迟到结果'); await stale.tail;
});
test('ASR backlog is bounded and cannot continue recording silently after overload', async () => {
  let error;
  const pipeline = new TranscriptionQueue({ transcribe: async () => '', onText: assert.fail, onError: (value) => error = value });
  for (let i = 0; i < 5; i++) pipeline.push({ audio: new Uint8Array(3200), final: true });
  assert.equal(pipeline.active, false); assert.match(error.message, /跟不上/); await pipeline.tail;
});
test('WAV frames are mono little-endian PCM, bounded and not arbitrary file data', () => {
  const pcm = encodePcm16(new Float32Array(1600).fill(.5));
  const wav = pcmToWav(pcm); assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), 16000); assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(40), pcm.length); assert.equal(wav.readInt16LE(44), 16384);
  for (const value of ['file:///private.wav', new Uint8Array(3), new Uint8Array(700000)]) assert.throws(() => pcmToWav(value));
});
test('speech settings reject metadata and credentials in URLs, bind to explicit model and clamp VAD', () => {
  assert.equal(normalizeSpeechProfile({ baseUrl: 'http://127.0.0.1:8000/v1/audio/transcriptions', model: 'whisper-1' }).baseUrl, 'http://127.0.0.1:8000/v1');
  for (const baseUrl of ['http://169.254.169.254/latest', 'https://key:secret@example.com/v1', 'http://example.com/v1']) assert.throws(() => normalizeSpeechProfile({ baseUrl, model: 'test' }));
  const options = normalizeInterviewOptions({ silenceMs: 1, threshold: Infinity, prompt: 'x'.repeat(5000) }); assert.equal(options.silenceMs, 500); assert.equal(options.threshold, .008); assert.equal(options.prompt.length, 4000);
});
test('transcription posts in-memory WAV only to the selected endpoint and disallows redirects', async () => {
  const text = await transcribeAudio({ baseUrl: 'https://speech.example.test/v1', model: 'test-speech', language: 'zh', prompt: 'Redis' }, 'mock-test-key', new Uint8Array(3200), { fetchImpl: async (url, init) => {
    assert.equal(url, 'https://speech.example.test/v1/audio/transcriptions'); assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, 'Bearer mock-test-key');
    assert.equal(init.body.get('model'), 'test-speech'); assert.equal(init.body.get('language'), 'zh'); assert.equal(init.body.get('prompt'), 'Redis'); assert.equal(init.body.get('file').name, 'question.wav');
    return Response.json({ text: '请解释 Redis。' });
  } });
  assert.equal(text, '请解释 Redis。');
  await assert.rejects(transcribeAudio({ baseUrl: 'https://speech.example.test/v1', model: 'test' }, '', new Uint8Array(3200)), /API Key/);
});
test('speech errors do not expose upstream keys and abort is bounded', async () => {
  await assert.rejects(transcribeAudio({ baseUrl: 'http://127.0.0.1:8000/v1', model: 'test' }, '', new Uint8Array(3200), { fetchImpl: async () => new Response('secret-key-should-not-escape', { status: 401 }) }), (error) => /鉴权/.test(error.message) && !error.message.includes('secret-key'));
  await assert.rejects(transcribeAudio({ baseUrl: 'http://127.0.0.1:8000/v1', model: 'test' }, '', new Uint8Array(3200), { timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) }), /超时/);
});
test('live interview prompts answer the question rather than simulate an interviewer', () => {
  const result = buildLocalRequest({ question: '如何做缓存？', mode: 'interview', documents: [], prompt: '回答语言：中文' });
  assert.match(result.messages[0].content, /可以口述/); assert.match(result.messages[0].content, /不编造用户经历/); assert.doesNotMatch(result.messages[0].content, /每次只提出一个问题/);
});
import { SPEECH_PROVIDERS, inferSpeechProvider, isSpeechModel, speechModelChoices } from '../src/shared/speech-providers.mjs';
test('speech presets migrate old profiles and keep recognition candidates separate from chat models', () => {
  for (const p of SPEECH_PROVIDERS.filter(p => !['custom', 'local'].includes(p.id))) {
    assert.equal(inferSpeechProvider(p.baseUrl), p.id);
    assert.equal(normalizeSpeechProfile({ baseUrl: p.baseUrl, model: speechModelChoices(p.id)[0].id }).providerId, p.id);
  }
  assert.equal(inferSpeechProvider('http://127.0.0.1:8000/v1'), 'local');
  assert.equal(inferSpeechProvider('https://custom.example/v1'), 'custom');
  assert.equal(isSpeechModel('gpt-4o-mini-transcribe'), true); assert.equal(isSpeechModel('FunAudioLLM/SenseVoiceSmall'), true); assert.equal(isSpeechModel('gpt-4o'), false);
  const opts = normalizeInterviewOptions({ opacity: 1, showShortcutHints: false }); assert.equal(opts.opacity, .85); assert.equal(opts.showShortcutHints, false);
});
test('SiliconFlow receives only its documented file/model fields', async () => {
  await transcribeAudio({ providerId: 'siliconflow', baseUrl: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/SenseVoiceSmall', language: 'zh', prompt: 'Redis' }, 'mock-test-key', new Uint8Array(3200), { fetchImpl: async (_url, init) => {
    assert.deepEqual([...init.body.keys()].sort(), ['file', 'model']); return Response.json({ text: '测试' });
  } });
});

test('Qwen ASR sends bounded WAV inline to audio chat with language and context', async () => {
  const profile = { providerId: 'dashscope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen3-asr-flash', language: 'zh', prompt: 'Redis、知跃' };
  const result = await transcribeAudio(profile, 'mock-qwen-key', new Uint8Array(3200), { fetchImpl: async (url, init) => {
    assert.equal(url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer mock-qwen-key'); assert.equal(init.headers['Content-Type'], 'application/json'); assert.equal(init.redirect, 'error');
    const body = JSON.parse(init.body); assert.equal(body.stream, false); assert.equal(body.messages[0].role, 'system'); assert.equal(body.messages[0].content, profile.prompt);
    assert.deepEqual(body.asr_options, { enable_itn: false, language: 'zh' });
    const audio = body.messages[1].content[0]; assert.equal(audio.type, 'input_audio');
    assert.ok(audio.input_audio.data.startsWith('data:audio/wav;base64,'));
    const wav = Buffer.from(audio.input_audio.data.split(',')[1], 'base64'); assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), 16000);
    assert.equal(wav.length, 3244); assert.equal(body.file, undefined);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '解释 Redis。' } }] });
  } }); assert.equal(result, '解释 Redis。');
});
test('Qwen auto language omits language/context and rejects interrupted or malformed results', async () => {
  const profile = { providerId: 'dashscope-intl', baseUrl: 'https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1', model: 'qwen3-asr-flash', language: '' };
  for (const choice of [{ finish_reason: 'length', message: { content: 'partial' } }, { finish_reason: 'stop', message: { content: null } }, { finish_reason: 'stop', message: { content: 'x'.repeat(12001) } }]) {
    await assert.rejects(transcribeAudio(profile, 'mock-qwen-key', new Uint8Array(3200), { fetchImpl: async (url, init) => {
      assert.equal(url, profile.baseUrl + '/chat/completions');const body = JSON.parse(init.body);assert.deepEqual(body.asr_options, { enable_itn: false }); assert.equal(body.messages.length, 1);
      return Response.json({ choices: [choice] });
    } }), /语音/);
  }
});
test('GLM ASR uses its native multipart fields and automatic language detection', async () => {
  const result = await transcribeAudio({ providerId: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', model: 'glm-asr-2512', language: 'zh', prompt: '上文提到了 Redis' }, 'mock-glm-key', new Uint8Array(3200), { fetchImpl: async (url, init) => {
    assert.equal(url, 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions'); assert.equal(init.headers.Authorization, 'Bearer mock-glm-key');
    assert.deepEqual([...init.body.keys()].sort(), ['file', 'model', 'prompt', 'stream']); assert.equal(init.body.get('stream'), 'false'); assert.equal(init.body.get('prompt'), '上文提到了 Redis');
    return Response.json({ text: '这是转写。' });
  } }); assert.equal(result, '这是转写。');
});
test('domestic discovery excludes asynchronous Qwen models and recognizes workspace region', () => {
  assert.equal(inferSpeechProvider('https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'), 'dashscope');
  assert.equal(inferSpeechProvider('https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'), 'dashscope-intl');
  assert.equal(inferSpeechProvider('https://workspace.cn-beijing.maas.aliyuncs.com.attacker.test/compatible-mode/v1'), 'custom');
  assert.equal(isSpeechModel('qwen3-asr-flash', 'dashscope'), true); assert.equal(isSpeechModel('qwen3-asr-flash-2025-09-08', 'dashscope'), true);
  for (const model of ['qwen3-asr-flash-filetrans', 'qwen3-asr-flash-realtime', 'qwen-plus', 'whisper-1']) assert.equal(isSpeechModel(model, 'dashscope'), false);
  assert.equal(isSpeechModel('glm-asr-2512', 'zhipu'), true); assert.equal(isSpeechModel('glm-5', 'zhipu'), false);
});
