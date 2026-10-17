// 知跃 · Developed by gulinyue.
import Store from 'electron-store';
import { safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { PersonalModelCredentialVault } from '../models/credentials.mjs';
import { normalizeSpeechProfile, speechRequiresKey, transcribeAudio } from './transcription.mjs';
const store = new Store({ name: 'speech-service', defaults: {}, clearInvalidConfig: true });
const vault = new PersonalModelCredentialVault(safeStorage, { get: () => store.get('credentials'), set: (value) => store.set('credentials', value) });
const validation = { allowInsecureLocalhost: true };
let session = null;
export function speechConnection() {
  let profile = null;
  try { profile = normalizeSpeechProfile(store.get('profile')); } catch {}
  return { profile, credential: profile ? vault.list(profile.baseUrl, validation, 'interview')[0] || null : null };
}
export function saveSpeechConnection(raw) {
  if (session) throw new Error('请先结束面试，再修改语音服务。');
  const profile = normalizeSpeechProfile(raw);
  if (raw.apiKey?.trim()) vault.save({ apiKey: raw.apiKey }, { slot: 'interview', baseUrl: profile.baseUrl, urlValidation: validation });
  if (speechRequiresKey(profile) && !vault.load(profile.baseUrl, validation, 'interview')) throw new Error('请填写此语音服务的 API Key。');
  store.set('profile', profile);
  return speechConnection();
}
export function removeSpeechConnection() { stopInterview(); vault.remove('interview'); store.delete('profile'); return speechConnection(); }
export function startInterview() {
  if (process.platform !== 'win32') throw new Error('当前实时面试的系统收音支持 Windows。');
  if (session) throw new Error('面试已在进行中。');
  const profile = normalizeSpeechProfile(store.get('profile'));
  const apiKey = vault.load(profile.baseUrl, validation, 'interview');
  if (speechRequiresKey(profile) && !apiKey) throw new Error('请先配置语音服务的 API Key。');
  session = { id: randomUUID(), profile, apiKey, controller: new AbortController(), sequence: -1, busy: false };
  return { sessionId: session.id, sampleRate: 16000 };
}
export function interviewIsActive() { return !!session; }
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
