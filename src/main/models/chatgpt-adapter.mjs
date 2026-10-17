import { validatePersonalModelRequest } from './validation.mjs';
import { createPersonalModelStreamAbortScope, assertPersonalModelResponseOk, readSseJson, PersonalModelAdapterError } from './transport.mjs';

export function chatgptRequest(model, raw) {
  const request = validatePersonalModelRequest(raw);
  const content = (m) => typeof m.content === 'string' ? m.content : m.content.map((p) => p.type === 'text' ? { type: m.role === 'assistant' ? 'output_text' : 'input_text', text: p.text } : { type: 'input_image', image_url: p.imageUrl });
  return { model, store: false, stream: true,
    instructions: request.messages.filter((m) => m.role === 'system').map((m) => typeof m.content === 'string' ? m.content : m.content.map((p) => p.text).join('\n')).join('\n\n'),
    input: request.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: content(m) })),
  };
}
export class ChatGptPlanAdapter {
  constructor({ profile, auth, fetchImpl = globalThis.fetch.bind(globalThis) }) {
    if (profile.providerId !== 'chatgpt' || profile.baseUrl !== 'https://api.openai.com/v1' || profile.apiMode !== 'responses') throw new Error('ChatGPT 授权仅能用于官方端点');
    Object.assign(this, { profile, auth, fetchImpl });
  }
  async stream(request, onEvent, options) {
    const body = chatgptRequest(this.profile.model, request);
    const signals = [options?.signal, this.auth.sessionSignal?.()].filter(Boolean);
    const scope = createPersonalModelStreamAbortScope('custom-api', { ...options, ...(signals.length ? { signal: AbortSignal.any(signals) } : {}) });
    let text = '', completed = false;
    try {
      const token = await this.auth.accessToken(); scope.signal.throwIfAborted();
      const response = await this.fetchImpl('https://api.openai.com/v1/responses', { method: 'POST', redirect: 'error', signal: scope.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body) });
      scope.markResponse(); assertPersonalModelResponseOk('custom-api', response);
      for await (const event of readSseJson('custom-api', response.body, scope.markActivity)) {
        if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) {
          const code = event.response?.error?.code || event.error?.code || event.code;
          const limited = ['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable'].includes(code);
          throw new PersonalModelAdapterError(limited ? 'CHATGPT_USAGE_LIMIT' : 'CHATGPT_RESPONSE_FAILED', limited ? 'ChatGPT 套餐用量暂不可用，请在连接设置中查看用量' : 'ChatGPT 未完成回答，请检查账号授权后重试', 'custom-api');
        }
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          scope.markVisibleContent(); text += event.delta;
          if (text.length > 512000) throw new Error('回答过长');
          onEvent({ type: 'delta', delta: event.delta });
        }
        if (event.type === 'response.completed' && event.response?.status === 'completed') completed = true;
      }
      scope.signal.throwIfAborted();
      if (!completed || !text) throw new PersonalModelAdapterError('CHATGPT_STREAM_INTERRUPTED', 'ChatGPT 回答流中断，请重试', 'custom-api');
      const result = { provider: 'custom-api', model: this.profile.model, text };
      onEvent({ type: 'done', result }); return result;
    } catch (error) {
      if (error.message?.startsWith('ChatGPT：')) throw error;
      return scope.mapError(error);
    } finally { scope.cleanup(); }
  }
  testConnection(options) { return this.stream({ messages: [{ role: 'user', content: 'Reply with OK.' }] }, () => {}, options); }
}
