const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { compile } = require('./cql-text.js');

function setup(reply, example = null) {
  const elements = new Map();
  const requests = [], opened = [];
  let identity = 'visitor', tabOpened = false;
  const node = id => {
    if (!elements.has(id)) elements.set(id, {
      disabled: id === 'ask-preview',
      addEventListener(event, listener) { this[event] = listener; }
    });
    return elements.get(id);
  };
  const context = {
    document: {
      getElementById: node,
      querySelector: () => ({ click() { tabOpened = true; } })
    },
    CqlText: { compile }, AbortSignal,
    crypto: { randomUUID: () => 'test-operation' },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return reply();
    }
  };
  runInNewContext(readFileSync(join(__dirname, 'cql-ask.js'), 'utf8'), context);
  context.CqlAsk.init({
    playground: { loadText(text) { opened.push(text); }, selectedPublicExample: () => example },
    isSandbox: () => true, getIdentity: () => identity, ensureAccessToken: async () => 'test-token'
  });
  node('ask-question').value = 'Count active MongoDB holons';
  return { node, requests, opened, changeIdentity: () => { identity = 'another'; },
    tabOpened: () => tabOpened };
}

test('WEB6 drafts a typed query and opens it only after review', async () => {
  const text = 'SELECT COUNT(*) FROM MongoDBOASIS WHERE IsActive = TRUE';
  const app = setup(() => ({ ok: true, json: async () => ({ result: { content: text } }) }));
  await app.node('ask-generate').click();
  const [{ url, options }] = app.requests;
  assert.equal(url, 'https://dev.api.web6.oasisomniverse.one/v1/complete');
  assert.equal(options.headers.Authorization, 'Bearer test-token');
  assert.equal(options.headers['Idempotency-Key'], 'test-operation');
  const request = JSON.parse(options.body);
  assert.deepEqual(request.tools, []);
  assert.equal(request.injectAvatarContext, false);
  assert.equal(request.messages[1].content, 'Count active MongoDB holons');
  assert.equal(app.node('ask-draft').textContent, text);
  assert.equal(app.node('ask-preview').disabled, false);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [text]);
  assert.equal(app.node('cql-text').value, text);
  assert.equal(app.node('cql-text-editor').open, true);
  assert.equal(app.tabOpened(), true);
});

test('rejects a destructive model response and expires a valid draft on session change', async () => {
  let content = 'DELETE FROM MongoDBOASIS';
  const app = setup(() => ({ ok: true, json: async () => ({ result: { content } }) }));
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled, true);
  assert.match(app.node('ask-status').textContent, /Expected SELECT/);
  content = 'SELECT * FROM Neo4jOASIS';
  await app.node('ask-generate').click();
  app.changeIdentity();
  app.node('ask-preview').click();
  assert.match(app.node('ask-status').textContent, /session changed/);
  assert.deepEqual(app.opened, []);
});

test('shows a daily token allowance rejection without enabling a draft', async () => {
  const app = setup(() => ({ ok: false, status: 429,
    json: async () => ({ code: 'DAILY_TOKEN_LIMIT_EXCEEDED' }) }));
  await app.node('ask-generate').click();
  assert.match(app.node('ask-status').textContent, /remaining daily AI token allowance/);
  assert.equal(app.node('ask-preview').disabled, true);
  assert.deepEqual(app.opened, []);
});

test('fills a question from the selected public example without contacting WEB6', () => {
  const app = setup(() => { throw new Error('Unexpected request'); }, {
    provider: 'SolanaOASIS', request: { take: 3, maximumDurationMilliseconds: 30000, filters: [
      { metadataPath: ['SolanaAccountAddress'], value: ['11111111111111111111111111111111'] }
    ] }
  });
  app.node('ask-use-example').click();
  assert.match(app.node('ask-question').value, /SolanaOASIS.*metadata.SolanaAccountAddress.*11111111111111111111111111111111/);
  assert.match(app.node('ask-question').value, /query timeout of 30000 milliseconds/);
  assert.deepEqual(app.requests, []);
  assert.equal(app.node('ask-preview').disabled, true);
});

test('editing a question discards completed and in-flight drafts', async () => {
  const reply = { ok: true, json: async () => ({ result: { content: 'SELECT * FROM MongoDBOASIS' } }) };
  let finish;
  const app = setup(() => new Promise(resolve => { finish = resolve; }));
  const first = app.node('ask-generate').click();
  await new Promise(resolve => setImmediate(resolve));
  finish(reply);
  await first;
  assert.equal(app.node('ask-preview').disabled, false);
  app.node('ask-question').input();
  assert.equal(app.node('ask-preview').disabled, true);

  const second = app.node('ask-generate').click();
  await new Promise(resolve => setImmediate(resolve));
  app.node('ask-question').input();
  finish(reply);
  await second;
  assert.equal(app.node('ask-preview').disabled, true);
  assert.equal(app.node('ask-draft').textContent, '');
});
