// Run with node --test cql-playground.test.cjs. No package installation is needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cql = require('./cql-playground.js');

test('every provider and preset produces a bounded JSON request for a fixed CQL route', () => {
  for (const provider of cql.providers) {
    for (const name of Object.keys(cql.presets)) {
      const request = cql.preset(name, provider);
      assert.match(request.path, /^data\/query-cql(?:\/(?:scalar|federation))?$/);
      assert.deepEqual(cql.parse(JSON.stringify(request.body)), request.body);
      if (name !== 'federation') assert.equal(request.body.provider, provider);
    }
  }
});

test('federation preserves copies and limits provider attempts without a leaf provider override', () => {
  const { body } = cql.preset('federation', cql.providers[0]);
  assert.deepEqual(body.providers, cql.providers);
  assert.equal(body.scope, 'Named');
  assert.equal(body.identityMode, 'PreserveCopies');
  assert.equal(body.maximumProviderAttempts, 3);
  assert.equal(body.source.provider, undefined);
  assert.equal(body.source.take, 10);
});

test('count omits take so cardinality is not accidentally limited to one page', () => {
  const { body, path } = cql.preset('count', cql.providers[0]);
  assert.equal(path, 'data/query-cql/scalar');
  assert.equal(body.operation, 'LongCount');
  assert.equal(body.take, undefined);
  assert.equal(body.includeMetadata, undefined);
});

test('AND / OR keeps the AND filter outside its OR group', () => {
  const { body } = cql.preset('either', cql.providers[0]);
  assert.equal(body.filters[0].field, 'IsActive');
  assert.deepEqual(body.anyOf.map(filter => filter.value), ['coffee', 'tea']);
});

test('presets are fresh objects and reject prototype members and unknown providers', () => {
  cql.preset('metadata', cql.providers[0]).body.filters[0].metadataPath.push('changed');
  assert.deepEqual(cql.preset('metadata', cql.providers[0]).body.filters[0].metadataPath, ['category']);
  assert.throws(() => cql.preset('toString', cql.providers[0]));
  assert.throws(() => cql.preset('browse', 'unregistered'));
});

test('JSON parser enforces UTF8 bytes and rejects non-object roots', () => {
  assert.throws(() => cql.parse('[]'));
  assert.throws(() => cql.parse('null'));
  assert.throws(() => cql.parse('true'));
  assert.throws(() => cql.parse('{ broken'));
  assert.throws(() => cql.parse(JSON.stringify({ value: '😀'.repeat(8192) })), /32 KiB/);
});

test('OASIS error wrapper remains an error rather than a successful data envelope', () => {
  const failure = { isError: true, errorCode: 'CQL_CAPABILITY_UNSUPPORTED' };
  assert.equal(cql.unwrap({ result: failure }), failure);
  assert.equal(cql.unwrap(failure), failure);
});

test('local Oracle examples use only the fixed loopback host and supported preset names', () => {
  for (const [name, example] of Object.entries(cql.localOraclePresets)) {
    const selected = cql.localOraclePreset(name);
    const url = new URL(selected.url);
    assert.equal(url.origin, 'http://127.0.0.1:5090');
    assert.deepEqual([...url.searchParams], [['preset', name]]);
    assert.equal(selected.expectedRows, example.rows);
    assert.equal(url.username, '');
    assert.equal(url.password, '');
  }
  for (const invalid of ['toString', 'constructor', 'shutdown', 'https://example.invalid'])
    assert.throws(() => cql.localOraclePreset(invalid));
});

// Exercise the asynchronous UI boundary without installing a DOM library.
// These are client controls; live provider/admission proof is recorded separately.
function harness(fetcher, discover, setup = {}) {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const elements = new Map();
  function element() {
    return {
      value: '', textContent: '', children: [], listeners: {}, disabled: false,
      focus() { this.focused = true; },
      add(option) { this.children.push(option); if (!this.value) this.value = option.value; },
      append(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; this.value = ''; },
      addEventListener(name, action) { this.listeners[name] = action; },
      createTHead() { const child = element(); this.children.push(child); return child; },
      createTBody() { const child = element(); this.children.push(child); return child; },
      insertRow() { const child = element(); this.children.push(child); return child; },
      insertCell() { const child = element(); this.children.push(child); return child; }
    };
  }
  const context = {
    TextEncoder, AbortController, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    CqlText: require('./cql-text.js'),
    CqlDemoPreparation: require('./cql-demo-preparation.js'), localStorage: setup.storage,
    fetch: async (...args) => {
      const response = args[0].endsWith('/api/data/query-cql/providers?examplesVersion=2')
        ? await (discover || (async () => ({ ok: true, status: 200, json: async () => ({ isError: false,
          result: cql.providers.map(provider => ({ provider, available: true, queryOnly: false, federationAvailable: true, examples: [] })) }) })))(...args)
        : await fetcher(...args);
      response.headers ??= { get: () => null };
      return response;
    },
    Option: function (text, value) { this.text = text; this.value = value; },
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('./cql-playground.js'), 'utf8'), context);
  let token = 'test-token';
  const ui = context.CqlPlayground.init({ getToken: () => setup.session ? setup.session.token : token,
    getIdentity: setup.session ? () => setup.session.identity : undefined,
    ensureAccessToken: setup.session ? () => setup.session.ensure() : undefined,
    getBase: () => 'https://example.invalid', request: setup.request ?? null, canPrepare: () => setup.canPrepare === true });
  return { elements, ui, signOut() { token = null; ui.syncAuth(); } };
}

test('draft provider scope only includes available supported identities from the current session', async () => {
  const h = harness(() => { throw new Error('Unexpected query'); }, async () => ({
    ok: true, status: 200, json: async () => ({ isError: false, result: [
      { provider: 'MongoDBOASIS', available: true, queryOnly: false, federationAvailable: true },
      { provider: 'Neo4jOASIS', available: false, queryOnly: false, federationAvailable: false },
      { provider: 'NostrOASIS', available: true, queryOnly: true, federationAvailable: true },
      { provider: 'DuckDBOASIS', available: true, queryOnly: true, federationAvailable: true }
    ] })
  }));
  await h.ui.ready;
  assert.deepEqual(Array.from(h.ui.availableTextProviders()), ['MongoDBOASIS', 'NostrOASIS']);
  h.signOut();
  assert.deepEqual(Array.from(h.ui.availableTextProviders()), []);
});

test('uses discovered native key profiles only for the active signed-in visitor', async () => {
  const h = harness(() => { throw new Error('Unexpected query'); }, async () => ({
    ok: true, status: 200, json: async () => ({ isError: false, result: [
      { provider: 'MongoDBOASIS', available: true, queryOnly: false, federationAvailable: true },
      { provider: 'NewOASIS', available: true, queryOnly: true, federationAvailable: true,
        textKeyProfile: { metadataKey: 'NativeKey', maximumKeyCharacters: 6, maximumSetKeys: 2 } },
      { provider: 'OfflineOASIS', available: false, queryOnly: true, federationAvailable: false,
        textKeyProfile: { metadataKey: 'NativeKey', maximumKeyCharacters: 6, maximumSetKeys: 2 } }
    ] })
  }));
  await h.ui.ready;
  assert.deepEqual(Array.from(h.ui.availableTextProviders()), ['MongoDBOASIS', 'NewOASIS']);
  const query = h.ui.compileAvailableText("SELECT * FROM NewOASIS WHERE metadata.NativeKey IN ('a', 'b')");
  assert.equal(query.body.provider, 'NewOASIS');
  assert.throws(() => h.ui.compileAvailableText("SELECT * FROM OfflineOASIS WHERE metadata.NativeKey = 'a'"));
  assert.equal(h.ui.availableTextProfiles().NewOASIS.maximumKeys, 2);
  h.signOut();
  assert.deepEqual(Object.keys(h.ui.availableTextProfiles()), []);
  assert.throws(() => h.ui.compileAvailableText("SELECT * FROM NewOASIS WHERE metadata.NativeKey = 'a'"));
});

