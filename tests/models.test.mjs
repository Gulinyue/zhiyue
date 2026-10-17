import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePersonalModelBaseUrl, createDefaultPersonalModelProfile, validatePersonalModelRequest } from '../src/main/models/validation.mjs';
import { OpenAiCompatiblePersonalModelAdapter, OpenAiResponsesPersonalModelAdapter } from '../src/main/models/adapters.mjs';
import { readSseJson } from '../src/main/models/transport.mjs';

const request = { messages: [{ role: 'user', content: [{ type: 'text', text: '你好' }] }] };
const profile = (apiMode = 'chat-completions') => createDefaultPersonalModelProfile('test-model', 'https://models.example.test/v1', true, {}, { webSearchEnabled: apiMode === 'responses' });

function sseResponse(frames, splitAt = 1) {
  const bytes = new TextEncoder().encode(frames);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += splitAt) controller.enqueue(bytes.slice(i, i + splitAt));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}

test('model endpoints normalize completions suffix and reject metadata targets', () => {
  assert.equal(normalizePersonalModelBaseUrl('https://models.example.test/v1/chat/completions'), 'https://models.example.test/v1');
  for (const target of ['http://models.example.test/v1', 'https://169.254.169.254/latest', 'https://user:pass@models.example.test/v1']) {
    assert.throws(() => normalizePersonalModelBaseUrl(target));
  }
});

test('model request limits reject missing users and oversized context', () => {
  assert.throws(() => validatePersonalModelRequest({ messages: [{ role: 'system', content: [{ type: 'text', text: 'only system' }] }] }));
  assert.throws(() => validatePersonalModelRequest({ messages: [{ role: 'user', content: [{ type: 'text', text: 'x'.repeat(200001) }] }] }));
  assert.equal(validatePersonalModelRequest(request).messages.length, 1);
});

test('SSE parser preserves Chinese UTF-8 across single-byte chunks and handles CRLF', async () => {
  const response = sseResponse('data: {"text":"你好"}\r\n\r\ndata: [DONE]\r\n\r\n');
  const values = [];
  for await (const item of readSseJson('custom-api', response.body)) values.push(item);
  assert.deepEqual(values, [{ text: '你好' }]);
});

test('chat completions adapter streams text and usage to the renderer contract', async () => {
  let posted;
  const adapter = new OpenAiCompatiblePersonalModelAdapter({ profile: profile(), apiKey: 'test-key-123', fetchImpl: async (url, options) => {
    posted = { url, options };
    return sseResponse('data: {"choices":[{"delta":{"content":"答案"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\ndata: [DONE]\n\n', 7);
  } });
  const events = [];
  const result = await adapter.stream(request, (event) => events.push(event));
  assert.equal(posted.url, 'https://models.example.test/v1/chat/completions');
  assert.equal(posted.options.redirect, 'error');
  assert.equal(result.text, '答案');
  assert.ok(events.some((event) => event.type === 'delta' && event.delta === '答案'));
  assert.ok(events.some((event) => event.type === 'done'));
});

test('Responses adapter supports non-stream responses with the original message schema', async () => {
  let posted;
  const adapter = new OpenAiResponsesPersonalModelAdapter({ profile: profile('responses'), apiKey: 'test-key-123', fetchImpl: async (url, options) => {
    posted = { url, body: JSON.parse(options.body) };
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: '回答' }] }] });
  } });
  const result = await adapter.generate(request);
  assert.equal(posted.url, 'https://models.example.test/v1/responses');
  assert.equal(posted.body.input[0].role, 'user');
  assert.equal(result.text, '回答');
});

test('canceling a model request aborts its underlying network operation', async () => {
  let signal;
  const controller = new AbortController();
  const adapter = new OpenAiCompatiblePersonalModelAdapter({ profile: profile(), apiKey: 'test-key-123', fetchImpl: (_url, options) => new Promise((_, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  }) });
  const operation = adapter.generate(request, { signal: controller.signal });
  const rejection = assert.rejects(operation, { code: 'PERSONAL_MODEL_ABORTED' });
  controller.abort();
  await rejection;
  assert.equal(signal.aborted, true);
});
