const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { compile } = require('./cql-text.js');

function setup(reply, example = null, compileAvailableText = compile) {
  const elements = new Map();
  const requests = [], opened = [];
  let identity = 'visitor', tabOpened = false;
  const node = id => {
    if (!elements.has(id)) elements.set(id, {
      focus() { this.focused = true; },
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
    AbortSignal,
    crypto: { randomUUID: () => 'test-operation' },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return reply();
    }
  };
  runInNewContext(readFileSync(join(__dirname, 'cql-ask.js'), 'utf8'), context);
  context.CqlAsk.init({
    playground: { compileAvailableText, loadText(text) { opened.push(text); }, selectedPublicExample: () => example },
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
  assert.match(request.messages[0].content, /Selected columns and all scalar queries use the server timeout/);
  assert.equal(request.injectAvatarContext, false);
  assert.equal(request.messages[1].content, 'Count active MongoDB holons');
  assert.equal(app.node('ask-draft').textContent, text);
  assert.equal(app.node('ask-preview').disabled, false);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [text]);
  assert.equal(app.node('cql-text').value, text);
  assert.equal(app.node('cql-text-editor').open, true);
  assert.equal(app.node('cql-text').focused, true);
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

test('reports the WEB6 HTTP status when the gateway returns a non-JSON response', async () => {
  const app = setup(() => new Response('<html>Bad Gateway</html>', { status: 502 }));
  await app.node('ask-generate').click();
  assert.match(app.node('ask-status').textContent, /WEB6 returned an invalid response [(]HTTP 502[)]/);
  assert.equal(app.node('ask-preview').disabled, true);
  assert.deepEqual(app.opened, []);
});

test('opens a reviewed WEB6 selected-column draft on the native projection route', async () => {
  const text = 'SELECT Id, Name, Version FROM SQLLiteDBOASIS WHERE IsActive = TRUE LIMIT 5';
  const app = setup(() => ({ ok: true, json: async () => ({ result: { content: text } }) }));
  app.node('ask-question').value = 'Show the ID, name and version of five active SQLite holons';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-draft').textContent, text);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  const [draft] = app.opened;
  const request = compile(draft);
  assert.equal(request.path, 'data/query-cql/projection');
  assert.equal(request.body.provider, 'SQLLiteDBOASIS');
  assert.deepEqual(request.body.columns.map(column => column.field), ['Id', 'Name', 'Version']);
});

test('the WEB6 relationship example compiles to independent child and descendant predicates', async () => {
  const app = setup(() => ({ ok: true, json: async () => ({ content: 'UNSUPPORTED' }) }));
  await app.node('ask-generate').click();
  const prompt = JSON.parse(app.requests[0].options.body).messages[0].content;
  const example = prompt.split(String.fromCharCode(10)).find(line => line.includes('EXISTS CHILD')).split('Example: ')[1].slice(0, -1);
  const { path, body } = compile(example);
  assert.equal(path, 'data/query-cql');
  assert.equal(body.anyChildren[0].filters[0].field, 'Version');
  assert.equal(body.anyDescendants[0].filters[0].field, 'IsActive');
  assert.equal(body.anyDescendants[0].maximumDepth, 8);
});

test('Ask your data hands a grouped count draft to the Playground only after review', async () => {
  const text = 'SELECT IsActive, COUNT(*) AS Total, AVG(Version) AS Mean, SUM(Version) AS Combined FROM MongoDBOASIS GROUP BY IsActive HAVING Total >= 2 AND Mean >= 1.5 AND Combined >= 3';
  const app = setup(() => ({ ok: true, json: async () => ({ result: { content: text } }) }));
  app.node('ask-question').value = 'Group MongoDB holons by active status with at least two records, average version 1.5 or higher, and total version at least 3';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-draft').textContent, text);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [text]);
  assert.equal(app.requests.length, 1);
});

test('withholds a syntactically valid draft when its provider is unavailable', async () => {
  const text = 'SELECT * FROM HashgraphOASIS';
  const app = setup(() => ({ ok: true, json: async () => ({ content: text }) }), null, draft => {
    assert.equal(compile(draft).body.provider, 'HashgraphOASIS');
    throw new Error('A requested provider is unavailable for this query on the selected WEB4 host.');
  });
  await app.node('ask-generate').click();
  assert.match(app.node('ask-status').textContent, /provider is unavailable/);
  assert.equal(app.node('ask-preview').disabled, true);
  assert.equal(app.node('ask-draft').textContent, '');
  assert.deepEqual(app.opened, []);
});

test('fills an exact-key public question without calling WEB6', () => {
  const key = 'b5d3f5a8-2539-4f94-9b12-aed841902ccb';
  const app = setup(() => { throw new Error('Unexpected request'); }, {
    provider: 'HoloOASIS',
    request: { take: 1, filters: [{ field: 'Id', operator: 'Equal', value: key }] }
  });
  app.node('ask-use-example').click();
  assert.match(app.node('ask-question').value, new RegExp('HoloOASIS.*Id exactly equal to "' + key + '"'));
  assert.deepEqual(app.requests, []);
  assert.equal(app.node('ask-preview').disabled, true);
});

test('explains the deployed WEB6 response when the visitor plan admits no model', async () => {
  const app = setup(() => ({ ok: false, status: 400, json: async () => ({
    isError: true, errorCode: null,
    message: 'Error calling AI provider(s). Reason: No LeelaAI model in the catalogue is admitted by your plan.'
  }) }));
  await app.node('ask-generate').click();
  assert.match(app.node('ask-status').textContent, /Your Development plan has no available WEB6 model/);
  assert.equal(app.node('ask-preview').disabled, true);
  assert.deepEqual(app.opened, []);
});
