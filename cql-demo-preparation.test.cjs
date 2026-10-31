const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const prep = require('./cql-demo-preparation.js');

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
function storage() {
  const entries = new Map();
  return { entries, get length() { return entries.size; }, key: i => [...entries.keys()][i] ?? null,
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
function fixture(count = 2) {
  const keys = ['101', '102'].slice(0, count);
  const source = { provider: 'ActivityPubOASIS', available: true, federationAvailable: true };
  const example = { operation: 'Federation', available: true, request: { scope: 'Named',
    providers: ['MongoDBOASIS', source.provider], source: { orderBy: 'None', take: 25, filters: [{
      metadataPath: ['MastodonStatusId'], scalar: 'String', operator: 'In', value: keys
    }] } } };
  const recipe = prep.recipe(source, example);
  const db = new Map(); const saves = []; const calls = []; const journal = storage();
  let current = true;
  const request = async (path, body) => {
    calls.push({ path, body });
    if (path.endsWith('demo-identities')) return { result: { ownerId: owner, provider: source.provider,
      records: keys.map((nativeKey, i) => ({ id: ids[i], nativeKey, metadata: {
        'oasis.native.provider': source.provider, 'oasis.native.source': 'cosmic-cql-demo', 'oasis.native.key': nativeKey
      } })) } };
    if (path === 'data/query-cql' && body.provider === source.provider) return { result: { rows: keys.map((key, i) => ({
      id: `33333333-3333-4333-8333-33333333333${i}`, name: 'Native ' + key, description: null,
      metadata: { MastodonStatusId: key }
    })) } };
    if (path === 'data/query-cql') return { result: { rows: db.has(body.filters[0].value) ? [db.get(body.filters[0].value)] : [] } };
    if (path === 'data/save-holon') {
      saves.push(body);
      assert.deepEqual(body.expectedRevisions, { [body.holon.id]: null });
      assert.equal(body.holon.isPublic, false);
      assert.equal(body.autoFailOverMode, 'OFF');
      if (db.has(body.holon.id)) throw new Error('create-only conflict');
      const row = { ...body.holon, metadata: body.holon.metaData, createdByAvatarId: owner };
      db.set(row.id, row);
      return { isSaved: true, result: row };
    }
    throw new Error('Unexpected endpoint ' + path);
  };
  const options = { recipe, request, storage: journal, base: 'https://example.invalid', isCurrent: () => current, randomUUID };
  return { recipe, source, example, db, saves, calls, journal, request, options, changeSession() { current = false; } };
}

function idFixture() {
  const f = fixture();
  const nativeIds = ['44444444-4444-4444-8444-444444444441',
    '44444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444443'];
  f.source.provider = 'OracleDBOASIS';
  f.example.request.providers = ['MongoDBOASIS', f.source.provider];
  f.example.request.source.filters = [{ field: 'Id', scalar: 'Guid', operator: 'In', value: nativeIds }];
  const previous = f.request;
  f.request = async (path, body) => {
    if (path.endsWith('demo-identities')) return { result: { ownerId: owner, provider: f.source.provider,
      records: body.keys.map((nativeKey, i) => ({ id: ids[i], nativeKey, metadata: {
        'oasis.native.provider': f.source.provider, 'oasis.native.source': 'cosmic-cql-demo', 'oasis.native.key': nativeKey
      } })) } };
    if (path === 'data/query-cql' && body.provider === f.source.provider) return { result: {
      rows: body.filters[0].value.map(id => ({ id, name: 'Native ' + id, description: null, metadata: {} })) } };
    return previous(path, body);
  };
  f.recipe = prep.recipe(f.source, f.example);
  f.options = { ...f.options, recipe: f.recipe, request: f.request };
  return { ...f, nativeIds };
}

test('ID pairing uses original and Core-mapped IDs, preserving three/two-record server selections', async () => {
  const f = idFixture();
  const first = await prep.prepare(f.options);
  assert.equal(first.saved, 2);
  assert.deepEqual(first.pairedRequest.source.filters[0].value, [...f.nativeIds, ...ids]);
  assert.deepEqual(f.example.request.source.filters[0].value, f.nativeIds);
  assert.equal(f.saves[0].holon.metaData['COSMIC.Demo.SourceHolonId'], f.nativeIds[0]);
  assert.equal(Object.hasOwn(f.saves[0].holon.metaData, 'undefined'), false);
  const repeated = await prep.prepare(f.options);
  assert.equal(repeated.saved, 0); assert.equal(repeated.existing, 2);
  assert.deepEqual(repeated.pairedRequest, first.pairedRequest);
  const subset = structuredClone(f.example);
  subset.request.source.filters[0].value = f.nativeIds.slice(0, 2);
  const smaller = await prep.prepare({ ...f.options, recipe: prep.recipe(f.source, subset) });
  assert.equal(smaller.saved, 0); assert.equal(smaller.existing, 2);
  assert.deepEqual(smaller.pairedRequest.source.filters[0].value, [...f.nativeIds.slice(0, 2), ...ids]);
  assert.equal(f.saves.length, 2);
});

test('ID recipes reject mixed fields, malformed IDs and equivalent duplicate GUIDs', () => {
  const f = idFixture();
  for (const change of [filter => { filter.metadataPath = ['category']; },
    filter => { filter.value[0] = 'not-a-guid'; },
    filter => { filter.scalar = 'String'; },
    filter => { filter.value = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']; }]) {
    const example = structuredClone(f.example);
    change(example.request.source.filters[0]);
    assert.equal(prep.recipe(f.source, example), null);
  }
});

test('ID preparation rejects source/mapping mismatch before writing', async () => {
  for (const fault of ['source', 'mapping']) {
    const f = idFixture();
    const request = async (path, body) => {
      const value = await f.request(path, body);
      if (fault === 'source' && body.provider === 'OracleDBOASIS') value.result.rows[0].id = randomUUID();
      if (fault === 'mapping' && path.endsWith('demo-identities')) value.result.records[0].id = f.nativeIds[0];
      return value;
    };
    await assert.rejects(prep.prepare({ ...f.options, request }), /identity|identities/i);
    assert.equal(f.saves.length, 0);
  }
});

test('ID preparation retains unknown save outcome and does not replay it', async () => {
  const f = idFixture();
  const request = async (path, body) => {
    const value = await f.request(path, body);
    if (path === 'data/save-holon') throw new Error('outcome unknown');
    return value;
  };
  await assert.rejects(prep.prepare({ ...f.options, request }), /unknown/);
  assert.equal(f.saves.length, 1); assert.equal(f.journal.length, 1);
  await assert.rejects(prep.prepare(f.options), /reconciliation/);
  assert.equal(f.saves.length, 1);
});

test('preparation creates private snapshots once and reuses acknowledged identities without overwriting', async () => {
  const f = fixture();
  assert.equal((await prep.prepare(f.options)).saved, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
  const second = await prep.prepare(f.options);
  assert.equal(second.saved, 0); assert.equal(second.existing, 2); assert.equal(f.saves.length, 2);
  assert.equal(f.db.get(ids[0]).metaData.MastodonStatusId, '101');
});

test('edited or foreign records are left untouched', async () => {
  for (const fault of ['edited', 'foreign', 'public']) {
    const f = fixture(); await prep.prepare(f.options);
    const row = f.db.get(ids[0]);
    if (fault === 'edited') row.name = 'My edit';
    if (fault === 'foreign') row.createdByAvatarId = randomUUID();
    if (fault === 'public') row.isPublic = true;
    await assert.rejects(prep.prepare(f.options), /left untouched/);
    assert.equal(f.saves.length, 2);
  }
});

test('lost save acknowledgement retains a payload-free intent and never automatically resends', async () => {
  const f = fixture();
  const request = async (path, body) => {
    const result = await f.request(path, body);
    if (path === 'data/save-holon') throw new Error('transport outcome unknown');
    return result;
  };
  await assert.rejects(prep.prepare({ ...f.options, request }), /unknown/);
  assert.equal(f.saves.length, 1); assert.equal(f.journal.length, 1);
  const pending = [...f.journal.entries.values()][0];
  assert.equal(JSON.parse(pending).operationId, f.saves[0].operationId);
  assert.doesNotMatch(pending, /Native 101|Bearer|MastodonStatusId|metaData/);
  await assert.rejects(prep.prepare(f.options), /reconciliation/);
  assert.equal(f.saves.length, 1);
});

test('unavailable intent storage prevents the first save', async () => {
  const f = fixture(); f.journal.setItem = () => { throw new Error('storage unavailable'); };
  await assert.rejects(prep.prepare(f.options), /storage unavailable/);
  assert.equal(f.saves.length, 0);
});

test('session change after identity mapping prevents all saves', async () => {
  const f = fixture();
  const request = async (path, body) => { const result = await f.request(path, body);
    if (path.endsWith('demo-identities')) f.changeSession(); return result; };
  await assert.rejects(prep.prepare({ ...f.options, request }), /Session changed/);
  assert.equal(f.saves.length, 0); assert.equal(f.journal.length, 0);
});

test('incomplete save acknowledgement preserves the exact operation and stops the batch', async () => {
  const f = fixture();
  const request = async (path, body) => { const result = await f.request(path, body);
    return path === 'data/save-holon' ? { ...result, isSaved: false } : result; };
  await assert.rejects(prep.prepare({ ...f.options, request }), /acknowledgement is incomplete/);
  assert.equal(f.saves.length, 1); assert.equal(f.journal.length, 1);
});

test('concurrent tabs keep distinct intents while native create-only CAS selects one writer', async () => {
  const f = fixture(1); let lookups = 0; let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const request = async (path, body) => {
    if (path === 'data/query-cql' && body.provider === 'MongoDBOASIS' && !f.db.size) {
      if (++lookups === 2) release(); await barrier; return { result: { rows: [] } };
    }
    return f.request(path, body);
  };
  const outcomes = await Promise.allSettled([prep.prepare({ ...f.options, request }), prep.prepare({ ...f.options, request })]);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(row => row.status === 'rejected').length, 1);
  assert.equal(f.db.size, 1); assert.equal(f.saves.length, 2); assert.equal(f.journal.length, 1);
  assert.equal(JSON.parse([...f.journal.entries.values()][0]).operationId, f.saves[1].operationId);
});

test('preparation only derives bounded native-key pairing recipes, without modifying the server template', () => {
  const f = fixture();
  f.recipe.read.filters[0].value.push('changed');
  assert.equal(f.example.request.source.filters[0].value.length, 2);
  f.example.request.source.filters[0].metadataPath = ['constructor'];
  assert.equal(prep.recipe(f.source, f.example), null);
});
