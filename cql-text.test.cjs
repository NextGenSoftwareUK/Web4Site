const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile, discoverKeyProfiles } = require('./cql-text.js');

test('COUNT of a column retains duplicate values and stays distinct from COUNT(*)', () => {
  const compiled = compile('SELECT COUNT(Description) AS VisibleDescriptions FROM Neo4jOASIS WHERE Version = 1');
  assert.equal(compiled.scalarAlias, 'VisibleDescriptions');
  assert.equal(compiled.body.operation, 'CountValues');
  assert.deepEqual(compiled.body.selection, { field: 'Description' });
  assert.equal(Object.hasOwn(compiled.body, 'take'), false);
  const metadata = compile('SELECT COUNT(CAST(metadata.rank AS SINGLE)) FROM MongoDBOASIS');
  assert.equal(metadata.body.operation, 'CountValues');
  assert.deepEqual(metadata.body.selection, { metadataPath: ['rank'], valueType: 'Single', nullable: true });
  for (const text of ['COUNT(*)', 'COUNT(1)']) {
    const count = compile('SELECT ' + text + ' FROM Neo4jOASIS');
    assert.equal(count.body.operation, 'LongCount');
    assert.equal(count.body.selection, undefined);
  }
});

test('grouped COUNT sends separate row, column and typed metadata count bindings', () => {
  const sql = 'SELECT Version, COUNT(*) AS Rows, COUNT(Description) AS Details, ' +
    'COUNT(CAST(metadata.category AS STRING)) AS Categories FROM Neo4jOASIS GROUP BY Version ' +
    'HAVING Details > 1 ORDER BY Categories DESC';
  const { path, body } = compile(sql);
  assert.equal(path, 'data/query-cql/grouped');
  assert.deepEqual(body.columns, [
    { alias: 'Version', keyAlias: 'Version' },
    { alias: 'Rows', operation: 'LongCount' },
    { alias: 'Details', operation: 'LongCount', selection: { field: 'Description' } },
    { alias: 'Categories', operation: 'LongCount',
      selection: { metadataPath: ['category'], valueType: 'String', nullable: true } }
  ]);
  assert.deepEqual(body.resultFilters, [{ alias: 'Details', operator: 'GreaterThan', value: '1' }]);
  assert.deepEqual(body.resultOrder, [{ alias: 'Categories', descending: true }]);
});

test('COUNT DISTINCT carries the exact selection and complete source filters', () => {
  const selected = compile('SELECT COUNT(DISTINCT CAST(metadata.category AS STRING)) AS UniqueCategories ' +
    "FROM MongoDBOASIS WHERE IsActive = TRUE AND Name LIKE 'Coffee%'");
  assert.equal(selected.path, 'data/query-cql/scalar');
  assert.equal(selected.scalarAlias, 'UniqueCategories');
  assert.equal(selected.body.operation, 'CountDistinct');
  assert.equal(Object.hasOwn(selected.body, 'take'), false);
  assert.deepEqual(selected.body.selection, { metadataPath: ['category'], valueType: 'String', nullable: true });
  assert.deepEqual(selected.body.filters.map(filter => filter.operator), ['Equal', 'StartsWith']);
  assert.deepEqual(compile('SELECT COUNT(DISTINCT Description) FROM Neo4jOASIS').body.selection, { field: 'Description' });
  assert.throws(() => compile('SELECT COUNT(DISTINCT *) FROM MongoDBOASIS'), /selected field/);
});

test('double-quoted metadata segments carry literal names to native projections and predicates', () => {
  const query = compile(`SELECT CAST(metadata."labels.v1"."Espresso ""Special""" AS STRING) AS Label
    FROM MongoDBOASIS WHERE metadata."labels.v1"."Espresso ""Special""" = 'yes'`);
  assert.deepEqual(query.body.columns[0].metadataPath, ['labels.v1', 'Espresso "Special"']);
  assert.deepEqual(query.body.filters[0].metadataPath, ['labels.v1', 'Espresso "Special"']);
  assert.deepEqual(compile('SELECT DISTINCT CAST(metadata."café price" AS DECIMAL) AS Price FROM Neo4jOASIS').body.keys[0].metadataPath, ['café price']);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS WHERE metadata."" = \'x\''), /metadata path segment/);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS WHERE metadata."bad\nkey" = \'x\''), /metadata path segment/);
});

test('distinguishes literal dots from nested metadata in compound selections', () => {
  const literal = 'CAST(metadata."catalog.v1" AS STRING)';
  const nested = 'CAST(metadata.catalog.v1 AS STRING)';
  const selected = literal + ' AS Literal, ' + nested + ' AS Nested';
  const paths = [['catalog.v1'], ['catalog', 'v1']];
  const distinct = compile('SELECT DISTINCT ' + selected + ' FROM Neo4jOASIS');
  assert.deepEqual(distinct.body.keys.map(key => key.metadataPath), paths);
  const grouped = compile('SELECT ' + selected + ', COUNT(*) AS Total FROM MongoDBOASIS GROUP BY ' + literal + ', ' + nested);
  assert.deepEqual(grouped.body.keys.map(key => key.metadataPath), paths);
  assert.throws(() => compile('SELECT DISTINCT ' + literal + ' AS One, ' + literal + ' AS Two FROM Neo4jOASIS'));
  assert.throws(() => compile('SELECT ' + literal + ' AS Literal, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY ' + nested));
});

test('projects and groups the additional canonical WEB4 columns without expanding WHERE filters', () => {
  const columns = compile('SELECT IsPublic, HolonType, VersionId, PreviousVersionId, ' +
    'CreatedByAvatarId, ModifiedByAvatarId FROM MongoDBOASIS').body.columns;
  assert.deepEqual(columns.map(column => column.field),
    ['IsPublic', 'HolonType', 'VersionId', 'PreviousVersionId', 'CreatedByAvatarId', 'ModifiedByAvatarId']);
  const query = compile("SELECT IsPublic, HolonType AS Kind, COUNT(*) AS Total FROM Neo4jOASIS " +
    "GROUP BY IsPublic, HolonType HAVING IsPublic = TRUE AND Kind = 'Avatar'");
  assert.equal(query.path, 'data/query-cql/grouped');
  assert.deepEqual(query.body.resultFilters, [
    { alias: 'IsPublic', operator: 'Equal', value: true },
    { alias: 'Kind', operator: 'Equal', value: 'Avatar' }
  ]);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS WHERE IsPublic = TRUE'), /Unknown filter field/);
});

test('floating aggregate SQL retains the exact selection and HAVING wire types', () => {
  for (const type of ['SINGLE', 'DOUBLE']) {
    const valueType = type === 'SINGLE' ? 'Single' : 'Double';
    const selector = `CAST(metadata.measure AS ${type})`;
    const aggregate = compile(`SELECT AVG(${selector}) FROM MongoDBOASIS`);
    assert.equal(aggregate.path, 'data/query-cql/scalar');
    assert.deepEqual(aggregate.body.selection, { metadataPath: ['measure'], valueType, nullable: true });
    const groups = compile(`SELECT Version, SUM(${selector}) AS Total, AVG(${selector}) AS Mean FROM Neo4jOASIS ` +
      'GROUP BY Version HAVING Total >= 1e-5 AND Mean < 2E-05');
    assert.equal(groups.path, 'data/query-cql/grouped');
    assert.deepEqual(groups.body.columns.slice(1).map(column => column.selection), [aggregate.body.selection, aggregate.body.selection]);
    assert.deepEqual(groups.body.resultFilters.map(({ value }) => value), ['1E-05', '2E-05']);
  }
});

test('scalar aggregate aliases stay in the editor and do not change the native request', () => {
  const count = compile('SELECT COUNT(*) AS Total FROM MongoDBOASIS');
  const average = compile('SELECT AVG(CAST(metadata.rank AS SINGLE)) AS Mean FROM Neo4jOASIS');
  assert.equal(count.scalarAlias, 'Total');
  assert.equal(average.scalarAlias, 'Mean');
  assert.deepEqual(count.body, compile('SELECT COUNT(*) FROM MongoDBOASIS').body);
  assert.deepEqual(average.body, compile('SELECT AVG(CAST(metadata.rank AS SINGLE)) FROM Neo4jOASIS').body);
  assert.throws(() => compile('SELECT COUNT(*) AS 7 FROM MongoDBOASIS'), /scalar result alias/);
});

test('scalar SUM and AVG preserve the exact floating metadata type', () => {
  for (const provider of ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']) {
    for (const [name, type, operation] of [['SUM', 'Single', 'Sum'], ['AVG', 'Double', 'Average']]) {
      const { path, body } = compile(`SELECT ${name}(CAST(metadata.reading AS ${type.toUpperCase()})) FROM ${provider}`);
      assert.equal(path, 'data/query-cql/scalar');
      assert.equal(body.operation, operation);
      assert.deepEqual(body.selection, { metadataPath: ['reading'], valueType: type, nullable: true });
    }
  }
});

test('SQL FETCH and OFFSET ROWS preserve the existing native row and selected windows', () => {
  const cases = [
    ['SELECT * FROM MongoDBOASIS ORDER BY Name', 'LIMIT 3 OFFSET 2', 'OFFSET 2 ROWS FETCH NEXT 3 ROWS ONLY'],
    ['SELECT Id, Description AS Detail FROM SQLLiteDBOASIS ORDER BY Detail', 'LIMIT 3 OFFSET 2', 'OFFSET 2 ROWS FETCH NEXT 3 ROWS ONLY'],
    ['SELECT DISTINCT Version FROM Neo4jOASIS ORDER BY Version', 'LIMIT 3 OFFSET 2', 'OFFSET 2 ROWS FETCH NEXT 3 ROWS ONLY'],
    ['SELECT Version, COUNT(*) AS Total FROM Neo4jOASIS GROUP BY Version ORDER BY Total', 'LIMIT 3 OFFSET 2', 'OFFSET 2 ROWS FETCH NEXT 3 ROWS ONLY'],
    ['SELECT * FROM MongoDBOASIS', 'LIMIT 1', 'FETCH FIRST ROW ONLY'],
    ['SELECT * FROM MongoDBOASIS', 'OFFSET 2', 'OFFSET 2 ROWS']
  ];
  for (const [query, existing, standard] of cases)
    assert.deepEqual(compile(query + ' ' + standard), compile(query + ' ' + existing));
});

test('SQL FETCH retains join input pagination and rejects invalid or excessive windows', () => {
  const query = 'SELECT l.Id AS LeftId, r.Id AS RightId FROM (SELECT * FROM MongoDBOASIS ORDER BY Id LIMIT 3 OFFSET 1) l ' +
    'INNER JOIN (SELECT * FROM MongoDBOASIS ORDER BY Id LIMIT 2) r ON l.Id = r.Id';
  assert.deepEqual(compile(query.replace('LIMIT 3 OFFSET 1', 'OFFSET 1 ROW FETCH NEXT 3 ROWS ONLY')
    .replace('LIMIT 2', 'FETCH FIRST 2 ROWS ONLY')), compile(query));
  assert.throws(() => compile(query.replace('LIMIT 2', 'FETCH FIRST 11 ROWS ONLY')), /integer from 1 to 10/);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS FETCH FIRST 3 ROWS WITH TIES'), /Expected ONLY/);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS OFFSET 2 FETCH NEXT 3 ROWS ONLY'), /OFFSET n ROWS/);
  assert.throws(() => compile('SELECT COUNT(*) FROM MongoDBOASIS FETCH FIRST 3 ROWS ONLY'), /Unexpected clause/);
});

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

