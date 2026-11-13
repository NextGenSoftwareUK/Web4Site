/* SQL-like sandbox syntax compiled to the existing typed WEB4 request. */
(function (root) {
  'use strict';

  const providers = ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS', 'HoloOASIS', 'SolanaOASIS', 'EthereumOASIS', 'PolygonOASIS', 'ArbitrumOASIS', 'NEAROASIS', 'EOSIOOASIS', 'SOLIDOASIS', 'IPFSOASIS', 'ActivityPubOASIS', 'CosmosBlockChainOASIS', 'PolkadotOASIS', 'TONOASIS'];
  const evmAddress = /^0x[0-9a-fA-F]{40}$/;
  const accountProfiles = {
    CosmosBlockChainOASIS: { key: 'CosmosValidatorAddress', accepts: value => /^[a-z0-9]{8,90}$/.test(value) },
    PolkadotOASIS: { key: 'PolkadotBlockHash', accepts: value => /^0x[0-9a-fA-F]{64}$/.test(value) },
    TONOASIS: { key: 'TonBlockRootHash', accepts: value => /^[a-zA-Z0-9+/_-]{43}=$/.test(value) },
    SOLIDOASIS: { key: 'SolidRecordId', accepts: value => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) },
    IPFSOASIS: { key: 'IPFSRecordCid', accepts: value => /^[a-zA-Z0-9]{1,128}$/.test(value) },
    ActivityPubOASIS: { key: 'MastodonStatusId', maximumKeys: 40, accepts: value => /^[0-9]{1,128}$/.test(value) },
    SolanaOASIS: { key: 'SolanaAccountAddress', accepts: value => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) },
    EthereumOASIS: { key: 'EthereumAccountAddress', accepts: value => evmAddress.test(value) },
    PolygonOASIS: { key: 'PolygonAccountAddress', accepts: value => evmAddress.test(value) },
    ArbitrumOASIS: { key: 'ArbitrumAccountAddress', accepts: value => evmAddress.test(value) },
    NEAROASIS: { key: 'NearAccountId', accepts: value => value.length >= 2 && value.length <= 64 &&
      /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value) },
    EOSIOOASIS: { key: 'EOSIOAccountName', accepts: value =>
      /^[a-z1-5.]{1,12}(?:[a-j1-5.])?$/.test(value) && !value.endsWith('.') }
  };
  const fields = { id: ['Id', 'Guid'], name: ['Name', 'String'],
    description: ['Description', 'String'], version: ['Version', 'Integer'],
    isactive: ['IsActive', 'Boolean'] };
  const comparisons = { '=': 'Equal', '<>': 'NotEqual', '!=': 'NotEqual',
    '<': 'LessThan', '<=': 'LessThanOrEqual', '>': 'GreaterThan',
    '>=': 'GreaterThanOrEqual', CONTAINS: 'Contains',
    STARTSWITH: 'StartsWith', ENDSWITH: 'EndsWith' };

  function compile(text) {
    if (typeof text !== 'string' || text.length > 4096) throw new Error('Enter a query of up to 4,096 characters.');
    const lexer = /\s+|'(?:[^']|'')*'|[A-Za-z_][A-Za-z_0-9]*|-?\d+|<=|>=|<>|!=|[(),.*=<>;]/gy;
    const tokens = [];
    while (lexer.lastIndex < text.length) {
      const position = lexer.lastIndex;
      const match = lexer.exec(text);
      if (!match) throw new Error('Unexpected character at position ' + (position + 1) + '.');
      if (match[0].trim()) tokens.push(match[0]);
    }
    let index = 0;
    const peek = () => tokens[index]?.toUpperCase();
    function accept(token) {
      if (peek() !== token) return false;
      index++;
      return true;
    }
    function expect(token) {
      if (!accept(token)) throw new Error('Expected ' + token + ' near token ' + (index + 1) + '.');
    }
    function integer(token, minimum, maximum) {
      const value = Number(token);
      if (!/^-?\d+$/.test(token) || !Number.isInteger(value) || value < minimum || value > maximum)
        throw new Error('Expected an integer from ' + minimum + ' to ' + maximum + '.');
      return value;
    }
    function filter() {
      const name = tokens[index++]?.toLowerCase();
      let selector, scalar;
      if (name === 'metadata') {
        const metadataPath = [];
        do {
          expect('.');
          const key = tokens[index++];
          if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key ?? '') || key.length > 64)
            throw new Error('Expected a metadata path segment of up to 64 characters.');
          metadataPath.push(key);
          if (metadataPath.length > 4) throw new Error('Use at most four metadata path segments.');
        } while (peek() === '.');
        selector = { metadataPath };
        if (accept('IS')) {
          if (accept('NULL')) return { ...selector, operator: 'IsNull' };
          expect('PRESENT');
          return { ...selector, operator: 'Exists' };
        }
        scalar = 'String';
      } else {
        if (!Object.hasOwn(fields, name)) throw new Error('Unknown filter field.');
        const [field, type] = fields[name];
        selector = { field };
        scalar = type;
      }
      function literal() {
        const token = tokens[index++];
        if (scalar === 'Integer') return integer(token, -2147483648, 2147483647);
        if (scalar === 'Boolean' && /^(true|false)$/i.test(token)) return token.toLowerCase() === 'true';
        if (scalar !== 'Boolean' && token?.startsWith("'")) return token.slice(1, -1).replace(/''/g, "'");
        throw new Error('Expected a ' + scalar + ' literal.');
      }
      if (accept('IN')) {
        expect('(');
        const value = [literal()];
        while (accept(',')) value.push(literal());
        expect(')');
        if (value.length > 100) throw new Error('IN accepts up to 100 values.');
        return { ...selector, scalar, operator: 'In', value };
      }
      const comparison = tokens[index++]?.toUpperCase();
      const operator = Object.hasOwn(comparisons, comparison) ? comparisons[comparison] : null;
      if (!operator) throw new Error('Expected a supported comparison.');
      if (['Contains', 'StartsWith', 'EndsWith'].includes(operator) && scalar !== 'String')
        throw new Error('Text matching requires a string field.');
      return { ...selector, scalar, operator, value: literal() };
    }

    expect('SELECT');
    const count = accept('COUNT');
    if (count) expect('(');
    expect('*');
    if (count) expect(')');
    expect('FROM');
    const selected = [];
    do {
      const provider = providers.find(value => value.toUpperCase() === peek());
      if (!provider || selected.includes(provider)) throw new Error('Choose distinct providers from: ' + providers.join(', '));
      selected.push(provider);
      index++;
    } while (accept(','));
    if (count && selected.length > 1) throw new Error('COUNT requires a single provider.');
    const [provider] = selected;
    const holo = selected.includes('HoloOASIS');
    const accountProviders = selected.filter(provider => Object.hasOwn(accountProfiles, provider));
    const body = { provider, filters: [], orderBy: holo || accountProviders.length ? 'None' : 'Name', skip: 0 };
    if (!count) Object.assign(body, { take: 10, includeMetadata: true });
    function predicates(target, allowChildren) {
      do {
        if (accept('(')) {
          if (target.anyOf) throw new Error('Use one parenthesized OR group per scope.');
          target.anyOf = [filter()];
          while (accept('OR')) target.anyOf.push(filter());
          expect(')');
        } else if (allowChildren && accept('EXISTS')) {
          const descendant = accept('DESCENDANT');
          if (!descendant) expect('CHILD');
          expect('(');
          const relationship = { filters: [] };
          predicates(relationship, false);
          expect(')');
          if (descendant) {
            Object.assign(relationship, { maximumDepth: 8, maximumNodes: 1000 });
            (target.anyDescendants ??= []).push(relationship);
          } else {
            (target.anyChildren ??= []).push(relationship);
          }
        } else {
          const predicate = filter();
          if (!allowChildren && !target.filters.length && !target.anyOf && accept('OR')) {
            target.anyOf = [predicate, filter()];
            while (accept('OR')) target.anyOf.push(filter());
            break;
          }
          target.filters.push(predicate);
        }
      } while (accept('AND'));
    }
    if (accept('WHERE')) predicates(body, true);
    if (!count && accept('ORDER')) {
      expect('BY');
      const field = fields[tokens[index++]?.toLowerCase()]?.[0];
      if (!['Name', 'Version', 'Id'].includes(field)) throw new Error('Order by Name, Version, or Id.');
      body.orderBy = field;
      if (accept('DESC')) body.descending = true;
      else accept('ASC');
    }
    if (!count && accept('LIMIT')) body.take = integer(tokens[index++], 1, 100);
    if (!count && accept('OFFSET')) body.skip = integer(tokens[index++], 0, 1000);
    accept(';');
    if (index !== tokens.length) throw new Error('Unexpected clause near token ' + (index + 1) + '.');
    const relationships = [...(body.anyChildren ?? []), ...(body.anyDescendants ?? [])];
    if (relationships.length > 4) throw new Error('Use at most four relationship predicates.');
    const filterCount = [body, ...relationships].reduce(
      (total, scope) => total + scope.filters.length + (scope.anyOf?.length ?? 0), 0);
    if (filterCount > 12) throw new Error('Use at most twelve filters across the query.');
    if (holo && (count || body.orderBy !== 'None' || relationships.length ||
        [...body.filters, ...(body.anyOf ?? [])].some(item =>
          item.field !== 'Id' || !['Equal', 'In'].includes(item.operator)))) {
      throw new Error('HoloOASIS supports row queries with Id equality or IN filters, LIMIT, and OFFSET.');
    }
    for (const accountProvider of accountProviders) {
      const { key, accepts, maximumKeys = 8 } = accountProfiles[accountProvider];
      const invalidFilter = [...body.filters, ...(body.anyOf ?? [])].some(filter => {
        if (filter.metadataPath?.length !== 1 || filter.metadataPath[0] !== key ||
            !['Equal', 'In'].includes(filter.operator)) return true;
        const values = Array.isArray(filter.value) ? filter.value : [filter.value];
        return values.length > maximumKeys || values.some(value => !accepts(value));
      });
      if (count || body.orderBy !== 'None' || relationships.length || invalidFilter) {
        throw new Error(accountProvider + ' supports row queries with ' + key +
          ' equality or IN (up to ' + maximumKeys + ' keys), LIMIT, and OFFSET.');
      }
    }
    if (count) body.operation = 'LongCount';
    if (selected.length > 1) {
      const { provider: _, skip, take, ...source } = body;
      return { path: 'data/query-cql/federation', body: {
        scope: 'Named', providers: selected, source: { ...source, skip: 0, take: 100 },
        identityMode: 'PreserveCopies', skip, take, maximumInputRows: 300, maximumRowsPerProvider: 100,
        maximumInputBytes: 4194304, maximumOutputBytes: 1048576, maximumWork: 100000,
        maximumProviderAttempts: selected.length, maximumDurationMilliseconds: 5000
      } };
    }
    return { path: count ? 'data/query-cql/scalar' : 'data/query-cql', body };
  }

  function publicExample(provider, request) {
    const expectedKey = accountProfiles[provider]?.key;
    const [filter] = request?.filters ?? [];
    if (request?.provider !== provider || request.filters?.length !== 1 || filter?.operator !== 'In' ||
        !Array.isArray(filter.value) || !filter.value.length || request.orderBy !== 'None' ||
        request.anyOf?.length || request.anyChildren?.length || request.anyDescendants?.length || request.graph)
      return null;
    const field = provider === 'HoloOASIS' && filter.field === 'Id' && filter.scalar === 'Guid' ? 'Id'
      : expectedKey && filter.metadataPath?.length === 1 && filter.metadataPath[0] === expectedKey &&
        filter.scalar === 'String' ? 'metadata.' + expectedKey : null;
    if (!field || filter.value.some(key => typeof key !== 'string') ||
        !Number.isInteger(request.take) || request.take < 1 || request.take > 100 || request.skip)
      return null;
    const keys = filter.value.map(key => "'" + key.replace(/'/g, "''") + "'").join(', ');
    const text = `SELECT * FROM ${provider} WHERE ${field} IN (${keys}) LIMIT ${request.take}`;
    compile(text);
    return text;
  }

  const api = { compile, publicExample };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CqlText = api;
})(globalThis);
