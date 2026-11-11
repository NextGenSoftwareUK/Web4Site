'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('./web4-session.js');
const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const origin = 'https://dev.api.web4.oasisomniverse.one';
function avatar(id, now, seconds = 900) {
  return { id, username: 'controlled', jwtToken: 'header.' +
    Buffer.from(JSON.stringify({ sub: id, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + seconds })).toString('base64url') + '.signature' };
}
function response(avatar, direct = false, status = 200) {
  const result = { isError: status !== 200, result: avatar };
  return { ok: status === 200, status, json: async () => direct ? result : { result } };
}
function fixture() {
  let time = Date.parse('2026-11-01T12:00:00Z'), base = origin;
  const calls = [], published = [], renewalFailures = [];
  let handle = async url => response(avatar(owner, time), url.endsWith('/sandbox/session'));
  const session = create({ getBase: () => base, now: () => time,
    fetch: async (url, options) => { calls.push({ url, options }); return handle(url, options); },
    onToken: value => published.push(value),
    onRenewalFailure: error => renewalFailures.push(error) });
  return { session, calls, published, renewalFailures, advance: ms => { time += ms; }, setBase: value => { base = value; },
    handle: value => { handle = value; }, fresh: id => avatar(id ?? owner, time) };
}
async function tick() { await new Promise(resolve => setImmediate(resolve)); }

test('issuer clock offsets do not delay or prematurely expire renewal', async () => {
  for (const offset of [-300000, 81000]) {
    const f = fixture();
    const issuerTime = Date.parse('2026-11-01T12:00:00Z') + offset;
    f.handle(async url => response(avatar(owner, issuerTime), url.endsWith('/sandbox/session')));
    await f.session.startDemo();
    f.advance(839000);
    await f.session.ensureAccessToken();
    assert.equal(f.calls.length, 1);
    f.advance(1000);
    f.handle(async () => response(avatar(owner, issuerTime + 840000)));
    await f.session.ensureAccessToken();
    assert.equal(f.calls.length, 2);
  }
});

test('authentication network time consumes the issued lifetime', async () => {
  const f = fixture();
  f.handle(async () => {
    const issued = f.fresh();
    f.advance(840000);
    return response(issued, true);
  });
  await f.session.startDemo();
  f.handle(async () => response(f.fresh()));
  await f.session.ensureAccessToken();
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].url, /avatar\/refresh-token$/);
});

test('an authentication response arriving after its lifetime is rejected', async () => {
  const f = fixture();
  f.handle(async () => {
    const issued = f.fresh();
    f.advance(900000);
    return response(issued, true);
  });
  await assert.rejects(f.session.startDemo(), /arrived after token expiry/);
  assert.equal(f.session.token(), null);
});

