import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPersonalModelProfile } from '../src/main/models/validation.mjs';
import { createPersonalModelAdapter } from '../src/main/models/adapters.mjs';
import { discoverModels, modelHeaders } from '../src/main/models/native-adapters.mjs';
import { ChatGptPlanAdapter, chatgptRequest } from '../src/main/models/chatgpt-adapter.mjs';
import { MODEL_PROVIDERS } from '../src/shared/model-providers.mjs';
import { isHotkeyAllowedForWorkMode } from '../src/main/hotkeys/modes.mjs';
import { DEFAULT_HOTKEYS } from '../src/main/store/default-settings.mjs';
const image = 'data:image/png;base64,aGVsbG8=';
const request = { messages: [{ role: 'system', content: '中文回答' }, { role: 'user', content: [{ type: 'text', text: '图片是什么' }, { type: 'image_url', imageUrl: image }] }] };
const profile = (id, mode) => createDefaultPersonalModelProfile('test-model', 'https://example.com/v1', true, {}, { providerId: id, apiMode: mode }, 'screenshot');
const sse = (items) => new Response(items.map((item) => 'data: ' + JSON.stringify(item) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });

test('provider identity and explicit protocol survive profile validation independently of search', () => {
  assert.equal(profile('openai', 'responses').apiMode, 'responses');
  assert.equal(profile('google', 'gemini').providerId, 'google');
  assert.throws(() => profile('unknown', 'responses'));
  assert.throws(() => profile('chatgpt', 'responses'));
  assert.equal(new Set(MODEL_PROVIDERS.map((p) => p.id)).size, MODEL_PROVIDERS.length);
});
test('Claude uses native headers, system prompt, base64 images and stream termination', async () => {
  let sent;
  const adapter = createPersonalModelAdapter({ profile: profile('anthropic', 'anthropic'), apiKey: 'test-key-only', fetchImpl: async (url, options) => {
    sent = { url, ...options, body: JSON.parse(options.body) };
    return sse([{ type: 'content_block_delta', delta: { type: 'text_delta', text: '图片回答' } }, { type: 'message_stop' }]);
  } });
  assert.equal((await adapter.stream(request, () => {})).text, '图片回答');
  assert.equal(sent.url, 'https://example.com/v1/messages');
  assert.equal(sent.headers['x-api-key'], 'test-key-only');
  assert.equal(sent.headers.Authorization, undefined);
  assert.equal(sent.body.system, '中文回答');
  assert.equal(sent.body.messages[0].content[1].source.data, 'aGVsbG8=');
});
test('Gemini maps assistant roles and image parts to the native stream API', async () => {
  let sent;
  const adapter = createPersonalModelAdapter({ profile: profile('google', 'gemini'), apiKey: 'test-key-only', fetchImpl: async (url, options) => {
    sent = { url, ...options, body: JSON.parse(options.body) };
    return sse([{ candidates: [{ content: { parts: [{ thought: true, text: 'private' }, { text: '回答' }] }, finishReason: 'STOP' }] }]);
  } });
  assert.equal((await adapter.stream(request, () => {})).text, '回答');
  assert.match(sent.url, /\/models\/test-model:streamGenerateContent\?alt=sse$/);
  assert.equal(sent.headers['x-goog-api-key'], 'test-key-only');
  assert.equal(sent.body.systemInstruction.parts[0].text, '中文回答');
  assert.equal(sent.body.contents[0].parts[1].inlineData.mimeType, 'image/png');
});
test('native adapters reject interrupted or blocked responses', async () => {
  for (const item of [{ candidates: [{ content: { parts: [{ text: 'partial' }] } }] }, { candidates: [{ finishReason: 'SAFETY' }] }]) {
    const adapter = createPersonalModelAdapter({ profile: profile('google', 'gemini'), apiKey: 'test-key-only', fetchImpl: async () => sse([item]) });
    await assert.rejects(adapter.stream(request, () => {}));
  }
});
test('Azure uses its API-key header and OAuth model discovery uses account visibility and slugs', async () => {
  assert.equal(modelHeaders(profile('azure', 'responses'), 'key')['api-key'], 'key');
  const models = await discoverModels({ baseUrl: 'https://api.openai.com/v1', providerId: 'chatgpt' }, 'oauth-test-token', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/models');
    assert.equal(options.headers.Authorization, 'Bearer oauth-test-token');
    assert.equal(options.redirect, 'error');
    return Response.json({ models: [{ slug: 'visible', display_name: 'Visible model', visibility: 'list' }, { slug: 'hidden', visibility: 'hidden' }] });
  });
  assert.deepEqual(models, [{ id: 'visible', name: 'Visible model' }]);
});
test('ChatGPT plan inference pins the public endpoint and omits unsupported API parameters', async () => {
  const body = chatgptRequest('chosen-model', { ...request, maxTokens: 1000, temperature: .5 });
  assert.equal(body.store, false); assert.equal(body.stream, true); assert.equal(body.instructions, '中文回答');
  assert.equal(body.input[0].role, 'user'); assert.equal(body.input[0].content[1].type, 'input_image');
  assert.equal('temperature' in body, false); assert.equal('max_output_tokens' in body, false);
  const adapter = new ChatGptPlanAdapter({ profile: { providerId: 'chatgpt', apiMode: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'chosen-model' }, auth: { accessToken: async () => 'oauth' }, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.headers.Authorization, 'Bearer oauth');
    return sse([{ type: 'response.output_text.delta', delta: '回答' }, { type: 'response.completed', response: { status: 'completed' } }]);
  } });
  assert.equal((await adapter.stream(request, () => {})).text, '回答');
  adapter.fetchImpl = async () => sse([{ type: 'response.output_text.delta', delta: 'partial' }]);
  await assert.rejects(adapter.stream(request, () => {}), /中断/);
  adapter.fetchImpl = async () => sse([{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }]);
  await assert.rejects(adapter.stream(request, () => {}), /用量/);
});
test('window recovery, movement and content scrolling remain allowed across all work modes', () => {
  for (const mode of ['idle', 'exam', 'interview']) {
    for (const action of ['window:hide', 'window:show', 'window:moveRight', 'window:opacityDown', 'window:toggleMouseThrough', 'answer:scrollUp', 'answer:scrollRight']) {
      assert.ok(DEFAULT_HOTKEYS[action]); assert.equal(isHotkeyAllowedForWorkMode(mode, action), true, `${mode}: ${action}`);
    }
  }
});
