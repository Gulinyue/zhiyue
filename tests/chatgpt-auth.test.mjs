import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { ChatGptAuth, OPENAI_ISSUER, OPENAI_RESOURCE } from '../src/main/models/chatgpt-auth.mjs';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey); jwk.kid = 'test';
const token = async (nonce, audience = 'oaiapp_test', sub = 'test-user') => new SignJWT({ nonce, email: 'test@example.invalid' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(OPENAI_ISSUER).setAudience(audience).setSubject(sub).setIssuedAt().setExpirationTime('1h').sign(privateKey);
const discovery = { issuer: OPENAI_ISSUER, jwks_uri: OPENAI_ISSUER + '/jwks', revocation_endpoint: OPENAI_ISSUER + '/revoke' };
function setup(options = {}) {
  let record = options.record || {}, browser;
  const forms = [];
  const auth = new ChatGptAuth({ storage: { read: () => structuredClone(record), write: (value) => { record = structuredClone(value); } }, openBrowser: async (url) => { browser = new URL(url); await options.browser?.(browser); }, fetchImpl: async (url, init) => {
    if (url.endsWith('openid-configuration')) return Response.json(discovery);
    if (url.endsWith('/revoke')) return new Response(null, { status: 200 });
    assert.equal(url, OPENAI_ISSUER + '/api/accounts/oauth/token');
    const form = new URLSearchParams(init.body); forms.push(form);
    assert.equal(form.get('resource'), OPENAI_RESOURCE);
    return Response.json(await options.tokens?.(browser, form) || { token_type: 'Bearer', access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, scope: 'openid chatgpt.tokens.use.direct', id_token: await token(browser.searchParams.get('nonce')) });
  } });
  auth.jwks = createLocalJWKSet({ keys: [jwk] });
  return { auth, forms, read: () => record, browser: () => browser };
}
const callback = async (browser, extra = {}) => {
  const url = new URL(browser.searchParams.get('redirect_uri'));
  url.search = new URLSearchParams({ state: browser.searchParams.get('state'), client_id: 'oaiapp_test', code: 'one-time-test-code', ...extra });
  return fetch(url);
};

test('real loopback OAuth callback validates PKCE, signed ID token and plan scope before saving credentials', async () => {
  let challenge;
  const { auth, forms, read } = setup({ browser: async (url) => { challenge = url.searchParams.get('code_challenge'); assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client'); assert.equal(url.searchParams.get('agent_name_hint'), '知跃'); assert.equal((await callback(url)).status, 200); } });
  const result = await auth.signIn();
  assert.equal(result.planEnabled, true); assert.equal(result.email, 'test@example.invalid');
  assert.equal('access_token' in result, false); assert.equal('refresh_token' in result, false);
  assert.match(read().ext_agent_host_id, /^urn:uuid:/); assert.equal(read().subject, 'test-user');
  const form = forms[0]; assert.equal(form.get('client_id'), 'oaiapp_test'); assert.equal(form.has('client_secret'), false);
  assert.match(form.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
  assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), challenge);
  assert.equal(await auth.accessToken(), 'test-access');
  const loggedOut = await auth.logout(); assert.equal(loggedOut.revoked, true); assert.equal(read().access_token, undefined); assert.equal(read().id_token, undefined); assert.equal(read().client_id, 'oaiapp_test');
});
test('incorrect state cannot exchange a code; cancellation closes the pending attempt', async () => {
  const { auth, forms } = setup({ browser: async (url) => { assert.equal((await callback(url, { state: 'invalid' })).status, 400); auth.cancel(); } });
  await assert.rejects(auth.signIn(), /已取消/); assert.equal(forms.length, 0); assert.equal(auth.status().pending, false);
});
test('signed token with wrong nonce is rejected and identity-only scopes cannot enable inference', async () => {
  const bad = setup({ browser: (url) => callback(url), tokens: async () => ({ token_type: 'Bearer', access_token: 'test', expires_in: 3600, scope: 'chatgpt.tokens.use.direct', id_token: await token('wrong') }) });
  await assert.rejects(bad.auth.signIn(), /校验失败/); assert.equal(bad.read().access_token, undefined);
  const identity = setup({ browser: (url) => callback(url), tokens: async (url) => ({ token_type: 'Bearer', access_token: 'identity-only', expires_in: 3600, scope: 'openid email', id_token: await token(url.searchParams.get('nonce')) }) });
  assert.equal((await identity.auth.signIn()).planEnabled, false); await assert.rejects(identity.auth.accessToken(), /允许使用/);
});
test('JWT validation rejects wrong audience, issuer and subject', async () => {
  const { auth } = setup();
  await assert.rejects(auth.verifyJwt(await token('nonce', 'oaiapp_other'), { clientId: 'oaiapp_test', nonce: 'nonce' }));
  await assert.rejects(auth.verifyJwt(await token('nonce'), { clientId: 'oaiapp_test', nonce: 'nonce', subject: 'another-user' }));
});
test('returning authorization reuses registration and host without accepting a changed client', async () => {
  const initial = { client_id: 'oaiapp_test', ext_agent_host_id: 'urn:uuid:stable', subject: 'test-user' };
  const good = setup({ record: initial, browser: async (url) => {
    assert.equal(url.searchParams.get('client_id'), 'oaiapp_test'); assert.equal(url.searchParams.has('agent_name_hint'), false); assert.equal(url.searchParams.get('ext_agent_host_id'), 'urn:uuid:stable');
    return callback(url);
  } });
  await good.auth.signIn(); assert.equal(good.read().ext_agent_host_id, 'urn:uuid:stable');
  const bad = setup({ record: initial, browser: (url) => callback(url, { client_id: 'oaiapp_changed' }) });
  await assert.rejects(bad.auth.signIn(), /不匹配/); assert.equal(bad.forms.length, 0);
});
test('refresh is serialized and logout prevents an in-flight refresh from restoring tokens', async () => {
  const record = { client_id: 'oaiapp_test', subject: 'test-user', ext_agent_host_id: 'host', access_token: 'old', refresh_token: 'refresh', expires_at: 0, scopes: ['chatgpt.tokens.use.direct'] };
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { auth, forms, read } = setup({ record, tokens: async () => { await pending; return { token_type: 'Bearer', access_token: 'new', refresh_token: 'rotated', expires_in: 3600 }; } });
  const a = auth.accessToken(), b = auth.accessToken();
  const rejected = Promise.allSettled([a, b]);
  await auth.logout(); release();
  assert.ok((await rejected).every((item) => item.status === 'rejected'));
  assert.equal(forms.length, 1); assert.equal(read().access_token, undefined);
});

test('refresh rotation saves the replacement token once and logout aborts session requests', async () => {
  const { auth, forms, read } = setup({ record: { client_id: 'oaiapp_test', subject: 'test-user', access_token: 'old', refresh_token: 'old-refresh', expires_at: 0, scopes: ['chatgpt.tokens.use.direct'] }, tokens: async () => ({ token_type: 'Bearer', access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }) });
  assert.deepEqual(await Promise.all([auth.accessToken(), auth.accessToken()]), ['new-access', 'new-access']);
  assert.equal(forms.length, 1); assert.equal(forms[0].has('scope'), false); assert.equal(read().refresh_token, 'new-refresh');
  const signal = auth.sessionSignal(); await auth.logout(); assert.equal(signal.aborted, true);
});

test('switching back to a saved account reuses its registration and checks its own subject', async () => {
  const { auth, read } = setup({ record: { client_id: 'oaiapp_current', subject: 'current-user', email: 'current@example.invalid', id_token: 'current-id-token', access_token: 'current-access', ext_agent_host_id: 'urn:uuid:host', registrations: [{ client_id: 'oaiapp_current', subject: 'current-user' }, { client_id: 'oaiapp_test', subject: 'test-user', email: 'test@example.invalid' }] }, browser: async (url) => {
    assert.equal(url.searchParams.get('client_id'), 'oaiapp_test'); assert.equal(url.searchParams.get('login_hint'), 'test@example.invalid'); assert.equal(url.searchParams.has('id_token_hint'), false); return callback(url);
  } });
  await auth.signIn({ clientId: 'oaiapp_test' });
  assert.equal(read().subject, 'test-user'); assert.equal(auth.status().accounts.length, 2);
  assert.equal(auth.status().accounts.find((r) => r.active).clientId, 'oaiapp_test');
  await assert.rejects(auth.signIn({ clientId: 'oaiapp_unknown' }), /已保存/);
});
