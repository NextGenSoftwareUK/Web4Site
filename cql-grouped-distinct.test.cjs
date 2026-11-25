const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./cql-text.js');

for (const provider of ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']) {
  test('grouped distinct keeps separate native count intent for ' + provider, () => {
    const result = compile('SELECT Version, COUNT(Description) AS Present, COUNT(DISTINCT Description) AS UniqueValues ' +
      'FROM ' + provider + ' GROUP BY Version HAVING UniqueValues >= 2 ORDER BY UniqueValues DESC LIMIT 3');
    assert.equal(result.path, 'data/query-cql/grouped');
    assert.deepEqual(result.body.columns, [
      { alias: 'Version', keyAlias: 'Version' },
      { alias: 'Present', operation: 'LongCount', selection: { field: 'Description' } },
      { alias: 'UniqueValues', operation: 'LongCount', selection: { field: 'Description' }, distinct: true }
    ]);
    assert.deepEqual(result.body.resultFilters, [{ alias: 'UniqueValues', operator: 'GreaterThanOrEqual', value: '2' }]);
    assert.deepEqual(result.body.resultOrder, [{ alias: 'UniqueValues', descending: true }]);
    assert.equal(result.body.resultTake, 3);
    assert.equal(Object.hasOwn(result.body, 'take'), false);
  });

  test('grouped distinct keeps the saved mapping and complete mixed reduction for ' + provider, () => {
    const mapping = '764b78ae-df26-4637-9bbd-1d0530954fea';
    const result = compile('SELECT CAST(metadata.region AS STRING) AS Region, ' +
      'COUNT(DISTINCT CAST(metadata.customer AS STRING)) AS Customers FROM ' + provider +
      " WITH VIRTUAL MAPPING '" + mapping + "' WHERE metadata.tier = 'gold' " +
      'GROUP BY Region HAVING Customers > 1 ORDER BY Customers DESC LIMIT 4 OFFSET 1');
    assert.equal(result.path, 'data/query-cql/projection/mixed');
    assert.equal(result.body.virtualMappingId, mapping);
    assert.equal(result.body.resultOperation, 'Group');
    assert.equal(result.body.take, 1);
    assert.equal(result.body.grouping.resultTake, 4);
    assert.equal(result.body.grouping.resultSkip, 1);
    assert.equal(result.body.grouping.columns[1].distinct, true);
    assert.deepEqual(result.body.grouping.columns[1].selection,
      { metadataPath: ['customer'], valueType: 'String', nullable: true });
    assert.deepEqual(result.body.columns.map(column => column.field ?? column.metadataPath[0]), ['Id', 'region', 'customer']);
  });
}

test('grouped distinct resolves HAVING and ORDER BY expressions independently of ordinary counts', () => {
  const result = compile('SELECT Version, COUNT(Description) AS Present, COUNT(DISTINCT Description) AS UniqueValues ' +
    'FROM MongoDBOASIS GROUP BY Version HAVING COUNT(DISTINCT Description) > 1 AND COUNT(Description) > 2 ' +
    'ORDER BY COUNT(DISTINCT Description) DESC, COUNT(Description) ASC');
  assert.deepEqual(result.body.resultFilters.map(filter => filter.alias), ['UniqueValues', 'Present']);
  assert.deepEqual(result.body.resultOrder, [
    { alias: 'UniqueValues', descending: true }, { alias: 'Present', descending: false }
  ]);
});

test('grouped distinct cannot borrow a selected ordinary count expression', () => {
  assert.throws(() => compile('SELECT Version, COUNT(Description) AS Present FROM MongoDBOASIS ' +
    'GROUP BY Version HAVING COUNT(DISTINCT Description) > 1'), /HAVING must name/);
  assert.throws(() => compile('SELECT Version, COUNT(DISTINCT Description) AS UniqueValues FROM MongoDBOASIS ' +
    'GROUP BY Version ORDER BY COUNT(Description)'), /Order grouped results/);
});

test('grouped distinct retains exact direct primitive metadata domains', () => {
  for (const [sqlType, type] of [['STRING','String'],['BOOLEAN','Boolean'],['INT32','Int32'],
    ['INT64','Int64'],['SINGLE','Single'],['DOUBLE','Double']]) {
    const result = compile('SELECT Version, COUNT(DISTINCT CAST(metadata.value AS ' + sqlType +
      ')) AS UniqueValues FROM Neo4jOASIS GROUP BY Version');
    assert.deepEqual(result.body.columns[1],
      { operation: 'LongCount', selection: { metadataPath: ['value'], valueType: type, nullable: true },
        distinct: true, alias: 'UniqueValues' });
  }
});

test('grouped distinct refuses invalid row, computed and unproved normalization domains', () => {
  for (const expression of ['COUNT(DISTINCT *)', 'COUNT(DISTINCT 1)',
    'COUNT(DISTINCT LENGTH(Description))',
    'COUNT(DISTINCT CAST(metadata.value AS DATETIME))', 'COUNT(DISTINCT CAST(metadata.value AS DECIMAL))',
    'COUNT(DISTINCT CAST(metadata.value AS UINT64))', 'MIN(DISTINCT Version)']) {
    assert.throws(() => compile('SELECT Version, ' + expression +
      ' AS UniqueValues FROM Neo4jOASIS GROUP BY Version'), expression);
  }
});

test('grouped distinct HAVING preserves exact 64-bit thresholds', () => {
  const result = compile('SELECT Version, COUNT(DISTINCT Description) AS UniqueValues FROM MongoDBOASIS ' +
    'GROUP BY Version HAVING UniqueValues > 9007199254740993');
  assert.equal(result.body.resultFilters[0].value, '9007199254740993');
});

test('grouped counts are never nullable even when their selected input is nullable', () => {
  for (const distinct of ['', 'DISTINCT ']) {
    assert.throws(() => compile('SELECT Version, COUNT(' + distinct +
      'CAST(metadata.value AS STRING)) AS ValuesCount FROM MongoDBOASIS GROUP BY Version HAVING ValuesCount IS NULL'),
      /cannot be null/);
  }
});
