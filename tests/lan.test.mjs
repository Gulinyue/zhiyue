import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LanBridge } from '../src/main/lan/bridge.mjs';
import { normalizeLanSnapshot, isPrivateIpv4 } from '../src/shared/lan-protocol.mjs';
import { loadMobileAssets } from '../src/main/lan/runtime.mjs';

async function setup(t, options = {}) {
  const commands = [];
  const bridge = new LanBridge({ assets: new Map([['/', { type: 'text/html', bytes: Buffer.from('<html>mobile</html>') }]]), onCommand: async action => commands.push(action), ...options });
  await bridge.start('127.0.0.1');t.after(() => bridge.stop());
  const call = async (route, value, token, headers = {}) => {
    const response = await fetch(bridge.origin + route, { method: value === undefined ? 'GET' : 'POST', headers: { Origin: bridge.origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    return { status: response.status, body: await response.json() };
  };
  const pair = async () => {
    const result = await call('/api/pair', { code: bridge.code, name: 'test phone' });assert.equal(result.status, 202);
    bridge.approve(result.body.requestId, true);
    const approved = await call('/api/pair-status', result.body);assert.equal(approved.body.state, 'approved');return approved.body;
  };
  return { bridge, call, pair, commands };
}
async function stream(bridge, token) {
  const controller = new AbortController();
  const response = await fetch(bridge.origin + '/api/events', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  assert.equal(response.status, 200);const reader = response.body.getReader(), decoder = new TextDecoder();let buffer = '';
  return { close: () => controller.abort(), next: async () => {
    while (!buffer.includes('\n\n')) { const chunk = await reader.read();assert.equal(chunk.done, false);buffer += decoder.decode(chunk.value, { stream: true }); }
    const end = buffer.indexOf('\n\n'), frame = buffer.slice(0, end);buffer = buffer.slice(end + 2);
    return { type: /^event: (.*)$/m.exec(frame)?.[1], data: JSON.parse(/^data: (.*)$/m.exec(frame)?.[1] || '{}') };
  } };
}
test('LAN only shares bounded visible text, never images, credentials or knowledge documents', () => {
  const value = normalizeLanSnapshot({ credentials: ['secret'], images: ['data:image/png;base64,private'], documents: ['private'], mode: 'written', messages: [{ id: 'a', role: 'assistant', text: '同步答案', images: ['private'] }, { role: 'system', text: 'hidden prompt' }] });
  assert.equal(value.messages.length, 1);assert.equal(value.messages[0].text, '同步答案');assert.doesNotMatch(JSON.stringify(value), /secret|private|hidden prompt|images|documents|credentials/);
  const bounded = normalizeLanSnapshot({ messages: Array.from({ length: 10 }, (_, id) => ({ id: String(id), role: 'assistant', text: '长'.repeat(20000) })) });
  assert.equal(bounded.messages.length, 6);assert.ok(bounded.messages.reduce((sum, item) => sum + item.text.length, 0) <= 240000);
  const long = normalizeLanSnapshot({ messages: Array.from({ length: 6 }, (_, id) => ({ id: String(id), role: 'assistant', text: String(id).repeat(130000) })) });
  assert.equal(long.messages.at(-1).text.length, 120000);assert.equal(long.messages.at(-2).text.length, 120000);assert.equal(long.messages[0].text, '');
  assert.equal(isPrivateIpv4('192.168.2.3'), true);assert.equal(isPrivateIpv4('172.31.1.1'), true);assert.equal(isPrivateIpv4('172.32.1.1'), false);assert.equal(isPrivateIpv4('8.8.8.8'), false);
});
test('LAN pairing requires desktop approval and one-time polling secret; status contains no session token', async t => {
  const { bridge, call } = await setup(t);
  const pending = await call('/api/pair', { code: bridge.code, name: '<phone>' });assert.equal(pending.status, 202);
  assert.equal((await call('/api/pair-status', pending.body)).body.state, 'pending');
  assert.equal((await call('/api/pair-status', { ...pending.body, pollSecret: 'wrong' })).status, 401);
  assert.equal(bridge.status().devices.length, 0);assert.equal(bridge.status().pending[0].name, 'phone');
  bridge.approve(pending.body.requestId, true);
  assert.doesNotMatch(JSON.stringify(bridge.status()), /pollSecret|pollHash|token/);
  const result = await call('/api/pair-status', pending.body);assert.equal(result.body.token.length, 43);
  assert.equal((await call('/api/pair-status', pending.body)).status, 401);
  assert.equal((await call('/api/command', { action: 'capture' }, result.body.token)).status, 202);
});
test('LAN rejects cross-site requests, invalid Host, missing bearer and unknown commands', async t => {
  const { bridge, call, pair, commands } = await setup(t);
  assert.equal((await call('/api/pair', { code: bridge.code }, '', { Origin: 'https://example.com' })).status, 403);
  assert.equal((await call('/api/pair', { code: bridge.code }, '', { Origin: '' })).status, 403);
  const invalidHost = await new Promise(resolve => { const req = http.get(bridge.origin, { headers: { Host: 'example.com' } }, res => { res.resume();resolve(res.statusCode); });req.on('error', () => resolve(0)); });assert.equal(invalidHost, 403);
  assert.equal((await call('/api/command', { action: 'capture' })).status, 401);
  const { token } = await pair();assert.equal((await call('/api/command', { action: 'shell:run' }, token)).status, 400);assert.deepEqual(commands, []);
  assert.equal((await call('/api/command', { action: 'desktop-scroll-down' }, token)).status, 202);assert.deepEqual(commands, ['desktop-scroll-down']);
});
test('LAN streams partial answers, scroll events, reconnect snapshot and clears answers on lock', async t => {
  const { bridge, pair, call } = await setup(t);const { token } = await pair();const events = await stream(bridge, token);t.after(events.close);
  assert.equal((await events.next()).type, 'state');
  bridge.publish({ mode: 'interview', busy: true, messages: [{ role: 'assistant', text: '首段' }] });assert.equal((await events.next()).data.snapshot.messages[0].text, '首段');
  bridge.publish({ mode: 'interview', busy: false, messages: [{ role: 'assistant', text: '首段，完整答案' }] });assert.equal((await events.next()).data.snapshot.messages[0].text, '首段，完整答案');
  bridge.scrollMobile('down');assert.deepEqual(await events.next(), { type: 'scroll', data: { direction: 'down' } });
  const reconnect = await stream(bridge, token);t.after(reconnect.close);assert.equal((await reconnect.next()).data.snapshot.messages[0].text, '首段，完整答案');
  bridge.setBlocked(true);const locked = await events.next();assert.equal(locked.data.blocked, true);assert.deepEqual(locked.data.snapshot.messages, []);
  bridge.publish({ messages: [{ role: 'assistant', text: 'locked private answer' }] });assert.deepEqual(bridge.snapshot.messages, []);
  assert.equal((await call('/api/command', { action: 'capture' }, token)).status, 423);
  bridge.setBlocked(false);assert.equal((await call('/api/command', { action: 'capture' }, token)).status, 202);
});
test('LAN revoke invalidates commands and streams; rotating code invalidates unapproved requests', async t => {
  const { bridge, pair, call } = await setup(t);const { token, deviceId } = await pair();const events = await stream(bridge, token);t.after(events.close);await events.next();
  bridge.revoke(deviceId);assert.equal((await events.next()).type, 'revoked');assert.equal((await call('/api/command', { action: 'capture' }, token)).status, 401);
  const pending = await call('/api/pair', { code: bridge.code });bridge.rotateCode();assert.equal((await call('/api/pair-status', pending.body)).status, 401);
});
test('LAN codes and sessions expire, pairing is rate limited, and stop discards all state', async t => {
  let now = Date.now();const { bridge, call, pair } = await setup(t, { now: () => now });const { token } = await pair();
  now += 121000;assert.equal((await call('/api/pair', { code: bridge.code })).status, 403);
  bridge.rotateCode();for (let i = 0; i < 5; i++) await call('/api/pair', { code: '00000000' });assert.equal((await call('/api/pair', { code: bridge.code })).status, 429);
  now += 8 * 3600000;assert.equal((await call('/api/command', { action: 'capture' }, token)).status, 401);
  await bridge.stop();assert.equal(bridge.status().enabled, false);assert.equal(bridge.status().devices.length, 0);assert.equal(bridge.snapshot.messages.length, 0);
});
test('LAN revocation during an incomplete command body cannot run a stale action', async t => {
  const { bridge, pair, commands } = await setup(t);const { token, deviceId } = await pair();
  const done = new Promise(resolve => {
    const req = http.request(bridge.origin + '/api/command', { method: 'POST', headers: { Origin: bridge.origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, res => { res.resume();resolve(res.statusCode); });
    req.write('{"action":');setTimeout(() => { bridge.revoke(deviceId);req.end('"capture"}'); }, 40);
  });assert.equal(await done, 401);assert.deepEqual(commands, []);
});
test('mobile asset loader serves only public assets and excludes source maps and private files', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zhiyue-mobile-assets-'));t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'assets'));await fs.writeFile(path.join(root, 'index.html'), '<html>mobile</html>');
  for (const name of ['app.js', 'app.css', 'app.js.map', 'credentials.json']) await fs.writeFile(path.join(root, 'assets', name), 'fixture');
  const assets = await loadMobileAssets(root);
  assert.equal(assets.has('/'), true);assert.equal(assets.has('/assets/app.js'), true);assert.equal([...assets.keys()].some(key => key.endsWith('.map')), false);
  assert.equal(assets.has('/assets/credentials.json'), false);
});