test('compiles a plain OR list as the same typed request as a parenthesized OR group', () => {
  const prefix = "SELECT Name FROM MongoDBOASIS WHERE ";
  const alternatives = "Name = 'Coffee' OR Name = 'Tea' OR IsActive = TRUE";
  const suffix = " ORDER BY Name LIMIT 5";
  const unwrapped = compile(prefix + alternatives + suffix);
  assert.deepEqual(unwrapped, compile(prefix + '(' + alternatives + ')' + suffix));
  assert.deepEqual(unwrapped.body.anyOf.map(filter => filter.value), ['Coffee', 'Tea', true]);
  assert.throws(() => compile(prefix + alternatives + " AND Version = 2"), /Parenthesize the OR group/);
  assert.throws(() => compile(prefix + "EXISTS CHILD (Version = 2) AND " + alternatives));
  assert.throws(() => compile(prefix + "Version BETWEEN 1 AND 5 OR IsActive = TRUE"), /outside OR/);
});

test('preserves the difference between missing and non-null metadata', () => {
  const prefix = "SELECT Id FROM MongoDBOASIS WHERE ";
  const { body } = compile(prefix + "(metadata.profile.nickname IS MISSING OR metadata.profile.since IS NOT NULL)");
  assert.deepEqual(body.anyOf, [
    { metadataPath: ['profile', 'nickname'], operator: 'IsMissing' },
    { metadataPath: ['profile', 'since'], operator: 'IsNotNull' }
  ]);
  assert.deepEqual(compile(prefix + "Name IS NOT NULL").body.filters, [{ field: "Name", operator: "IsNotNull" }]);
  assert.throws(() => compile(prefix + "metadata.profile.nickname IS NOT PRESENT"));
});

test('queries the enrolled Axelar block-height catalogue without numeric rounding', () => {
  const prefix = "SELECT * FROM AxelarOASIS WHERE ";
  const request = compile(prefix + "metadata.AxelarBlockHeight IN ('37269326', '9007199254740993') LIMIT 2");
  assert.equal(request.body.provider, 'AxelarOASIS');
  assert.equal(request.body.orderBy, 'None');
  assert.deepEqual(request.body.filters[0].value, ['37269326', '9007199254740993']);
  assert.throws(() => compile(prefix + "metadata.TronBlockHeight = '37269326'"), /AxelarBlockHeight/);
  assert.throws(() => compile(prefix + "metadata.AxelarBlockHeight = '9223372036854775808'"), /AxelarBlockHeight/);
  assert.throws(() => compile(prefix + "metadata.AxelarBlockHeight = '0'"), /AxelarBlockHeight/);
  assert.throws(() => compile(prefix + "metadata.AxelarBlockHeight = '37269326' ORDER BY Id"));
  assert.throws(() => compile("SELECT * FROM AxelarOASIS"), /requires one AxelarBlockHeight/);
  assert.throws(() => compile(prefix + "metadata.AxelarBlockHeight IN ('37269326', '37269326')"), /AxelarBlockHeight/);
  assert.throws(() => compile(prefix + "metadata.AxelarBlockHeight = '37269326' OR metadata.AxelarBlockHeight = '37269327'"), /requires one AxelarBlockHeight/);
});

test('compiles DISTINCT into native key-only grouping before ordering and paging', () => {
  const { path, body } = compile("SELECT DISTINCT Version AS Revision, IsActive FROM SQLLiteDBOASIS " +
    "WHERE Version >= 1 ORDER BY Revision DESC, IsActive LIMIT 5 OFFSET 2");
  assert.equal(path, 'data/query-cql/grouped');
  assert.deepEqual(body.keys, [{ field: 'Version', alias: 'Revision' }, { field: 'IsActive', alias: 'IsActive' }]);
  assert.deepEqual(body.columns, [{ alias: 'Revision', keyAlias: 'Revision' }, { alias: 'IsActive', keyAlias: 'IsActive' }]);
  assert.deepEqual(body.resultOrder, [{ alias: 'Revision', descending: true }, { alias: 'IsActive', descending: false }]);
  assert.equal(body.maximumGroups, 100);
  assert.equal(body.resultTake, 5);
  assert.equal(body.resultSkip, 2);
  assert.equal(body.take, undefined);
  assert.throws(() => compile("SELECT DISTINCT * FROM MongoDBOASIS"), /different selected fields/);
  assert.throws(() => compile("SELECT DISTINCT COUNT(*) FROM MongoDBOASIS"), /without aggregates/);
  assert.throws(() => compile("SELECT DISTINCT Version, Version AS Again FROM MongoDBOASIS"), /different selected fields/);
  assert.throws(() => compile("SELECT DISTINCT Version FROM Neo4jOASIS HAVING Version > 1"), /HAVING/);
  assert.throws(() => compile("SELECT DISTINCT Version FROM Neo4jOASIS LIMIT 5 OFFSET 2"), /ORDER BY/);
});

test('compiles exact public block or ledger queries on Bitcoin, XRP, Stellar and Cardano', () => {
  for (const [provider, field, valid, invalid] of [
    ['BitcoinOASIS', 'BitcoinBlockHash', 'a'.repeat(64), 'A'.repeat(64)],
    ['XRPLOASIS', 'XRPLLedgerHash', 'A'.repeat(64), 'a'.repeat(64)],
    ['StellarOASIS', 'StellarLedgerSequence', '4294967295', '4294967296'],
    ['CardanoOASIS', 'CardanoBlockHash', 'c'.repeat(64), 'c'.repeat(63)]
  ]) {
    const prefix = "SELECT * FROM " + provider + " WHERE metadata." + field;
    const { path, body } = compile(prefix + " = '" + valid + "' LIMIT 1");
    assert.equal(path, 'data/query-cql');
    assert.equal(body.orderBy, 'None');
    assert.deepEqual(body.filters, [{ metadataPath: [field], scalar: 'String', operator: 'Equal', value: valid }]);
    assert.throws(() => compile(prefix + " = '" + invalid + "'"), new RegExp(field));
    assert.throws(() => compile("SELECT * FROM " + provider), /requires one/);
    assert.throws(() => compile(prefix + " IN ('" + valid + "','" + valid + "')"), new RegExp(field));
  }
});

test('binds BNB Chain, Avalanche, Base and Optimism to independent public account keys', () => {
  const address = '0x' + 'aB'.repeat(20);
  for (const [provider, key] of [
    ['BNBChainOASIS', 'BNBChainAccountAddress'], ['AvalancheOASIS', 'AvalancheAccountAddress'],
    ['BaseOASIS', 'BaseAccountAddress'], ['OptimismOASIS', 'OptimismAccountAddress']
  ]) {
    const prefix = "SELECT * FROM " + provider;
    const query = prefix + " WHERE metadata." + key + " = '" + address + "'";
    assert.deepEqual(compile(query).body.filters, [
      { metadataPath: [key], scalar: 'String', operator: 'Equal', value: address }
    ]);
    assert.throws(() => compile(prefix), /requires one/);
    assert.throws(() => compile(query.replace(key, 'EthereumAccountAddress')), new RegExp(key));
    assert.throws(() => compile(query.replace(address, address.slice(1))), new RegExp(key));
  }
  assert.throws(() => compile("SELECT * FROM BaseOASIS, OptimismOASIS"), /different key fields/);
});

test('preserves native key domains for Sui, Aptos, Starknet and Fantom', () => {
  const prime = (1n << 251n) + 17n * (1n << 192n) + 1n;
  const maxFelt = '0x' + (prime - 1n).toString(16);
  for (const [provider, key, value, invalid] of [
    ['SuiOASIS', 'SuiObjectId', '0x' + 'a'.repeat(64), '0x' + 'A'.repeat(64)],
    ['AptosOASIS', 'AptosAccountAddress', '0x' + 'b'.repeat(64), '0x1'],
    ['StarknetOASIS', 'StarknetBlockHash', maxFelt, '0x' + prime.toString(16)],
    ['FantomOASIS', 'FantomAccountAddress', '0x' + 'aB'.repeat(20), '0x' + 'a'.repeat(41)]
  ]) {
    const prefix = "SELECT * FROM " + provider + " WHERE metadata." + key;
    assert.deepEqual(compile(prefix + " = '" + value + "'").body.filters, [
      { metadataPath: [key], scalar: 'String', operator: 'Equal', value }
    ]);
    assert.throws(() => compile(prefix + " = '" + invalid + "'"), new RegExp(key));
    assert.throws(() => compile("SELECT * FROM " + provider), /requires one/);
  }
  assert.throws(() => compile("SELECT * FROM StarknetOASIS WHERE metadata.StarknetBlockHash = '0x01'"), /StarknetBlockHash/);
});

test('binds Algorand, Filecoin, Zcash and Radix to their enrolled key shapes', () => {
  for (const [provider, key, valid, invalid] of [
    ['AlgorandOASIS', 'AlgorandAddress', 'A'.repeat(58), 'a'.repeat(58)],
    ['FilecoinOASIS', 'FilecoinAccountAddress', '0x' + 'a'.repeat(40), 'f1' + 'a'.repeat(40)],
    ['ZcashOASIS', 'ZcashBlockHash', 'b'.repeat(64), 'B'.repeat(64)],
    ['RadixOASIS', 'RadixResourceAddress', 'resource_rdx1' + 'q'.repeat(54), 'resource_tdx1' + 'q'.repeat(54)]
  ]) {
    const prefix = "SELECT * FROM " + provider + " WHERE metadata." + key;
    assert.deepEqual(compile(prefix + " = '" + valid + "'").body.filters, [
      { metadataPath: [key], scalar: 'String', operator: 'Equal', value: valid }
    ]);
    assert.throws(() => compile(prefix + " = '" + invalid + "'"), new RegExp(key));
    assert.throws(() => compile("SELECT * FROM " + provider), /requires one/);
  }
});

test('enables only ready enrolled native key profiles without weakening built-in validation', () => {
  const keyProfile = { metadataKey: 'DemoKey', maximumKeyCharacters: 4, maximumSetKeys: 0 };
  const sources = [
    { provider: 'NewOASIS', queryOnly: true, available: true, textKeyProfile: keyProfile },
    { provider: 'OfflineOASIS', queryOnly: true, available: false, textKeyProfile: keyProfile },
    { provider: 'OrdinaryOASIS', queryOnly: false, available: true, textKeyProfile: keyProfile },
    { provider: 'BitcoinOASIS', queryOnly: true, available: true, textKeyProfile: keyProfile },
    { provider: 'BadOASIS', queryOnly: true, available: true, textKeyProfile: { ...keyProfile, maximumSetKeys: 41 } }
  ];
  const profiles = discoverKeyProfiles(sources);
  assert.deepEqual(Object.keys(profiles), ['NewOASIS']);
  const prefix = "SELECT * FROM NewOASIS WHERE metadata.DemoKey ";
  assert.equal(compile(prefix + "= 'abcd'", profiles).body.provider, 'NewOASIS');
  assert.throws(() => compile(prefix + "= 'abcde'", profiles), /DemoKey/);
  assert.throws(() => compile(prefix + "IN ('abcd')", profiles), /DemoKey/);
  assert.throws(() => compile(prefix + "= 'abcd'"));
  assert.throws(() => compile("SELECT * FROM BitcoinOASIS WHERE metadata.DemoKey = 'abcd'", profiles), /BitcoinBlockHash/);
});

