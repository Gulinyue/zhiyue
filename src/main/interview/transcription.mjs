// 知跃 · Developed by gulinyue. Audio is held in memory and never written to disk.
import { normalizePersonalModelBaseUrl, isLoopbackHostname } from '../models/validation.mjs';
export const AUDIO_RATE = 16000;
export const MAX_AUDIO_BYTES = AUDIO_RATE * 2 * 21;
export function normalizeSpeechProfile(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('请先配置语音转写服务。');
  const base = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim().replace(/\/audio\/transcriptions\/?$/i, '') : '';
  const baseUrl = normalizePersonalModelBaseUrl(base, { allowInsecureLocalhost: true });
  const model = typeof raw.model === 'string' ? raw.model.trim() : '';
  if (!model || model.length > 200 || /[\s\u0000-\u001f]/u.test(model)) throw new Error('请填写有效的语音模型 ID。');
  const language = typeof raw.language === 'string' && /^[a-z]{2,3}$/.test(raw.language) ? raw.language : '';
  return { baseUrl, model, language, prompt: typeof raw.prompt === 'string' ? raw.prompt.replaceAll('\0', '').slice(0, 1000) : '' };
}
export function speechRequiresKey(profile) { return !isLoopbackHostname(new URL(profile.baseUrl).hostname); }
export function pcmToWav(raw) {
  if (!(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) throw new Error('无效的音频数据。');
  const pcm = raw instanceof ArrayBuffer ? Buffer.from(raw) : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (pcm.length < 3200 || pcm.length > MAX_AUDIO_BYTES || pcm.length % 2) throw new Error('语音片段长度无效。');
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(AUDIO_RATE, 24); header.writeUInt32LE(AUDIO_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export async function transcribeAudio(rawProfile, apiKey, pcm, { signal, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  const profile = normalizeSpeechProfile(rawProfile);
  if (speechRequiresKey(profile) && !apiKey) throw new Error('语音服务尚未配置 API Key。');
  const wav = pcmToWav(pcm);
  const body = new FormData();
  body.append('file', new Blob([wav], { type: 'audio/wav' }), 'question.wav'); body.append('model', profile.model); body.append('response_format', 'json');
  if (profile.language) body.append('language', profile.language);
  if (profile.prompt) body.append('prompt', profile.prompt);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${profile.baseUrl}/audio/transcriptions`, { method: 'POST', headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, body, redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '语音服务鉴权失败，请检查 API Key 和权限。' : response.status === 429 ? '语音服务限流或额度不足，请稍后重试。' : `语音转写失败（HTTP ${response.status}），请检查服务与模型配置。`);
    let size = 0, result = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) { size += chunk.byteLength; if (size > 128 * 1024) { controller.abort(); throw new Error('语音服务返回内容过大。'); } result += decoder.decode(chunk, { stream: true }); }
    result += decoder.decode();
    const parsed = JSON.parse(result);
    if (typeof parsed.text !== 'string' || parsed.text.length > 12000) throw new Error('语音服务返回了无效的转写结果。');
    return parsed.text.trim();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? '语音转写已停止。' : '语音转写超时，请检查网络或切换服务。');
    if (error instanceof Error && /语音/.test(error.message)) throw error;
    throw new Error('无法连接语音服务，请检查地址、网络和模型配置。');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}