test('API failures display their status/code and never render success rows', async () => {
  const h = harness(async () => ({ ok: false, status: 503,
    json: async () => ({ isError: true, errorCode: 'CQL_ADMISSION_REQUIRED', message: 'Admission required' }) }));
  await h.ui.ready;
  await h.elements.get('cql-run').listeners.click();
  assert.match(h.elements.get('cql-note').textContent, /503.*CQL_ADMISSION_REQUIRED/);
  assert.equal(h.elements.get('cql-results').children.length, 0);
  assert.equal(h.elements.get('cql-run').disabled, false);
});

test('local Oracle link works without signing in and never sends the hosted bearer or edited request', async () => {
  let requests = 0;
  const h = harness(async () => { requests++; throw new Error('No native fetch through hosted auth.'); });
  await h.ui.ready;
  h.signOut();
  h.elements.get('cql-request').value = '{"actorId":"private-owner","token":"never-share"}';
  const chooser = h.elements.get('cql-oracle-preset');
  chooser.value = 'metadata';
  chooser.listeners.change();
  assert.equal(h.elements.get('cql-oracle-open').href, 'http://127.0.0.1:5090/?preset=metadata');
  assert.match(h.elements.get('cql-oracle-note').textContent, /4 expected physical copies/);
  assert.equal(requests, 0);
});

test('a late response after sign-out cannot restore data from the previous identity', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const h = harness(() => new Promise(resolve => { release = resolve; entered(); }));
  await h.ui.ready;
  const running = h.elements.get('cql-run').listeners.click();
  await started;
  h.signOut();
  release({ ok: true, status: 200, json: async () => ({ isError: false, result: {
    provider: 'MongoDBOASIS', rows: [{ name: 'private record' }] } }) });
  await running;
  assert.equal(h.elements.get('cql-results').children.length, 0);
  assert.equal(h.elements.get('cql-response').textContent, '');
  assert.equal(h.elements.get('cql-run').disabled, true);
});

test('stored markup is assigned to textContent and each query uses the current bearer', async () => {
  let captured;
  const markup = '<img src=x onerror=alert(1)>';
  const h = harness(async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200, json: async () => ({ isError: false,
      result: { provider: 'MongoDBOASIS', rows: [{ name: markup, metadata: {} }] } }) };
  });
  await h.ui.ready;
  await h.elements.get('cql-run').listeners.click();
  const table = h.elements.get('cql-results').children[0];
  assert.equal(table.children[1].children[0].children[1].textContent, markup);
  assert.equal(captured.options.headers.Authorization, 'Bearer test-token');
  assert.match(captured.options.headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
  assert.equal(captured.url, 'https://example.invalid/api/data/query-cql');
});

test('cancelling an in-flight query does not retry or claim server cancellation', async () => {
  let calls = 0, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const h = harness((url, options) => {
    calls++;
    return new Promise((resolve, reject) => {
      if (options.signal.aborted) reject(new Error('aborted'));
      else options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      entered();
    });
  });
  await h.ui.ready;
  const running = h.elements.get('cql-run').listeners.click();
  await started;
  h.elements.get('cql-cancel').listeners.click();
  await running;
  assert.equal(calls, 1);
  assert.match(h.elements.get('cql-note').textContent, /Server work may already have executed/);
});

function publicSource(provider = 'ActivityPubOASIS') {
  return { provider, available: true, queryOnly: true, federationAvailable: false, examples: [{
    id: 'public-posts', label: 'Read public native records', request: {
      provider, orderBy: 'None', take: 25, filters: [{ metadataPath: ['NativeKey'], scalar: 'String',
        operator: 'In', value: ['101', '102', '103'] }]
    }
  }] };
}

test('server-owned examples work for discovered sources without adding client provider cases', () => {
  for (const provider of ['ActivityPubOASIS', 'IPFSOASIS']) {
    const sources = cql.catalogue({ result: [publicSource(provider)] });
    assert.deepEqual(cql.profileChoices(sources[0], sources).map(row => row.id), ['host:public-posts']);
    const chosen = cql.profilePreset(sources[0], 'host:public-posts');
    assert.equal(chosen.path, 'data/query-cql');
    assert.equal(chosen.body.provider, provider);
    chosen.body.filters[0].value.push('changed');
    assert.equal(cql.profilePreset(sources[0], 'host:public-posts').body.filters[0].value.length, 3);
  }
});

test('malformed, duplicate or mis-scoped catalogue entries reject instead of enabling a source', () => {
  assert.throws(() => cql.catalogue({ result: [publicSource(), publicSource()] }));
  const missing = publicSource(); delete missing.provider;
  assert.throws(() => cql.catalogue({ result: [missing] }));
  const wrongScope = publicSource(); wrongScope.examples[0].request.provider = 'MongoDBOASIS';
  assert.throws(() => cql.catalogue({ result: [wrongScope] }));
  const noId = publicSource(); delete noId.examples[0].id;
  assert.throws(() => cql.catalogue({ result: [noId] }));
  const excessive = publicSource(); excessive.examples[0].request.extra = '😀'.repeat(8192);
  assert.throws(() => cql.catalogue({ result: [excessive] }), /32 KiB/);
});

test('public example uses only the hosted query endpoint and never forwards its bearer to native storage', async () => {
  const calls = [];
  const h = harness(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ result: { provider: 'ActivityPubOASIS', rows: [] } }) };
  }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ result: [publicSource()] }) };
  });
  await h.ui.ready;
  assert.equal(h.elements.get('cql-provider').value, 'ActivityPubOASIS');
  assert.equal(h.elements.get('cql-preset').value, 'host:public-posts');
  await h.elements.get('cql-run').listeners.click();
  assert.deepEqual(calls.map(call => call.url), [
    'https://example.invalid/api/data/query-cql/providers?examplesVersion=2', 'https://example.invalid/api/data/query-cql'
  ]);
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(calls[1].options.body).filters[0].value, ['101', '102', '103']);
});

test('failed discovery disables queries and does not invent the original three providers', async () => {
  let queries = 0;
  const h = harness(async () => { queries++; throw new Error('No query permitted.'); }, async () => ({
    ok: false, status: 503, json: async () => ({ isError: true, errorCode: 'CQL_SOURCE_CATALOGUE_UNAVAILABLE' })
  }));
  await h.ui.ready;
  await h.elements.get('cql-run').listeners.click();
  assert.equal(queries, 0);
  assert.equal(h.elements.get('cql-run').disabled, true);
  assert.equal(h.elements.get('cql-provider').children.length, 0);
  assert.match(h.elements.get('cql-note').textContent, /503.*CQL_SOURCE_CATALOGUE_UNAVAILABLE/);
});

test('late discovery after sign-out cannot restore the previous source catalogue', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const h = harness(async () => { throw new Error('No query.'); }, () => new Promise(resolve => { release = resolve; entered(); }));
  await started;
  h.signOut();
  release({ ok: true, status: 200, json: async () => ({ result: [publicSource()] }) });
  await h.ui.ready;
  assert.equal(h.elements.get('cql-provider').children.length, 0);
  assert.equal(h.elements.get('cql-run').disabled, true);
  assert.equal(h.elements.get('cql-sources').textContent, '');
});

test('unavailable or unconfigured native examples never offer a runnable preset', async () => {
  const source = publicSource(); source.available = false;
  assert.equal(cql.profileChoices(source, [source]).length, 0);
  assert.throws(() => cql.profilePreset(source, 'host:public-posts'));
  const unknown = publicSource('IPFSOASIS'); unknown.examples = [];
  const h = harness(async () => { throw new Error('No query.'); }, async () => ({
    ok: true, status: 200, json: async () => ({ result: [unknown] })
  }));
  await h.ui.ready;
  assert.equal(h.elements.get('cql-run').disabled, true);
  assert.match(h.elements.get('cql-note').textContent, /No hosted demo query is ready/);
});

test('three-provider federation is offered only when every original target is ready', () => {
  const rows = cql.providers.map(provider => ({ provider, available: true, federationAvailable: true, examples: [] }));
  assert.ok(cql.profileChoices(rows[0], rows).some(row => row.id === 'federation'));
  rows[1].available = false;
  assert.equal(cql.profileChoices(rows[0], rows).some(row => row.id === 'federation'), false);
});