test('compiles key-only GROUP BY to the same native request as DISTINCT', () => {
  const distinct = 'SELECT DISTINCT Version AS Revision, IsActive FROM MongoDBOASIS';
  const grouped = 'SELECT Version AS Revision, IsActive FROM MongoDBOASIS GROUP BY Version, IsActive';
  const page = ' ORDER BY Revision DESC, IsActive LIMIT 5 OFFSET 2';
  assert.deepEqual(compile(grouped + page), compile(distinct + page));
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS GROUP BY Version'), /match GROUP BY/);

});

test('compiles inclusive ranges without rounding typed bounds', () => {
  const { body } = compile("SELECT * FROM MongoDBOASIS WHERE Version BETWEEN 2 AND 5 " +
    "AND metadata.sequence AS UINT64 BETWEEN 9007199254740993 AND 18446744073709551615 " +
    "AND IsActive = TRUE");
  assert.deepEqual(body.filters.map(({ operator, value }) => [operator, value]), [
    ['GreaterThanOrEqual', 2], ['LessThanOrEqual', 5],
    ['GreaterThanOrEqual', '9007199254740993'], ['LessThanOrEqual', '18446744073709551615'],
    ['Equal', true]
  ]);
  const date = compile("SELECT * FROM Neo4jOASIS WHERE metadata.observedAt AS DATETIME " +
    "BETWEEN '2026-11-13T12:00:00.0000001Z' AND '2026-11-13T12:00:00.0000002Z'");
  assert.equal(date.body.filters[0].value, '2026-11-13T12:00:00.0000001Z');
  assert.equal(date.body.filters[1].value, '2026-11-13T12:00:00.0000002Z');
  assert.throws(() => compile("SELECT * FROM MongoDBOASIS WHERE (Version BETWEEN 2 AND 5 OR IsActive = TRUE)"), /outside OR/);
  assert.throws(() => compile("SELECT * FROM MongoDBOASIS WHERE Name BETWEEN 'a' AND 'b'"), /numeric or UTC timestamp/);
});

test('keeps signed Int64 comparison and range bounds exact', () => {
  const { body } = compile('SELECT * FROM Neo4jOASIS WHERE metadata.sequence AS INT64 ' +
    'BETWEEN -9223372036854775808 AND 9223372036854775807 AND Version >= 1');
  assert.deepEqual(body.filters.map(({ scalar, value }) => [scalar, value]), [
    ['Integer', '-9223372036854775808'], ['Integer', '9223372036854775807'], ['Integer', 1]
  ]);
  for (const invalid of ['9223372036854775808', '-9223372036854775809', '1.0', '-0', '01']) {
    assert.throws(() => compile('SELECT * FROM MongoDBOASIS WHERE metadata.sequence AS INT64 = ' +
      invalid), /signed 64-bit/);
  }
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

test('compiles bounded nested metadata presence and null predicates without a value', () => {
  const { body } = compile("SELECT * FROM MongoDBOASIS WHERE metadata.location.city IS PRESENT AND metadata.location.zip IS NULL");
  assert.deepEqual(body.filters, [
    { metadataPath: ['location', 'city'], operator: 'Exists' },
    { metadataPath: ['location', 'zip'], operator: 'IsNull' }
  ]);
  assert.throws(() => compile("SELECT * FROM MongoDBOASIS WHERE metadata.a.b.c.d.e = 'x'"), /four metadata/);
  const nullable = compile('SELECT * FROM MongoDBOASIS WHERE Description IS NULL AND Name IS NOT NULL');
  assert.deepEqual(nullable.body.filters, [
    { field: 'Description', operator: 'IsNull' },
    { field: 'Name', operator: 'IsNotNull' }
  ]);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS WHERE Version IS NULL'), /require a text field/);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS WHERE Name IS MISSING'));
});

test('compiles HoloOASIS text and federation as unordered bounded identity reads', () => {
  const id = 'b5d3f5a8-2539-4f94-9b12-aed841902ccb';
  const { body } = compile(`SELECT * FROM HoloOASIS WHERE Id IN ('${id}') LIMIT 2`);
  assert.equal(body.orderBy, 'None');
  assert.equal(body.take, 2);
  assert.deepEqual(body.filters, [{ field: 'Id', scalar: 'Guid', operator: 'In', value: [id] }]);
  assert.equal(compile('SELECT * FROM MongoDBOASIS, HoloOASIS LIMIT 2').body.source.orderBy, 'None');
  for (const text of ['SELECT COUNT(*) FROM HoloOASIS', 'SELECT * FROM HoloOASIS ORDER BY Id',
    "SELECT * FROM HoloOASIS WHERE Name = 'Example'"])
    assert.throws(() => compile(text), /HoloOASIS supports row queries/);
});

test('compiles Solana public account lookups as unordered native queries', () => {
  const address = '11111111111111111111111111111111';
  const query = compile(`SELECT * FROM SolanaOASIS WHERE metadata.SolanaAccountAddress IN ('${address}') LIMIT 2`);
  assert.equal(query.body.orderBy, 'None');
  assert.deepEqual(query.body.filters, [{ metadataPath: ['SolanaAccountAddress'], scalar: 'String', operator: 'In', value: [address] }]);
  assert.throws(() => compile("SELECT * FROM SolanaOASIS WHERE Name = 'Example'"), /SolanaOASIS supports/);
  assert.throws(() => compile("SELECT * FROM SolanaOASIS WHERE metadata.SolanaAccountAddress = 'bad'"), /SolanaOASIS supports/);
});

test('compiles Ethereum public account lookups without ordering', () => {
  const address = '0x' + 'a'.repeat(40);
  const query = compile(`SELECT * FROM EthereumOASIS WHERE metadata.EthereumAccountAddress = '${address}' LIMIT 2`);
  assert.equal(query.body.orderBy, 'None');
  assert.deepEqual(query.body.filters, [{ metadataPath: ['EthereumAccountAddress'], scalar: 'String', operator: 'Equal', value: address }]);
  assert.throws(() => compile("SELECT * FROM EthereumOASIS WHERE metadata.EthereumAccountAddress = 'bad'"), /EthereumOASIS supports/);
});

test('compiles each EVM account lookup with its own native metadata key', () => {
  const address = '0x' + 'a'.repeat(40);
  for (const network of ['Polygon', 'Arbitrum']) {
    const provider = network + 'OASIS';
    const key = network + 'AccountAddress';
    const { body } = compile(`SELECT * FROM MongoDBOASIS, ${provider} WHERE metadata.${key} IN ('${address}') LIMIT 2`);
    assert.equal(body.source.orderBy, 'None');
    assert.deepEqual(body.source.filters[0].metadataPath, [key]);
    assert.throws(() => compile(`SELECT * FROM ${provider} WHERE metadata.EthereumAccountAddress = '${address}'`), new RegExp(provider + ' supports'));
  }
});

test('compiles NEAR and EOS public lookups with their respective native account keys', () => {
  for (const [provider, key, value] of [
    ['NEAROASIS', 'NearAccountId', 'near.testnet'],
    ['EOSIOOASIS', 'EOSIOAccountName', 'eosio.token']
  ]) {
    const { body } = compile(`SELECT * FROM ${provider} WHERE metadata.${key} = '${value}' LIMIT 2`);
    assert.equal(body.orderBy, 'None');
    assert.deepEqual(body.filters, [{ metadataPath: [key], scalar: 'String', operator: 'Equal', value }]);
    assert.throws(() => compile(`SELECT * FROM ${provider} WHERE metadata.${key} = 'BAD'`), new RegExp(provider + ' supports'));
  }
});

test('compiles network record lookups with their native metadata keys', () => {
  for (const [provider, key, value] of [
    ['SOLIDOASIS', 'SolidRecordId', 'b5d3f5a8-2539-4f94-9b12-aed841902ccb'],
    ['IPFSOASIS', 'IPFSRecordCid', 'bafkreigh2akiscaildc'],
    ['ActivityPubOASIS', 'MastodonStatusId', '123456789']
  ]) {
    const { body } = compile(`SELECT * FROM ${provider} WHERE metadata.${key} = '${value}' LIMIT 2`);
    assert.equal(body.orderBy, 'None');
    assert.deepEqual(body.filters, [{ metadataPath: [key], scalar: 'String', operator: 'Equal', value }]);
    assert.throws(() => compile(`SELECT * FROM ${provider} WHERE Name = 'Example'`), new RegExp(provider + ' supports'));
  }
});

test('compiles Cosmos validators and Polkadot and TON block lookups', () => {
  for (const [provider, key, value] of [
    ['CosmosBlockChainOASIS', 'CosmosValidatorAddress', 'cosmosvaloper1' + 'a'.repeat(38)],
    ['PolkadotOASIS', 'PolkadotBlockHash', '0x' + 'a'.repeat(64)],
    ['TONOASIS', 'TonBlockRootHash', 'a'.repeat(43) + '=']
  ]) {
    const { body } = compile(`SELECT * FROM ${provider} WHERE metadata.${key} = '${value}' LIMIT 2`);
    assert.equal(body.orderBy, 'None');
    assert.deepEqual(body.filters, [{ metadataPath: [key], scalar: 'String', operator: 'Equal', value }]);
    assert.throws(() => compile(`SELECT * FROM ${provider} WHERE Name = 'Example'`), new RegExp(provider + ' supports'));
  }
});

test('renders a reviewed native public preset as editable SQL-like CQL', () => {
  const { publicExample } = require('./cql-text.js');
  const provider = 'SolanaOASIS';
  const filter = { metadataPath: ['SolanaAccountAddress'], scalar: 'String', operator: 'In',
    value: ['11111111111111111111111111111111'] };
  const request = { provider, orderBy: 'None', includeMetadata: true, take: 2, filters: [filter] };
  assert.deepEqual(compile(publicExample(provider, request)).body.filters, [filter]);
  assert.equal(publicExample(provider, { ...request, anyOf: [filter] }), null);
  assert.equal(publicExample(provider, { ...request, includeMetadata: false }), null);
  assert.equal(publicExample(provider, { ...request, descending: true }), null);
  assert.equal(publicExample(provider, { ...request, provider: 'MongoDBOASIS' }), null);
});

