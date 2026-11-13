const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./cql-text.js');

test('compiles typed filters, grouped alternatives and ordered pagination', () => {
  const { path, body } = compile(
    "select * from SQLLiteDBOASIS where IsActive = TRUE AND Version >= 2 " +
    "AND (Name CONTAINS 'O''Brien' OR metadata.category IN ('coffee', 'tea')) " +
    "ORDER BY Version DESC LIMIT 5 OFFSET 2;"
  );
  assert.equal(path, 'data/query-cql');
  assert.equal(body.provider, 'SQLLiteDBOASIS');
  assert.deepEqual(body.filters.map(({ scalar, value }) => [scalar, value]),
    [['Boolean', true], ['Integer', 2]]);
  assert.deepEqual(body.anyOf.map(({ operator, value }) => [operator, value]),
    [['Contains', "O'Brien"], ['In', ['coffee', 'tea']]]);
  assert.deepEqual([body.orderBy, body.descending, body.take, body.skip], ['Version', true, 5, 2]);
});

test('compiles native counts and applies pagination only to federated results', () => {
  const count = compile('SELECT COUNT(*) FROM Neo4jOASIS WHERE IsActive = FALSE');
  assert.equal(count.path, 'data/query-cql/scalar');
  assert.equal(count.body.operation, 'LongCount');
  const federation = compile('SELECT * FROM MongoDBOASIS, Neo4jOASIS ORDER BY Name LIMIT 3 OFFSET 1');
  assert.equal(federation.path, 'data/query-cql/federation');
  assert.deepEqual(federation.body.providers, ['MongoDBOASIS', 'Neo4jOASIS']);
  assert.deepEqual([federation.body.take, federation.body.skip], [3, 1]);
  assert.deepEqual([federation.body.source.take, federation.body.source.skip], [100, 0]);
  assert.equal(federation.body.identityMode, 'PreserveCopies');
});

test('rejects unsupported statements, stacked statements and requests outside demo bounds', () => {
  for (const text of [
    'DELETE FROM MongoDBOASIS',
    'SELECT * FROM MongoDBOASIS; SELECT * FROM Neo4jOASIS',
    'SELECT * FROM MongoDBOASIS WHERE Name = TRUE',
    'SELECT COUNT(*) FROM MongoDBOASIS, Neo4jOASIS',
    'SELECT * FROM MongoDBOASIS, MongoDBOASIS',
    'SELECT * FROM MongoDBOASIS LIMIT 101',
    'SELECT * FROM MongoDBOASIS OFFSET 10001'
  ]) assert.throws(() => compile(text), Error, text);
});