test('explicit refresh clears stale results when the hosted catalogue becomes unavailable', async () => {
  let discoveries = 0;
  const h = harness(async () => ({ ok: true, status: 200, json: async () => ({
    result: { provider: 'ActivityPubOASIS', rows: [{ name: 'previous result' }] }
  }) }), async () => ++discoveries === 1
    ? { ok: true, status: 200, json: async () => ({ result: [publicSource()] }) }
    : { ok: false, status: 503, json: async () => ({ isError: true, errorCode: 'CQL_SOURCE_CATALOGUE_UNAVAILABLE' }) });
  await h.ui.ready;
  await h.elements.get('cql-run').listeners.click();
  assert.equal(h.elements.get('cql-results').children.length, 1);
  await h.ui.syncAuth(true);
  assert.equal(discoveries, 2);
  assert.equal(h.elements.get('cql-results').children.length, 0);
  assert.equal(h.elements.get('cql-run').disabled, true);
});
function federationSource() {
  const source = publicSource();
  source.federationAvailable = true;
  source.examples = [{ id: 'paired', label: 'Public posts and my Mongo records', operation: 'Federation', available: true,
    request: { scope: 'Named', providers: ['MongoDBOASIS', source.provider], identityMode: 'PreserveCopies',
      source: { orderBy: 'None', take: 25, filters: source.examples[0].request.filters }, maximumProviderAttempts: 2, take: 25 } }];
  return source;
}

function federationCatalogue() {
  return cql.catalogue({ result: [federationSource(), {
    provider: 'MongoDBOASIS', available: true, queryOnly: false, federationAvailable: true, examples: []
  }] });
}

test('hosted examples with the same label show distinct IDs without changing selection', () => {
  const source = federationSource();
  const full = { ...source.examples[0], id: 'mongo-public-records' };
  const subset = { ...full, id: 'mongo-public-subset' };
  source.examples = [full, subset];
  const sources = [source, { provider: 'MongoDBOASIS', available: true, federationAvailable: true }];
  assert.deepEqual(cql.profileChoices(source, sources), [full, subset].map(row => ({
    id: 'host:' + row.id, label: `${row.label} · ${row.id}`, disabled: false
  })));
  assert.equal(cql.profilePreset(source, 'host:' + subset.id).path, 'data/query-cql/federation');
});

test('explicit hosted federation selects only the fixed WEB4 federation endpoint and owns its body', () => {
  const sources = federationCatalogue();
  const request = cql.profilePreset(sources[0], 'host:paired');
  assert.equal(request.path, 'data/query-cql/federation');
  assert.deepEqual(request.body.providers, ['MongoDBOASIS', 'ActivityPubOASIS']);
  request.body.source.filters[0].value.push('changed');
  assert.equal(cql.profilePreset(sources[0], 'host:paired').body.source.filters[0].value.length, 3);
});

test('unavailable dependency disables the federation choice while keeping leaf examples', () => {
  const sources = federationCatalogue();
  sources[0].examples.push({ ...publicSource().examples[0], operation: 'Rows', available: true });
  sources[1].available = false;
  const choices = cql.profileChoices(sources[0], sources);
  assert.equal(choices[0].disabled, true);
  assert.equal(choices[1].disabled, false);
  sources[0].examples[0].available = false;
  assert.throws(() => cql.profilePreset(sources[0], 'host:paired'), /unavailable/);
  assert.equal(cql.profilePreset(sources[0], 'host:public-posts').path, 'data/query-cql');
});

test('server examples cannot supply executable routes or rebind federation scope', () => {
  for (const fault of ['operation', 'owner', 'duplicate', 'scope', 'provider', 'cursor', 'identity']) {
    const source = federationSource(); const example = source.examples[0]; const request = example.request;
    if (fault === 'operation') example.operation = 'https://example.invalid/steal';
    if (fault === 'owner') request.providers[1] = 'Neo4jOASIS';
    if (fault === 'duplicate') request.providers[0] = 'ActivityPubOASIS';
    if (fault === 'scope') request.scope = 'AllEligible';
    if (fault === 'provider') request.source.provider = 'MongoDBOASIS';
    if (fault === 'cursor') request.enableContinuation = true;
    if (fault === 'identity') request.identityMode = 'ProviderPriority';
    assert.throws(() => cql.catalogue({ result: [source] }), /operation|scope/);
  }
});

test('hosted federation run keeps the bearer on WEB4 and sends the selected bounded intent', async () => {
  const calls = [];
  const h = harness(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ result: { rows: [] } }) };
  }, async () => ({ ok: true, status: 200, json: async () => ({ result: federationCatalogue() }) }));
  await h.ui.ready;
  await h.elements.get('cql-run').listeners.click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.invalid/api/data/query-cql/federation');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(calls[0].options.body).providers, ['MongoDBOASIS', 'ActivityPubOASIS']);
});

test('private preparation uses the configured example rather than edited JSON and clears acknowledged intents', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const entries = new Map(); const writes = []; const reads = [];
  const storage = { get length() { return entries.size; }, key: i => [...entries.keys()][i] ?? null,
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  const request = async (method, path, body) => {
    assert.equal(method, 'POST');
    if (path.endsWith('demo-identities')) return { result: { ownerId: owner, provider: 'ActivityPubOASIS',
      records: body.keys.map((nativeKey, i) => ({ id: `11111111-1111-4111-8111-11111111111${i}`, nativeKey, metadata: {
        'oasis.native.provider': 'ActivityPubOASIS', 'oasis.native.source': 'cosmic-cql-demo', 'oasis.native.key': nativeKey
      } })) } };
    if (path === 'data/query-cql' && body.provider === 'ActivityPubOASIS') {
      reads.push(body);
      return { result: { rows: body.filters[0].value.map((key, i) => ({
        id: `22222222-2222-4222-8222-22222222222${i}`, name: 'Native ' + key, description: null, metadata: { NativeKey: key }
      })) } };
    }
    if (path === 'data/query-cql') return { result: { rows: [] } };
    writes.push(body); return { isSaved: true, result: { id: body.holon.id, createdByAvatarId: owner, isPublic: false, version: 1 } };
  };
  const h = harness(async () => { throw new Error('Query run was not requested.'); },
    async () => ({ ok: true, status: 200, json: async () => ({ result: federationCatalogue() }) }),
    { storage, request, canPrepare: true });
  await h.ui.ready;
  h.elements.get('cql-request').value = '{"source":{"filters":[{"value":["edited-private-key"]}]}}';
  assert.equal(h.elements.get('cql-prepare').disabled, false);
  await h.elements.get('cql-prepare').listeners.click();
  assert.deepEqual(Array.from(reads[0].filters[0].value), ['101', '102']);
  assert.equal(writes.length, 2); assert.equal(entries.size, 0);
  assert.match(h.elements.get('cql-note').textContent, /2 saved/);
});

test('ID preparation publishes the actor-specific query only after complete save acknowledgements', async () => {
  const native = ['44444444-4444-4444-8444-444444444441',
    '44444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444443'];
  const copies = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  for (const incomplete of [false, true]) {
    const source = federationSource();
    source.provider = 'OracleDBOASIS';
    source.examples[0].request.providers = ['MongoDBOASIS', source.provider];
    source.examples[0].request.source.filters = [{ field: 'Id', scalar: 'Guid', operator: 'In', value: native }];
    const entries = new Map(); let writes = 0; let executed;
    const storage = { get length() { return entries.size; }, key: i => [...entries.keys()][i] ?? null,
      getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
    const request = async (_, path, body) => {
      if (path.endsWith('demo-identities')) return { result: { ownerId: owner, provider: source.provider,
        records: body.keys.map((nativeKey, i) => ({ id: copies[i], nativeKey, metadata: {
          'oasis.native.provider': source.provider, 'oasis.native.source': 'cosmic-cql-demo', 'oasis.native.key': nativeKey
        } })) } };
      if (path === 'data/query-cql') return { result: { rows: body.provider === source.provider
        ? body.filters[0].value.map(id => ({ id, name: 'Native ' + id, metadata: {} })) : [] } };
      writes++;
      return { isSaved: !(incomplete && writes === 2), result: { id: body.holon.id, createdByAvatarId: owner, isPublic: false, version: 1 } };
    };
    const h = harness(async (url, options) => {
      assert.match(url, /\/api\/data\/query-cql\/federation$/);
      executed = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ result: { rows: [] } }) };
    }, async () => ({ ok: true, status: 200, json: async () => ({ result: [source,
      { provider: 'MongoDBOASIS', available: true, queryOnly: false, federationAvailable: true, examples: [] }] }) }),
    { storage, request, canPrepare: true });
    await h.ui.ready;
    await h.elements.get('cql-prepare').listeners.click();
    const displayed = JSON.parse(h.elements.get('cql-request').value);
    assert.deepEqual(displayed.source.filters[0].value, incomplete ? native : [...native, ...copies]);
    assert.equal(writes, 2); assert.equal(entries.size, incomplete ? 1 : 0);
    if (incomplete) assert.match(h.elements.get('cql-note').textContent, /acknowledgement is incomplete/);
    else {
      assert.match(h.elements.get('cql-note').textContent, /query now includes your private snapshot IDs/);
      await h.elements.get('cql-run').listeners.click();
      assert.deepEqual(executed.source.filters[0].value, [...native, ...copies]);
    }
  }
});