test('preserves a public example deadline and supports explicit bounded query timeouts', () => {
  const { publicExample } = require('./cql-text.js');
  const request = { provider: 'HoloOASIS', orderBy: 'None', includeMetadata: true, take: 3, maximumDurationMilliseconds: 30000,
    filters: [{ field: 'Id', scalar: 'Guid', operator: 'In', value: ['b5d3f5a8-2539-4f94-9b12-aed841902ccb'] }] };
  assert.equal(compile(publicExample(request.provider, request)).body.maximumDurationMilliseconds, 30000);
  const federation = compile('SELECT * FROM MongoDBOASIS, Neo4jOASIS LIMIT 2 TIMEOUT 12000').body;
  assert.equal(federation.maximumDurationMilliseconds, 12000);
  assert.equal(federation.source.maximumDurationMilliseconds, undefined);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS TIMEOUT 30001'));
});

test('rejects a timeout on the scalar COUNT route', () => {
  assert.throws(() => compile('SELECT COUNT(*) FROM MongoDBOASIS TIMEOUT 8000'), /Scalar queries use the server timeout/);
});

test('compiles native numeric aggregates over Version', () => {
  for (const [fn, operation] of [['MIN','Min'],['MAX','Max'],['SUM','Sum'],['AVG','Average']]) {
    const { path, body } = compile(`SELECT ${fn}(Version) FROM MongoDBOASIS WHERE IsActive = TRUE`);
    assert.equal(path, 'data/query-cql/scalar');
    assert.equal(body.operation, operation);
    assert.deepEqual(body.selection, { field: 'Version' });
    assert.equal(body.includeMetadata, undefined);
  }
  assert.throws(() => compile('SELECT SUM(Name) FROM MongoDBOASIS'));
  assert.throws(() => compile('SELECT AVG(Version) FROM MongoDBOASIS, Neo4jOASIS'));
});

test('round-trips reviewed Hedera presets and enforces canonical account IDs', () => {
  const { publicExample } = require('./cql-text.js');
  const provider = 'HashgraphOASIS';
  const filter = { metadataPath: ['HederaAccountId'], scalar: 'String', operator: 'In',
    value: ['0.0.2', '0.0.18446744073709551615'] };
  const request = { provider, filters: [filter], orderBy: 'None', includeMetadata: true, take: 2 };
  assert.deepEqual(compile(publicExample(provider, request)).body.filters, [filter]);
  for (const value of ['0.0.0', '0.00.2', '0.0.18446744073709551616']) {
    assert.throws(() => compile(`SELECT * FROM HashgraphOASIS WHERE metadata.HederaAccountId = '${value}'`),
      /HashgraphOASIS supports/);
  }
  assert.throws(() => compile('SELECT COUNT(*) FROM HashgraphOASIS'), /HashgraphOASIS supports/);
});

test('rejects federation with incompatible native key fields', () => {
  assert.throws(() => compile('SELECT * FROM HoloOASIS, HashgraphOASIS LIMIT 6'),
    /require different key fields/);
  const id = 'b5d3f5a8-2539-4f94-9b12-aed841902ccb';
  assert.equal(compile("SELECT * FROM MongoDBOASIS, HoloOASIS WHERE Id = '" + id + "'").path,
    'data/query-cql/federation');
  assert.equal(compile("SELECT * FROM MongoDBOASIS, HashgraphOASIS WHERE metadata.HederaAccountId = '0.0.2'").path,
    'data/query-cql/federation');
});

test('rejects malformed Id literals before a drafted query can be opened', () => {
  const id = 'B5D3F5A8-2539-4F94-9B12-AED841902CCB';
  assert.equal(compile("SELECT * FROM HoloOASIS WHERE Id = '" + id + "'").body.filters[0].value, id);
  assert.throws(() => compile("SELECT * FROM MongoDBOASIS WHERE Id IN ('" + id + "', 'customer-123')"),
    /Expected a quoted GUID/);
});

test('rejects filters WEB4 cannot compile before opening a draft', () => {
  assert.throws(() => compile("SELECT * FROM MongoDBOASIS WHERE Name > 'A'"), /Ordered comparisons/);
  assert.throws(() => compile("SELECT * FROM SQLLiteDBOASIS WHERE IsActive < TRUE"), /Ordered comparisons/);
  const prefix = "SELECT * FROM Neo4jOASIS WHERE Name = '";
  assert.equal(compile(prefix + 'a'.repeat(512) + "'").body.filters[0].value.length, 512);
  assert.throws(() => compile(prefix + 'a'.repeat(513) + "'"), /up to 512 characters/);
  assert.equal(compile('SELECT * FROM Neo4jOASIS WHERE Version >= 2').body.filters[0].operator, 'GreaterThanOrEqual');
});

test('keeps typed UInt64 metadata literals exact in WEB4 requests', () => {
  const { body } = compile('SELECT * FROM MongoDBOASIS WHERE metadata.Sequence AS UINT64 >= 9007199254740993 AND metadata.Sequence AS UINT64 IN (0, 18446744073709551615)');
  assert.deepEqual(body.filters.map(({ scalar, value }) => [scalar, value]),
    [['UInt64', '9007199254740993'], ['UInt64', ['0', '18446744073709551615']]]);
  assert.throws(() => compile('SELECT * FROM Neo4jOASIS WHERE metadata.Sequence AS UINT64 = 18446744073709551616'),
    /unsigned 64-bit/);
  assert.throws(() => compile('SELECT * FROM SQLLiteDBOASIS WHERE metadata.Sequence AS UINT64 = -1'),
    /unsigned 64-bit/);
});

test('compiles direct parent IDs as exact GUID membership', () => {
  const parent = 'fd184f58-4317-4e21-896b-2f908248e12c';
  const { body } = compile("SELECT * FROM MongoDBOASIS, SQLLiteDBOASIS, Neo4jOASIS WHERE ParentHolonId IN ('" + parent + "') LIMIT 5");
  assert.deepEqual(body.source.filters, [{ field: 'ParentHolonId', scalar: 'Guid', operator: 'In', value: [parent] }]);
  assert.throws(() => compile("SELECT * FROM MongoDBOASIS WHERE ParentHolonId = 'invalid'"), /quoted GUID/);
});

test('preserves TRON block heights and rejects noncanonical or overflowing keys', () => {
  const sql = "SELECT * FROM TRONOASIS WHERE metadata.TronBlockHeight IN ('9007199254740993', '9223372036854775807')";
  const { body } = compile(sql);
  assert.equal(body.provider, 'TRONOASIS');
  assert.equal(body.orderBy, 'None');
  assert.deepEqual(body.filters[0].value, ['9007199254740993', '9223372036854775807']);
  for (const height of ['0', '01', '9223372036854775808']) {
    assert.throws(() => compile("SELECT * FROM TRONOASIS WHERE metadata.TronBlockHeight = '" + height + "'"), /TronBlockHeight/);
  }
});

test('compiles selected columns into the native projection endpoint', () => {
  const { path, body } = compile('SELECT Id, Name, Version FROM Neo4jOASIS ORDER BY Id LIMIT 3');
  assert.equal(path, 'data/query-cql/projection');
  assert.deepEqual(body.columns, ['Id', 'Name', 'Version'].map(field => ({ field, alias: field })));
  assert.equal(body.take, 3);
  assert.equal(Object.hasOwn(body, 'includeMetadata'), false);
  assert.throws(() => compile('SELECT Id FROM Neo4jOASIS, MongoDBOASIS'), /Selected columns require one/);
});

test('preserves UTC timestamp precision in metadata filters', () => {
  const filter = value => compile("SELECT * FROM MongoDBOASIS WHERE metadata.observedAt AS DATETIME >= '" + value + "'").body.filters[0];
  assert.deepEqual(filter('2024-02-29T12:34:56.1234567Z'), {
    metadataPath: ['observedAt'], scalar: 'DateTime', operator: 'GreaterThanOrEqual', value: '2024-02-29T12:34:56.1234567Z'
  });
  for (const value of ['2023-02-29T00:00:00Z', '0000-01-01T00:00:00Z', '2024-01-01T24:00:00Z',
    '2024-01-01T00:00:00+00:00', '2024-01-01T00:00:00.12345678Z'])
    assert.throws(() => filter(value), /quoted UTC timestamp/);
});

test('preserves SQL column aliases in typed projections', () => {
  const query = compile('SELECT Name AS DisplayName, Name AS Title, Id FROM MongoDBOASIS');
  assert.deepEqual(query.body.columns, [
    { field: 'Name', alias: 'DisplayName' },
    { field: 'Name', alias: 'Title' },
    { field: 'Id', alias: 'Id' }
  ]);
  assert.throws(() => compile('SELECT Name AS id, Id FROM MongoDBOASIS'), /distinct alias/);
  assert.throws(() => compile('SELECT Name AS _private FROM MongoDBOASIS'), /Expected a column alias/);
});

test('groups a filtered database query before paging result groups', () => {
  const { path, body } = compile('SELECT Version AS Revision, COUNT(*) AS Total FROM MongoDBOASIS ' +
    'WHERE IsActive = TRUE GROUP BY Version ORDER BY Total DESC LIMIT 2');
  assert.equal(path, 'data/query-cql/grouped');
  assert.deepEqual(body.keys, [{ field: 'Version', alias: 'Revision' }]);
  assert.deepEqual(body.columns, [{ alias: 'Revision', keyAlias: 'Revision' }, { alias: 'Total', operation: 'LongCount' }]);
  assert.deepEqual(body.resultOrder, [{ alias: 'Total', descending: true }]);
  assert.equal(body.resultTake, 2);
  assert.equal(body.take, undefined);
  assert.throws(() => compile('SELECT Version, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Name'), /match GROUP BY/);
});

test('compiles a Boolean existence query without counting or selecting rows', () => {
  const { path, body } = compile('SELECT ANY(*) FROM MongoDBOASIS WHERE EXISTS CHILD (Version >= 2)');
  assert.equal(path, 'data/query-cql/scalar');
  assert.equal(body.operation, 'Any');
  assert.equal(body.selection, undefined);
  assert.equal(body.take, undefined);
  assert.equal(body.anyChildren[0].filters[0].field, 'Version');
  assert.throws(() => compile('SELECT ANY(Version) FROM MongoDBOASIS'), /Expected/);
  assert.throws(() => compile('SELECT ANY(*) FROM MongoDBOASIS, Neo4jOASIS'), /single provider/);
});

test('compiles explicitly typed Boolean metadata without coercing strings', () => {
  const { body } = compile('SELECT * FROM MongoDBOASIS WHERE metadata.flags.active AS BOOLEAN IN (TRUE, FALSE)');
  assert.deepEqual(body.filters, [{ metadataPath: ['flags', 'active'], scalar: 'Boolean', operator: 'In', value: [true, false] }]);
  assert.throws(() => compile("SELECT * FROM MongoDBOASIS WHERE metadata.active AS BOOLEAN = 'true'"), /Boolean literal/);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS WHERE metadata.active AS BOOLEAN > TRUE'), /Ordered comparisons/);
});

