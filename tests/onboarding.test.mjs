import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_LINKS, GUIDE_VALUES, GUIDE_EXAMPLES, GUIDE_STEPS } from '../src/shared/onboarding.mjs';
import { normalizeSpeechProfile } from '../src/main/interview/transcription.mjs';
import { createDefaultPersonalModelProfile } from '../src/main/models/validation.mjs';
test('beginner examples use real platform protocols and contain no credential field', () => {
  for (const slot of ['interview', 'screenshot']) {
    const value = GUIDE_EXAMPLES[slot]; assert.equal(value.model, 'deepseek-flash');assert.equal(value.apiMode, 'chat-completions');
    const profile = createDefaultPersonalModelProfile(value.model, value.baseUrl, true, {}, value, slot);assert.equal(profile.thinkingLevel, 'none');assert.equal(value.apiKey, undefined);
  }
  const speech = normalizeSpeechProfile(GUIDE_EXAMPLES.speech);assert.equal(speech.providerId, 'dashscope');assert.equal(speech.language, '');
  assert.equal(GUIDE_VALUES.speechModel, speech.model);
});
test('tutorial navigation and copy actions resolve only fixed public IDs', () => {
  const allowed = new Set(['platform.deepseek.com','api-docs.deepseek.com','account.aliyun.com','bailian.console.aliyun.com','help.aliyun.com']);
  assert.equal(new Set(GUIDE_STEPS.map(step=>step.id)).size, GUIDE_STEPS.length);
  for (const value of Object.values(GUIDE_LINKS)) { const url=new URL(value);assert.equal(url.protocol,'https:');assert.ok(allowed.has(url.hostname)); }
  for (const step of GUIDE_STEPS) {
    assert.ok(step.items.length >= 5);assert.ok(step.check);
    for (const [id] of step.links || []) assert.ok(Object.hasOwn(GUIDE_LINKS,id));
    for (const [id] of step.copies || []) assert.ok(Object.hasOwn(GUIDE_VALUES,id));
    if (step.target) assert.ok(Object.hasOwn(GUIDE_EXAMPLES,step.target));
  }
});
