import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocalModelRunInput } from '../src/main/models/local-request.mjs';
import { normalizeConversation, normalizeWorkspace } from '../src/main/store/workspace-schema.mjs';
import { buildLocalRequest, selectKnowledge, chooseModelSlot } from '../src/renderer/local/requests.mjs';
import { LOCAL_ACCOUNT, LOCAL_SNAPSHOT } from '../src/shared/local-profile.mjs';
import { normalizeWrittenOptions } from '../src/shared/written-options.mjs';

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

test('written screenshots request direct answers and keep previous questions out of a new image request', () => {
  const history = [{ role: 'user', text: '上一题' }, { role: 'assistant', text: '上一题答案' }];
  const request = buildLocalRequest({ question: '请解答本题', mode: 'written', images: ['data:image/png;base64,aGVsbG8='], history });
  assert.match(request.messages[0].content, /笔试模式/);
  assert.match(request.messages[0].content, /先给出明确答案/);
  assert.match(request.messages[0].content, /时间与空间复杂度/);
  assert.equal(request.messages.length, 2);
  assert.doesNotMatch(JSON.stringify(request), /上一题/);
  const followup = buildLocalRequest({ question: '解释复杂度', mode: 'written', history });
  assert.equal(followup.messages.length, 4);
});

test('written mode and its completed answer survive workspace normalization', () => {
  const saved = normalizeWorkspace([{ id: 'written-1', title: '笔试题', updatedAt: 1, mode: 'written', messages: [{ id: 'answer', role: 'assistant', text: '答案 B', status: 'completed' }] }]);
  assert.equal(saved[0].mode, 'written'); assert.equal(saved[0].messages[0].text, '答案 B');
  assert.throws(() => normalizeConversation({ ...saved[0], mode: 'unrecognized' }));
});

test('written preferences select coding language, answer language and an independent prompt', () => {
  const request = buildLocalRequest({ question: '写一个排序函数', mode: 'written', prompt: '通用偏好不应混入', writtenOptions: { codingLanguage: 'Go', answerLanguage: 'English', prompt: '采用 ACM 输入输出格式' } });
  const system = request.messages[0].content;
  assert.match(system, /默认编程语言：Go/); assert.match(system, /回答语言：English/); assert.match(system, /ACM 输入输出格式/);
  assert.doesNotMatch(system, /通用偏好不应混入/);
  assert.match(system, /题目明确指定其他语言时，以题目为准/);
});

test('written screenshot knowledge honors selection, disabled documents, opt-out and bounded excerpts', () => {
  const docs = [{ id: 'allowed', title: '指定资料', text: '应被发送的资料'.repeat(10000) }, { id: 'private', title: '未选择资料', text: '不应被发送的资料' }, { id: 'disabled', title: '已禁用', text: '禁用资料绝不能发送', enabled: false }];
  const input = { question: '图片问题', mode: 'written', images: ['data:image/png;base64,aGVsbG8='], documents: docs, writtenOptions: { knowledgeMode: 'selected', documentIds: ['allowed', 'disabled'] } };
  const system = buildLocalRequest(input).messages[0].content;
  assert.match(system, /指定资料/); assert.doesNotMatch(system, /未选择资料|禁用资料绝不能发送/); assert.ok(system.length < 8500);
  assert.doesNotMatch(buildLocalRequest({ ...input, writtenOptions: { knowledgeMode: 'off' } }).messages[0].content, /local_reference/);
  assert.doesNotMatch(buildLocalRequest({ ...input, writtenOptions: { knowledgeMode: 'selected', documentIds: [] } }).messages[0].content, /local_reference/);
});

test('written settings clamp translucent opacity and reject malformed values and document identifiers', () => {
  const options = normalizeWrittenOptions({ opacity: 2, prompt: 'x'.repeat(5000), codingLanguage: { bad: true }, answerLanguage: null, knowledgeMode: 'everything', documentIds: ['safe-id', '../private', 'safe-id', 42] });
  assert.equal(options.opacity, .85); assert.equal(normalizeWrittenOptions({ opacity: -.5 }).opacity, .15);
  assert.equal(options.prompt.length, 4000); assert.equal(options.codingLanguage, 'auto'); assert.equal(options.answerLanguage, '中文');
  assert.deepEqual(options.documentIds, ['safe-id']); assert.equal(options.knowledgeMode, 'all');
});
