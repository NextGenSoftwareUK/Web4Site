const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { compile } = require('./cql-text.js');

function setup(reply, example = null, compileAvailableText = compile, providers = ['MongoDBOASIS', 'Neo4jOASIS'], textProfiles = {}, demo = false) {
  const elements = new Map();
  const requests = [], opened = [];
  let identity = 'visitor', tabOpened = false;
  let tokenReads = 0;
  const node = id => {
    if (!elements.has(id)) elements.set(id, {
      focus() { this.focused = true; },
      replaceChildren(...children) { this.children = children; },
      value: '',
      disabled: id === 'ask-preview',
      addEventListener(event, listener) { this[event] = listener; }
    });
    return elements.get(id);
  };
  const context = {
    document: {
      getElementById: node,
      createElement: () => ({}),
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
  const ask = context.CqlAsk.init({
    playground: { availableTextProviders: () => providers, availableTextProfiles: () => textProfiles, compileAvailableText, loadText(text, parameters = {}) { compileAvailableText(text, textProfiles, parameters); opened.push(text); }, publicQuestionExample: provider => typeof example === 'function' ? example(provider) : example,
      clearVirtualMapping() { require('./cql-playground.js').clearVirtualMapping(node('cql-virtual-mapping'), node('cql-saved-mapping'), node('cql-mapping-note')); },
      availableQuestionProviders: () => ['HashgraphOASIS', 'HoloOASIS'] },
    isSandbox: () => true, getIdentity: () => identity, ensureAccessToken: async () => { tokenReads++; return 'test-token'; }, isDemoSession: () => demo
  });
  node('ask-question').value = 'Count active MongoDB holons';
  return { node, requests, opened, tokenReads: () => tokenReads, changeIdentity: () => { identity = 'another'; },
    resetSession: ask.resetSession, refreshExampleProviders: ask.refreshExampleProviders, tabOpened: () => tabOpened };
}

test('grounds the WEB6 draft in ready discovered key names and exact set bounds', async () => {
  const text = "SELECT * FROM NewOASIS WHERE metadata.NativeKey = 'abc'";
  const profiles = { NewOASIS: { key: 'NativeKey', maximumKeys: 0, requiresSingleKeyFilter: true,
    accepts: value => value.length <= 8 } };
  const h = setup(() => ({ ok: true, status: 200, json: async () => ({ content: text }) }),
    null, sql => compile(sql, profiles), ['NewOASIS'], profiles);
  h.node('ask-question').value = 'Show the public record with native key abc';
  await h.node('ask-generate').click();
  const system = JSON.parse(h.requests[0].options.body).messages[0].content;
  assert.match(system, /available WEB4 providers: NewOASIS/);
  assert.match(system, /NewOASIS:metadata\.NativeKey\(0\)/);
  assert.match(system, /IN is allowed only when the bound is positive/);
  assert.doesNotMatch(system, /MongoDBOASIS|HederaAccountId|NostrEventId/);
  assert.deepEqual(h.opened, []);
});

test('uses only ready databases in executable WEB6 examples', async () => {
  const text = 'SELECT COUNT(DISTINCT Description) FROM Neo4jOASIS';
  const app = setup(() => ({ ok: true, json: async () => ({ content: text }) }),
    null, compile, ['Neo4jOASIS']);
  app.node('ask-question').value = 'Count unique descriptions in Neo4j';
  await app.node('ask-generate').click();
  const system = JSON.parse(app.requests[0].options.body).messages[0].content;
  assert.match(system, /FROM Neo4jOASIS/);
  assert.doesNotMatch(system, /FROM (MongoDBOASIS|SQLLiteDBOASIS)\b/);
  assert.equal(app.node('ask-draft').textContent, text);
  assert.deepEqual(app.opened, []);
});

test('rejects invalid and unsuccessful WEB6 responses before opening a CQL draft', async () => {
  const text = 'SELECT COUNT(*) FROM Neo4jOASIS';
  const cases = [
    [null, /invalid response/],
    [{ result: { content: 12 } }, /no CQL statement/],
    [{ content: ' ' }, /no CQL statement/],
    [{ isError: true, result: { content: text } }, /could not draft a query/]
  ];
  for (const [reply, expected] of cases) {
    const app = setup(() => ({ ok: true, status: 200, json: async () => reply }));
    await app.node('ask-generate').click();
    assert.match(app.node('ask-status').textContent, expected);
    assert.equal(app.node('ask-preview').disabled, true);
    assert.deepEqual(app.opened, []);
  }
});

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
  assert.match(request.messages[0].content, /currently available WEB4 providers: MongoDBOASIS, Neo4jOASIS/);
  assert.doesNotMatch(request.messages[0].content, /SuiObjectId|HederaAccountId|NostrEventId/);
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

test('a changed session clears the question, review draft and copied editor text', async () => {
  const text = "SELECT * FROM MongoDBOASIS WHERE Name = 'private query'";
  const app = setup(() => ({ ok: true, json: async () => ({ content: text }) }));
  await app.node('ask-generate').click();
  app.node('ask-preview').click();
  app.changeIdentity();
  app.resetSession();

  assert.equal(app.node('ask-question').value, '');
  assert.equal(app.node('ask-draft').textContent, '');
  assert.equal(app.node('ask-status').textContent, '');
  assert.equal(app.node('cql-text').value, '');
  assert.equal(app.node('ask-preview').disabled, true);
  assert.deepEqual(app.opened, [text]);
});

test('an old WEB6 response cannot repopulate a cleared session', async () => {
  const text = 'SELECT COUNT(*) FROM MongoDBOASIS';
  let respond, arrived;
  const requestStarted = new Promise(resolve => { arrived = resolve; });
  const app = setup(() => new Promise(resolve => {
    respond = resolve;
    arrived();
  }));
  const pending = app.node('ask-generate').click();
  await requestStarted;
  assert.equal(app.requests.length, 1);
  app.changeIdentity();
  app.resetSession();
  respond({ ok: true, json: async () => ({ content: text }) });
  await pending;

  assert.equal(app.node('ask-draft').textContent, '');
  assert.equal(app.node('ask-status').textContent, '');
  assert.equal(app.node('ask-preview').disabled, true);
  assert.equal(app.node('ask-generate').disabled, false);
});

test('waits for provider discovery without using WEB6', async () => {
  const app = setup(() => { throw new Error('Unexpected WEB6 request'); }, null, compile, []);
  await app.node('ask-generate').click();
  assert.deepEqual(app.requests, []);
  assert.equal(app.node('ask-preview').disabled, true);
  assert.match(app.node('ask-status').textContent, /Wait for WEB4 provider discovery/);
});

test('runs the current editor text only after it compiles', () => {
  const app = setup(() => { throw new Error('Unexpected WEB6 request'); });
  const actions = [];
  app.node('cql-run').click = () => actions.push('run');
  const query = 'SELECT * FROM MongoDBOASIS WHERE Version BETWEEN 2 AND 5';
  app.node('cql-text').value = query;
  app.node('cql-run-text').click();
  assert.deepEqual(app.opened, [query]);
  assert.deepEqual(actions, ['run']);
});

test('an invalid editor query never runs the previous prepared request', () => {
  const app = setup(() => { throw new Error('Unexpected WEB6 request'); }, null, t => compile(t));
  let ran = false;
  app.node('cql-run').click = () => { ran = true; };
  const load = app.node('cql-compile').click;
  app.node('cql-text').value = 'DELETE FROM MongoDBOASIS';
  load();
  app.node('cql-run-text').click();
  assert.equal(ran, false);
  assert.match(app.node('cql-note').textContent, /Expected SELECT/);
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

test('keeps the Playground available when the Free inference route is unconfigured', async () => {
  const app = setup(() => ({ ok: false, status: 400, json: async () => ({
    isError: true, errorCode: 'WEB6_FREE_ROUTE_UNAVAILABLE'
  }) }));
  await app.node('ask-generate').click();
  assert.match(app.node('ask-status').textContent, /Free AI drafting is temporarily unavailable/);
  assert.match(app.node('ask-status').textContent, /write and run CQL in the Playground/);
  assert.equal(app.node('ask-preview').disabled, true);
  assert.deepEqual(app.opened, []);
});

test('Ask your data can return counts with an unselected grouping field', async () => {
  const text = 'SELECT COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version';
  const app = setup(() => ({ ok: true, json: async () => ({ result: { content: text } }) }));
  app.node('ask-question').value = 'Count MongoDB holons per version and return only the counts';
  await app.node('ask-generate').click();
  const prompt = JSON.parse(app.requests[0].options.body).messages[0].content;
  assert.ok(prompt.includes(text));
  assert.equal(app.node('ask-draft').textContent, text);
  assert.deepEqual(compile(text).body.columns, [{ alias: 'Total', operation: 'LongCount' }]);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [text]);
});

test('Ask your data drafts a typed metadata projection with its requested alias', async () => {
  const text = 'SELECT CAST(metadata.stock AS INT64) AS Stock FROM MongoDBOASIS ORDER BY Stock DESC LIMIT 5';
  const app = setup(() => ({ ok: true, json: async () => ({ result: { content: text } }) }));
  app.node('ask-question').value = 'Show the top five stock values from MongoDB; metadata.stock is an Int64';
  await app.node('ask-generate').click();
  const prompt = JSON.parse(app.requests[0].options.body).messages[0].content;
  assert.ok(prompt.includes(text));
  assert.equal(app.node('ask-draft').textContent, text);
  const compiled = compile(text);
  assert.equal(compiled.path, 'data/query-cql/projection');
  assert.deepEqual(compiled.body.selectedOrder, [{ alias: 'Stock', descending: true }]);
  assert.deepEqual(compiled.body.columns,
    [{ metadataPath: ['stock'], valueType: 'Int64', nullable: true, alias: 'Stock' }]);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [text]);
});

test('Ask your data drafts DISTINCT typed metadata through the native grouped path', async () => {
  const text = 'SELECT DISTINCT CAST(metadata.stock AS INT64) AS Stock FROM MongoDBOASIS ORDER BY Stock LIMIT 5';
  const app = setup(() => ({ ok: true, json: async () => ({ result: { content: text } }) }));
  app.node('ask-question').value = 'Show five unique stock values from MongoDB. The stock metadata is Int64.';
  await app.node('ask-generate').click();
  const prompt = JSON.parse(app.requests[0].options.body).messages[0].content;
  assert.ok(prompt.includes(text));
  assert.equal(app.node('ask-draft').textContent, text);
  assert.deepEqual(compile(text).body.keys,
    [{ metadataPath: ['stock'], valueType: 'Int64', nullable: true, alias: 'Stock' }]);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [text]);
});

test('Ask your data drafts a scalar Decimal aggregate for review', async () => {
  const text = 'SELECT SUM(CAST(metadata.amount AS DECIMAL)) FROM MongoDBOASIS';
  const app = setup(() => ({ ok: true, json: async () => ({ result: { content: text } }) }));
  app.node('ask-question').value = 'Sum MongoDB metadata.amount, which is a Decimal.';
  await app.node('ask-generate').click();
  const prompt = JSON.parse(app.requests[0].options.body).messages[0].content;
  assert.ok(prompt.includes(text));
  assert.equal(app.node('ask-draft').textContent, text);
  const query = compile(text);
  assert.equal(query.path, 'data/query-cql/scalar');
  assert.equal(query.body.operation, 'Sum');
  assert.deepEqual(query.body.selection, { metadataPath: ['amount'], valueType: 'Decimal', nullable: true });
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [text]);
});