test('preserves exact decimal metadata literals without binary rounding', () => {
  const { body } = compile('SELECT * FROM MongoDBOASIS WHERE metadata.amount AS DECIMAL >= 1.0000000000000000000000000001');
  assert.deepEqual(body.filters, [{ metadataPath: ['amount'], scalar: 'Decimal',
    operator: 'GreaterThanOrEqual', value: '1.0000000000000000000000000001' }]);
  for (const literal of ['01.2', '-0.0', '79228162514264337593543950336', '0.00000000000000000000000000001']) {
    assert.throws(() => compile('SELECT * FROM MongoDBOASIS WHERE metadata.amount AS DECIMAL = ' + literal), /exact decimal/);
  }
});

test('grouped HAVING preserves large count thresholds and pages after filtering', () => {
  const query = 'SELECT COUNT(*) AS Total, Version FROM Neo4jOASIS GROUP BY Version HAVING ';
  const { body } = compile(query + 'total >= 9007199254740993 ORDER BY Version LIMIT 1 OFFSET 2');
  assert.deepEqual(body.columns.map(column => column.alias), ['Total', 'Version']);
  assert.deepEqual(body.resultFilters, [
    { alias: 'Total', operator: 'GreaterThanOrEqual', value: '9007199254740993' }
  ]);
  assert.equal(body.resultSkip, 2);
  assert.equal(body.resultTake, 1);
  assert.equal(body.skip, 0);
  assert.equal(body.take, undefined);
  assert.throws(() => compile(query + 'Total >= 9223372036854775808'), /64-bit/);
  assert.throws(() => compile(query + 'Unknown = 1'), /alias/);
});

test('grouped paging accepts a second ordering alias as a tie-breaker', () => {
  const query = 'SELECT Version AS Revision, COUNT(*) AS Total FROM Neo4jOASIS GROUP BY Version ';
  const { body } = compile(query + 'ORDER BY total DESC, revision ASC LIMIT 3 OFFSET 2');
  assert.deepEqual(body.resultOrder, [
    { alias: 'Total', descending: true }, { alias: 'Revision', descending: false }
  ]);
  assert.equal(body.resultTake, 3);
  assert.equal(body.resultSkip, 2);
  assert.throws(() => compile(query + 'ORDER BY Total, total'), /only once/);
});

test('groups by multiple fields and preserves the SELECT column order', () => {
  const base = 'SELECT Version AS Revision, COUNT(*) AS Total, IsActive FROM SQLLiteDBOASIS';
  const { body } = compile(base + ' GROUP BY IsActive, Version ORDER BY Total DESC, Revision ASC');
  assert.deepEqual(body.keys.map(key => key.field), ['IsActive', 'Version']);
  assert.deepEqual(body.columns.map(column => column.alias), ['Revision', 'Total', 'IsActive']);
  assert.throws(() => compile(base + ' GROUP BY Version, Version'), /different GROUP BY fields/);
});

test('grouped HAVING compiles both inclusive range boundaries before paging', () => {
  const { body } = compile('SELECT Version, COUNT(*) AS Total FROM MongoDBOASIS ' +
    'GROUP BY Version HAVING Total >= 2 AND total <= 10 ORDER BY Version LIMIT 5');
  assert.deepEqual(body.resultFilters, [
    { alias: 'Total', operator: 'GreaterThanOrEqual', value: '2' },
    { alias: 'Total', operator: 'LessThanOrEqual', value: '10' }
  ]);
  assert.equal(body.resultTake, 5);
});

test('preserves grouped numeric aggregates and counts in SELECT order', () => {
  const { body } = compile('SELECT AVG(Version) AS Mean, IsActive, COUNT(*) AS Total, ' +
    'MAX(Version) AS Latest FROM Neo4jOASIS GROUP BY IsActive HAVING Total >= 1 ORDER BY Mean DESC');
  assert.deepEqual(body.columns, [
    { alias: 'Mean', operation: 'Average', selection: { field: 'Version' } },
    { alias: 'IsActive', keyAlias: 'IsActive' },
    { alias: 'Total', operation: 'LongCount' },
    { alias: 'Latest', operation: 'Max', selection: { field: 'Version' } }
  ]);
  assert.deepEqual(body.resultOrder, [{ alias: 'Mean', descending: true }]);
});

test('HAVING binds each aggregate using its exact WEB4 scalar type', () => {
  const sql = 'SELECT IsActive, COUNT(*) AS Total, AVG(Version) AS Mean, SUM(Version) AS Combined ' +
    'FROM MongoDBOASIS GROUP BY IsActive HAVING ';
  const { body } = compile(sql + 'Total >= 2 AND Mean > 1.250 AND Combined <= 9');
  assert.deepEqual(body.resultFilters.map(filter => filter.value), ['2', '1.250', 9]);
  assert.throws(() => compile(sql + 'Combined = 1.1'), /Expected an integer/);
  assert.throws(() => compile(sql + 'Mean = 79228162514264337593543950336'), /exact decimal/);
});

test('compiles bounded SQL LIKE patterns and rejects unsupported wildcards', () => {
  const query = predicate => compile('SELECT * FROM SQLLiteDBOASIS WHERE ' + predicate).body.filters[0];
  for (const [pattern, operator] of [['A', 'Equal'], ['A%', 'StartsWith'], ['%A', 'EndsWith'], ['%A%', 'Contains'], ['%%A%%', 'Contains']]) {
    assert.deepEqual(query("Name LIKE '" + pattern + "'"), { field: 'Name', scalar: 'String', operator, value: 'A' });
  }
  assert.deepEqual(query("Name LIKE '%'"), { field: 'Name', operator: 'IsNotNull' });
  assert.deepEqual(query("Description LIKE '%%'"), { field: 'Description', operator: 'IsNotNull' });
  for (const predicate of ["Name LIKE 'A%%B'", "metadata.category LIKE '%'", "Name LIKE 'A_'", "Version LIKE '3'"]) {
    assert.throws(() => query(predicate), /LIKE/);
  }
});

test('lowers bounded NOT IN with SQL null exclusion and typed literals', () => {
  const prefix = 'SELECT * FROM MongoDBOASIS WHERE ';
  assert.deepEqual(compile(prefix + "Description NOT IN ('a', 'b', 'a')").body.filters, [
    { field: 'Description', operator: 'IsNotNull' },
    { field: 'Description', scalar: 'String', operator: 'NotEqual', value: 'a' },
    { field: 'Description', scalar: 'String', operator: 'NotEqual', value: 'b' }
  ]);
  assert.deepEqual(compile(prefix + 'Version NOT IN (1, 2)').body.filters, [
    { field: 'Version', scalar: 'Integer', operator: 'NotEqual', value: 1 },
    { field: 'Version', scalar: 'Integer', operator: 'NotEqual', value: 2 }
  ]);
  assert.throws(() => compile(prefix + "Description NOT IN ('a') OR Version = 1"), /outside OR/);
  assert.deepEqual(compile(prefix + "metadata.category NOT IN ('a')").body.filters, [
    { metadataPath: ['category'], operator: 'IsNotNull' },
    { metadataPath: ['category'], scalar: 'String', operator: 'NotEqual', value: 'a' }
  ]);
  assert.deepEqual(compile(prefix + 'metadata.sequence AS INT64 NOT IN (9007199254740993)').body.filters, [
    { metadataPath: ['sequence'], operator: 'IsNotNull' },
    { metadataPath: ['sequence'], scalar: 'Integer', operator: 'NotEqual', value: '9007199254740993' }
  ]);
  assert.throws(() => compile(prefix + 'IsActive NOT IN (TRUE)'), /NOT IN requires/);
  assert.throws(() => compile(prefix + "Description NOT IN ('a', NULL)"), /literal/);
  const numbers = Array.from({ length: 13 }, (_, index) => index + 1);
  assert.throws(() => compile(prefix + 'Version NOT IN (' + numbers.join(',') + ')'), /filter budget/);
});

test('compiles NOT LIKE patterns as native negation and excludes null exact matches', () => {
  const prefix = 'SELECT * FROM MongoDBOASIS WHERE ';
  assert.deepEqual(compile(prefix + "Description NOT LIKE '%secret%'").body.filters,
    [{ field: 'Description', scalar: 'String', operator: 'NotContains', value: 'secret' }]);
  assert.deepEqual(compile(prefix + "Name NOT LIKE 'A%'").body.filters,
    [{ field: 'Name', scalar: 'String', operator: 'NotStartsWith', value: 'A' }]);
  assert.deepEqual(compile(prefix + "metadata.category NOT LIKE '%!_' ESCAPE '!'").body.filters,
    [{ metadataPath: ['category'], scalar: 'String', operator: 'NotEndsWith', value: '_' }]);
  assert.deepEqual(compile(prefix + "Name NOT LIKE '%'").body.filters,
    [{ field: 'Name', scalar: 'String', operator: 'NotContains', value: '' }]);
  assert.deepEqual(compile(prefix + "Description NOT LIKE 'secret'").body.filters, [
    { field: 'Description', operator: 'IsNotNull' },
    { field: 'Description', scalar: 'String', operator: 'NotEqual', value: 'secret' }
  ]);
});

test('escapes literal LIKE wildcard characters before native compilation', () => {
  const filter = pattern => compile('SELECT * FROM Neo4jOASIS WHERE Name LIKE ' + pattern).body.filters[0];
  assert.deepEqual(filter("'%100!%!_!!%' ESCAPE '!'"),
    { field: 'Name', scalar: 'String', operator: 'Contains', value: '100%_!' });
  assert.equal(filter("'!_start%' ESCAPE '!'").operator, 'StartsWith');
  assert.equal(filter("'%end!%' ESCAPE '!'").operator, 'EndsWith');
  assert.equal(filter("'100!%' ESCAPE '!'").operator, 'Equal');
  for (const pattern of ["'a!' ESCAPE '!'", "'a!b' ESCAPE '!'", "'a' ESCAPE 'ab'", "'a' ESCAPE '%'"])
    assert.throws(() => filter(pattern), /LIKE ESCAPE/);
});

test('preserves a public exact-key preset as equality', () => {
  const { publicExample } = require('./cql-text.js');
  const provider = 'HoloOASIS';
  const filter = { field: 'Id', scalar: 'Guid', operator: 'Equal', value: 'b5d3f5a8-2539-4f94-9b12-aed841902ccb' };
  const request = { provider, orderBy: 'None', includeMetadata: true, take: 1, filters: [filter] };
  assert.deepEqual(compile(publicExample(provider, request)).body.filters, [filter]);
});

test('compiles bounded Nostr event queries using the exact event metadata key', () => {
  const id = 'ab'.repeat(32);
  const { body } = compile("SELECT * FROM NostrOASIS WHERE metadata.NostrEventId = '" + id + "' LIMIT 1");
  assert.equal(body.orderBy, 'None');
  assert.deepEqual(body.filters, [{ metadataPath: ['NostrEventId'], scalar: 'String', operator: 'Equal', value: id }]);
  assert.throws(() => compile("SELECT * FROM NostrOASIS WHERE metadata.NostrEventId = '" + id.toUpperCase() + "'"), /NostrOASIS supports/);
});

