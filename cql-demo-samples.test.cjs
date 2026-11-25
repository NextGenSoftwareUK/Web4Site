const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const prep = require('./cql-demo-preparation.js');

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function storage() {
  const entries = new Map();
  return { entries, get length() { return entries.size; }, key: i => [...entries.keys()][i] ?? null,
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
function server() {
  const db = new Map(); const saves = []; let n = 0;
  const idFor = (provider, key) => {
    const hex = Buffer.from(provider + key).toString('hex').padEnd(32, '0').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  const request = async (path, body) => {
    n++;
    if (path.endsWith('demo-identities')) return { result: { ownerId: owner, provider: body.provider,
      records: body.keys.map(key => ({ id: idFor(body.provider, key), nativeKey: key, metadata: {
        'oasis.native.provider': body.provider, 'oasis.native.source': 'cosmic-cql-demo', 'oasis.native.key': key } })) } };
    if (path === 'data/query-cql') {
      const key = body.provider + ':' + body.filters[0].value;
      return { result: { rows: db.has(key) ? [db.get(key)] : [] } };
    }
    if (path === 'data/save-holon') {
      saves.push(body);
      assert.deepEqual(body.expectedRevisions, { [body.holon.id]: null });
      assert.equal(body.autoReplicationMode, 'OFF');
      assert.equal(body.holon.isPublic, false);
      const key = body.providerType + ':' + body.holon.id;
      if (db.has(key)) throw new Error('create-only conflict');
      const row = { ...body.holon, version: 1, createdByAvatarId: owner, metadata: body.holon.metaData };
      db.set(key, row);
      return { isSaved: true, result: row };
    }
    throw new Error('Unexpected endpoint ' + path);
  };
  return { db, saves, request };
}
const options = (s, recipe, journal = storage()) => ({ recipe, request: s.request, storage: journal,
  base: 'https://example.invalid', isCurrent: () => true, randomUUID });

test('sample recipe is offered only for built-in store presets', () => {
  assert.deepEqual(prep.sampleRecipe('browse', 'MongoDBOASIS'), { kind: 'samples', providers: ['MongoDBOASIS'] });
  assert.deepEqual(prep.sampleRecipe('federation', 'MongoDBOASIS').providers, ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']);
  assert.equal(prep.sampleRecipe('browse', 'IPFSOASIS'), null);
  assert.equal(prep.sampleRecipe('host:public-records', 'MongoDBOASIS'), null);
});

test('samples are saved once per store, with categories the presets query', async () => {
  const s = server();
  const first = await prep.prepareSamples(options(s, prep.sampleRecipe('federation', 'MongoDBOASIS')));
  assert.equal(first.saved, 6); assert.equal(first.existing, 0);
  const names = s.saves.map(save => save.providerType + ':' + save.holon.name).sort();
  assert.deepEqual(names, ['MongoDBOASIS:Espresso', 'MongoDBOASIS:Green Tea', 'Neo4jOASIS:Espresso', 'Neo4jOASIS:Green Tea',
    'SQLLiteDBOASIS:Espresso', 'SQLLiteDBOASIS:Green Tea']);
  const espresso = s.saves.find(save => save.holon.name === 'Espresso');
  assert.equal(espresso.holon.metaData.category, 'coffee');
  assert.match(espresso.holon.description, /coffee/);
  const again = await prep.prepareSamples(options(s, prep.sampleRecipe('federation', 'MongoDBOASIS')));
  assert.equal(again.saved, 0); assert.equal(again.existing, 6); assert.equal(s.saves.length, 6);
});

test('an existing record that differs is left untouched', async () => {
  const s = server();
  await prep.prepareSamples(options(s, prep.sampleRecipe('browse', 'Neo4jOASIS')));
  for (const row of s.db.values()) row.name = 'Changed by me';
  await assert.rejects(prep.prepareSamples(options(s, prep.sampleRecipe('browse', 'Neo4jOASIS'))), /left untouched/);
  assert.equal(s.saves.length, 2);
});

test('a leftover save journal blocks a repeat save', async () => {
  const s = server(); const journal = storage();
  const recipe = prep.sampleRecipe('browse', 'SQLLiteDBOASIS');
  const mapped = await s.request('data/query-cql/demo-identities', { provider: 'SQLLiteDBOASIS', keys: ['espresso'] });
  journal.setItem(`oasis.cql.samples.v1:https://example.invalid:${owner}:SQLLiteDBOASIS:${mapped.result.records[0].id}:op`, '{}');
  await assert.rejects(prep.prepareSamples(options(s, recipe, journal)), /reconciliation/);
  assert.equal(s.saves.length, 0);
});