test('view-only environment cannot start record preparation', async () => {
  let calls = 0;
  const h = harness(async () => { throw new Error('No query requested.'); },
    async () => ({ ok: true, status: 200, json: async () => ({ result: federationCatalogue() }) }),
    { request: async () => { calls++; }, canPrepare: false });
  await h.ui.ready;
  assert.equal(h.elements.get('cql-prepare').disabled, true);
  await h.elements.get('cql-prepare').listeners.click();
  assert.equal(calls, 0);
});


test('CQL preflight renewal uses the new bearer without discarding the same avatar result', async () => {
  const session = { token: 'old', identity: 'same-avatar', ensure: async () => session.token };
  let requests = 0;
  const h = harness(async (_, options) => {
    requests++; assert.equal(options.headers.Authorization, 'Bearer renewed');
    return { ok: true, status: 200, json: async () => ({ isError: false, result: { rows: [] } }) };
  }, null, { session });
  await h.ui.ready;
  session.ensure = async () => { session.token = 'renewed'; return session.token; };
  await h.elements.get('cql-run').listeners.click();
  assert.equal(requests, 1); assert.match(h.elements.get('cql-response').textContent, /"rows"/);
});

test('unverified CQL renewal prevents the original provider request', async () => {
  const session = { token: 'old', identity: 'same-avatar', ensure: async () => session.token };
  let requests = 0;
  const h = harness(async () => { requests++; throw Error('Original query must not be sent.'); }, null, { session });
  await h.ui.ready;
  session.ensure = async () => { throw Error('controlled renewal failure'); };
  await h.elements.get('cql-run').listeners.click();
  assert.equal(requests, 0); assert.match(h.elements.get('cql-note').textContent, /renewal failure/);
});

test('token rotation during a query preserves the same identity response', async () => {
  const session = { token: 'old', identity: 'same-avatar', ensure: async () => session.token };
  let release;
  const h = harness(() => new Promise(resolve => { release = resolve; }), null, { session });
  await h.ui.ready;
  const query = h.elements.get('cql-run').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  session.token = 'rotated';
  release({ ok: true, status: 200, json: async () => ({ isError: false, result: { rows: [] } }) });
  await query; assert.match(h.elements.get('cql-response').textContent, /"rows"/);
});


test('query timeout survives the explicit server budget with bounded transport allowance', () => {
  assert.equal(cql.requestTimeout({}), 15000);
  assert.equal(cql.requestTimeout({ maximumDurationMilliseconds: 1 }), 15000);
  assert.equal(cql.requestTimeout({ maximumDurationMilliseconds: 5000 }), 15000);
  assert.equal(cql.requestTimeout({ maximumDurationMilliseconds: 30000 }), 35000);
  // The federation top-level budget owns timing, not a nested source request.
  assert.equal(cql.requestTimeout({ maximumDurationMilliseconds: 30000,
    source: { maximumDurationMilliseconds: 1 } }), 35000);
});

test('query timeout rejects invalid or unbounded explicit durations before dispatch', () => {
  for (const value of [0, -1, 30001, 1.5, '30000', true, Infinity, NaN])
    assert.throws(() => cql.requestTimeout({ maximumDurationMilliseconds: value }));
});

test('shipped query runner gives a 30-second preset 35 seconds and dispatches only once', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(`${__dirname}/cql-playground.js`, 'utf8');
  const start = source.indexOf('    async function run() {');
  const end = source.indexOf('    async function syncAuth(', start);
  assert.ok(start > 0 && end > start);
  const body = { provider: 'TONOASIS', maximumDurationMilliseconds: 30000 };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: id === 'cql-request' ? JSON.stringify(body) : '', replaceChildren() {} });
    return elements.get(id);
  };
  const timers = [], cleared = [], errors = [];
  let dispatched = 0;
  const context = vm.createContext({
    controller: null, preparing: false, discovery: null, endpoint: 'data/query-cql', generation: 0, namedScalar: null,
    getToken: () => 'controlled', getIdentity: () => 'same-avatar', getBase: () => 'https://example.invalid',
    ensureAccessToken: async () => 'controlled', parse: cql.parse, requestTimeout: cql.requestTimeout, withVirtualMapping: cql.withVirtualMapping,
    unwrap: cql.unwrap, $: element, crypto: { randomUUID: () => 'one-operation' }, AbortController,
    controls() {}, render() {}, note: (text, error) => { if (error) errors.push(text); },
    setTimeout: (_callback, delay) => { timers.push(delay); return 7; },
    clearTimeout: handle => cleared.push(handle),
    fetch: async (_url, options) => {
      dispatched++;
      assert.equal(options.signal.aborted, false);
      assert.deepEqual(JSON.parse(options.body), body);
      return { ok: true, headers: { get: () => 'one-operation' },
        json: async () => ({ isError: false, result: { rows: [] } }) };
    }
  });
  vm.runInContext(source.slice(start, end), context);
  await context.run();
  assert.deepEqual(timers, [35000]);
  assert.deepEqual(cleared, [7]);
  assert.equal(dispatched, 1);
  assert.deepEqual(errors, []);
});


test('rejected preparation does not display the preceding query operation identity', async () => {
  let calls = 0;
  const h = harness(async () => { throw new Error('No query requested.'); },
    async () => ({ ok: true, status: 200, json: async () => ({ result: federationCatalogue() }) }),
    { storage: { length: 0, key() {}, getItem() {}, setItem() {}, removeItem() {} }, canPrepare: true, request: async () => {
      calls++;
      throw new Error('The daily call limit has been reached. Request key: preparation-key. Operation: preparation-operation.');
    } });
  await h.ui.ready;
  h.elements.get('cql-operation').textContent = 'Idempotency-Key: previous-query-key\nOperation ID: previous-query-operation';
  await h.elements.get('cql-prepare').listeners.click();
  assert.equal(h.elements.get('cql-operation').textContent, '');
  assert.equal(calls, 1);
  assert.match(h.elements.get('cql-note').textContent, /preparation-key.*preparation-operation/);
});

test('loads the selected public subset into the SQL editor', async () => {
  const provider = 'HoloOASIS';
  const ids = ['b5d3f5a8-2539-4f94-9b12-aed841902ccb', 'ec251d38-c660-48dc-a558-dd3b5cae0bd2'];
  const example = (id, value) => ({ id, label: id, operation: 'Rows', available: true, request: {
    provider, orderBy: 'None', includeMetadata: true, take: 3,
    filters: [{ field: 'Id', scalar: 'Guid', operator: 'In', value }]
  } });
  const h = harness(async () => { throw new Error('Loading a preset should not execute it'); },
    async () => ({ ok: true, status: 200, json: async () => ({ result: [{
      provider, available: true, queryOnly: true, federationAvailable: true,
      examples: [example('public-records', ids), example('public-subset', ids.slice(1))]
    }] }) }));
  await h.ui.ready;
  const select = h.elements.get('cql-preset');
  select.value = '';
  assert.equal(h.ui.selectedPublicExample(), null);
  assert.deepEqual(Array.from(h.ui.publicQuestionExample().request.filters[0].value), ids);
  select.value = 'host:public-subset';
  select.listeners.change();
  h.elements.get('cql-load-text-example').listeners.click();
  const { body } = require('./cql-text.js').compile(h.elements.get('cql-text').value);
  assert.deepEqual(body.filters[0].value, ids.slice(1));
  assert.deepEqual(Array.from(h.ui.selectedPublicExample().request.filters[0].value), ids.slice(1));
  assert.deepEqual(Array.from(h.ui.publicQuestionExample().request.filters[0].value), ids.slice(1));
  h.signOut();
  assert.equal(h.ui.publicQuestionExample(), null);
});