test('Ask your data drafts a bounded composite join on an available provider', async () => {
  const text = 'SELECT l.Id AS LeftId, r.Id AS RightId FROM (SELECT * FROM Neo4jOASIS ORDER BY Id LIMIT 2) AS l ' +
    'LEFT JOIN (SELECT * FROM Neo4jOASIS ORDER BY Id LIMIT 2) AS r ON l.Id = r.Id AND l.Version = r.Version';
  const app = setup(() => ({ ok: true, json: async () => ({ result: { content: text } }) }), null, compile, ['Neo4jOASIS']);
  app.node('ask-question').value = 'Left join two two-row Neo4j windows by ID and version, returning both IDs.';
  await app.node('ask-generate').click();
  const prompt = JSON.parse(app.requests[0].options.body).messages[0].content;
  assert.ok(prompt.includes(text));
  assert.match(prompt, /Both inputs must use the same available provider/);
  assert.equal(app.node('ask-draft').textContent, text);
  const query = compile(text);
  assert.equal(query.path, 'data/query-cql/join');
  assert.equal(query.body.kind, 'Left');
  assert.equal(query.body.maximumPairs, 4);
  assert.deepEqual(query.body.keys.map(key => [key.left.field, key.right.field]), [['Id', 'Id'], ['Version', 'Version']]);
  assert.equal(query.body.columns[1].allowMissing, true);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [text]);
});

