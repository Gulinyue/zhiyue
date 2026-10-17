import { parsePersonalModelImageDataUrl, validatePersonalModelRequest } from './validation.mjs';
import { createPersonalModelStreamAbortScope, assertPersonalModelResponseOk, readSseJson, readResponseJson, PersonalModelAdapterError } from './transport.mjs';

const parts = (content) => typeof content === 'string' ? [{ type: 'text', text: content }] : content;
export function nativeRequest(profile, request, stream = true) {
  const systems = request.messages.filter((m) => m.role === 'system').flatMap((m) => parts(m.content)).map((p) => p.text).join('\n\n');
  const messages = request.messages.filter((m) => m.role !== 'system');
  if (profile.apiMode === 'anthropic') return {
    model: profile.model, max_tokens: request.maxTokens ?? 4096, stream,
    ...(systems ? { system: systems } : {}),
    messages: messages.map((m) => ({ role: m.role, content: parts(m.content).map((p) => {
      if (p.type === 'text') return { type: 'text', text: p.text };
      const image = parsePersonalModelImageDataUrl(p.imageUrl);
      return { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64Data } };
    }) })),
  };
  return {
    ...(systems ? { systemInstruction: { parts: [{ text: systems }] } } : {}),
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: parts(m.content).map((p) => {
      if (p.type === 'text') return { text: p.text };
      const image = parsePersonalModelImageDataUrl(p.imageUrl);
      return { inlineData: { mimeType: image.mimeType, data: image.base64Data } };
    }) })),
    ...(request.maxTokens ? { generationConfig: { maxOutputTokens: request.maxTokens } } : {}),
  };
}
export function modelHeaders(profile, apiKey) {
  return {
    'Content-Type': 'application/json',
    ...(profile.apiMode === 'anthropic' ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : profile.apiMode === 'gemini' ? { 'x-goog-api-key': apiKey }
      : profile.providerId === 'azure' ? { 'api-key': apiKey } : { Authorization: `Bearer ${apiKey}` }),
  };
}
export class NativeModelAdapter {
  constructor(options) { Object.assign(this, options); this.fetchImpl ??= globalThis.fetch.bind(globalThis); }
  async stream(raw, onEvent, options) {
    const request = validatePersonalModelRequest(raw);
    const scope = createPersonalModelStreamAbortScope('custom-api', options);
    const anthropic = this.profile.apiMode === 'anthropic';
    const endpoint = anthropic ? `${this.profile.baseUrl}/messages` : `${this.profile.baseUrl}/models/${encodeURIComponent(this.profile.model.replace(/^models\//, ''))}:streamGenerateContent?alt=sse`;
    let text = '', completed = false;
    try {
      const response = await this.fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal: scope.signal, headers: modelHeaders(this.profile, this.apiKey), body: JSON.stringify(nativeRequest(this.profile, request)) });
      scope.markResponse(); assertPersonalModelResponseOk('custom-api', response);
      for await (const item of readSseJson('custom-api', response.body, scope.markActivity)) {
        if (item.error || item.type === 'error' || item.promptFeedback?.blockReason) throw new Error('模型服务拒绝了请求');
        const candidate = item.candidates?.[0];
        if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) throw new Error('模型服务未能完成回答');
        const delta = anthropic ? (item.delta?.type === 'text_delta' ? item.delta.text : '') : (candidate?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
        if (delta) { scope.markVisibleContent(); text += delta; if (text.length > 512000) throw new Error('回答过长'); onEvent({ type: 'delta', delta }); }
        if (anthropic ? item.type === 'message_stop' : !!candidate?.finishReason) completed = true;
      }
      scope.signal.throwIfAborted();
      if (!text || !completed) throw new PersonalModelAdapterError('PERSONAL_MODEL_UPSTREAM_UNAVAILABLE', '模型流未完整结束，请重试', 'custom-api');
      const result = { provider: 'custom-api', model: this.profile.model, text };
      onEvent({ type: 'done', result }); return result;
    } catch (error) { return scope.mapError(error); } finally { scope.cleanup(); }
  }
  generate(request, options) { return this.stream(request, () => {}, options); }
  testConnection(options) { return this.generate({ messages: [{ role: 'user', content: 'Reply with OK.' }] }, options); }
}

export async function discoverModels(profile, apiKey, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const endpoint = `${profile.baseUrl}/models`;
  const response = await fetchImpl(endpoint, { redirect: 'error', headers: modelHeaders(profile, apiKey), signal: AbortSignal.timeout(20000) });
  assertPersonalModelResponseOk('custom-api', response);
  const data = await readResponseJson('custom-api', response);
  const rows = data.data || data.models || [];
  if (!Array.isArray(rows)) throw new Error('服务商没有返回模型列表，请手动填写模型 ID');
  return rows.filter((m) => profile.providerId !== 'chatgpt' || m.visibility === 'list').filter((m) => profile.apiMode !== 'gemini' || !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')).slice(0, 1000).map((m) => ({ id: m.slug || m.id || m.name?.replace(/^models\//, ''), name: m.display_name || m.displayName || m.display_name || m.id || m.name })).filter((m) => typeof m.id === 'string' && m.id.length <= 200);
}
