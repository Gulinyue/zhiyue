import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocalModelRunInput } from '../src/main/models/local-request.mjs';
import { normalizeConversation, normalizeWorkspace } from '../src/main/store/workspace-schema.mjs';
import { buildLocalRequest, selectKnowledge, chooseModelSlot } from '../src/renderer/local/requests.mjs';
import { LOCAL_ACCOUNT, LOCAL_SNAPSHOT } from '../src/shared/local-profile.mjs';

test('local requests accept a model invocation without a cloud entitlement', () => {
  const request = { requestId: 'local-request-123', taskKind: 'interview', slot: 'interview', request: { messages: [{ role: 'user', content: '你好' }] } };
  assert.equal(normalizeLocalModelRunInput(request).slot, 'interview');
  assert.throws(() => normalizeLocalModelRunInput({ ...request, entitlement: 'old-cloud-token' }));
  assert.throws(() => normalizeLocalModelRunInput({ ...request, slot: 'managed' }));
  assert.equal(LOCAL_SNAPSHOT.email, LOCAL_ACCOUNT);
  assert.equal('subscription' in LOCAL_SNAPSHOT, false);
});

test('local retrieval only uses enabled matching documents and stays within a budget', () => {
  const docs = [{ title: '项目', text: '本地项目使用 Redis 缓存提升查询性能。' }, { title: '私有草稿', text: 'Redis 密码信息', enabled: false }, { title: '其他', text: '完全无关的材料' }];
  const selected = selectKnowledge('Redis 缓存怎么设计？', docs);
  assert.match(selected, /提升查询性能/);
  assert.doesNotMatch(selected, /密码信息|完全无关/);
  assert.equal(selectKnowledge('Redis', docs, 2), '');
});

test('local prompt keeps system instructions, bounded history and image parts', () => {
  const request = buildLocalRequest({ question: '分析架构', images: ['data:image/png;base64,abc'], history: Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `history-${i}` })), mode: 'practice' });
  assert.equal(request.messages.length, 32);
  assert.match(request.messages[0].content, /每次只提出一个问题/);
  assert.equal(request.messages[1].content, 'history-10');
  assert.equal(request.messages.at(-1).content[1].type, 'image_url');
});

test('model selection requires vision configuration for screenshots and allows text fallback', () => {
  const profiles = [{ slot: 'screenshot', enabled: true }];
  assert.equal(chooseModelSlot(profiles, false), 'screenshot');
  assert.equal(chooseModelSlot([{ slot: 'interview', enabled: true }], true), null);
  assert.equal(chooseModelSlot([], false), null);
});

test('workspace stores text messages without API keys, raw screenshots or extra fields', () => {
  const saved = normalizeConversation({ id: 'chat-1', title: '测试', updatedAt: 1, mode: 'chat', apiKey: 'must-not-save', messages: [{ id: 'msg-1', role: 'user', text: 'test', images: ['data:secret'], token: 'must-not-save' }] });
  assert.equal('apiKey' in saved, false);
  assert.equal('images' in saved.messages[0], false);
  assert.throws(() => normalizeWorkspace({ damaged: true }));
  assert.throws(() => normalizeConversation({ ...saved, id: '../escape' }));
  assert.throws(() => normalizeConversation({ ...saved, messages: Array(201).fill(saved.messages[0]) }));
});
