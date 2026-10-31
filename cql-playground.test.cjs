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
function harness(fetcher, discover) {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const elements = new Map();
  function element() {
    return {
      value: '', textContent: '', children: [], listeners: {}, disabled: false,
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
    fetch: async (...args) => {
      const response = args[0].endsWith('/api/data/query-cql/providers')
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
  const ui = context.CqlPlayground.init({ getToken: () => token, getBase: () => 'https://example.invalid' });
  return { elements, ui, signOut() { token = null; ui.syncAuth(); } };
}

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
  let release;
  const h = harness(() => new Promise(resolve => { release = resolve; }));
  await h.ui.ready;
  const running = h.elements.get('cql-run').listeners.click();
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
  let calls = 0;
  const h = harness((url, options) => {
    calls++;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  await h.ui.ready;
  const running = h.elements.get('cql-run').listeners.click();
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
    'https://example.invalid/api/data/query-cql/providers', 'https://example.invalid/api/data/query-cql'
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
  let release;
  const h = harness(async () => { throw new Error('No query.'); }, () => new Promise(resolve => { release = resolve; }));
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
