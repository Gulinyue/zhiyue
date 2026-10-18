import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validatedPortalUrl } from '../src/main/security/external-url.mjs';
import { createTokenCodec } from '../src/main/security/token-codec.mjs';
import { createIpcGateway } from '../src/main/ipc/gateway.mjs';
import { trustedInstallerDigest, verifyInstallerDigest } from '../src/main/updater/integrity.mjs';

test('external portal permits only the configured exact origin', () => {
  assert.equal(validatedPortalUrl('https://github.com/Gulinyue/zhiyue'), 'https://github.com/Gulinyue/zhiyue');
  for (const target of ['javascript:alert(1)', 'file:///C:/Windows', 'https://github.com.evil.test/', 'https://evil.test/', 'http://github.com/', 'https://user@github.com/']) {
    assert.throws(() => validatedPortalUrl(target));
  }
  assert.equal(validatedPortalUrl('http://localhost:8787/subscribe', 'http://localhost:8787'), 'http://localhost:8787/subscribe');
});

test('unavailable encryption never persists or decodes plaintext base64', () => {
  let calls = 0;
  const codec = createTokenCodec({ isEncryptionAvailable: () => false, encryptString: () => { calls++; } });
  assert.throws(() => codec.encrypt('sensitive-token'), /AUTH_ENCRYPTION_UNAVAILABLE/);
  assert.equal(codec.decrypt(Buffer.from('sensitive-token').toString('base64')), undefined);
  assert.equal(calls, 0);
});

test('corrupt encrypted tokens become an anonymous session', () => {
  const codec = createTokenCodec({ isEncryptionAvailable: () => true, decryptString: () => { throw new Error('bad ciphertext'); } });
  assert.equal(codec.decrypt('not-a-valid-token'), undefined);
});

test('IPC limits overlay access to settings reads and layout reports', () => {
  const handlers = new Map();
  const listeners = new Map();
  const ipc = createIpcGateway({ handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) },
    (id) => { if (id !== 1) throw new Error('unauthorized'); }, (id) => id === 2, 'layout', ['settings:get']);
  ipc.handle('tokens', () => 'secret');
  const mainFrame = {};
  const event = (id, frame = mainFrame) => ({ sender: { id, mainFrame }, senderFrame: frame });
  assert.equal(handlers.get('tokens')(event(1)), 'secret');
  assert.throws(() => handlers.get('tokens')(event(2)), /unauthorized/);
  ipc.handle('lan:start', () => 'private pairing server');
  ipc.handle('lan:publish', () => 'private answer');
  assert.throws(() => handlers.get('lan:start')(event(2)), /unauthorized/);
  assert.throws(() => handlers.get('lan:publish')(event(2)), /unauthorized/);
  assert.throws(() => handlers.get('tokens')(event(1, {})), /frame/);
  ipc.handle('settings:get', () => ({ opacity: 1 }));
  assert.deepEqual(handlers.get('settings:get')(event(2)), { opacity: 1 });
  let reports = 0;
  ipc.on('layout', () => reports++);
  ipc.on('log', () => reports++);
  listeners.get('layout')(event(2));
  listeners.get('log')(event(2));
  assert.equal(reports, 1);
});

test('updates require an exact pinned URL and fail on modified installer bytes', async (t) => {
  const testRoot = path.resolve(import.meta.dirname, '../.runtime/tests');
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, 'climb-integrity-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 }));
  const file = path.join(directory, 'installer.exe');
  const bytes = Buffer.from('MZ official release bytes');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const url = 'https://example.invalid/releases/Zhiyue-Setup.exe';
  assert.throws(() => trustedInstallerDigest(url, {}), /INTEGRITY_UNAVAILABLE/);
  assert.throws(() => trustedInstallerDigest(url + '?replacement=1', { [url]: digest }));
  assert.equal(trustedInstallerDigest(url, { [url]: digest }), digest);
  await writeFile(file, bytes);
  await verifyInstallerDigest(file, digest);
  await writeFile(file, Buffer.from('MZ modified release bytes'));
  await assert.rejects(verifyInstallerDigest(file, digest), /INTEGRITY_MISMATCH/);
});