test('compiles selected multi-column sorting before result pagination', () => {
  const { path, body } = compile('SELECT Id, Version AS Revision FROM Neo4jOASIS ORDER BY revision DESC, Id ASC LIMIT 5 OFFSET 1');
  assert.equal(path, 'data/query-cql/projection');
  assert.equal(body.provider, 'Neo4jOASIS');
  assert.equal(body.orderBy, 'None');
  assert.equal(body.skip, 1);
  assert.equal(body.take, 5);
  assert.deepEqual(body.selectedOrder, [{ alias: 'Revision', descending: true }, { alias: 'Id', descending: false }]);
  assert.equal(compile('SELECT Id, Version FROM Neo4jOASIS ORDER BY Version DESC, Id ASC LIMIT 5 OFFSET 125').body.skip, 125);
  assert.deepEqual(compile('SELECT * FROM Neo4jOASIS ORDER BY Name, Id DESC LIMIT 4 OFFSET 2').body.ordering,
    [{ field: 'Name', descending: false }, { field: 'Id', descending: true }]);
  assert.throws(() => compile('SELECT Id, Version FROM Neo4jOASIS ORDER BY Name, Id'), /selected column aliases/);
});

test('orders a single projected alias by its selected source field', () => {
  const { path, body } = compile('SELECT Version AS Revision FROM SQLLiteDBOASIS ORDER BY Revision DESC LIMIT 5');
  assert.equal(path, 'data/query-cql/projection');
  assert.equal(body.orderBy, 'Version');
  assert.equal(body.descending, true);
});

test('orders a selected description alias natively before paging', () => {
  const { path, body } = compile('SELECT Id, Description AS Detail FROM SQLLiteDBOASIS ORDER BY Detail DESC LIMIT 3');
  assert.equal(path, 'data/query-cql/projection');
  assert.equal(body.take, 3);
  assert.deepEqual(body.selectedOrder, [{ alias: 'Detail', descending: true }]);
});

test('uses default aliases for grouped aggregates in either SELECT order', () => {
  const tail = ' FROM MongoDBOASIS GROUP BY Version HAVING Count >= 2 ORDER BY Avg DESC LIMIT 5';
  const columns = ['COUNT(*)', 'AVG(Version)', 'Version'];
  const aliases = ['COUNT(*) AS Count', 'AVG(Version) AS Avg', 'Version'];
  assert.deepEqual(compile('SELECT ' + columns.join(', ') + tail),
    compile('SELECT ' + aliases.join(', ') + tail));
  assert.deepEqual(compile('SELECT Version, COUNT(*) FROM Neo4jOASIS GROUP BY Version').body.columns,
    [{ alias: 'Version', keyAlias: 'Version' }, { alias: 'Count', operation: 'LongCount' }]);
  assert.throws(() => compile('SELECT Version AS Count, COUNT(*) FROM MongoDBOASIS GROUP BY Version'),
    /distinct alias/);
});

test('compiles SQL with inline and block comments while preserving string literals', () => {
  const query = "SELECT Name FROM MongoDBOASIS WHERE Name = 'a--b /* c */' ORDER BY Name";
  const withComments = "-- demo\r\n SELECT Name /* selected */ FROM MongoDBOASIS\n" +
    "WHERE Name = 'a--b /* c */' -- literal above\n ORDER BY /* direction */ Name; -- done";
  assert.deepEqual(compile(withComments), compile(query));
  assert.throws(() => compile(query + ' /* unfinished'), /Unexpected character/);
  assert.throws(() => compile(query + '; /* comment */ SELECT * FROM MongoDBOASIS'), /Unexpected clause/);
});

test('groups on hidden keys and returns only selected columns', () => {
  const count = compile('SELECT COUNT(*) FROM MongoDBOASIS GROUP BY Version ORDER BY Count DESC');
  assert.equal(count.path, 'data/query-cql/grouped');
  assert.deepEqual(count.body.keys, [{ field: 'Version', alias: 'Version' }]);
  assert.deepEqual(count.body.columns, [{ alias: 'Count', operation: 'LongCount' }]);
  const hidden = compile('SELECT Version AS IsActive, COUNT(*) AS Total FROM Neo4jOASIS GROUP BY Version, IsActive');
  assert.deepEqual(hidden.body.keys, [{ field: 'Version', alias: 'IsActive' }, { field: 'IsActive', alias: 'IsActive_' }]);
  assert.deepEqual(hidden.body.columns, [{ alias: 'IsActive', keyAlias: 'IsActive' }, { alias: 'Total', operation: 'LongCount' }]);
  assert.throws(() => compile('SELECT COUNT(*) FROM MongoDBOASIS GROUP BY Version, Version'), /different GROUP BY fields/);
});

test('projects typed metadata with CAST while retaining exact aliases and nullability', () => {
  const projection = compile('SELECT Id, CAST(metadata.Stock.current AS INT64) AS Stock FROM MongoDBOASIS');
  assert.equal(projection.path, 'data/query-cql/projection');
  assert.deepEqual(projection.body.columns, [
    { field: 'Id', alias: 'Id' },
    { metadataPath: ['Stock', 'current'], valueType: 'Int64', nullable: true, alias: 'Stock' }
  ]);
  const sorted = compile('SELECT CAST(metadata.total AS DECIMAL) AS Total FROM Neo4jOASIS ORDER BY Total DESC');
  assert.equal(sorted.path, 'data/query-cql/projection');
  assert.deepEqual(sorted.body.selectedOrder, [{ alias: 'Total', descending: true }]);
  assert.throws(() => compile('SELECT CAST(metadata.total AS INTEGER) AS Total FROM Neo4jOASIS'), /exact metadata projection type/);
});

test('groups or deduplicates exact metadata keys and resolves aliases without exposing hidden keys', () => {
  const select = 'CAST(metadata.Stock.current AS INT64)';
  const distinct = compile('SELECT DISTINCT ' + select + ' AS Stock FROM MongoDBOASIS ORDER BY Stock');
  const grouped = compile('SELECT ' + select + ' AS Stock FROM MongoDBOASIS GROUP BY ' + select + ' ORDER BY Stock');
  assert.deepEqual(distinct, grouped);
  assert.deepEqual(grouped.body.keys, [
    { metadataPath: ['Stock', 'current'], valueType: 'Int64', nullable: true, alias: 'Stock' }
  ]);
  const count = compile('SELECT COUNT(*) FROM Neo4jOASIS GROUP BY ' + select);
  assert.equal(count.body.keys[0].alias, 'GroupKey1');
  assert.deepEqual(count.body.columns, [{ alias: 'Count', operation: 'LongCount' }]);
  assert.throws(() => compile('SELECT ' + select + ' AS Stock FROM MongoDBOASIS GROUP BY CAST(metadata.Stock.current AS DECIMAL)'),
    /match GROUP BY/);
  assert.throws(() => compile('SELECT DISTINCT ' + select + ' AS First, ' + select + ' AS Second FROM MongoDBOASIS'),
    /different selected fields/);
});

test('groups exact numeric metadata aggregates and preserves typed HAVING thresholds', () => {
  const text = 'SELECT Name, MAX(CAST(metadata.signed AS INT64)) AS Peak, ' +
    'MIN(CAST(metadata.unsigned AS UINT64)) AS Floor, SUM(CAST(metadata.amount AS DECIMAL)) AS Total ' +
    'FROM MongoDBOASIS GROUP BY Name HAVING Peak >= 9007199254740993 AND ' +
    'Floor <= 18446744073709551615 AND Total > 1.0000000000000000000000000001 ORDER BY Peak DESC';
  const { path, body } = compile(text);
  assert.equal(path, 'data/query-cql/grouped');
  assert.deepEqual(body.columns.slice(1).map(({ selection }) => selection), [
    { metadataPath: ['signed'], valueType: 'Int64', nullable: true },
    { metadataPath: ['unsigned'], valueType: 'UInt64', nullable: true },
    { metadataPath: ['amount'], valueType: 'Decimal', nullable: true }
  ]);
  assert.deepEqual(body.resultFilters.map(filter => filter.value),
    ['9007199254740993', '18446744073709551615', '1.0000000000000000000000000001']);
  assert.throws(() => compile(text.replace('18446744073709551615', '18446744073709551616')), /exact UInt64/);
  assert.throws(() => compile(text.replace('9007199254740993', '9223372036854775808')), /exact Int64/);
  assert.throws(() => compile(text.replace('AS DECIMAL)', 'AS GUID)')), /exact numeric metadata/);
  const avg = compile('SELECT AVG(CAST(metadata.units AS INT64)) FROM Neo4jOASIS GROUP BY Name HAVING Avg >= 1.25');
  assert.equal(avg.body.resultFilters[0].value, '1.25');
});

test('compiles exact scalar aggregates over typed metadata', () => {
  for (const [fn, operation] of [['MIN', 'Min'], ['MAX', 'Max'], ['SUM', 'Sum'], ['AVG', 'Average']]) {
    const query = 'SELECT ' + fn + '(CAST(metadata.finance.amount AS DECIMAL)) FROM MongoDBOASIS';
    const { path, body } = compile(query);
    assert.equal(path, 'data/query-cql/scalar');
    assert.equal(body.operation, operation);
    assert.deepEqual(body.selection, { metadataPath: ['finance', 'amount'], valueType: 'Decimal', nullable: true });
  }
  assert.throws(() => compile('SELECT SUM(CAST(metadata.value AS GUID)) FROM MongoDBOASIS'), /exact numeric metadata/);
  assert.throws(() => compile('SELECT SUM(CAST(metadata.value AS DECIMAL)) FROM MongoDBOASIS TIMEOUT 1000'), /Scalar queries use the server timeout/);
});

test('compiles bounded composite left joins without paging joined results', () => {
  const left = '(SELECT * FROM MongoDBOASIS WHERE Version >= 2 ORDER BY Id LIMIT 3) AS l';
  const right = '(SELECT * FROM MongoDBOASIS LIMIT 2) AS r';
  const query = 'SELECT l.Id AS LeftId, r.Id AS RightId FROM ' + left + ' LEFT JOIN ' + right +
    ' ON r.Version = l.Version AND l.Name = r.Name';
  const { path, body } = compile(query);
  assert.equal(path, 'data/query-cql/join');
  assert.equal(body.kind, 'Left');
  assert.equal(body.left.filters[0].value, 2);
  assert.deepEqual(body.keys.map(key => [key.left.field, key.right.field]), [['Version', 'Version'], ['Name', 'Name']]);
  assert.deepEqual(body.columns, [
    { alias: 'LeftId', source: 'Left', selection: { field: 'Id' } },
    { alias: 'RightId', source: 'Right', selection: { field: 'Id' }, allowMissing: true }
  ]);
  assert.deepEqual([body.maximumLeftRows, body.maximumRightRows, body.maximumPairs, body.maximumResults], [3, 2, 6, 6]);
  assert.throws(() => compile(query + ' LIMIT 2'), /Unexpected join clause/);
  assert.throws(() => compile(query.replace(right, right.replace('MongoDBOASIS', 'Neo4jOASIS'))), /one join provider/);
});

