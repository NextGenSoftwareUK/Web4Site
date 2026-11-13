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
