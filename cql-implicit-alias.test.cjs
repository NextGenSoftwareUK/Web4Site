const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./cql-text.js');

test('implicit aliases retain scalar and selected payloads on all three stores', () => {
  for (const provider of ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']) {
    for (const [implicit, explicit] of [
      ['Name Label, Version Revision', 'Name AS Label, Version AS Revision'],
      ['LENGTH(Name) Size', 'LENGTH(Name) AS Size'],
      ['CAST(metadata.label AS STRING) Label', 'CAST(metadata.label AS STRING) AS Label'],
      ['COUNT(*) Total', 'COUNT(*) AS Total']
    ]) assert.deepEqual(compile('SELECT ' + implicit + ' FROM ' + provider),
      compile('SELECT ' + explicit + ' FROM ' + provider));
  }
});
test('implicit aliases preserve grouped and joined result bindings', () => {
  assert.deepEqual(
    compile('SELECT Name Label, COUNT(*) Total FROM MongoDBOASIS GROUP BY Name HAVING Total >= 1 ORDER BY Total DESC LIMIT 3'),
    compile('SELECT Name AS Label, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Name HAVING Total >= 1 ORDER BY Total DESC LIMIT 3'));
  const sources = '(SELECT * FROM MongoDBOASIS WHERE Version >= 2 ORDER BY Id LIMIT 3) AS l LEFT JOIN ' +
    '(SELECT * FROM MongoDBOASIS LIMIT 2) AS r ON r.Version = l.Version AND l.Name = r.Name';
  assert.deepEqual(compile('SELECT l.Id LeftId, r.Id RightId FROM ' + sources),
    compile('SELECT l.Id AS LeftId, r.Id AS RightId FROM ' + sources));
});
test('implicit alias lookahead preserves clause boundaries and rejects ambiguous names', () => {
  assert.equal(compile('SELECT Name FROM MongoDBOASIS').body.columns[0].alias, 'Name');
  assert.equal(compile('SELECT COUNT(*) FROM MongoDBOASIS').scalarAlias, undefined);
  assert.throws(() => compile('SELECT Name Label, Description label FROM MongoDBOASIS'), /distinct alias/i);
  assert.throws(() => compile('SELECT LENGTH(Name) FROM MongoDBOASIS'), /AS|alias/i);
  assert.throws(() => compile("SELECT Name 'unsafe label' FROM MongoDBOASIS"));
});
