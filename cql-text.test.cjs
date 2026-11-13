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
    'SELECT * FROM MongoDBOASIS OFFSET 1001'
  ]) assert.throws(() => compile(text), Error, text);
});

test('compiles prefix and suffix matching only for string fields', () => {
  const query = compile("SELECT * FROM MongoDBOASIS WHERE Name STARTSWITH 'Coffee' AND Name ENDSWITH 'Bar'");
  assert.deepEqual(query.body.filters.map(filter => filter.operator), ['StartsWith', 'EndsWith']);
  assert.throws(() => compile("SELECT * FROM MongoDBOASIS WHERE Version STARTSWITH 2"), /string field/);
});

test('enforces the WEB4 filter budget across root and relationship predicates', () => {
  const prefix = 'SELECT * FROM MongoDBOASIS WHERE ';
  const filters = Array(11).fill('IsActive = TRUE').join(' AND ');
  assert.doesNotThrow(() => compile(prefix + filters + ' AND EXISTS CHILD (IsActive = TRUE) OFFSET 1000'));
  assert.throws(() => compile(prefix + filters + " AND EXISTS CHILD (Name = 'a' OR Name = 'b')"), /twelve filters/);
  assert.throws(() => compile(prefix + Array(5).fill('EXISTS CHILD (IsActive = TRUE)').join(' AND ')), /four relationship/);
});

test('compiles bounded descendant search alongside a direct child filter', () => {
  const { body } = compile(
    "SELECT * FROM Neo4jOASIS WHERE EXISTS CHILD (IsActive = TRUE) " +
    "AND EXISTS DESCENDANT (Name = 'Coffee' OR Name = 'Tea') LIMIT 5"
  );
  assert.equal(body.anyChildren.length, 1);
  assert.equal(body.anyDescendants.length, 1);
  const [descendant] = body.anyDescendants;
  assert.deepEqual([descendant.maximumDepth, descendant.maximumNodes], [8, 1000]);
  assert.deepEqual(descendant.anyOf.map(filter => filter.value), ['Coffee', 'Tea']);
});

test('compiles a direct child existence predicate independently of the root filters', () => {
  const { body } = compile(
    "SELECT * FROM Neo4jOASIS WHERE IsActive = TRUE AND " +
    "EXISTS CHILD (Version >= 2 AND (Name = 'Coffee' OR Name = 'Tea')) LIMIT 5"
  );
  assert.equal(body.filters[0].field, 'IsActive');
  assert.equal(body.anyChildren.length, 1);
  assert.equal(body.anyChildren[0].filters[0].field, 'Version');
  assert.deepEqual(body.anyChildren[0].anyOf.map(filter => filter.value), ['Coffee', 'Tea']);
  const alternatives = compile("SELECT * FROM Neo4jOASIS WHERE EXISTS CHILD (Name = 'Coffee' OR Name = 'Tea')");
  assert.deepEqual(alternatives.body.anyChildren[0].anyOf.map(filter => filter.value), ['Coffee', 'Tea']);
  assert.throws(() => compile('SELECT * FROM Neo4jOASIS WHERE EXISTS CHILD (EXISTS CHILD (Version = 1))'));
});