test('login and explicit demo creation retain cookie credentials and stable owner identity', async () => {
  for (const demo of [false, true]) {
    const f = fixture();
    await (demo ? f.session.startDemo() : f.session.signIn({ username: 'controlled', password: 'inert-marker' }));
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].options.credentials, 'include');
    assert.match(f.calls[0].url, demo ? /sandbox\/session$/ : /avatar\/authenticate$/);
    assert.ok(f.session.identity().includes(owner));
    assert.equal(await f.session.ensureAccessToken(), f.session.token());
    assert.equal(f.calls.length, 1);
  }
});
test('renewal precedes the original request and retains the same identity', async () => {
  const f = fixture(); await f.session.startDemo(); const identity = f.session.identity();
  f.advance(840000);
  const token = await f.session.ensureAccessToken();
  assert.equal(token, f.session.token()); assert.equal(f.session.identity(), identity);
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].url, /avatar\/refresh-token$/);
  assert.equal(f.calls[1].options.credentials, 'include');
  assert.equal(f.calls.filter(call => call.url.includes('/data/')).length, 0);
});
test('concurrent callers share one refresh rotation', async () => {
  const f = fixture(); await f.session.startDemo(); f.advance(840000);
  let release; const gate = new Promise(resolve => { release = resolve; });
  f.handle(async () => { await gate; return response(f.fresh()); });
  const pending = [f.session.ensureAccessToken(), f.session.ensureAccessToken(), f.session.ensureAccessToken()];
  await tick(); assert.equal(f.calls.length, 2); release();
  const tokens = await Promise.all(pending); assert.equal(new Set(tokens).size, 1);
  assert.equal(f.calls.length, 2);
});
test('unknown refresh outcome is not retried and never creates another avatar', async () => {
  const f = fixture(); await f.session.startDemo(); f.advance(840000);
  f.handle(async () => { throw Error('controlled lost response'); });
  await assert.rejects(f.session.ensureAccessToken(), /could not be verified/);
  await assert.rejects(f.session.ensureAccessToken(), /could not be verified/);
  assert.equal(f.calls.length, 2); assert.equal(f.calls.filter(call => call.url.endsWith('/sandbox/session')).length, 1);
  assert.equal(f.renewalFailures.length, 1);
  assert.match(f.renewalFailures[0].message, /Sign in again/);
});
test('renewal cannot switch the authenticated avatar', async () => {
  const f = fixture(); await f.session.startDemo(); const identity = f.session.identity(); f.advance(840000);
  f.handle(async () => response(f.fresh(other)));
  await assert.rejects(f.session.ensureAccessToken(), /could not be verified/);
  assert.equal(f.session.identity(), identity);
});
test('late rotation cannot revive a cleared session', async () => {
  const f = fixture(); await f.session.startDemo(); f.advance(840000);
  let release; const gate = new Promise(resolve => { release = resolve; });
  f.handle(async () => { await gate; return response(f.fresh()); });
  const pending = f.session.ensureAccessToken(); await tick(); f.session.clear(); release();
  await assert.rejects(pending); assert.equal(f.session.token(), null); assert.equal(f.session.identity(), null);
  assert.equal(f.published.at(-1), null);
  assert.deepEqual(f.renewalFailures, []);
});
test('environment changes cannot receive the former environment bearer', async () => {
  const f = fixture(); await f.session.startDemo(); f.setBase('https://another.example');
  await assert.rejects(f.session.ensureAccessToken(), /selected environment/);
  assert.equal(f.calls.length, 1);
});
test('cookie-changing login waits for an already running rotation', async () => {
  const f = fixture(); await f.session.startDemo(); f.advance(840000);
  let release; const gate = new Promise(resolve => { release = resolve; });
  f.handle(async url => { if (url.endsWith('/refresh-token')) { await gate; return response(f.fresh()); }
    return response(f.fresh(other)); });
  const renewal = f.session.ensureAccessToken(); await tick();
  const login = f.session.signIn({ username: 'another-controlled', password: 'inert-marker' });
  await tick(); assert.equal(f.calls.length, 2); release();
  await renewal; await login; assert.equal(f.calls.length, 3); assert.ok(f.session.identity().includes(other));
});
test('logout revokes through the normal endpoint before clearing the local identity', async () => {
  const f = fixture(); await f.session.startDemo();
  f.handle(async url => { assert.match(url, /avatar\/revoke-token$/); return response('revoked'); });
  await f.session.signOut(); assert.equal(f.session.token(), null);
  assert.equal(f.calls[1].options.credentials, 'include');
  assert.match(f.calls[1].options.headers.Authorization, /^Bearer /);
});
test('failed rotation cannot prevent local logout or trigger another refresh', async () => {
  const f = fixture(); await f.session.startDemo(); f.advance(840000);
  let release; const gate = new Promise(resolve => { release = resolve; });
  f.handle(async () => { await gate; throw Error('controlled transport failure'); });
  const renewal = f.session.ensureAccessToken(); await tick(); const logout = f.session.signOut(); release();
  await assert.rejects(renewal); await assert.rejects(logout);
  assert.equal(f.session.token(), null); assert.equal(f.calls.length, 2);
});


test('response context stays valid across rotation but rejects a cleared or changed identity', async () => {
  const f = fixture(); await f.session.startDemo();
  const context = await f.session.accessContext(); f.advance(840000);
  await f.session.ensureAccessToken(); assert.doesNotThrow(() => f.session.assertContext(context));
  f.session.clear();
  assert.throws(() => f.session.assertContext(context, 'inert-request-key'), /Retain request key/);
});

test('an old environment response cannot be published after the selector changes', async () => {
  const f = fixture(); await f.session.startDemo(); const context = await f.session.accessContext();
  f.setBase('https://another.example');
  assert.throws(() => f.session.assertContext(context), /previous response was not shown/);
});
