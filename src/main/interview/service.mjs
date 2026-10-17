// 知跃 · Developed by gulinyue.
import Store from 'electron-store';
import { safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { PersonalModelCredentialVault } from '../models/credentials.mjs';
import { normalizeSpeechProfile, speechRequiresKey, transcribeAudio } from './transcription.mjs';
import { normalizePersonalModelBaseUrl } from '../models/validation.mjs';
import { isSpeechModel, inferSpeechProvider } from '../../shared/speech-providers.mjs';
const store = new Store({ name: 'speech-service', defaults: {}, clearInvalidConfig: true });
const vault = new PersonalModelCredentialVault(safeStorage, { get: () => store.get('credentials'), set: (value) => store.set('credentials', value) });
const validation = { allowInsecureLocalhost: true };
let session = null;
let connectionOperation = false;
export function speechConnection() {
  let profile = null;
  try { profile = normalizeSpeechProfile(store.get('profile')); } catch {}
  return { profile, credential: profile ? vault.list(profile.baseUrl, validation, 'interview')[0] || null : null };
}
export function saveSpeechConnection(raw) {
  if (session) throw new Error('请先结束面试，再修改语音服务。');
  if (connectionOperation) throw new Error('语音连接正在验证，请稍候。');
  return persistSpeechConnection(raw);
}
function persistSpeechConnection(raw) {
  const profile = normalizeSpeechProfile(raw);
  keyFor(raw, profile.baseUrl);
  if (raw.apiKey?.trim()) vault.save({ apiKey: raw.apiKey }, { slot: 'interview', baseUrl: profile.baseUrl, urlValidation: validation });
  if (speechRequiresKey(profile) && !vault.load(profile.baseUrl, validation, 'interview')) throw new Error('请填写此语音服务的 API Key。');
  store.set('profile', profile);
  return speechConnection();
}
export function removeSpeechConnection() { if (session || connectionOperation) throw new Error('请先结束面试或等待连接验证完成。'); vault.remove('interview'); store.delete('profile'); return speechConnection(); }
function keyFor(raw, baseUrl) {
  if (raw?.apiKey !== undefined && typeof raw.apiKey !== 'string') throw new Error('API Key 格式无效。');
  const key = raw?.apiKey?.trim() || vault.load(baseUrl, validation, 'interview') || '';
  if (key && (key.length < 8 || key.length > 512 || /\s|[\u0000-\u001f]/.test(key))) throw new Error('API Key 格式无效。');
  if (!key && speechRequiresKey({ baseUrl })) throw new Error('请填写此语音服务的 API Key。');
  return key;
}
export async function discoverSpeechModels(raw) {
  const baseUrl = normalizePersonalModelBaseUrl(typeof raw?.baseUrl === 'string' ? raw.baseUrl.trim().replace(/\/audio\/transcriptions\/?$/i, '') : '', validation);
  const key = keyFor(raw, baseUrl);
  try {
  const response = await fetch(`${baseUrl}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '模型列表鉴权失败，请检查语音 API Key。' : '此服务未提供模型列表，请使用预设或手动填写模型 ID。');
  let text = '', size = 0; const decoder = new TextDecoder();
  for await (const chunk of response.body) { size += chunk.byteLength; if (size > 1024 * 1024) throw new Error('模型列表过大。'); text += decoder.decode(chunk, { stream: true }); }
  const data = JSON.parse(text + decoder.decode()), rows = data.data || data.models;
  if (!Array.isArray(rows)) throw new Error('服务未返回有效的模型列表，请手动填写。');
  const providerId = raw.providerId || inferSpeechProvider(baseUrl);
  const choices = rows.slice(0, 1000).filter((value) => typeof value === 'string' || (value && typeof value === 'object')).map((value) => ({ id: typeof value === 'string' ? value : value.id || value.name, name: typeof value === 'string' ? value : value.display_name || value.name || value.id })).filter((value) => typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200);
  return [...new Map(choices.filter((value) => ['local', 'custom'].includes(providerId) || isSpeechModel(value.id)).map((value) => [value.id, { id: value.id, name: typeof value.name === 'string' ? value.name.slice(0, 200) : value.id }])).values()];
  } catch (error) {
    if (error instanceof Error && /^(模型列表|此服务未提供|服务未返回)/.test(error.message)) throw error;
    throw new Error('无法获取模型列表，请检查网络，或使用预设及手动填写模型 ID。');
  }
}
export async function testSpeechConnection(raw) {
  if (session || connectionOperation) throw new Error('请先结束面试或等待连接验证完成。');
  const profile = normalizeSpeechProfile(raw), apiKey = keyFor(raw, profile.baseUrl);
  connectionOperation = true;
  const start = Date.now();
  try {
    // A bounded synthetic tone tests the actual upload/response path, without accessing any audio device.
    const audio = new Uint8Array(16000), view = new DataView(audio.buffer);
    for (let i = 0; i < audio.length / 2; i++) view.setInt16(i * 2, Math.round(Math.sin(i * Math.PI * 2 * 440 / 16000) * 1000), true);
    await transcribeAudio(profile, apiKey, audio, { timeoutMs: 20000 });
    const connection = persistSpeechConnection(raw);
    return { connection, latencyMs: Date.now() - start };
  } finally { connectionOperation = false; }
}
export function startInterview() {
  if (process.platform !== 'win32') throw new Error('当前实时面试的系统收音支持 Windows。');
  if (session) throw new Error('面试已在进行中。');
  if (connectionOperation) throw new Error('语音连接正在验证，请稍候。');
  const profile = normalizeSpeechProfile(store.get('profile'));
  const apiKey = vault.load(profile.baseUrl, validation, 'interview');
  if (speechRequiresKey(profile) && !apiKey) throw new Error('请先配置语音服务的 API Key。');
  session = { id: randomUUID(), profile, apiKey, controller: new AbortController(), sequence: -1, busy: false };
  return { sessionId: session.id, sampleRate: 16000 };
}
export function interviewIsActive() { return !!session; }
export function interviewHasSession(id) { return !!session && session.id === id; }
export function stopInterview(sessionId) { if (sessionId && session?.id !== sessionId) return; const old = session; session = null; old?.controller.abort(); }
export async function transcribeInterview(raw) {
  const current = session;
  if (!current || raw?.sessionId !== current.id) throw new Error('面试会话已结束，请重新开始。');
  if (current.busy || !Number.isSafeInteger(raw.sequence) || raw.sequence <= current.sequence) throw new Error('语音片段顺序无效或转写队列繁忙。');
  current.busy = true; current.sequence = raw.sequence;
  try {
    const text = await transcribeAudio(current.profile, current.apiKey, raw.audio, { signal: current.controller.signal });
    if (session !== current) throw new Error('面试会话已结束。');
    return { text };
  } finally { current.busy = false; }
}