test('selected columns render in request order as plain text', async () => {
  const h = harness(async (url, options) => {
    assert.match(url, /query-cql\/projection$/);
    assert.deepEqual(JSON.parse(options.body).columns.map(c => c.alias), ['Name', 'Version']);
    return { ok: true, status: 200, json: async () => ({ result: {
      version: 'cql-projection-v1', provider: 'MongoDBOASIS',
      columns: [{ alias: 'Name' }, { alias: 'Version' }], rows: [['<b>Literal</b>', 0]]
    } }) };
  });
  await h.ui.ready;
  h.ui.loadText('SELECT Name, Version FROM MongoDBOASIS LIMIT 1');
  await h.elements.get('cql-run').listeners.click();
  const [table] = h.elements.get('cql-results').children;
  const [head, rows] = table.children;
  assert.deepEqual(head.children[0].children.map(cell => cell.textContent), ['Name', 'Version']);
  assert.deepEqual(rows.children[0].children.map(cell => cell.textContent), ['<b>Literal</b>', '0']);
});

test('empty relationship-filtered average displays the aggregate message', async () => {
  const h = harness(async (url, options) => {
    assert.ok(url.endsWith('/query-cql/scalar'));
    const request = JSON.parse(options.body);
    assert.equal(request.operation, 'Average');
    assert.equal(request.anyChildren[0].filters[0].field, 'Version');
    assert.equal(request.anyDescendants[0].filters[0].field, 'IsActive');
    return { ok: false, status: 503, json: async () => ({
      isError: true, errorCode: 'CQL_EMPTY_SEQUENCE'
    }) };
  });
  await h.ui.ready;
  h.ui.loadText('SELECT AVG(Version) FROM Neo4jOASIS WHERE EXISTS CHILD (Version >= 2) AND EXISTS DESCENDANT (IsActive = TRUE)');
  await h.elements.get('cql-run').listeners.click();
  assert.equal(h.elements.get('cql-note').textContent, 'No records matched. This aggregate needs at least one value.');
  assert.equal(h.elements.get('cql-results').children.length, 0);
  assert.ok(h.elements.get('cql-response').textContent.includes('CQL_EMPTY_SEQUENCE'));
});

test('the displayed relationship example compiles to a bounded projection', () => {
  const html = require('node:fs').readFileSync(__dirname + '/web4-sandbox.html', 'utf8');
  const sample = html.split('<code id="cql-relationship-example">')[1].split('</code>')[0].replaceAll('&gt;', '>');
  const { path, body } = require('./cql-text.js').compile(sample);
  assert.equal(path, 'data/query-cql/projection');
  assert.deepEqual(body.columns.map(column => column.field), ['Id', 'Name', 'Version']);
  assert.equal(body.anyChildren[0].filters[0].field, 'Version');
  assert.equal(body.anyDescendants[0].filters[0].field, 'IsActive');
  assert.equal(body.take, 5);
});

test('the SQL scalar alias labels only the matching prepared request', async () => {
  const h = harness(async (url, options) => {
    assert.ok(url.endsWith('/query-cql/scalar'));
    const body = JSON.parse(options.body);
    assert.equal(body.operation, 'LongCount');
    assert.equal(Object.hasOwn(body, 'scalarAlias'), false);
    return { ok: true, status: 200, json: async () => ({ result: {
      version: 'cql-scalar-v1', provider: 'Neo4jOASIS', operation: 'LongCount', valueType: 'Int64', value: '6'
    } }) };
  });
  await h.ui.ready;
  h.ui.loadText('SELECT COUNT(*) AS Total FROM Neo4jOASIS');
  await h.elements.get('cql-run').listeners.click();
  assert.match(h.elements.get('cql-note').textContent, /Total: 6/);
  const request = h.elements.get('cql-request');
  request.value = JSON.stringify({ ...JSON.parse(request.value), filters: [{ field: 'Version', operator: 'Equal', value: 1 }] });
  await h.elements.get('cql-run').listeners.click();
  assert.match(h.elements.get('cql-note').textContent, /LongCount: 6/);
});

test('a false ANY result is displayed as a Boolean outcome', async () => {
  const h = harness(async (url, options) => {
    assert.ok(url.endsWith('/query-cql/scalar'));
    assert.equal(JSON.parse(options.body).operation, 'Any');
    return { ok: true, status: 200, json: async () => ({ result: {
      version: 'cql-scalar-v1', provider: 'Neo4jOASIS', operation: 'Any', valueType: 'Boolean', value: false
    } }) };
  });
  await h.ui.ready;
  h.ui.loadText('SELECT ANY(*) FROM Neo4jOASIS WHERE EXISTS CHILD (Version >= 2)');
  await h.elements.get('cql-run').listeners.click();
  assert.match(h.elements.get('cql-note').textContent, /Neo4jOASIS .* Any: false/);
  assert.equal(h.elements.get('cql-results').children.length, 0);
});

test('loads the displayed grouped example for review without submitting it', async () => {
  const h = harness(async () => assert.fail('Loading the example must not query WEB4.'));
  await h.ui.ready;
  const fs = require('node:fs');
  const page = fs.readFileSync(require.resolve('./web4-sandbox.html'), 'utf8');
  const sql = page.match(/<code id="cql-grouped-example">([\s\S]+?)<\/code>/)[1].replaceAll('&gt;', '>');
  h.elements.set('cql-grouped-example', { textContent: sql });
  h.elements.get('cql-load-grouped-example').listeners.click();
  const editor = h.elements.get('cql-text');
  assert.equal(editor.value, sql);
  assert.equal(editor.focused, true);
  const { path, body } = require('./cql-text.js').compile(editor.value);
  assert.equal(path, 'data/query-cql/grouped');
  assert.deepEqual(body.resultFilters.map(({ alias, value }) => [alias, value]),
    [['AverageVersion', '1.0'], ['TotalVersion', 1]]);
  assert.deepEqual(body.resultOrder, [{ alias: 'Total', descending: true }, { alias: 'IsActive', descending: false }]);
});

test('loads the unique category count without submitting it', async () => {
  const h = harness(async () => assert.fail('Loading the example must not query WEB4.'));
  await h.ui.ready;
  const page = require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'), 'utf8');
  const sql = page.match(/<code id="cql-distinct-count-example">([\s\S]+?)<\/code>/)[1];
  h.elements.set('cql-distinct-count-example', { textContent: sql });
  h.elements.get('cql-load-distinct-count-example').listeners.click();
  const editor = h.elements.get('cql-text');
  assert.equal(editor.value, sql);
  assert.equal(editor.focused, true);
  const { path, body, scalarAlias } = require('./cql-text.js').compile(editor.value);
  assert.equal(path, 'data/query-cql/scalar');
  assert.equal(body.operation, 'CountDistinct');
  assert.equal(scalarAlias, 'UniqueCategories');
  assert.deepEqual(body.selection, { metadataPath: ['category'], valueType: 'String', nullable: true });
});

test('typed grouped results distinguish NULL from empty strings and preserve exact numbers', async () => {
  const h = harness(async url => {
    assert.match(url, /query-cql\/grouped$/);
    return { ok: true, status: 200, json: async () => ({ result: {
      version: 'cql-grouped-v1', provider: 'MongoDBOASIS',
      columns: [{ alias: 'Label' }, { alias: 'Stock' }, { alias: 'Amount' }],
      rows: [['', '9007199254740993', '1.0000000000000000000000000001'], [null, null, null]]
    } }) };
  });
  await h.ui.ready;
  h.ui.loadText('SELECT DISTINCT CAST(metadata.label AS STRING) AS Label, ' +
    'CAST(metadata.stock AS INT64) AS Stock, CAST(metadata.amount AS DECIMAL) AS Amount FROM MongoDBOASIS');
  await h.elements.get('cql-run').listeners.click();
  const [table] = h.elements.get('cql-results').children;
  const [, rows] = table.children;
  assert.deepEqual(rows.children.map(row => row.children.map(cell => cell.textContent)), [
    ['', '9007199254740993', '1.0000000000000000000000000001'], ['NULL', 'NULL', 'NULL']
  ]);
});

