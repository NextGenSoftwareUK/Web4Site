const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./cql-text.js');
const mapping = '764b78ae-df26-4637-9bbd-1d0530954fea';
const identity = 'AB8079E8-5E72-4FF9-81B7-8FECE973C50A';
const prefix = provider => 'SELECT Id, CAST(metadata.identity AS GUID) AS Identity FROM ' + provider +
  " WITH VIRTUAL MAPPING '" + mapping + "' WHERE ";
for (const provider of ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']) {
  test('UUID CAST equality sends an exact mapped filter for ' + provider, () => {
    const query = compile(prefix(provider) + "CAST(metadata.identity AS GUID) = '" + identity + "' ORDER BY Id LIMIT 10");
    assert.equal(query.path, 'data/query-cql/projection/mixed');
    assert.equal(query.body.virtualMappingId, mapping);
    assert.deepEqual(query.body.filters, [{ metadataPath: ['identity'], scalar: 'Guid', operator: 'Equal', value: identity }]);
    assert.equal(query.body.columns[1].valueType, 'Guid');
  });
  test('UUID typed inequality retains selected global ordering for ' + provider, () => {
    const query = compile(prefix(provider) + "metadata.identity AS GUID <> '" + identity + "' ORDER BY Identity DESC, Id LIMIT 2 OFFSET 1");
    assert.deepEqual(query.body.filters, [{ metadataPath: ['identity'], scalar: 'Guid', operator: 'NotEqual', value: identity }]);
    assert.deepEqual(query.body.selectedOrder, [{ alias: 'Identity', descending: true }, { alias: 'Id', descending: false }]);
    assert.equal(query.body.skip, 1);
    assert.equal(query.body.take, 2);
  });
}
test('mapped UUID predicates compose with grouped distinct input', () => {
  const query = compile('SELECT CAST(metadata.region AS STRING) AS Region, COUNT(DISTINCT CAST(metadata.identity AS GUID)) AS UniqueIds ' +
    "FROM MongoDBOASIS WITH VIRTUAL MAPPING '" + mapping + "' WHERE CAST(metadata.identity AS GUID) = '" + identity +
    "' GROUP BY Region ORDER BY UniqueIds DESC LIMIT 2");
  assert.equal(query.path, 'data/query-cql/projection/mixed');
  assert.equal(query.body.resultOperation, 'Group');
  assert.equal(query.body.filters[0].scalar, 'Guid');
});
test('malformed UUID is refused before dispatch', () =>
  assert.throws(() => compile(prefix('MongoDBOASIS') + "CAST(metadata.identity AS GUID) = 'not-a-uuid'"), /quoted GUID/));
test('mapped UUID relational comparisons remain refused', () =>
  assert.throws(() => compile(prefix('MongoDBOASIS') + "CAST(metadata.identity AS GUID) > '" + identity + "'"), /Ordered comparisons require/));
test('mapped UUID IN remains refused until the native membership contract exists', () =>
  assert.throws(() => compile(prefix('MongoDBOASIS') + "CAST(metadata.identity AS GUID) IN ('" + identity + "')"), /supported typed metadata/));
test('LENGTH cannot coerce UUID to text', () =>
  assert.throws(() => compile(prefix('MongoDBOASIS') + "LENGTH(CAST(metadata.identity AS GUID)) = 36"), /LENGTH requires a string/));