test('chooses a ready provider for a public question without sending a draft', () => {
  const selected = [];
  const app = setup(() => { throw Error('Choosing an example must not send a draft'); }, provider => {
    selected.push(provider);
    return { provider, request: { take: 2, filters: [
      { metadataPath: ['HederaAccountId'], operator: 'In', value: ['0.0.2', '0.0.3'] }
    ] } };
  });
  const chooser = app.node('ask-example-provider');
  app.refreshExampleProviders();
  assert.deepEqual(Array.from(chooser.children, option => option.value), ['', 'HashgraphOASIS', 'HoloOASIS']);
  chooser.value = 'HashgraphOASIS';
  app.node('ask-use-example').click();
  assert.deepEqual(selected, ['HashgraphOASIS']);
  assert.match(app.node('ask-question').value, /HashgraphOASIS.*0\.0\.2.*0\.0\.3/);
  assert.equal(app.node('ask-question').focused, true);
  assert.equal(app.requests.length, 0);
});

test('grounds a paged CHILD JOIN and preserves explicit review', async () => {
  const sql = 'SELECT c.Id AS Child FROM (SELECT * FROM Neo4jOASIS LIMIT 2) AS p ' +
    'CHILD JOIN (SELECT * FROM Neo4jOASIS LIMIT 4) AS c ORDER BY Child ASC LIMIT 2 OFFSET 1';
  const app = setup(() => ({ ok: true, json: async () => ({ content: sql }) }), null, compile, ['Neo4jOASIS']);
  app.node('ask-question').value = 'Show two visible child IDs from two Neo4j records, ordered by ID and skipping the first child';
  await app.node('ask-generate').click();
  const system = JSON.parse(app.requests[0].options.body).messages[0].content;
  assert.match(system, /CHILD JOIN without ON/);
  assert.match(system, /matching signed integer fields/);
  assert.match(system, /LIMIT n OFFSET m outside both inputs/);
  assert.equal(app.node('ask-draft').textContent, sql);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [sql]);
  const { path, body } = compile(app.opened[0]);
  assert.equal(path, 'data/query-cql/join');
  assert.deepEqual([body.left.take, body.right.take, body.outputOffset, body.outputLimit], [2, 4, 1, 2]);
});

test('reviews a WEB6 signed integer join draft before compiling it for WEB4', async () => {
  const table = '(SELECT * FROM Neo4jOASIS LIMIT 2)';
  const sql = 'SELECT l.Id AS BeforeId, r.Id AS AfterId FROM ' + table + ' l INNER JOIN ' + table + ' r ON l.Version < r.Version';
  const app = setup(() => ({ ok: true, json: async () => ({ content: sql }) }), null, compile, ['Neo4jOASIS']);
  app.node('ask-question').value = 'Pair two bounded Neo4j windows where the first revision is lower.';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-draft').textContent, sql);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.equal(compile(app.opened[0]).body.keys[0].operator, 'LessThan');
});

test('temporary avatars request free inference and review only the exact public example keys', async () => {
  let query = "SELECT * FROM HashgraphOASIS WHERE metadata.HederaAccountId IN ('0.0.3', '0.0.2') LIMIT 2";
  const example = { provider: 'HashgraphOASIS', request: {take: 2, filters: [
    {metadataPath: ['HederaAccountId'], operator: 'In', value: ['0.0.2', '0.0.3']}
  ]} };
  const app = setup(() => ({ ok: true, json: async () => ({content:query}) }), example, compile,
    ['HashgraphOASIS','MongoDBOASIS'], {}, true);
  app.node('ask-example-provider').value = 'HashgraphOASIS';
  app.node('ask-use-example').click();
  await app.node('ask-generate').click();
  const request = JSON.parse(app.requests[0].options.body);
  assert.equal(request.freeOnly, true);
  assert.match(request.messages[0].content, /available WEB4 providers: HashgraphOASIS\./);
  assert.doesNotMatch(request.messages[0].content, /MongoDBOASIS/);
  assert.match(request.messages[0].content, /Preserve every supplied key verbatim, using IN for multiple keys/);
  assert.equal(app.node('ask-preview').disabled, false);
  assert.deepEqual(app.opened, []);
  query = "SELECT * FROM HashgraphOASIS WHERE metadata.HederaAccountId IN ('0.0.2','0.0.4') LIMIT 2";
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled, true);
  assert.match(app.node('ask-status').textContent, /did not preserve the reviewed public example/);
  assert.deepEqual(app.opened, []);
});

test('reviewed exact-key examples require the requested timeout', async () => {
  const text = "SELECT * FROM HashgraphOASIS WHERE metadata.HederaAccountId = '0.0.2' LIMIT 1";
  let content = text;
  const example = { provider: 'HashgraphOASIS', request: { take: 1, maximumDurationMilliseconds: 30000, filters: [
    { metadataPath: ['HederaAccountId'], operator: 'Equal', value: '0.0.2' }
  ] } };
  const app = setup(() => ({ ok: true, json: async () => ({ content }) }), example, compile, ['HashgraphOASIS']);
  app.node('ask-use-example').click();
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled, true);
  content = text + ' TIMEOUT 30000';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled, false);
  assert.deepEqual(app.opened, []);
});

const mappedId = '11000000-0000-0000-0000-000000000001';
const anotherMappedId = '11000000-0000-0000-0000-000000000002';
function mappedStatement(id = mappedId, provider = 'Neo4jOASIS') {
  return 'SELECT Id, CAST(metadata.name AS STRING) AS Original, '+
    'LENGTH(CAST(metadata.name AS STRING)) AS Units FROM '+provider+
    " WITH VIRTUAL MAPPING '"+id+"' WHERE LENGTH(metadata.name) >= 2 "+
    'ORDER BY Units DESC, Original ASC LIMIT 2 OFFSET 1';
}
function chooseMapping(app, id = mappedId, provider = 'Neo4jOASIS') {
  app.node('cql-virtual-mapping').value = id;
  app.node('cql-provider').value = provider;
}