test('SQL left join renders a matching row with a null value distinctly from an unmatched row', async () => {
  const table = '(SELECT * FROM MongoDBOASIS ORDER BY Id LIMIT 2)';
  const h = harness(async (url, options) => {
    assert.match(url, /query-cql\/join$/);
    const request = JSON.parse(options.body);
    assert.equal(request.kind, 'Left');
    assert.equal(request.columns[1].allowMissing, true);
    return { ok: true, status: 200, json: async () => ({ result: {
      version: 'cql-join-v1', provider: 'MongoDBOASIS', kind: 'Left',
      columns: [{ alias: 'LeftName' }, { alias: 'RightDescription' }],
      rows: [{ hasRight: true, values: ['Matched', null] }, { hasRight: false, values: ['Unmatched', null] }]
    } }) };
  });
  await h.ui.ready;
  h.ui.loadText('SELECT l.Name AS LeftName, r.Description AS RightDescription FROM ' + table +
    ' AS l LEFT JOIN ' + table + ' AS r ON l.Id = r.Id');
  await h.elements.get('cql-run').listeners.click();
  const [result] = h.elements.get('cql-results').children;
  const [head, rows] = result.children;
  assert.deepEqual(head.children[0].children.map(cell => cell.textContent), ['LeftName', 'RightDescription', 'Matched']);
  assert.deepEqual(rows.children.map(row => row.children.map(cell => cell.textContent)),
    [['Matched', 'NULL', 'Yes'], ['Unmatched', 'NULL', 'No']]);
});

test('loads the displayed bounded SQL join for review without submitting it', async () => {
  const h = harness(async () => assert.fail('Loading the join must not query WEB4.'));
  await h.ui.ready;
  const page = require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'), 'utf8');
  const sql = page.match(/<code id="cql-join-example">([\s\S]+?)<\/code>/)[1];
  h.elements.set('cql-join-example', { textContent: sql });
  h.elements.get('cql-load-join-example').listeners.click();
  const editor = h.elements.get('cql-text');
  assert.equal(editor.value, sql);
  assert.equal(editor.focused, true);
  const { path, body } = require('./cql-text.js').compile(editor.value);
  assert.equal(path, 'data/query-cql/join');
  assert.equal(body.kind, 'Left');
  assert.equal(body.maximumResults, 25);
});

test('SQL full outer join shows which source row exists even when projected values are null', async () => {
  const source = '(SELECT * FROM Neo4jOASIS ORDER BY Id LIMIT 2)';
  const h = harness(async (url, options) => {
    assert.match(url, /query-cql\/join$/);
    const request = JSON.parse(options.body);
    assert.equal(request.kind, 'Full');
    assert.deepEqual(request.columns.map(column => column.allowMissing), [true, true]);
    return { ok: true, status: 200, json: async () => ({ result: {
      version: 'cql-join-v1', provider: 'Neo4jOASIS', kind: 'Full',
      columns: [{ alias: 'LeftDescription' }, { alias: 'RightDescription' }],
      rows: [
        { hasLeft: true, hasRight: true, values: [null, null] },
        { hasLeft: true, hasRight: false, values: ['Only left', null] },
        { hasLeft: false, hasRight: true, values: [null, 'Only right'] }
      ]
    } }) };
  });
  await h.ui.ready;
  h.ui.loadText('SELECT l.Description AS LeftDescription, r.Description AS RightDescription FROM ' +
    source + ' AS l FULL OUTER JOIN ' + source + ' AS r ON l.Id = r.Id');
  await h.elements.get('cql-run').listeners.click();
  const [table] = h.elements.get('cql-results').children;
  const [head, rows] = table.children;
  assert.deepEqual(head.children[0].children.map(cell => cell.textContent),
    ['LeftDescription', 'RightDescription', 'Source rows']);
  assert.deepEqual(rows.children.map(row => row.children.map(cell => cell.textContent)), [
    ['NULL', 'NULL', 'Both'], ['Only left', 'NULL', 'Left only'], ['NULL', 'Only right', 'Right only']
  ]);
});

test('loads a child join example without running it', async () => {
  const h = harness(async () => assert.fail('Loading the child join must not query WEB4.'));
  await h.ui.ready;
  const page = require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'), 'utf8');
  const sql = page.match(/<code id="cql-child-join-example">([\s\S]+?)<\/code>/)[1];
  h.elements.set('cql-child-join-example', { textContent: sql });
  h.elements.get('cql-load-child-join-example').listeners.click();
  const editor = h.elements.get('cql-text');
  assert.equal(editor.value, sql);
  assert.equal(editor.focused, true);
  const { path, body } = require('./cql-text.js').compile(editor.value);
  assert.equal(path, 'data/query-cql/join');
  assert.equal(body.kind, 'Child');
  assert.equal(body.maximumResults, 3);
  assert.equal(body.maximumPairs, 5);
  assert.equal(body.outputLimit, 3);
  assert.deepEqual(body.outputOrdering, [{ alias: 'ParentName', descending: false }, { alias: 'ChildName', descending: false }]);
});

test('loads the signed version comparison and previews the bounded native request without querying WEB4', async () => {
  const h = harness(async () => assert.fail('Loading the version comparison must not query WEB4.'));
  await h.ui.ready;
  const page = require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'), 'utf8');
  const sql = page.match(/<code id="cql-version-join-example">([\s\S]+?)<\/code>/)[1].replaceAll('&gt;', '>');
  h.elements.set('cql-version-join-example', { textContent: sql });
  h.elements.get('cql-load-version-join-example').listeners.click();
  const editor = h.elements.get('cql-text');
  assert.equal(editor.value, sql);
  assert.equal(editor.focused, true);
  const { path, body } = require('./cql-text.js').compile(editor.value);
  assert.equal(path, 'data/query-cql/join');
  assert.equal(body.kind, 'Inner');
  assert.equal(body.keys[0].operator, 'LessThan');
  assert.equal(body.maximumPairs, 25);
  assert.equal(body.outputLimit, 5);
  assert.deepEqual(body.outputOrdering, [{ alias: 'LaterVersion', descending: true },
    { alias: 'EarlierVersion', descending: false }]);
});

test('loads the displayed text length example for review without querying', async () => {
  const h = harness(async () => assert.fail('Loading the example must not query WEB4.'));
  await h.ui.ready;
  const page = require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'), 'utf8');
  const sql = page.match(/<code id="cql-length-example">([\s\S]+?)<\/code>/)[1].replaceAll('&gt;', '>');
  h.elements.set('cql-length-example', { textContent: sql });
  h.elements.get('cql-load-length-example').listeners.click();
  const editor = h.elements.get('cql-text');
  assert.equal(editor.value, sql);
  assert.equal(editor.focused, true);
  for (const provider of ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']) {
    const { path, body } = require('./cql-text.js').compile(editor.value.replace('MongoDBOASIS', provider));
    assert.equal(path, 'data/query-cql/projection');
    assert.equal(body.provider, provider);
    assert.deepEqual(body.filters[1], { field: 'Name', scalar: 'String',
      function: 'Utf16Length', operator: 'GreaterThanOrEqual', value: '4' });
    assert.deepEqual(body.columns.map(c => c.field), ['Id', 'Name']);
    assert.equal(body.take, 10);
  }
});


test('clearing the selected virtual source resets its controls without discarding saved definitions', () => {
  const mapping={value:'11000000-0000-0000-0000-000000000001'};
  const saved={value:mapping.value,options:['saved-source']};
  const note={textContent:'Using saved source'};
  cql.clearVirtualMapping(mapping,saved,note);
  assert.equal(mapping.value,'');assert.equal(saved.value,'');assert.equal(note.textContent,'');
  assert.deepEqual(saved.options,['saved-source']);
});