test('uses exact typed metadata in composite join keys and selected right output', () => {
  const source = '(SELECT * FROM SQLLiteDBOASIS LIMIT 3)';
  const text = 'SELECT l.Id, CAST(r.metadata.Amount AS DECIMAL) AS Amount FROM ' + source +
    ' AS l LEFT JOIN ' + source + ' AS r ON l.Version = r.Version AND ' +
    'CAST(l.metadata.JoinId AS INT64) = CAST(r.metadata.JoinId AS INT64)';
  const { path, body } = compile(text);
  assert.equal(path, 'data/query-cql/join');
  assert.deepEqual(body.keys[1], {
    alias: 'Key2',
    left: { metadataPath: ['JoinId'], valueType: 'Int64', nullable: true },
    right: { metadataPath: ['JoinId'], valueType: 'Int64', nullable: true }
  });
  assert.deepEqual(body.columns[1], { alias: 'Amount', source: 'Right', allowMissing: true,
    selection: { metadataPath: ['Amount'], valueType: 'Decimal', nullable: true } });
  assert.throws(() => compile(text.replace(' AS Amount FROM', ' FROM')), /name a joined metadata column/);
  assert.throws(() => compile(text + ' AND CAST(l.metadata.JoinId AS INT64) = CAST(r.metadata.JoinId AS INT64)'),
    /key pair once/);
});

test('COUNT(1) uses exactly the same native scalar and grouped requests as COUNT(*)', () => {
  const scalar = 'SELECT COUNT(1) FROM SQLLiteDBOASIS WHERE Version >= 2';
  const grouped = 'SELECT Version, COUNT(1) AS Total FROM MongoDBOASIS GROUP BY Version HAVING Total >= 2';
  for (const text of [scalar, grouped]) {
    assert.deepEqual(compile(text), compile(text.replace('COUNT(1)', 'COUNT(*)')));
  }
  for (const text of ['SELECT COUNT(NULL) FROM MongoDBOASIS', 'SELECT COUNT(UnknownField) FROM MongoDBOASIS',
    'SELECT ANY(1) FROM MongoDBOASIS', 'SELECT COUNT(DISTINCT 1) FROM MongoDBOASIS']) {
    assert.throws(() => compile(text));
  }
});

test('HAVING BETWEEN preserves exact count and Decimal thresholds before paging', () => {
  const head = 'SELECT Version, COUNT(*) AS Total, AVG(Version) AS Mean FROM MongoDBOASIS GROUP BY Version HAVING ';
  const order = ' ORDER BY Mean DESC LIMIT 5';
  const range = 'Total BETWEEN 9007199254740993 AND 9223372036854775807 AND Mean BETWEEN 0.10 AND 2.5';
  const expanded = 'Total >= 9007199254740993 AND Total <= 9223372036854775807 AND Mean >= 0.10 AND Mean <= 2.5';
  assert.deepEqual(compile(head + range + order), compile(head + expanded + order));
  assert.throws(() => compile(head + 'Total BETWEEN 1 OR 2'), /Expected AND/);
  assert.throws(() => compile(head + 'Total BETWEEN 1 AND 9223372036854775808'), /64-bit count/);
  assert.throws(() => compile(head + Array(17).fill('Total BETWEEN 1 AND 2').join(' AND ')), /32 HAVING comparisons/);
});

test('HAVING filters selected grouping keys and aggregate aliases before paging', () => {
  const query = 'SELECT Version AS Revision, IsActive AS Enabled, COUNT(*) AS Total FROM MongoDBOASIS ' +
    'GROUP BY Version, IsActive HAVING Revision BETWEEN 2 AND 4 AND Enabled = TRUE AND Total > 0 ORDER BY Revision LIMIT 2';
  assert.deepEqual(compile(query).body.resultFilters, [
    { alias: 'Revision', operator: 'GreaterThanOrEqual', value: 2 },
    { alias: 'Revision', operator: 'LessThanOrEqual', value: 4 },
    { alias: 'Enabled', operator: 'Equal', value: true },
    { alias: 'Total', operator: 'GreaterThan', value: '0' }
  ]);
  const text = "SELECT CAST(metadata.label AS STRING) AS Label, COUNT(*) AS Total FROM Neo4jOASIS " +
    "GROUP BY CAST(metadata.label AS STRING) HAVING Label <> 'O''Brien'";
  assert.deepEqual(compile(text).body.resultFilters, [
    { alias: 'Label', operator: 'NotEqual', value: null },
    { alias: 'Label', operator: 'NotEqual', value: "O'Brien" }
  ]);
  assert.deepEqual(compile(text.replace("<> 'O''Brien'", 'IS NULL')).body.resultFilters, [{ alias: 'Label', operator: 'IsNull' }]);
  assert.throws(() => compile(query.replace('Enabled = TRUE', 'Enabled > TRUE')), /equality/);
  assert.throws(() => compile(query.replace('Revision BETWEEN 2 AND 4', 'Version > 2')), /selected/);
});

test('HAVING LIKE matches selected text keys using the row LIKE escape rules', () => {
  const head = 'SELECT Description AS Label, COUNT(*) AS Total FROM Neo4jOASIS GROUP BY Description HAVING ';
  const filters = compile(head + "Label LIKE '%100!%%' ESCAPE '!' AND Total >= 2").body.resultFilters;
  assert.deepEqual(filters, [
    { alias: 'Label', operator: 'Contains', value: '100%' },
    { alias: 'Total', operator: 'GreaterThanOrEqual', value: '2' }
  ]);
  assert.deepEqual(compile(head + "Label LIKE 'Coffee%'").body.resultFilters,
    [{ alias: 'Label', operator: 'StartsWith', value: 'Coffee' }]);
  assert.throws(() => compile(head + "Label LIKE 'Tea_'"), /literal underscore/);
  assert.throws(() => compile("SELECT Version, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version HAVING Version LIKE 'x'"), /string field/);
});

test('HAVING null checks and inequality handle empty nullable numeric aggregates', () => {
  const head = 'SELECT Version, AVG(CAST(metadata.amount AS DECIMAL)) AS Mean, COUNT(*) AS Total ' +
    'FROM SQLLiteDBOASIS GROUP BY Version HAVING ';
  assert.deepEqual(compile(head + 'Mean IS NULL AND Total > 0').body.resultFilters, [
    { alias: 'Mean', operator: 'IsNull' },
    { alias: 'Total', operator: 'GreaterThan', value: '0' }
  ]);
  assert.deepEqual(compile(head + 'Mean IS NOT NULL').body.resultFilters,
    [{ alias: 'Mean', operator: 'NotEqual', value: null }]);
  assert.deepEqual(compile(head + 'Mean <> 0.10').body.resultFilters, [
    { alias: 'Mean', operator: 'NotEqual', value: null },
    { alias: 'Mean', operator: 'NotEqual', value: '0.10' }
  ]);
  assert.throws(() => compile(head + 'Total IS NULL'), /cannot be null/);
});

test('join sources have independent offsets and keep their pair-work bounds', () => {
  const left = '(SELECT * FROM Neo4jOASIS ORDER BY Id LIMIT 3 OFFSET 2) AS l';
  const right = '(SELECT * FROM Neo4jOASIS ORDER BY Name DESC LIMIT 2 OFFSET 1) AS r';
  const sql = 'SELECT l.Id AS LeftId, r.Id AS RightId FROM ' + left + ' LEFT JOIN ' + right + ' ON l.Id = r.Id';
  const { path, body } = compile(sql);
  assert.equal(path, 'data/query-cql/join');
  assert.deepEqual(body.left, { filters: [], orderBy: 'Id', take: 3, skip: 2 });
  assert.deepEqual(body.right, { filters: [], orderBy: 'Name', descending: true, take: 2, skip: 1 });
  assert.deepEqual([body.maximumLeftRows, body.maximumRightRows, body.maximumPairs, body.maximumResults], [3, 2, 6, 6]);
  assert.throws(() => compile(sql.replace('OFFSET 2', 'OFFSET 1001')));
  assert.throws(() => compile(sql + ' OFFSET 1'), /Unexpected join clause/);
});

test('RIGHT OUTER JOIN preserves the original right input and selected output order', () => {
  const left = '(SELECT * FROM MongoDBOASIS ORDER BY Id LIMIT 2 OFFSET 1) AS l';
  const right = '(SELECT * FROM MongoDBOASIS ORDER BY Name LIMIT 4) AS r';
  const sql = 'SELECT l.Id AS LeftId, r.Id AS RightId FROM ' + left + ' RIGHT OUTER JOIN ' + right +
    ' ON l.ParentHolonId = r.Id';
  const query = compile(sql);
  assert.equal(query.path, 'data/query-cql/join');
  assert.equal(query.body.kind, 'Left');
  assert.deepEqual(query.body.left, { filters: [], orderBy: 'Name', take: 4 });
  assert.deepEqual(query.body.right, { filters: [], orderBy: 'Id', take: 2, skip: 1 });
  assert.deepEqual(query.body.keys, [{ alias: 'Key1', left: { field: 'Id' }, right: { field: 'ParentHolonId' } }]);
  assert.deepEqual(query.body.columns, [
    { alias: 'LeftId', source: 'Right', selection: { field: 'Id' }, allowMissing: true },
    { alias: 'RightId', source: 'Left', selection: { field: 'Id' } }
  ]);
  assert.deepEqual([query.body.maximumLeftRows, query.body.maximumRightRows, query.body.maximumPairs], [4, 2, 8]);
});

test('bounded CROSS JOIN requires no ON condition and preserves the product limit', () => {
  const left = '(SELECT * FROM MongoDBOASIS ORDER BY Id LIMIT 2) AS l';
  const right = '(SELECT * FROM MongoDBOASIS ORDER BY Name LIMIT 3 OFFSET 1) AS r';
  const text = 'SELECT l.Id AS LeftId, r.Id AS RightId FROM ' + left + ' CROSS JOIN ' + right;
  const query = compile(text);
  assert.equal(query.path, 'data/query-cql/join');
  assert.equal(query.body.kind, 'Cross');
  assert.deepEqual(query.body.keys, []);
  assert.deepEqual([query.body.maximumLeftRows, query.body.maximumRightRows, query.body.maximumPairs, query.body.maximumResults],
    [2, 3, 6, 6]);
  assert.equal(query.body.right.skip, 1);
  assert.deepEqual(query.body.columns.map(column => column.source), ['Left', 'Right']);
  assert.throws(() => compile(text + ' ON l.Id = r.Id'), /Unexpected join clause/);
  assert.throws(() => compile(text.replace('CROSS JOIN', 'INNER JOIN')), /Expected ON/);
});