test('grounds text length and reviews its compiled selected integer ordering', async () => {
  const sql = 'SELECT Id, LENGTH(Name) AS Units FROM Neo4jOASIS WHERE Name IS NOT NULL ORDER BY Units DESC LIMIT 2';
  const app = setup(() => ({ok:true,json:async()=>({content:sql})}),null,compile,['Neo4jOASIS']);
  app.node('ask-question').value='Show two non-null Neo4j names with the greatest text length';
  await app.node('ask-generate').click();
  const request=JSON.parse(app.requests[0].options.body);
  assert.match(request.messages[0].content,/UTF-16 units/);
  assert.match(request.messages[0].content,/No virtual mapping is selected/);
  assert.doesNotMatch(request.messages[0].content,/FROM MongoDBOASIS/);
  assert.equal(app.node('ask-preview').disabled,false);
  assert.deepEqual(app.opened,[]);
  app.node('ask-preview').click();
  assert.equal(compile(app.opened[0]).body.columns[1].function,'Utf16Length');
});

test('grounds one selected mapping/provider and reviews mixed computed ordering without running it', async () => {
  const sql=mappedStatement();
  const app=setup(()=>({ok:true,json:async()=>({content:sql})}),null,compile,
    ['MongoDBOASIS','Neo4jOASIS'],{},true);
  chooseMapping(app,mappedId.toUpperCase());
  app.node('ask-question').value='Use metadata.name as STRING, order by its length and then its text, skipping one record';
  await app.node('ask-generate').click();
  const request=JSON.parse(app.requests[0].options.body);
  assert.equal(request.freeOnly,true);
  assert.equal(request.injectAvatarContext,false);
  assert.deepEqual(request.tools,[]);
  assert.match(request.messages[0].content,/available WEB4 providers: Neo4jOASIS\./);
  assert.match(request.messages[0].content,new RegExp(mappedId));
  assert.match(request.messages[0].content,/Do not invent IDs, paths or types/);
  assert.match(request.messages[0].content,/OFFSET below 200/);
  assert.deepEqual(app.opened,[]);
  app.node('ask-preview').click();
  const compiled=compile(app.opened[0]);
  assert.equal(compiled.path,'data/query-cql/projection/mixed');
  assert.equal(compiled.body.virtualMappingId,mappedId);
  assert.deepEqual(compiled.body.selectedOrder,[{alias:'Units',descending:true},{alias:'Original',descending:false}]);
});

test('rejects an invented mapping, a dropped selected source and a different target provider', async () => {
  for(const sql of [mappedStatement(anotherMappedId),mappedStatement(mappedId,'MongoDBOASIS'),
    'SELECT Id, Name FROM Neo4jOASIS LIMIT 2']) {
    const app=setup(()=>({ok:true,json:async()=>({content:sql})}));
    chooseMapping(app);
    await app.node('ask-generate').click();
    assert.equal(app.node('ask-preview').disabled,true);
    assert.match(app.node('ask-status').textContent,/did not preserve the selected mapping and provider/);
    assert.deepEqual(app.opened,[]);
  }
});

test('rejects a model-created mapping when the visitor has not selected one', async () => {
  const app=setup(()=>({ok:true,json:async()=>({content:mappedStatement()})}));
  await app.node('ask-generate').click();
  assert.match(app.node('ask-status').textContent,/unselected virtual mapping/);
  assert.equal(app.node('ask-preview').disabled,true);
  assert.deepEqual(app.opened,[]);
});

test('validates mapping source input before obtaining a token or calling WEB6', async () => {
  for(const [id,provider] of [['bad','Neo4jOASIS'],['00000000-0000-0000-0000-000000000000','Neo4jOASIS'],
    [mappedId,'HoloOASIS']]) {
    const app=setup(()=>{throw Error('An invalid mapping must not invoke WEB6');});
    chooseMapping(app,id,provider);
    await app.node('ask-generate').click();
    assert.equal(app.tokenReads(),0);
    assert.equal(app.requests.length,0);
    assert.equal(app.node('ask-preview').disabled,true);
  }
});

test('does not draft a mapping against a currently unavailable database', async () => {
  const app=setup(()=>{throw Error('An unavailable target must not invoke WEB6');});
  chooseMapping(app,mappedId,'SQLLiteDBOASIS');
  await app.node('ask-generate').click();
  assert.equal(app.requests.length,0);
  assert.match(app.node('ask-status').textContent,/Wait for WEB4 provider discovery/);
});

test('a changed mapping or target cannot accept an in-flight WEB6 response', async () => {
  for(const change of ['mapping','provider']) {
    let respond,started;
    const arrived=new Promise(resolve=>{started=resolve;});
    const app=setup(()=>new Promise(resolve=>{respond=resolve;started();}));
    chooseMapping(app);
    const pending=app.node('ask-generate').click();
    await arrived;
    if(change==='mapping')app.node('cql-virtual-mapping').value=anotherMappedId;
    else app.node('cql-provider').value='MongoDBOASIS';
    respond({ok:true,json:async()=>({content:mappedStatement()})});
    await pending;
    assert.equal(app.node('ask-preview').disabled,true);
    assert.equal(app.node('ask-draft').textContent,'');
    assert.match(app.node('ask-status').textContent,/selected mapping changed/);
    assert.equal(app.node('ask-generate').disabled,false);
    assert.deepEqual(app.opened,[]);
  }
});

test('a programmatic source change after drafting cannot open the old reviewed query', async () => {
  const app=setup(()=>({ok:true,json:async()=>({content:mappedStatement()})}));
  chooseMapping(app);
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled,false);
  app.node('cql-virtual-mapping').value=anotherMappedId;
  app.node('ask-preview').click();
  assert.equal(app.node('ask-preview').disabled,true);
  assert.match(app.node('ask-status').textContent,/selected mapping changed/);
  assert.deepEqual(app.opened,[]);
});

test('manual mapping edits clear the draft immediately', async () => {
  const app=setup(()=>({ok:true,json:async()=>({content:mappedStatement()})}));
  chooseMapping(app);
  await app.node('ask-generate').click();
  app.node('cql-virtual-mapping').value=anotherMappedId;
  app.node('cql-virtual-mapping').input();
  assert.equal(app.node('ask-draft').textContent,'');
  assert.equal(app.node('ask-preview').disabled,true);
  assert.deepEqual(app.opened,[]);
});