test('a reviewed mixed count renders its exact scalar and never offers snapshot writes', async () => {
  let queries=0, writes=0;
  const h=harness(async (url, options) => {
    queries++;
    assert.ok(url.endsWith('/query-cql/projection/mixed'));
    const body=JSON.parse(options.body);
    assert.equal(body.resultOperation,'LongCount'); assert.equal(body.take,1);
    assert.deepEqual(body.columns,[{field:'Id',alias:'Id'}]);
    assert.equal(body.scalarAlias,undefined);
    return {ok:true,status:200,json:async()=>({result:{
      version:'cql-scalar-v1',provider:'Neo4jOASIS',operation:'LongCount',valueType:'Int64',
      value:'198',canPrepareSnapshot:false
    }})};
  },undefined,{canPrepare:true,request:async()=>{writes++;throw new Error('Count cannot save data.');}});
  await h.ui.ready;
  h.ui.loadText("SELECT COUNT(*) AS Total FROM Neo4jOASIS WITH VIRTUAL MAPPING "+
    "'11000000-0000-0000-0000-000000000001' WHERE metadata.tier = 'gold'");
  assert.equal(queries,0);
  await h.elements.get('cql-run').listeners.click();
  assert.equal(queries,1); assert.equal(writes,0);
  assert.match(h.elements.get('cql-note').textContent,/Total: 198/);
  assert.equal(h.elements.get('cql-results').children.length,0);
});

test('mixed AVG renders the exact Decimal result without a native snapshot action', async () => {
  const h=harness(async (url, options)=>{
    const body=JSON.parse(options.body);
    assert.ok(url.endsWith('/query-cql/projection/mixed')); assert.equal(body.resultOperation,'Average');
    assert.equal(body.columns[1].valueType,'Int64');
    return {ok:true,status:200,json:async()=>({result:{version:'cql-scalar-v1',provider:'Neo4jOASIS',
      operation:'Average',valueType:'Decimal',value:'9007199254740994',canPrepareSnapshot:false}})};
  });
  await h.ui.ready;
  h.ui.loadText("SELECT AVG(CAST(metadata.amount AS INT64)) AS Mean FROM Neo4jOASIS WITH VIRTUAL MAPPING "+
    "'11000000-0000-0000-0000-000000000001' WHERE metadata.tier = 'gold'");
  await h.elements.get('cql-run').listeners.click();
  assert.match(h.elements.get('cql-note').textContent,/Mean: 9007199254740994/);
});

test('mixed selected value count renders a scalar and offers no snapshot write', async () => {
  const h=harness(async (url,options)=>{
    const body=JSON.parse(options.body); assert.ok(url.endsWith('/query-cql/projection/mixed'));
    assert.equal(body.resultOperation,'CountDistinct');
    return {ok:true,status:200,json:async()=>({result:{version:'cql-scalar-v1',provider:'MongoDBOASIS',
      operation:'CountDistinct',valueType:'Int64',value:'3',canPrepareSnapshot:false}})};
  });
  await h.ui.ready;
  h.ui.loadText("SELECT COUNT(DISTINCT CAST(metadata.region AS STRING)) AS Regions FROM MongoDBOASIS WITH VIRTUAL MAPPING "+
    "'11000000-0000-0000-0000-000000000001' WHERE metadata.tier = 'gold'");
  await h.elements.get('cql-run').listeners.click();
  assert.match(h.elements.get('cql-note').textContent,/Regions: 3/);
});

test('mixed empty text MIN renders null as a successful scalar', async () => {
  const h=harness(async(url,options)=>{
    const body=JSON.parse(options.body); assert.equal(body.resultOperation,'Min');
    assert.equal(body.columns[1].valueType,'String');
    return {ok:true,status:200,json:async()=>({result:{version:'cql-scalar-v1',provider:'Neo4jOASIS',
      operation:'Min',valueType:'String',value:null,canPrepareSnapshot:false}})};
  });
  await h.ui.ready;
  h.ui.loadText("SELECT MIN(CAST(metadata.region AS STRING)) AS FirstRegion FROM Neo4jOASIS WITH VIRTUAL MAPPING "+
    "'11000000-0000-0000-0000-000000000001' WHERE metadata.tier = 'gold'");
  await h.elements.get('cql-run').listeners.click();
  assert.match(h.elements.get('cql-note').textContent,/FirstRegion: null/);
});

test('loads the grouped distinct demo for review without querying WEB4', async () => {
  const h = harness(async () => assert.fail('Loading an example must not query WEB4.'));
  await h.ui.ready;
  const page = require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'), 'utf8');
  const sql = page.match(/<code id="cql-grouped-distinct-example">([\s\S]+?)<\/code>/)[1].replaceAll('&gt;', '>').replaceAll('&lt;', '<');
  h.elements.set('cql-grouped-distinct-example', { textContent: sql });
  h.elements.get('cql-load-grouped-distinct-example').listeners.click();
  const editor = h.elements.get('cql-text');
  assert.equal(editor.value, sql);
  assert.equal(editor.focused, true);
  const { path, body } = require('./cql-text.js').compile(editor.value);
  assert.equal(path, 'data/query-cql/grouped');
  assert.deepEqual(body.columns.map(c => [c.alias, c.distinct === true]),
    [['Category', false], ['Present', false], ['UniqueLabels', true]]);
  assert.deepEqual(body.resultFilters.map(c => [c.alias, c.value]), [['Present', '1'], ['UniqueLabels', '1']]);
  assert.deepEqual(body.resultOrder, [{ alias: 'UniqueLabels', descending: true }, { alias: 'Category', descending: false }]);
  assert.equal(body.resultTake, 5);
});

test('loads the grouped distinct demo with the documented mixed mapping syntax', () => {
  const page = require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'), 'utf8');
  const sql = page.match(/<code id="cql-grouped-distinct-example">([\s\S]+?)<\/code>/)[1].replaceAll('&gt;', '>').replaceAll('&lt;', '<');
  const mapping = '764b78ae-df26-4637-9bbd-1d0530954fea';
  for (const provider of ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']) {
    const text = sql.replace('FROM MongoDBOASIS', "FROM " + provider + " WITH VIRTUAL MAPPING '" + mapping + "'");
    const { path, body } = require('./cql-text.js').compile(text);
    assert.equal(path, 'data/query-cql/projection/mixed');
    assert.equal(body.provider, provider);
    assert.equal(body.virtualMappingId, mapping);
    assert.equal(body.resultOperation, 'Group');
    assert.equal(body.take, 1);
    assert.equal(body.grouping.resultTake, 5);
    assert.equal(body.grouping.columns[2].distinct, true);
    assert.deepEqual(body.grouping.columns[2].selection, { metadataPath: ['label'], valueType: 'String', nullable: true });
  }
});

test('loads the displayed conditional/coalesce demo for review and clears unrelated mapping scope', async () => {
  const h=harness(async()=>assert.fail('Loading an example must not query records.'));
  await h.ui.ready;
  const page=require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'),'utf8');
  const sql=page.match(/<code id="cql-computed-example">([\s\S]+?)<\/code>/)[1];
  h.elements.set('cql-computed-example',{textContent:sql});
  h.elements.get('cql-virtual-mapping').value='20000000-0000-0000-0000-000000000001';
  h.elements.get('cql-saved-mapping').value='20000000-0000-0000-0000-000000000001';
  h.elements.get('cql-load-computed-example').listeners.click();
  assert.equal(h.elements.get('cql-text').value,sql);
  assert.equal(h.elements.get('cql-text').focused,true);
  assert.equal(h.elements.get('cql-virtual-mapping').value,'');
  assert.equal(h.elements.get('cql-saved-mapping').value,'');
  for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
    const q=require('./cql-text.js').compile(sql.replace('MongoDBOASIS',provider));
    assert.equal(q.path,'data/query-cql/projection');
    assert.equal(q.body.columns[2].function,'BooleanTextCase');
    assert.equal(q.body.columns[3].function,'TextCoalesce');
    assert.deepEqual(q.body.selectedOrder,[{alias:'Status',descending:false},{alias:'Id',descending:false}]);
    assert.equal(q.body.take,5);
  }
});


test('loads the displayed bounded WITH example for review without querying records',async()=>{
 const h=harness(async()=>assert.fail('Loading a query must not execute it.'));
 await h.ui.ready;
 const page=require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'),'utf8');
 const sql=page.match(/<code id="cql-cte-example">([\s\S]+?)<\/code>/)[1];
 h.elements.set('cql-cte-example',{textContent:sql});
 h.elements.get('cql-virtual-mapping').value='20000000-0000-0000-0000-000000000001';
 h.elements.get('cql-saved-mapping').value='20000000-0000-0000-0000-000000000001';
 h.elements.get('cql-load-cte-example').listeners.click();
 assert.equal(h.elements.get('cql-text').value,sql.trim());
 assert.equal(h.elements.get('cql-text').focused,true);
 assert.equal(h.elements.get('cql-virtual-mapping').value,'');
 assert.equal(h.elements.get('cql-saved-mapping').value,'');
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const compiled=require('./cql-text.js').compile(sql.replace('MongoDBOASIS',provider));
  assert.equal(compiled.path,'data/query-cql/composition');
  assert.equal(compiled.body.provider,provider);
  assert.equal(compiled.body.source.take,25);
  assert.equal(compiled.body.stages.at(-1).operation,'Take');
  assert.equal(compiled.body.stages.at(-1).count,5);
 }
});


