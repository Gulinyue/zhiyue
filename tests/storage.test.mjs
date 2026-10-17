import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeLibraryFileStore, validatedKnowledgeLibraryAccount } from '../src/main/store/knowledge-library.mjs';
import { LocalRecordsStore } from '../src/main/store/local-records.mjs';

async function directory(t) {
  const testRoot = path.resolve(import.meta.dirname, '../.runtime/tests');
  await mkdir(testRoot, { recursive: true });
  const root = await mkdtemp(path.join(testRoot, 'climb-storage-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 }));
  return root;
}

test('knowledge library serializes concurrent writes and isolates accounts', async (t) => {
  const root = await directory(t);
  const store = new KnowledgeLibraryFileStore(root);
  await Promise.all(['one', 'two', 'three'].map((id) => store.save('a@example.test', { id, text: id })));
  assert.equal((await store.list('a@example.test')).length, 3);
  assert.equal((await store.list('b@example.test')).length, 0);
  assert.equal((await new KnowledgeLibraryFileStore(root).list('a@example.test')).length, 3);
  await assert.rejects(store.save('a@example.test', { id: '../escape' }), /INVALID_ID/);
  assert.throws(() => validatedKnowledgeLibraryAccount('b@example.test', 'a@example.test'));
});

test('transcripts survive reopening, deduplicate entries, and close safely', async (t) => {
  const root = await directory(t);
  const store = new LocalRecordsStore(root);
  const account = 'a@example.test';
  const id = 'interview-12345678-1234-1234-1234-123456789abc';
  await store.configure(account, { saveInterviewTranscript: true });
  const input = { recordId: id, startedAt: 1700000000000, eventId: 'event-1', text: '面试转写', at: 1700000000100 };
  await store.appendTranscript(account, input);
  await store.appendTranscript(account, input);
  await store.endInterview(account, id);
  const reopened = new LocalRecordsStore(root);
  const transcript = await reopened.readTranscript(account, id);
  assert.equal(transcript.entries.length, 1);
  assert.equal(transcript.entries[0].text, '面试转写');
  await assert.rejects(reopened.readTranscript('b@example.test', id), { code: 'LOCAL_RECORDS_NOT_FOUND' });
  await assert.rejects(reopened.appendTranscript(account, { ...input, eventId: 'event-2' }), { code: 'LOCAL_RECORDS_CLOSED' });
});

test('recording is opt-in and unsafe record identifiers are rejected', async (t) => {
  const store = new LocalRecordsStore(await directory(t));
  await assert.rejects(store.appendTranscript('a@example.test', {
    recordId: 'interview-12345678-1234-1234-1234-123456789abc', startedAt: 1700000000000,
    eventId: 'event-1', text: 'hidden', at: 1700000000100,
  }), { code: 'LOCAL_RECORDS_DISABLED' });
  await assert.rejects(store.readTranscript('a@example.test', '../../escape'), { code: 'LOCAL_RECORDS_INVALID_INPUT' });
});