test('choosing a public example clears the private mapping selection before drafting', async () => {
  const sql="SELECT * FROM HashgraphOASIS WHERE metadata.HederaAccountId = '0.0.2' LIMIT 1";
  const example={provider:'HashgraphOASIS',request:{take:1,filters:[
    {metadataPath:['HederaAccountId'],operator:'Equal',value:'0.0.2'}]}};
  const app=setup(()=>({ok:true,json:async()=>({content:sql})}),example,compile,
    ['HashgraphOASIS','Neo4jOASIS'],{},true);
  chooseMapping(app);
  app.node('cql-saved-mapping').value=mappedId;
  app.node('cql-mapping-note').textContent='Using the saved private mapping';
  app.node('ask-use-example').click();
  assert.equal(app.node('cql-virtual-mapping').value,'');
  assert.equal(app.node('cql-saved-mapping').value,'');
  assert.equal(app.node('cql-mapping-note').textContent,'');
  await app.node('ask-generate').click();
  const request=JSON.parse(app.requests[0].options.body);
  assert.match(request.messages[0].content,/available WEB4 providers: HashgraphOASIS\./);
  assert.doesNotMatch(request.messages[0].content,new RegExp(mappedId));
  assert.deepEqual(app.opened,[]);
  app.node('ask-preview').click();
  assert.equal(app.opened[0],sql);
});

test('a model draft cannot offer a mixed column that the native projection contract rejects', async () => {
  const sql='SELECT Id, CAST(metadata.amount AS DECIMAL) AS Amount FROM Neo4jOASIS '+
    "WITH VIRTUAL MAPPING '"+mappedId+"' WHERE metadata.tier = 'gold' ORDER BY Amount DESC LIMIT 2";
  const app=setup(()=>({ok:true,json:async()=>({content:sql})}));
  chooseMapping(app);
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled,true);
  assert.match(app.node('ask-status').textContent,/Mapped columns support/);
  assert.deepEqual(app.opened,[]);
});

test('a source-bound known DOUBLE draft stays review-only and retains its native schema', async () => {
  const sql='SELECT Id, CAST(metadata.rate AS DOUBLE) AS Rate FROM Neo4jOASIS '+
    "WITH VIRTUAL MAPPING '"+mappedId+"' WHERE CAST(metadata.rate AS DOUBLE) >= 3.25 ORDER BY Rate DESC LIMIT 2";
  const app=setup(()=>({ok:true,json:async()=>({content:sql})}));
  chooseMapping(app);
  app.node('ask-question').value='Show the two highest rates; rate is a Double metadata field in this mapping.';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled,false);
  assert.deepEqual(app.opened,[]);
  const sent=JSON.parse(app.requests[0].options.body);
  assert.match(sent.messages[0].content,/finite DOUBLE/);
  app.node('ask-preview').click();
  assert.equal(app.opened[0],sql);
});

test('a source-bound identity-only draft stays review-only and selects no data fields', async () => {
  const sql='SELECT Id FROM Neo4jOASIS WITH VIRTUAL MAPPING '+ "'"+mappedId+
    "' WHERE metadata.tier = 'gold' ORDER BY Id LIMIT 2";
  const app=setup(()=>({ok:true,json:async()=>({content:sql})}));
  chooseMapping(app);
  app.node('ask-question').value='List only the logical IDs for gold-tier records in my selected mapping.';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled,false);
  assert.deepEqual(app.opened,[]);
  const sent=JSON.parse(app.requests[0].options.body);
  assert.match(sent.messages[0].content,/Select Id alone/);
  app.node('ask-preview').click();
  assert.equal(app.opened[0],sql);
});

test('a source-bound mixed count is drafted for review without fetching or materializing data', async () => {
  const sql='SELECT COUNT(*) AS Total FROM Neo4jOASIS WITH VIRTUAL MAPPING '+ "'"+mappedId+
    "' WHERE metadata.tier = 'gold'";
  const app=setup(()=>({ok:true,json:async()=>({content:sql})}));
  chooseMapping(app);
  app.node('ask-question').value='Count my real and virtual records where the known tier text equals gold.';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled,false);
  assert.deepEqual(app.opened,[]);
  const sent=JSON.parse(app.requests[0].options.body);
  assert.match(sent.messages[0].content,/complete deduplicated identity union/);
  app.node('ask-preview').click();
  assert.equal(app.opened[0],sql);
});

test('a selected mapping can draft native computed SUM for explicit review', async () => {
  const sql='SELECT SUM(LENGTH(CAST(metadata.name AS STRING))) AS Total FROM Neo4jOASIS WITH VIRTUAL MAPPING '+ "'"+mappedId+
    "' WHERE LENGTH(metadata.name) >= 2";
  const app=setup(()=>({ok:true,json:async()=>({content:sql})}));
  chooseMapping(app);
  app.node('ask-question').value='Sum the UTF16 lengths of my mapped String name values with at least two units.';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled,false); assert.deepEqual(app.opened,[]);
  app.node('ask-preview').click(); assert.equal(app.opened[0],sql);
});

test('a selected mapping can draft an exact distinct value count for review without executing it', async () => {
  const sql='SELECT COUNT(DISTINCT CAST(metadata.region AS STRING)) AS Regions FROM Neo4jOASIS WITH VIRTUAL MAPPING '+ "'"+mappedId+
    "' WHERE metadata.tier = 'gold'";
  const app=setup(()=>({ok:true,json:async()=>({content:sql})}));
  chooseMapping(app);
  app.node('ask-question').value='Count distinct mapped STRING region values, excluding null.';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled,false); assert.deepEqual(app.opened,[]);
  app.node('ask-preview').click(); assert.equal(app.opened[0],sql);
});

test('a selected mapping can draft text MAX for review and keeps exact text schema', async () => {
  const sql='SELECT MAX(CAST(metadata.region AS STRING)) AS LastRegion FROM Neo4jOASIS WITH VIRTUAL MAPPING '+ "'"+mappedId+
    "' WHERE metadata.tier = 'gold'";
  const app=setup(()=>({ok:true,json:async()=>({content:sql})}));
  chooseMapping(app); app.node('ask-question').value='Find the last mapped STRING region in Unicode scalar order.';
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled,false); assert.deepEqual(app.opened,[]);
  app.node('ask-preview').click(); assert.equal(app.opened[0],sql);
});