test('loads displayed derived and staged-set examples for review without executing records',async()=>{
 const h=harness(async()=>assert.fail('Loading examples must not query records.'));
 await h.ui.ready;
 const page=require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'),'utf8');
 for(const example of ['derived','staged-set']){
  const sql=page.match(new RegExp('<code id="cql-'+example+'-example">([\\s\\S]+?)<\\/code>'))[1];
  h.elements.set('cql-'+example+'-example',{textContent:sql});
  h.elements.get('cql-virtual-mapping').value='20000000-0000-0000-0000-000000000001';
  h.elements.get('cql-saved-mapping').value='20000000-0000-0000-0000-000000000001';
  h.elements.get('cql-load-'+example+'-example').listeners.click();
  assert.equal(h.elements.get('cql-text').value,sql.trim());assert.equal(h.elements.get('cql-text').focused,true);
  assert.equal(h.elements.get('cql-virtual-mapping').value,'');assert.equal(h.elements.get('cql-saved-mapping').value,'');
  for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
   const query=require('./cql-text.js').compile(sql.replaceAll('MongoDBOASIS',provider));
   assert.equal(query.body.provider,provider);
   if(example==='derived'){
    assert.equal(query.path,'data/query-cql/composition');assert.equal(query.body.source.take,25);
    assert.ok(query.body.stages.some(stage=>stage.operation==='Where'));
   }else{
    assert.equal(query.path,'data/query-cql/set');assert.equal(query.body.kind,'Concat');
    assert.equal(query.body.left.take,25);assert.equal(query.body.right.take,25);
    assert.ok(query.body.left.stages.some(stage=>stage.operation==='Where'));
    assert.ok(query.body.right.stages.some(stage=>stage.operation==='Where'));
    assert.deepEqual(query.body.ordering,[{field:'Display',descending:false}]);assert.equal(query.body.take,5);
   }
  }
 }
});

test('loads displayed visible-tuple DISTINCT for review and compiles all three native providers',async()=>{
 const h=harness(async()=>assert.fail('Loading an example must not query records.'));
 await h.ui.ready;
 const page=require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'),'utf8');
 const sql=page.match(/<code id="cql-tuple-distinct-example">([\s\S]+?)<\/code>/)[1];
 h.elements.set('cql-tuple-distinct-example',{textContent:sql});
 h.elements.get('cql-virtual-mapping').value='20000000-0000-0000-0000-000000000001';
 h.elements.get('cql-saved-mapping').value='20000000-0000-0000-0000-000000000001';
 h.elements.get('cql-load-tuple-distinct-example').listeners.click();
 assert.equal(h.elements.get('cql-text').value,sql.trim());
 assert.equal(h.elements.get('cql-text').focused,true);
 assert.equal(h.elements.get('cql-virtual-mapping').value,'');
 assert.equal(h.elements.get('cql-saved-mapping').value,'');
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const query=require('./cql-text.js').compile(sql.replaceAll('MongoDBOASIS',provider));
  assert.equal(query.body.provider,provider);
  assert.equal(query.body.source.take,25);
  const stages=query.body.stages;
  assert.deepEqual(stages.find(stage=>stage.operation==='Select').columns,
   [{alias:'Label',sourceAlias:'Name'},{alias:'Detail',sourceAlias:'Description'}]);
  assert.ok(stages.findIndex(stage=>stage.operation==='Select')<stages.findIndex(stage=>stage.operation==='Distinct'));
  assert.ok(stages.findIndex(stage=>stage.operation==='Distinct')<stages.findIndex(stage=>stage.operation==='OrderBy'));
  assert.deepEqual(stages.at(-1),{operation:'Take',count:5});
 }
});


test('loads selected combined results for review and clears mapping without executing data queries',async()=>{
 const h=harness(async()=>assert.fail('Loading a query must not execute it.'));
 await h.ui.ready;
 const page=require('node:fs').readFileSync(require.resolve('./web4-sandbox.html'),'utf8');
 const sql=page.match(/<code id="cql-late-set-composition-example">([\s\S]+?)<\/code>/)[1];
 h.elements.set('cql-late-set-composition-example',{textContent:sql});
 h.elements.get('cql-virtual-mapping').value='20000000-0000-0000-0000-000000000001';
 h.elements.get('cql-saved-mapping').value='20000000-0000-0000-0000-000000000001';
 h.elements.get('cql-load-late-set-composition-example').listeners.click();
 assert.equal(h.elements.get('cql-text').value,sql.trim());assert.equal(h.elements.get('cql-text').focused,true);
 assert.equal(h.elements.get('cql-virtual-mapping').value,'');assert.equal(h.elements.get('cql-saved-mapping').value,'');
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']) {
  const result=require('./cql-text.js').compile(sql.replaceAll('MongoDBOASIS',provider));
  assert.equal(result.path,'data/query-cql/set');assert.equal(result.body.provider,provider);
  assert.equal(result.body.kind,'Union');assert.equal(result.body.left.columns,undefined);
  assert.equal(result.body.take,25);assert.deepEqual(result.body.entityStages,[{operation:'Take',count:20}]);
  assert.deepEqual(result.body.selectedStages.map(stage=>stage.operation),['Where','OrderBy','Take','Select','Distinct','OrderBy','Take']);
 }
});

test('late-selected set replies render aliased native cells in the result grid',async()=>{
 const h=harness(async(url,options)=>{
  assert.ok(url.endsWith('/query-cql/set'));
  const body=JSON.parse(options.body);assert.equal(body.kind,'Concat');
  assert.deepEqual(body.outputColumns,[{field:'Name',alias:'Label'}]);
  return {ok:true,status:200,json:async()=>({isError:false,result:{
   version:'cql-set-projection-v1',provider:'MongoDBOASIS',kind:'Concat',count:1,
   columns:[{alias:'Label',valueType:'String'}],rows:[['<b>literal label</b>']]
  }})};
 });
 await h.ui.ready;
 h.ui.loadText('SELECT Name AS Label FROM (SELECT * FROM MongoDBOASIS UNION ALL SELECT * FROM MongoDBOASIS LIMIT 4) AS records ORDER BY Label LIMIT 2');
 await h.elements.get('cql-run').listeners.click();
 const grid=h.elements.get('cql-results').children[0];
 assert.ok(grid,'Native selected results need a visible result grid.');
 assert.deepEqual(grid.children[0].children[0].children.map(cell=>cell.textContent),['Label']);
 assert.deepEqual(grid.children[1].children[0].children.map(cell=>cell.textContent),['<b>literal label</b>']);
 assert.match(h.elements.get('cql-note').textContent,/1 returned rows/);
});
test('combined count replies display the reviewed SQL alias through the set route',async()=>{
 let calls=0;
 const h=harness(async(url,options)=>{
  calls++;assert.ok(url.endsWith('/query-cql/set'));
  const body=JSON.parse(options.body);assert.equal(body.reduction,'LongCount');
  assert.equal(body.take,4);assert.equal(body.outputColumns,undefined);
  return {ok:true,status:200,json:async()=>({isError:false,result:{
   version:'cql-scalar-v1',provider:'MongoDBOASIS',operation:'LongCount',valueType:'Int64',value:'4'
  }})};
 });
 await h.ui.ready;
 h.ui.loadText('SELECT COUNT(*) AS Total FROM (SELECT * FROM MongoDBOASIS UNION ALL SELECT * FROM MongoDBOASIS LIMIT 4) AS records');
 await h.elements.get('cql-run').listeners.click();
 assert.match(h.elements.get('cql-note').textContent,/Total: 4/);
 assert.equal(h.elements.get('cql-results').children.length,0);
 assert.equal(calls,1,'Rendering must not issue another data query.');
});
