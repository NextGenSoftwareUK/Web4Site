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
function fixture(count = 2, profile = {}) {
  const keys = (profile.keys ?? ['101', '102']).slice(0, count);
  const metadataKey = profile.metadataKey ?? 'MastodonStatusId';
  const source = { provider: profile.provider ?? 'ActivityPubOASIS', available: true, federationAvailable: true };
  const example = { operation: 'Federation', available: true, request: { scope: 'Named',
    providers: ['MongoDBOASIS', source.provider], source: { orderBy: 'None', take: 25, filters: [{
      metadataPath: [metadataKey], scalar: 'String', operator: 'In', value: keys
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
      metadata: { [metadataKey]: key }
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

test('derived native preparation request preserves the paired execution budget before saves', async () => {
  const f = fixture();
  f.example.request.maximumDurationMilliseconds = 30000;
  const before = structuredClone(f.example);
  const recipe = prep.recipe(f.source, f.example);
  assert.equal(recipe.read.maximumDurationMilliseconds, 30000);
  assert.deepEqual(f.example, before);
  await prep.prepare({ ...f.options, recipe });
  assert.equal(f.calls[0].path, 'data/query-cql');
  assert.equal(f.calls[0].body.maximumDurationMilliseconds, 30000);
  assert.equal(f.saves.length, 2);
  for (const invalid of [0, -1, 30001, 1.5, '30000']) {
    f.example.request.maximumDurationMilliseconds = invalid;
    assert.equal(prep.recipe(f.source, f.example), null);
  }
});

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

test('the shared ID compositor rejects invalid copy sets and never mutates a source template', () => {
  const f = idFixture();
  const before = structuredClone(f.recipe);
  assert.deepEqual(prep.composeIdPair(f.recipe, ids).source.filters[0].value, [...f.nativeIds, ...ids]);
  assert.deepEqual(f.recipe, before);
  for (const invalid of [[], null, [f.nativeIds[0]], ['bad-id'],
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']])
    assert.throws(() => prep.composeIdPair(f.recipe, invalid));
  assert.throws(() => prep.composeIdPair(fixture().recipe, ids));
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


test('Google public metadata uses host keys and Core identities for repeat-safe Mongo snapshots', async () => {
  const prefix = 'LC08/01/001/003/LC08_L1GT_001003_20140812_20170420_01_T2/';
  const name = 'LC08_L1GT_001003_20140812_20170420_01_T2_';
  const keys = ['ANG.txt', 'B1.TIF', 'B10.TIF'].map(suffix => prefix + name + suffix);
  const f = fixture(2, { provider: 'GoogleCloudOASIS', metadataKey: 'GCSObjectKey', keys });

  // The three-object federation keeps its original predicate; preparation reads
  // only the first two objects and saves two avatar-scoped Mongo snapshots.
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const before = structuredClone(f.example);
  assert.deepEqual(plan.keys, keys.slice(0, 2));
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.equal(plan.read.provider, 'GoogleCloudOASIS');
  assert.equal(plan.read.includeMetadata, true);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(f.example, before);
  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.GCSObjectKey, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'GoogleCloudOASIS');
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});


test('Ethereum address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'EthereumOASIS', metadataKey: 'EthereumAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.EthereumAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'EthereumOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});


test('Polygon address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'PolygonOASIS', metadataKey: 'PolygonAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.PolygonAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'PolygonOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});


test('Arbitrum address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'ArbitrumOASIS', metadataKey: 'ArbitrumAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.ArbitrumAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'ArbitrumOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Cosmos validator snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = ['cosmosvaloper1qphf0ferqcch0jca9hlqfm3x0eds3dpkcvpafp',
    'cosmosvaloper1qr6sk28w4r6kqsg0737wzgu05505t4glezetwn',
    'cosmosvaloper1q9p73lx07tjqc34vs8jrsu5pg3q4ha534uqv4w'];
  const f = fixture(2, { provider: 'CosmosBlockChainOASIS', metadataKey: 'CosmosValidatorAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.CosmosValidatorAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'CosmosBlockChainOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Polkadot header snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(64, '0'));
  const f = fixture(2, { provider: 'PolkadotOASIS', metadataKey: 'PolkadotBlockHash', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.PolkadotBlockHash, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'PolkadotOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('NEAR account snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = ['near', 'wrap.near', 'aurora'];
  const f = fixture(2, { provider: 'NEAROASIS', metadataKey: 'NearAccountId', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.NearAccountId, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'NEAROASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Base address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'BaseOASIS', metadataKey: 'BaseAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.BaseAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'BaseOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Avalanche address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'AvalancheOASIS', metadataKey: 'AvalancheAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.AvalancheAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'AvalancheOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('BNB Chain address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'BNBChainOASIS', metadataKey: 'BNBChainAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.BNBChainAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'BNBChainOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Optimism address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'OptimismOASIS', metadataKey: 'OptimismAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.OptimismAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'OptimismOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Linea address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'LineaOASIS', metadataKey: 'LineaAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.LineaAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'LineaOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Scroll address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'ScrollOASIS', metadataKey: 'ScrollAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.ScrollAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'ScrollOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('ZkSync address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'ZkSyncOASIS', metadataKey: 'ZkSyncAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.ZkSyncAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'ZkSyncOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Abstract address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'AbstractOASIS', metadataKey: 'AbstractAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.AbstractAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'AbstractOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Monad address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'MonadOASIS', metadataKey: 'MonadAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.MonadAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'MonadOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Sei address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'SeiOASIS', metadataKey: 'SeiAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.SeiAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'SeiOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Berachain address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'BerachainOASIS', metadataKey: 'BerachainAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.BerachainAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'BerachainOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Fantom address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'FantomOASIS', metadataKey: 'FantomAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.FantomAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'FantomOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Filecoin address snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => '0x' + value.toString(16).padStart(40, '0'));
  const f = fixture(2, { provider: 'FilecoinOASIS', metadataKey: 'FilecoinAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.FilecoinAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'FilecoinOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Bitcoin header snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 2, 3].map(value => value.toString(16).padStart(64, '0'));
  const f = fixture(2, { provider: 'BitcoinOASIS', metadataKey: 'BitcoinBlockHash', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.BitcoinBlockHash, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'BitcoinOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('XRPL header snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [10, 11, 12].map(value => value.toString(16).toUpperCase().padStart(64, '0'));
  const f = fixture(2, { provider: 'XRPLOASIS', metadataKey: 'XRPLLedgerHash', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.XRPLLedgerHash, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'XRPLOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Stellar header snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = ['65247993', '65247992', '65247991'];
  const f = fixture(2, { provider: 'StellarOASIS', metadataKey: 'StellarLedgerSequence', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.StellarLedgerSequence, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'StellarOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Algorand current account snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ', 'AAAAAAAAAATLOVN6WSNYBWSCZGEO4PS5BKS7KGB4PPJXA6WCTIII35HJZE', 'AAAAAAAAACV43GFSJHXLCG7ZLTNYZJJLUDOQT35CK4ZB74U3CGSAMNCUBA'];
  const f = fixture(2, { provider: 'AlgorandOASIS', metadataKey: 'AlgorandAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.AlgorandAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'AlgorandOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Aptos version-selected account snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = [1, 3, 4].map(value => '0x' + value.toString(16).padStart(64, '0'));
  const f = fixture(2, { provider: 'AptosOASIS', metadataKey: 'AptosAccountAddress', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.AptosAccountAddress, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'AptosOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});

test('Hedera indexed account snapshots keep the source filter and never request a signed chain write', async () => {
  const keys = ['0.0.2', '0.0.3', '0.0.98'];
  const f = fixture(2, { provider: 'HashgraphOASIS', metadataKey: 'HederaAccountId', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  const original = structuredClone(f.example);

  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.deepEqual(plan.read.filters[0].value, keys.slice(0, 2));
  assert.deepEqual(f.example, original);

  for (const [index, save] of f.saves.entries()) {
    assert.equal(save.providerType, 'MongoDBOASIS');
    assert.equal(save.holon.id, ids[index]);
    assert.equal(save.holon.metaData.HederaAccountId, keys[index]);
    assert.equal(save.holon.metaData['oasis.native.provider'], 'HashgraphOASIS');
    assert.equal(save.holon.isPublic, false);
  }

  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
  assert.equal(f.journal.length, 0);
});


test('Azure dataset blob names retain exact keys above 128 characters', async () => {
  const keys = ['data/' + 'a'.repeat(137), 'data/manifest', 'data/_SUCCESS'];
  const f = fixture(2, { provider: 'AzureStorageOASIS', metadataKey: 'AzureBlobKey', keys });
  f.example.request.source.filters[0].value = keys;
  const plan = prep.recipe(f.source, f.example);
  assert.ok(plan);
  const first = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(first.saved, 2);
  assert.equal(f.saves[0].holon.metaData.AzureBlobKey, keys[0]);
  assert.equal(f.saves[0].holon.isPublic, false);
  const repeated = await prep.prepare({ ...f.options, recipe: plan });
  assert.equal(repeated.saved, 0);
  assert.equal(repeated.existing, 2);
  assert.equal(f.saves.length, 2);
});

test('Azure key extension remains bounded and does not expand other profiles', () => {
  const f = fixture(2, { provider: 'AzureStorageOASIS', metadataKey: 'AzureBlobKey' });
  f.example.request.source.filters[0].value = ['x'.repeat(512)];
  assert.ok(prep.recipe(f.source, f.example));
  f.example.request.source.filters[0].value = ['x'.repeat(513)];
  assert.equal(prep.recipe(f.source, f.example), null);
  f.source.provider = 'GoogleCloudOASIS';
  f.example.request.providers = ['MongoDBOASIS', 'GoogleCloudOASIS'];
  f.example.request.source.filters[0].value = ['x'.repeat(137)];
  assert.equal(prep.recipe(f.source, f.example), null);
});