for (const distinct of [false, true]) {
  test('a source-bound mapped ' + (distinct ? 'DISTINCT' : 'GROUP BY') + ' draft requires review before execution', async () => {
    const sql = (distinct
      ? 'SELECT DISTINCT CAST(metadata.region AS STRING) AS Region'
      : 'SELECT CAST(metadata.region AS STRING) AS Region, COUNT(*) AS Total') +
      " FROM Neo4jOASIS WITH VIRTUAL MAPPING '" + mappedId + "' WHERE metadata.tier = 'gold'" +
      (distinct ? ' ORDER BY Region LIMIT 3' : ' GROUP BY Region HAVING Total >= 2 ORDER BY Total DESC LIMIT 3');
    const app = setup(() => ({ok:true,json:async()=>({content:sql})}));
    chooseMapping(app);
    app.node('ask-question').value = 'Use the selected mapping, known STRING region and STRING tier; ' +
      (distinct ? 'list unique regions for gold tier' : 'count gold-tier rows by region, keeping at least two, highest counts first');
    await app.node('ask-generate').click();
    assert.equal(app.node('ask-preview').disabled, false);
    assert.deepEqual(app.opened, []);
    const sent = JSON.parse(app.requests[0].options.body);
    assert.match(sent.messages[0].content, /GROUP BY over known direct typed metadata keys/);
    assert.match(sent.messages[0].content, /before grouping, HAVING/);
    app.node('ask-preview').click();
    assert.equal(app.opened[0], sql);
    const compiled = compile(sql);
    assert.equal(compiled.body.resultOperation, 'Group');
    assert.equal(compiled.body.virtualMappingId, mappedId);
    assert.equal(compiled.body.provider, 'Neo4jOASIS');
  });
}
test('mapped grouped drafts cannot switch the selected mapping or provider', async () => {
  for (const [id, provider] of [[anotherMappedId, 'Neo4jOASIS'], [mappedId, 'MongoDBOASIS']]) {
    const sql = 'SELECT CAST(metadata.region AS STRING) AS Region, COUNT(*) AS Total FROM ' + provider +
      " WITH VIRTUAL MAPPING '" + id + "' WHERE metadata.tier = 'gold' GROUP BY Region";
    const app = setup(() => ({ok:true,json:async()=>({content:sql})}));
    chooseMapping(app);
    await app.node('ask-generate').click();
    assert.equal(app.node('ask-preview').disabled, true);
    assert.match(app.node('ask-status').textContent, /did not preserve the selected mapping and provider/);
    assert.deepEqual(app.opened, []);
  }
});


test('grouped distinct WEB6 draft retains both counts and requires review before explicit execution', async () => {
  const text = 'SELECT Version, COUNT(Description) AS Present, COUNT(DISTINCT Description) AS UniqueValues ' +
    'FROM Neo4jOASIS GROUP BY Version HAVING COUNT(DISTINCT Description) > 1 ' +
    'ORDER BY COUNT(DISTINCT Description) DESC LIMIT 5';
  const app = setup(() => ({ ok: true, json: async () => ({ content: text }) }),
    null, compile, ['Neo4jOASIS']);
  const actions = [];
  app.node('cql-run').click = () => actions.push('run');
  app.node('ask-question').value = 'Count unique and present descriptions per version in Neo4j';
  await app.node('ask-generate').click();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].url, 'https://dev.api.web6.oasisomniverse.one/v1/complete');
  assert.deepEqual(app.opened, []);
  assert.deepEqual(actions, []);
  assert.equal(app.node('ask-draft').textContent, text);
  assert.equal(app.node('ask-preview').disabled, false);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [text]);
  assert.deepEqual(actions, []);
  assert.equal(app.node('cql-text').value, text);
  const query = compile(app.node('cql-text').value);
  assert.equal(query.body.columns[1].distinct, undefined);
  assert.equal(query.body.columns[2].distinct, true);
  assert.equal(query.body.resultFilters[0].alias, 'UniqueValues');
  assert.equal(query.body.resultOrder[0].alias, 'UniqueValues');
  app.node('cql-run-text').click();
  assert.deepEqual(actions, ['run']);
  assert.equal(app.requests.length, 1);
});

test('grouped distinct WEB6 rejects unproved normalized domains before editor or execution', async () => {
  const text = 'SELECT Version, COUNT(DISTINCT CAST(metadata.owner AS GUID)) AS Owners ' +
    'FROM Neo4jOASIS GROUP BY Version';
  const app = setup(() => ({ ok: true, json: async () => ({ content: text }) }),
    null, compile, ['Neo4jOASIS']);
  const actions = [];
  app.node('cql-run').click = () => actions.push('run');
  app.node('ask-question').value = 'Count different owner GUIDs per version in Neo4j';
  await app.node('ask-generate').click();
  assert.equal(app.requests.length, 1);
  assert.match(app.node('ask-status').textContent, /Grouped COUNT DISTINCT requires/);
  assert.equal(app.node('ask-preview').disabled, true);
  assert.equal(app.node('ask-draft').textContent, '');
  assert.equal(app.node('cql-text').value, '');
  assert.deepEqual(app.opened, []);
  assert.deepEqual(actions, []);
});

test('grounds and reviews typed UUID mapping filters without executing data', async () => {
  const identity = 'AB8079E8-5E72-4FF9-81B7-8FECE973C50A';
  const sql = 'SELECT Id, CAST(metadata.identity AS GUID) AS Identity FROM Neo4jOASIS ' +
    "WITH VIRTUAL MAPPING '" + mappedId + "' WHERE CAST(metadata.identity AS GUID) = '" + identity + "' ORDER BY Id LIMIT 2";
  const app = setup(() => ({ok:true,json:async()=>({content:sql})}),null,compile,['Neo4jOASIS']);
  chooseMapping(app);
  app.node('ask-question').value = 'Use the selected mapping. metadata.identity is GUID. Find identity ' + identity;
  await app.node('ask-generate').click();
  assert.equal(app.requests.length, 1);
  const request = JSON.parse(app.requests[0].options.body);
  assert.match(request.messages[0].content, /Mapped metadata types are STRING, BOOLEAN, GUID/);
  assert.match(request.messages[0].content, /GUID range comparisons, IN and LENGTH\(GUID\) are unsupported/);
  assert.equal(app.node('ask-preview').disabled, false);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  assert.deepEqual(app.opened, [sql]);
  const compiled = compile(app.opened[0]);
  assert.equal(compiled.path, 'data/query-cql/projection/mixed');
  assert.equal(compiled.body.virtualMappingId, mappedId);
  assert.deepEqual(compiled.body.filters, [{metadataPath:['identity'],scalar:'Guid',operator:'Equal',value:identity}]);
  assert.equal(app.requests.length, 1, 'Review must not send an automatic data query.');
});

