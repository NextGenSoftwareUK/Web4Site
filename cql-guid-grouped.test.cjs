const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./cql-text.js');

for (const provider of ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']) {
  test('GUID grouped text retains canonical and metadata domains for ' + provider, () => {
    const query = compile('SELECT Name, COUNT(DISTINCT Id) AS UniqueIds, ' +
      'COUNT(DISTINCT Version) AS UniqueVersions, COUNT(DISTINCT CAST(metadata.identity AS GUID)) AS UniqueMetadata ' +
      'FROM ' + provider + ' GROUP BY Name HAVING COUNT(DISTINCT Id) > 1 ' +
      'ORDER BY UniqueMetadata DESC, UniqueVersions ASC LIMIT 3');
    assert.equal(query.path, 'data/query-cql/grouped');
    assert.deepEqual(query.body.columns.slice(1), [
      { operation: 'LongCount', selection: { field: 'Id' }, distinct: true, alias: 'UniqueIds' },
      { operation: 'LongCount', selection: { field: 'Version' }, distinct: true, alias: 'UniqueVersions' },
      { operation: 'LongCount', selection: { metadataPath: ['identity'], valueType: 'Guid', nullable: true },
        distinct: true, alias: 'UniqueMetadata' }
    ]);
    assert.deepEqual(query.body.resultFilters, [{ alias: 'UniqueIds', operator: 'GreaterThan', value: '1' }]);
    assert.deepEqual(query.body.resultOrder, [
      { alias: 'UniqueMetadata', descending: true }, { alias: 'UniqueVersions', descending: false }
    ]);
    assert.equal(query.body.resultTake, 3);
  });

  test('GUID grouped text preserves saved mapping and ordinary distinct separation for ' + provider, () => {
    const mapping = '764b78ae-df26-4637-9bbd-1d0530954fea';
    const query = compile('SELECT CAST(metadata.region AS STRING) AS Region, ' +
      'COUNT(CAST(metadata.identity AS GUID)) AS Present, ' +
      'COUNT(DISTINCT CAST(metadata.identity AS GUID)) AS UniqueValues FROM ' + provider +
      " WITH VIRTUAL MAPPING '" + mapping + "' WHERE metadata.tier = 'gold' " +
      'GROUP BY Region HAVING COUNT(DISTINCT CAST(metadata.identity AS GUID)) > 1 ' +
      'ORDER BY UniqueValues DESC LIMIT 2 OFFSET 1');
    assert.equal(query.path, 'data/query-cql/projection/mixed');
    assert.equal(query.body.virtualMappingId, mapping);
    assert.equal(query.body.resultOperation, 'Group');
    assert.deepEqual(query.body.columns.map(column => column.field ?? column.metadataPath[0]),
      ['Id', 'region', 'identity']);
    assert.deepEqual(query.body.grouping.columns.slice(1), [
      { operation: 'LongCount', selection: { metadataPath: ['identity'], valueType: 'Guid', nullable: true },
        alias: 'Present' },
      { operation: 'LongCount', selection: { metadataPath: ['identity'], valueType: 'Guid', nullable: true },
        distinct: true, alias: 'UniqueValues' }
    ]);
    assert.deepEqual(query.body.grouping.resultFilters,
      [{ alias: 'UniqueValues', operator: 'GreaterThan', value: '1' }]);
    assert.equal(query.body.grouping.resultTake, 2);
    assert.equal(query.body.grouping.resultSkip, 1);
  });
}
