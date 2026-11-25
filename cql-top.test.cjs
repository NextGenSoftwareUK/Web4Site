const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./cql-text.js');

test('TOP rows and projections compile to existing bounded payloads on all canonical stores', () => {
  for (const provider of ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']) {
    for (const fields of ['*', 'Id, Name Label']) {
      const tail = ' FROM ' + provider + ' WHERE Version >= 2 ORDER BY Id';
      for (const bound of ['3', '(3)']) assert.deepEqual(
        compile('SELECT TOP ' + bound + ' ' + fields + tail),
        compile('SELECT ' + fields + tail + ' LIMIT 3'));
    }
  }
});

test('TOP applies to DISTINCT and grouped result windows', () => {
  assert.deepEqual(compile('SELECT DISTINCT TOP 4 Name Label FROM MongoDBOASIS ORDER BY Label'),
    compile('SELECT DISTINCT Name Label FROM MongoDBOASIS ORDER BY Label LIMIT 4'));
  assert.deepEqual(compile('SELECT TOP 3 Name Label, COUNT(*) Total FROM Neo4jOASIS GROUP BY Name ORDER BY Total DESC'),
    compile('SELECT Name Label, COUNT(*) Total FROM Neo4jOASIS GROUP BY Name ORDER BY Total DESC LIMIT 3'));
});

test('joined TOP input and output share existing join bounds', () => {
  const top = 'SELECT TOP 2 l.Id LeftId, r.Id RightId FROM (SELECT TOP 3 * FROM SQLLiteDBOASIS ORDER BY Id) l LEFT JOIN ' +
    '(SELECT TOP (2) * FROM SQLLiteDBOASIS ORDER BY Id) r ON l.Version = r.Version ORDER BY LeftId';
  const limit = 'SELECT l.Id LeftId, r.Id RightId FROM (SELECT * FROM SQLLiteDBOASIS ORDER BY Id LIMIT 3) l LEFT JOIN ' +
    '(SELECT * FROM SQLLiteDBOASIS ORDER BY Id LIMIT 2) r ON l.Version = r.Version ORDER BY LeftId LIMIT 2';
  assert.deepEqual(compile(top), compile(limit));
});

test('TOP refuses competing windows, unsupported scalar modifiers and out of scope bounds', () => {
  for (const suffix of ['LIMIT 2', 'OFFSET 1', 'FETCH FIRST 2 ROWS ONLY'])
    assert.throws(() => compile('SELECT TOP 3 * FROM MongoDBOASIS ' + suffix), /either TOP/i);
  for (const header of ['TOP 0', 'TOP -1', 'TOP 101', 'TOP 1.5', 'TOP 2 PERCENT', 'TOP 2 WITH TIES'])
    assert.throws(() => compile('SELECT ' + header + ' * FROM MongoDBOASIS'));
  assert.throws(() => compile('SELECT TOP 1 COUNT(*) FROM MongoDBOASIS'), /scalar queries/i);
  assert.throws(() => compile('SELECT l.Id FROM (SELECT TOP 11 * FROM MongoDBOASIS) l JOIN ' +
    '(SELECT TOP 2 * FROM MongoDBOASIS) r ON l.Id = r.Id'), /integer from 1 to 10/i);
});