test('grounds exact mapped Int32 filters and retains review before data execution', async () => {
  const sql = 'SELECT Id, CAST(metadata.stock AS INT32) AS Stock FROM Neo4jOASIS ' +
    "WITH VIRTUAL MAPPING '" + mappedId + "' WHERE CAST(metadata.stock AS INT32) > 0 ORDER BY Stock DESC, Id LIMIT 2";
  const app = setup(() => ({ok:true,json:async()=>({content:sql})}),null,compile,['Neo4jOASIS']);
  chooseMapping(app);
  app.node('ask-question').value = 'metadata.stock is INT32. Show two positive stock values in the selected mapping.';
  await app.node('ask-generate').click();
  const request = JSON.parse(app.requests[0].options.body);
  assert.match(request.messages[0].content, /do not substitute INT64 for a declared INT32 field/);
  assert.equal(app.node('ask-preview').disabled, false);
  assert.deepEqual(app.opened, []);
  app.node('ask-preview').click();
  const query = compile(app.opened[0]);
  assert.equal(query.body.virtualMappingId, mappedId);
  assert.deepEqual(query.body.filters, [{metadataPath:['stock'],scalar:'Int32',operator:'GreaterThan',value:0}]);
  assert.equal(app.requests.length, 1, 'Opening review must not run an automatic data query.');
});


test('editor parameter preview binds JSON and refuses malformed JSON before opening a request', () => {
  const h=setup(() => { throw new Error('No WEB6 call expected'); });
  h.node('cql-text').value='SELECT * FROM MongoDBOASIS WHERE Name = @name LIMIT 5';
  h.node('cql-text-parameters').value=JSON.stringify({name:"Coffee'; DROP TABLE x"});
  h.node('cql-compile').click();
  assert.equal(h.opened.length,1);
  h.node('cql-text-parameters').value='{';
  h.node('cql-compile').click();
  assert.equal(h.opened.length,1);
  assert.ok(h.node('cql-note').textContent);
  assert.equal(h.requests.length,0);
});


test('parameter example loads the selected ready provider and stays review-only', () => {
  const h=setup(() => { throw new Error('No WEB6 call expected'); });
  h.node('cql-provider').value='Neo4jOASIS';
  h.node('cql-load-parameter-example').click();
  assert.match(h.node('cql-text').value,/FROM Neo4jOASIS WHERE Version >= @minimum/);
  assert.deepEqual(JSON.parse(h.node('cql-text-parameters').value),{minimum:1,active:true});
  assert.equal(h.opened.length,0);assert.equal(h.requests.length,0);
  h.node('cql-compile').click();
  assert.equal(h.opened.length,1);
  const previous=h.node('cql-text').value;
  h.node('cql-provider').value='HashgraphOASIS';
  h.node('cql-load-parameter-example').click();
  assert.equal(h.node('cql-text').value,previous);
  assert.match(h.node('cql-note').textContent,/ready MongoDB/);
  assert.equal(h.opened.length,1);assert.equal(h.requests.length,0);
});

test('Ask drafts selected-value set operations and waits for explicit review', async()=>{
  for(const operator of ['UNION','UNION ALL','INTERSECT','EXCEPT']){
    const text='SELECT Name AS Label FROM Neo4jOASIS WHERE IsActive = TRUE '+operator+
      ' SELECT Name FROM Neo4jOASIS WHERE Version >= 2 ORDER BY Label LIMIT 5';
    const app=setup(()=>({ok:true,json:async()=>({content:text})}),null,compile,['Neo4jOASIS']);
    app.node('ask-question').value='Compare active names with version two names in Neo4j';
    await app.node('ask-generate').click();
    const prompt=JSON.parse(app.requests[0].options.body).messages[0].content;
    assert.match(prompt,/equality uses only the selected values/);
    assert.match(prompt,/aliases come from the left/);
    assert.doesNotMatch(prompt,/FROM (MongoDBOASIS|SQLLiteDBOASIS)\b/);
    assert.equal(app.node('ask-draft').textContent,text);
    assert.deepEqual(app.opened,[]);
    app.node('ask-preview').click();
    const request=compile(app.opened[0]);
    assert.equal(request.path,'data/query-cql/set');
    assert.deepEqual(request.body.ordering,[{field:'Label',descending:false}]);
    assert.equal(request.body.take,5);
  }
});
test('Ask refuses a selected-value set draft with a hidden result sort', async()=>{
  const text='SELECT Name AS Label FROM Neo4jOASIS UNION SELECT Name FROM Neo4jOASIS ORDER BY Id';
  const app=setup(()=>({ok:true,json:async()=>({content:text})}),null,compile,['Neo4jOASIS']);
  await app.node('ask-generate').click();
  assert.equal(app.node('ask-preview').disabled,true);
  assert.deepEqual(app.opened,[]);
});

