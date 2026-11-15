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
  assert.throws(() => compile(prefix + "Name IS NOT NULL"));
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
  assert.throws(() => compile("SELECT * FROM MongoDBOASIS WHERE Name IS NULL"));
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
  assert.throws(() => compile('SELECT Version, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Name'), /matches GROUP BY/);
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
  assert.throws(() => compile(query + 'Version = 1'), /alias/);
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
  assert.throws(() => compile(base + ' GROUP BY Version, Version'), /matches GROUP BY/);
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
  for (const [pattern, operator] of [['A', 'Equal'], ['A%', 'StartsWith'], ['%A', 'EndsWith'], ['%A%', 'Contains']]) {
    assert.deepEqual(query("Name LIKE '" + pattern + "'"), { field: 'Name', scalar: 'String', operator, value: 'A' });
  }
  for (const predicate of ["Name LIKE 'A%B'", "Name LIKE '%'", "Name LIKE 'A_'", "Version LIKE '3'"]) {
    assert.throws(() => query(predicate), /LIKE/);
  }
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
  assert.equal(path, 'data/query-cql/composition');
  assert.equal(body.source.provider, undefined);
  assert.equal(body.source.orderBy, 'Id');
  assert.equal(body.source.take, 100);
  assert.deepEqual(body.stages, [
    { operation: 'OrderBy', order: [{ alias: 'Revision', descending: true }, { alias: 'Id', descending: false }] },
    { operation: 'Skip', count: 1 },
    { operation: 'Take', count: 5 }
  ]);
  assert.throws(() => compile('SELECT * FROM Neo4jOASIS ORDER BY Name, Id'), /selected columns/);
  assert.throws(() => compile('SELECT Id, Version FROM Neo4jOASIS ORDER BY Name, Id'), /selected column aliases/);
});

test('orders a single projected alias by its selected source field', () => {
  const { path, body } = compile('SELECT Version AS Revision FROM SQLLiteDBOASIS ORDER BY Revision DESC LIMIT 5');
  assert.equal(path, 'data/query-cql/projection');
  assert.equal(body.orderBy, 'Version');
  assert.equal(body.descending, true);
});

test('orders a selected description alias through bounded composition', () => {
  const { path, body } = compile('SELECT Id, Description AS Detail FROM SQLLiteDBOASIS ORDER BY Detail DESC LIMIT 3');
  assert.equal(path, 'data/query-cql/composition');
  assert.equal(body.source.take, 100);
  assert.deepEqual(body.stages, [
    { operation: 'OrderBy', order: [{ alias: 'Detail', descending: true }] },
    { operation: 'Take', count: 3 }
  ]);
});