test('keeps each OR group inside its own bounded join input', () => {
  const left = "(SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE AND (Version = 1 OR Version = 3) ORDER BY Id LIMIT 2) AS l";
  const right = "(SELECT * FROM MongoDBOASIS WHERE Name LIKE 'Demo%' OR Name = 'Sample' ORDER BY Name LIMIT 3 OFFSET 1) AS r";
  const text = 'SELECT l.Id AS LeftId, r.Id AS RightId FROM ' + left + ' CROSS JOIN ' + right;
  const { body } = compile(text);
  assert.deepEqual(body.left.filters.map(filter => [filter.field, filter.value]), [['IsActive', true]]);
  assert.deepEqual(body.left.anyOf.map(filter => [filter.field, filter.value]), [['Version', 1], ['Version', 3]]);
  assert.deepEqual(body.right.anyOf.map(filter => [filter.field, filter.value]), [['Name', 'Demo'], ['Name', 'Sample']]);
  assert.equal(body.right.skip, 1);
  assert.equal(body.maximumPairs, 6);
  assert.throws(() => compile(text.replace('IsActive = TRUE','EXISTS CHILD (IsActive = TRUE)')), /Unknown filter field/);
});

test('compiles NOT BETWEEN to two strict ordered alternatives in the same scope', () => {
  const head = 'SELECT Id FROM MongoDBOASIS WHERE ';
  const query = compile(head + "IsActive = TRUE AND metadata.count AS INT64 NOT BETWEEN 10 AND 20");
  assert.deepEqual(query.body.filters.map(({ field, value }) => [field, value]), [['IsActive', true]]);
  assert.deepEqual(query.body.anyOf.map(({ operator, value }) => [operator, value]),
    [['LessThan', '10'], ['GreaterThan', '20']]);
  const parenthesized = compile(head + "(Version NOT BETWEEN 2 AND 5 OR Name = 'Example')");
  assert.deepEqual(parenthesized.body.anyOf.map(({ operator, value }) => [operator, value]),
    [['LessThan', 2], ['GreaterThan', 5], ['Equal', 'Example']]);
  const plain = compile(head + "Version NOT BETWEEN 2 AND 5 OR Name = 'Example'");
  assert.deepEqual(plain, parenthesized);
  assert.throws(() => compile(head + 'Version NOT BETWEEN 2 AND 5 AND Version NOT BETWEEN 7 AND 9'), /one OR group/);
  assert.throws(() => compile(head + "Name NOT BETWEEN 'A' AND 'B'"), /requires a numeric or UTC timestamp/);
});

test('keeps floating-point metadata literals in the WEB4 wire format', () => {
  const head = 'SELECT * FROM MongoDBOASIS WHERE ';
  const { body } = compile(head + 'metadata.score AS DOUBLE BETWEEN -1e-7 AND 2.5E+9 ' +
    'AND metadata.rank AS SINGLE IN (001.2500, 3e-2)');
  assert.deepEqual(body.filters.map(({ scalar, value }) => [scalar, value]), [
    ['Double', '-1E-07'], ['Double', '2500000000'], ['Single', ['1.25', '0.03']]
  ]);
  assert.throws(() => compile(head + 'metadata.score AS DOUBLE > 1E+999'), /finite floating-point/);
  const { body: boundaries } = compile(head + 'metadata.score AS DOUBLE IN (0.00001, 100000000000000000) ' +
    'AND metadata.rank AS SINGLE IN (-0.000, 100000000, 1000000000)');
  assert.deepEqual(boundaries.filters.map(({ value }) => value),
    [['1E-05', '1E+17'], ['0', '100000000', '1E+09']]);
  assert.equal(compile(head + 'metadata.score AS DOUBLE = 1.00000000000000001').body.filters[0].value,
    '1.00000000000000001');
  assert.throws(() => compile(head + 'metadata.score AS DECIMAL > 1e2'), /exact decimal/);
  assert.throws(() => compile(head + 'Version = 1e2'), /Expected an integer/);
});

test('projects both floating-point metadata widths as distinct typed columns', () => {
  for (const provider of ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS']) {
    const { body } = compile('SELECT DISTINCT CAST(metadata.score AS DOUBLE) AS Score, ' +
      'CAST(metadata.rank AS SINGLE) AS Rank FROM ' + provider);
    assert.deepEqual(body.keys.map(({ valueType }) => valueType), ['Double', 'Single']);
  }
});

test('FULL OUTER JOIN lifts both projections and reserves each unmatched input', () => {
  const left = '(SELECT * FROM MongoDBOASIS ORDER BY Id LIMIT 1) AS l';
  const right = '(SELECT * FROM MongoDBOASIS ORDER BY Id LIMIT 1) AS r';
  const text = 'SELECT l.Id AS LeftId, r.Id AS RightId FROM ' + left + ' FULL OUTER JOIN ' + right + ' ON l.Id = r.Id';
  const { body } = compile(text);
  assert.equal(body.kind, 'Full');
  assert.equal(body.maximumPairs, 2);
  assert.equal(body.maximumResults, 2);
  assert.deepEqual(body.columns.map(column => column.allowMissing), [true, true]);
  assert.throws(() => compile(text.split(' ON ')[0]), /Expected ON/);
});


test('compiles negated HAVING patterns on selected text keys', () => {
  const head = 'SELECT Name AS Label, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Name HAVING ';
  assert.deepEqual(compile(head + "Label NOT LIKE '%tea%' AND Total > 1").body.resultFilters, [
    { alias: 'Label', operator: 'NotContains', value: 'tea' },
    { alias: 'Total', operator: 'GreaterThan', value: '1' }
  ]);
  assert.deepEqual(compile(head + "Label NOT LIKE 'tea'").body.resultFilters, [
    { alias: 'Label', operator: 'NotEqual', value: null },
    { alias: 'Label', operator: 'NotEqual', value: 'tea' }
  ]);
  assert.deepEqual(compile(head + "Label NOT LIKE '%'").body.resultFilters, [
    { alias: 'Label', operator: 'NotContains', value: '' }
  ]);
  assert.throws(() => compile(head + "Total NOT LIKE '%1%'"));
});


test('orders full rows by canonical keys on one native source', () => {
  const compiled = compile('SELECT * FROM SQLLiteDBOASIS ORDER BY Description DESC, Id ASC LIMIT 5 OFFSET 100');
  assert.equal(compiled.path, 'data/query-cql');
  assert.equal(compiled.body.orderBy, 'None');
  assert.equal(compiled.body.skip, 100);
  assert.equal(compiled.body.take, 5);
  assert.deepEqual(compiled.body.ordering, [
    { field: 'Description', descending: true },
    { field: 'Id', descending: false }
  ]);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS, Neo4jOASIS ORDER BY Name, Id'), /one MongoDB/);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS ORDER BY Name, Name'), /only once/);
  assert.throws(() => compile('SELECT * FROM MongoDBOASIS ORDER BY Unknown, Id'), /Order full rows/);
});

test('compiles native negative child and descendant existence without inverting their local filters', () => {
  const query = compile("SELECT * FROM Neo4jOASIS WHERE IsActive = TRUE AND NOT EXISTS CHILD (Name = 'pending') AND NOT EXISTS DESCENDANT (Version >= 2) LIMIT 3");
  assert.equal(query.path, 'data/query-cql');
  assert.equal(query.body.anyChildren[0].negated, true);
  assert.equal(query.body.anyChildren[0].filters[0].operator, 'Equal');
  assert.equal(query.body.anyDescendants[0].negated, true);
  assert.equal(query.body.anyDescendants[0].filters[0].operator, 'GreaterThanOrEqual');
  assert.equal(query.body.anyDescendants[0].maximumDepth, 8);
  assert.throws(() => compile("SELECT * FROM Neo4jOASIS WHERE NOT EXISTS CHILD (NOT EXISTS CHILD (Version = 1))"));
});

test('orders explicit SELECT columns by their one-based positions', () => {
  const selected = 'SELECT Id, Version AS Revision FROM Neo4jOASIS ORDER BY ';
  const grouped = 'SELECT COUNT(*) AS Total, Version FROM Neo4jOASIS GROUP BY Version ORDER BY ';
  const distinct = 'SELECT DISTINCT Version FROM Neo4jOASIS ORDER BY ';
  assert.deepEqual(compile(selected + '2 DESC, 1 LIMIT 5').body,
    compile(selected + 'Revision DESC, Id LIMIT 5').body);
  assert.deepEqual(compile(grouped + '1 DESC, 2 LIMIT 5').body,
    compile(grouped + 'Total DESC, Version LIMIT 5').body);
  assert.deepEqual(compile(distinct + '1 DESC LIMIT 5').body,
    compile(distinct + 'Version DESC LIMIT 5').body);
  assert.throws(() => compile(selected + '2, Revision'), /only once/);
  assert.throws(() => compile(grouped + '1, Total'), /only once/);
  for (const query of [selected + '0', grouped + '3', selected + '999999999999999999999',
    'SELECT * FROM Neo4jOASIS ORDER BY 1']) {
    assert.throws(() => compile(query), /explicit SELECT column/);
  }
});

test('accepts predicate-free child and descendant existence without changing following clauses', () => {
  const query = compile('SELECT * FROM Neo4jOASIS WHERE EXISTS CHILD AND NOT EXISTS DESCENDANT ORDER BY Name LIMIT 5');
  assert.deepEqual(query.body.anyChildren, [{ filters: [] }]);
  assert.deepEqual(query.body.anyDescendants, [{ filters: [], negated: true, maximumDepth: 8, maximumNodes: 1000 }]);
  assert.equal(query.body.orderBy, 'Name');
  assert.equal(query.body.take, 5);
  assert.throws(() => compile('SELECT * FROM Neo4jOASIS WHERE EXISTS CHILD ('));
});

test('groups by explicit selected column positions without counting aggregate positions as fields', () => {
  const base = 'SELECT COUNT(*) AS Total, IsActive AS Active, ' +
    'CAST(metadata.label AS STRING) AS Label FROM Neo4jOASIS GROUP BY ';
  const rest = ' HAVING Total > 1 ORDER BY 1 DESC LIMIT 5';
  assert.deepEqual(compile(base + '2, 3' + rest), compile(base +
    'IsActive, CAST(metadata.label AS STRING)' + rest));
  assert.throws(() => compile(base + '1, 2, 3'), /aggregate position/);
  assert.throws(() => compile(base + '0, 3'), /explicit SELECT column/);
  assert.throws(() => compile(base + '2, 4'), /explicit SELECT column/);
  assert.throws(() => compile(base + '2, IsActive, 3'), /different GROUP BY fields/);
});

test('compiles a bounded child join with canonical relationship keys', () => {
  const query = "SELECT p.Id AS Parent, c.Id AS Child FROM (SELECT * FROM Neo4jOASIS LIMIT 3) AS p " +
    "CHILD JOIN (SELECT * FROM Neo4jOASIS WHERE IsActive = TRUE LIMIT 4) AS c";
  const { path, body } = compile(query);
  assert.equal(path, 'data/query-cql/join');
  assert.equal(body.kind, 'Child');
  assert.deepEqual(body.keys, []);
  assert.equal(body.maximumLeftRows, 3);
  assert.equal(body.maximumRightRows, 4);
  assert.equal(body.maximumPairs, 4);
  assert.equal(body.maximumResults, 4);
  assert.equal(body.right.filters[0].field, 'IsActive');
  assert.throws(() => compile(query + ' ON p.Id = c.ParentHolonId'));
  assert.throws(() => compile(query.replace('FROM Neo4jOASIS WHERE', 'FROM MongoDBOASIS WHERE')), /one join provider/);
});