test('Ask drafts native text coalescing on a ready database and still requires review',async()=>{
  const text="SELECT COALESCE(Description, 'Unnamed') AS Label FROM Neo4jOASIS ORDER BY Label LIMIT 5";
  const app=setup(()=>({ok:true,json:async()=>({content:text})}),null,compile,['Neo4jOASIS']);
  app.node('ask-question').value='Show five Neo4j descriptions, using Unnamed for missing descriptions';
  await app.node('ask-generate').click();
  const prompt=JSON.parse(app.requests[0].options.body).messages[0].content;
  assert.match(prompt,/COALESCE\(Description/);
  assert.match(prompt,/stored invalid types are errors/);
  assert.doesNotMatch(prompt,/FROM (MongoDBOASIS|SQLLiteDBOASIS)\b/);
  assert.equal(app.node('ask-draft').textContent,text);
  assert.deepEqual(app.opened,[]);
  app.node('ask-preview').click();
  const request=compile(app.opened[0]);
  assert.equal(request.path,'data/query-cql/projection');
  assert.equal(request.body.columns[0].function,'TextCoalesce');
  assert.equal(request.body.columns[0].nullReplacement,'Unnamed');
  assert.deepEqual(request.body.selectedOrder,[{alias:'Label',descending:false}]);
});

test('Ask conditional text requires review on a ready provider',async()=>{
 const text="SELECT CASE WHEN IsActive THEN 'Active' ELSE 'Inactive' END AS Status FROM Neo4jOASIS ORDER BY Status LIMIT 5";
 const app=setup(()=>({ok:true,json:async()=>({content:text})}),null,compile,['Neo4jOASIS']);
 app.node('ask-question').value='Show Neo4j records with Active or Inactive labels';
 await app.node('ask-generate').click();
 const prompt=JSON.parse(app.requests[0].options.body).messages[0].content;
 assert.match(prompt,/CASE WHEN IsActive/);
 assert.doesNotMatch(prompt,/FROM (MongoDBOASIS|SQLLiteDBOASIS)\b/);
 assert.equal(app.node('ask-draft').textContent,text);assert.deepEqual(app.opened,[]);
 app.node('ask-preview').click();
 const request=compile(app.opened[0]);
 assert.equal(request.body.columns[0].function,'BooleanTextCase');
 assert.equal(request.body.columns[0].whenTrue,'Active');
 assert.equal(request.body.columns[0].whenFalse,'Inactive');
});

test('Ask captures a known Boolean metadata CASE and keeps review explicit',async()=>{
 const text="SELECT CASE WHEN CAST(metadata.flag AS BOOLEAN) THEN 'Yes' ELSE 'No' END AS Label FROM Neo4jOASIS ORDER BY Label LIMIT 5";
 const app=setup(()=>({ok:true,json:async()=>({content:text})}),null,compile,['Neo4jOASIS']);
 app.node('ask-question').value='The metadata flag field is Boolean. Label five Neo4j records Yes or No using flag';
 await app.node('ask-generate').click();
 const prompt=JSON.parse(app.requests[0].options.body).messages[0].content;
 assert.match(prompt,/Never guess a metadata path or its type/);
 assert.match(prompt,/missing, null or invalid Boolean values are errors/);
 assert.equal(app.node('ask-draft').textContent,text);assert.deepEqual(app.opened,[]);
 app.node('ask-preview').click();
 const column=compile(app.opened[0]).body.columns[0];
 assert.deepEqual(column.metadataPath,['flag']);assert.equal(column.valueType,'Boolean');
 assert.equal(column.nullable,false);assert.equal(column.function,'BooleanTextCase');
});

test('Ask drafts exact nullable Int32 replacement and still requires review',async()=>{
 const text='SELECT COALESCE(CAST(metadata.stock AS INT32), 0) AS Stock FROM Neo4jOASIS ORDER BY Stock LIMIT 5';
 const app=setup(()=>({ok:true,json:async()=>({content:text})}),null,compile,['Neo4jOASIS']);
 app.node('ask-question').value='metadata.stock is nullable Int32. Show five Neo4j stock values using zero for missing stock';
 await app.node('ask-generate').click();
 const prompt=JSON.parse(app.requests[0].options.body).messages[0].content;
 assert.match(prompt,/nullable Int32 metadata/);assert.match(prompt,/-2147483648 to 2147483647/);
 assert.doesNotMatch(prompt,/FROM (MongoDBOASIS|SQLLiteDBOASIS)\b/);
 assert.equal(app.node('ask-draft').textContent,text);assert.deepEqual(app.opened,[]);
 app.node('ask-preview').click();
 const column=compile(app.opened[0]).body.columns[0];
 assert.deepEqual(column.metadataPath,['stock']);assert.equal(column.valueType,'Int32');
 assert.equal(column.nullable,true);assert.equal(column.function,'Int32Coalesce');assert.equal(column.int32Replacement,0);
});

test('Ask mapped computed rows preserve source, free visitor scope and review before execution',async()=>{
 const sql="SELECT Id, COALESCE(CAST(metadata.label AS STRING), 'Unnamed') AS Label, CASE WHEN CAST(metadata.flag AS BOOLEAN) THEN 'Yes' ELSE 'No' END AS Status, COALESCE(CAST(metadata.stock AS INT32), 0) AS Stock FROM Neo4jOASIS WITH VIRTUAL MAPPING '"+mappedId+"' ORDER BY Stock DESC, Id LIMIT 5";
 const app=setup(()=>({ok:true,json:async()=>({content:sql})}),null,compile,['Neo4jOASIS'],{},true);
 chooseMapping(app);
 app.node('ask-question').value='Use the selected mapping. label is STRING, flag is required BOOLEAN and stock is nullable INT32. Show labels with Unnamed for null, Yes/No flag labels and zero for missing stock, highest stock first.';
 await app.node('ask-generate').click();
 const request=JSON.parse(app.requests[0].options.body);
 assert.equal(request.freeOnly,true);assert.equal(request.injectAvatarContext,false);
 assert.match(request.messages[0].content,/mapped row columns admit/);
 assert.match(request.messages[0].content,/These mapped computations are row-only/);
 assert.doesNotMatch(request.messages[0].content,/aggregates or virtual mappings|virtual CASE queries|virtual mappings; these contracts are not enrolled/);
 assert.equal(app.node('ask-preview').disabled,false);assert.deepEqual(app.opened,[]);
 app.node('ask-preview').click();
 const q=compile(app.opened[0]);assert.equal(q.path,'data/query-cql/projection/mixed');
 assert.equal(q.body.virtualMappingId,mappedId);
 assert.deepEqual(q.body.columns.slice(1).map(c=>c.function),['TextCoalesce','BooleanTextCase','Int32Coalesce']);
 assert.equal(app.requests.length,1,'Review must not run a data query.');
});
test('Ask mapped computed response cannot substitute another saved mapping',async()=>{
 const sql="SELECT Id, COALESCE(CAST(metadata.stock AS INT32), 0) AS Stock FROM Neo4jOASIS WITH VIRTUAL MAPPING '"+anotherMappedId+"' ORDER BY Stock LIMIT 5";
 const app=setup(()=>({ok:true,json:async()=>({content:sql})}),null,compile,['Neo4jOASIS']);
 chooseMapping(app);await app.node('ask-generate').click();
 assert.equal(app.node('ask-preview').disabled,true);
 assert.match(app.node('ask-status').textContent,/did not preserve the selected mapping and provider/);
 assert.deepEqual(app.opened,[]);
});
