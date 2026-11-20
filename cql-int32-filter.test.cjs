const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./cql-text.js');
const mapping = '764b78ae-df26-4637-9bbd-1d0530954fea';
const prefix = provider => 'SELECT Id, CAST(metadata.stock AS INT32) AS Stock FROM ' + provider +
  " WITH VIRTUAL MAPPING '" + mapping + "' WHERE ";
for (const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']) {
  test('typed Int32 equality sends JSON numeric boundary for ' + provider, () => {
    const query = compile(prefix(provider) + 'CAST(metadata.stock AS INT32) = -2147483648 ORDER BY Id LIMIT 2');
    assert.equal(query.path, 'data/query-cql/projection/mixed');
    assert.equal(query.body.virtualMappingId, mapping);
    assert.deepEqual(query.body.filters, [{metadataPath:['stock'],scalar:'Int32',operator:'Equal',value:-2147483648}]);
    assert.equal(query.body.columns[1].valueType, 'Int32');
  });
  test('typed Int32 BETWEEN composes with global selected paging for ' + provider, () => {
    const query = compile(prefix(provider) + 'metadata.stock AS INT32 BETWEEN -1 AND 2147483647 ORDER BY Stock DESC, Id LIMIT 2 OFFSET 1');
    assert.deepEqual(query.body.filters, [
      {metadataPath:['stock'],scalar:'Int32',operator:'GreaterThanOrEqual',value:-1},
      {metadataPath:['stock'],scalar:'Int32',operator:'LessThanOrEqual',value:2147483647}
    ]);
    assert.deepEqual(query.body.selectedOrder, [{alias:'Stock',descending:true},{alias:'Id',descending:false}]);
    assert.equal(query.body.skip, 1);
  });
}
for (const value of ['-2147483649','2147483648']) {
  test('typed Int32 refuses overflowing literal ' + value, () =>
    assert.throws(() => compile(prefix('MongoDBOASIS') + 'CAST(metadata.stock AS INT32) = ' + value), /integer from -2147483648 to 2147483647/));
}
test('typed Int32 refuses quoted numbers', () =>
  assert.throws(() => compile(prefix('MongoDBOASIS') + "CAST(metadata.stock AS INT32) = '7'"), /integer from/));
test('typed Int32 refuses fractions', () =>
  assert.throws(() => compile(prefix('MongoDBOASIS') + 'CAST(metadata.stock AS INT32) = 1.25'), /integer from/));
test('typed Int32 mapped membership remains explicitly unsupported', () =>
  assert.throws(() => compile(prefix('MongoDBOASIS') + 'CAST(metadata.stock AS INT32) IN (1,2)'), /supported typed metadata/));
test('LENGTH cannot coerce Int32 metadata to text', () =>
  assert.throws(() => compile(prefix('MongoDBOASIS') + 'LENGTH(CAST(metadata.stock AS INT32)) = 1'), /LENGTH requires a string/));
test('existing INT64 filters retain exact quoted wire width', () => {
  const query = compile(prefix('MongoDBOASIS') + 'CAST(metadata.stock AS INT64) = 9223372036854775807 ORDER BY Id LIMIT 2');
  assert.equal(query.body.filters[0].scalar, 'Integer');
  assert.equal(query.body.filters[0].value, '9223372036854775807');
});
