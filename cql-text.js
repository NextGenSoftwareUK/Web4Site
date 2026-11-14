/* SQL-like sandbox syntax compiled to the existing typed WEB4 request. */
(function (root) {
  'use strict';

  const providers = ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS', 'HoloOASIS', 'SolanaOASIS', 'EthereumOASIS', 'PolygonOASIS', 'ArbitrumOASIS', 'NEAROASIS', 'EOSIOOASIS', 'SOLIDOASIS', 'IPFSOASIS', 'ActivityPubOASIS', 'CosmosBlockChainOASIS', 'PolkadotOASIS', 'TONOASIS', 'HashgraphOASIS', 'TRONOASIS'];
  const evmAddress = /^0x[0-9a-fA-F]{40}$/;
  const accountProfiles = {
    TRONOASIS: { key: 'TronBlockHeight', accepts: value =>
      /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n },
    HashgraphOASIS: { key: 'HederaAccountId', accepts: value =>
      /^(?:0|[1-9][0-9]{0,19})\.(?:0|[1-9][0-9]{0,19})\.[1-9][0-9]{0,19}$/.test(value) &&
      value.split('.').every(part => BigInt(part) <= 18446744073709551615n) },
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
    parentholonid: ['ParentHolonId', 'Guid'], description: ['Description', 'String'], version: ['Version', 'Integer'],
    isactive: ['IsActive', 'Boolean'] };
  const comparisons = { '=': 'Equal', '<>': 'NotEqual', '!=': 'NotEqual',
    '<': 'LessThan', '<=': 'LessThanOrEqual', '>': 'GreaterThan',
    '>=': 'GreaterThanOrEqual', CONTAINS: 'Contains',
    STARTSWITH: 'StartsWith', ENDSWITH: 'EndsWith' };

  function compile(text) {
    if (typeof text !== 'string' || text.length > 4096) throw new Error('Enter a query of up to 4,096 characters.');
    const lexer = /\s+|'(?:[^']|'')*'|[A-Za-z_][A-Za-z_0-9]*|-?\d+(?:\.\d+)?|<=|>=|<>|!=|[(),.*=<>;]/gy;
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
    function exactDecimal(token) {
      const match = /^(-?)(0|[1-9]\d*)(?:\.(\d{1,28}))?$/.exec(token ?? '');
      if (!match || token.length > 31) throw new Error('Expected an exact decimal literal.');
      const [, sign, whole, fraction = ''] = match;
      const coefficient = BigInt(whole + fraction);
      if (coefficient > 79228162514264337593543950335n || (sign && coefficient === 0n))
        throw new Error('Expected an exact decimal literal.');
      return token;
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
        if (accept('AS')) {
          if (accept('BOOLEAN')) scalar = 'Boolean';
          else if (accept('DECIMAL')) scalar = 'Decimal';
          else if (accept('DATETIME')) scalar = 'DateTime';
          else {
            expect('UINT64');
            scalar = 'UInt64';
          }
        }
      } else {
        if (!Object.hasOwn(fields, name)) throw new Error('Unknown filter field.');
        const [field, type] = fields[name];
        selector = { field };
        scalar = type;
      }
      function literal() {
        const token = tokens[index++];
        if (scalar === 'Integer') return integer(token, -2147483648, 2147483647);
        if (scalar === 'DateTime') {
          const match = /^'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,7})?Z'$/.exec(token ?? '');
          const utcSeconds = match && new Date(match[1] + 'Z');
          if (!utcSeconds || match[1].startsWith('0000') || !Number.isFinite(utcSeconds.getTime())
              || utcSeconds.toISOString().slice(0, 19) !== match[1])
            throw new Error('Expected a quoted UTC timestamp with up to seven fractional digits.');
          return token.slice(1, -1);
        }
        if (scalar === 'Decimal') {
          return exactDecimal(token);
        }
        if (scalar === 'UInt64') {
          if (!/^[0-9]{1,20}$/.test(token ?? '') || BigInt(token) > 18446744073709551615n)
            throw new Error('Expected an unsigned 64-bit integer.');
          return token;
        }
        if (scalar === 'Boolean' && /^(true|false)$/i.test(token)) return token.toLowerCase() === 'true';
        if (scalar === 'Guid') {
          const value = token?.slice(1, -1);
          if (!token?.startsWith("'") || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))
            throw new Error('Expected a quoted GUID for the selected field.');
          return value;
        }
        if (scalar === 'String' && token?.startsWith("'")) {
          const value = token.slice(1, -1).replace(/''/g, "'");
          if (value.length > 512) throw new Error('String literals may contain up to 512 characters.');
          return value;
        }
        throw new Error('Expected a ' + scalar + ' literal.');
      }
      if (accept('LIKE')) {
        if (scalar !== 'String') throw new Error('LIKE requires a string field.');
        const pattern = literal();
        const escape = accept('ESCAPE') ? literal() : null;
        if (escape !== null && ([...escape].length !== 1 || '%_'.includes(escape)))
          throw new Error('LIKE ESCAPE requires one character other than % or _.');
        const units = [];
        const characters = [...pattern];
        for (let offset = 0; offset < characters.length; offset++) {
          const character = characters[offset];
          if (character === escape) {
            const escaped = characters[++offset];
            if (escaped !== escape && escaped !== '%' && escaped !== '_')
              throw new Error('LIKE ESCAPE must precede %, _ or the escape character.');
            units.push(escaped);
          } else if (character === '%') {
            units.push(null);
          } else if (character === '_') {
            throw new Error('LIKE requires escaping a literal underscore.');
          } else {
            units.push(character);
          }
        }
        const leading = units[0] === null;
        const trailing = units[units.length - 1] === null;
        const inner = units.slice(leading ? 1 : 0, trailing ? -1 : undefined);
        if (!inner.length || inner.includes(null))
          throw new Error('LIKE supports nonempty text with optional % at either end.');
        const value = inner.join('');
        let operator = 'Equal';
        if (leading && trailing) operator = 'Contains';
        else if (leading) operator = 'EndsWith';
        else if (trailing) operator = 'StartsWith';
        return { ...selector, scalar, operator, value };
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
      if (!['Integer', 'UInt64', 'Decimal', 'DateTime'].includes(scalar) && ['<', '<=', '>', '>='].includes(comparison))
        throw new Error('Ordered comparisons require Version or metadata typed AS UINT64, AS DECIMAL, or AS DATETIME.');
      if (['Contains', 'StartsWith', 'EndsWith'].includes(operator) && scalar !== 'String')
        throw new Error('Text matching requires a string field.');
      return { ...selector, scalar, operator, value: literal() };
    }

    expect('SELECT');
    const aggregates = { COUNT: 'LongCount', ANY: 'Any', MIN: 'Min', MAX: 'Max', SUM: 'Sum', AVG: 'Average' };
    const startsWithAliasedAggregate = peek() !== 'ANY' && tokens[index + 4]?.toUpperCase() === 'AS';
    const operation = !startsWithAliasedAggregate && Object.hasOwn(aggregates, peek())
      ? aggregates[tokens[index++].toUpperCase()] : null;
    if (operation) expect('(');
    const hasSelection = operation && operation !== 'LongCount' && operation !== 'Any';
    if (hasSelection) expect('VERSION');
    else if (operation) expect('*');
    const columns = [];
    const groupedAggregates = [];
    if (!operation && !accept('*')) {
      do {
        if (peek() !== 'ANY' && Object.hasOwn(aggregates, peek())) {
          const aggregate = aggregates[tokens[index++].toUpperCase()];
          expect('(');
          const isCount = aggregate === 'LongCount';
          expect(isCount ? '*' : 'VERSION');
          expect(')');
          expect('AS');
          const alias = tokens[index++];
          if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(alias ?? ''))
            throw new Error('Expected a column alias for the grouped aggregate.');
          const binding = { alias, operation: aggregate };
          if (!isCount) binding.selection = { field: 'Version' };
          groupedAggregates.push({ index: columns.length + groupedAggregates.length, binding });
          continue;
        }
        const name = tokens[index++]?.toLowerCase();
        if (!Object.hasOwn(fields, name)) throw new Error('Unknown selected field.');
        const [field] = fields[name];
        const alias = accept('AS') ? tokens[index++] : field;
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(alias ?? ''))
          throw new Error('Expected a column alias of up to 64 letters, digits or underscores, starting with a letter.');
        if (columns.some(column => column.alias.toLowerCase() === alias.toLowerCase()))
          throw new Error('Use a distinct alias for each selected column.');
        columns.push({ field, alias });
      } while (accept(','));
    }
    if (operation) expect(')');
    expect('FROM');
    const selected = [];
    do {
      const provider = providers.find(value => value.toUpperCase() === peek());
      if (!provider || selected.includes(provider)) throw new Error('Choose distinct providers from: ' + providers.join(', '));
      selected.push(provider);
      index++;
    } while (accept(','));
    if ((columns.length || groupedAggregates.length) && (selected.length !== 1 || !['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS'].includes(selected[0])))
      throw new Error('Selected columns require one of MongoDBOASIS, SQLLiteDBOASIS, or Neo4jOASIS.');
    if (operation && selected.length > 1) throw new Error('Scalar queries require a single provider.');
    const [provider] = selected;
    const holo = selected.includes('HoloOASIS');
    const accountProviders = selected.filter(provider => Object.hasOwn(accountProfiles, provider));
    const body = { provider, filters: [], orderBy: holo || accountProviders.length ? 'None' : 'Name', skip: 0 };
    if (!operation) Object.assign(body, { take: 10, includeMetadata: true });
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
    if (groupedAggregates.length) {
      expect('GROUP');
      expect('BY');
      const groupFields = [];
      do {
        const name = tokens[index++]?.toLowerCase();
        if (!Object.hasOwn(fields, name)) throw new Error('Unknown GROUP BY field.');
        groupFields.push(fields[name][0]);
      } while (accept(','));
      if (columns.length !== groupFields.length || new Set(groupFields).size !== groupFields.length ||
          !groupFields.every(field => columns.filter(column => column.field === field).length === 1))
        throw new Error('Select each field that matches GROUP BY once, along with an aggregate.');
      const keys = groupFields.map(field => columns.find(column => column.field === field));
      delete body.includeMetadata;
      delete body.take;
      const resultColumns = columns.map(({ alias }) => ({ alias, keyAlias: alias }));
      for (const { index, binding } of groupedAggregates) resultColumns.splice(index, 0, binding);
      if (new Set(resultColumns.map(column => column.alias.toLowerCase())).size !== resultColumns.length)
        throw new Error('Use a distinct alias for each selected column.');
      if (resultColumns.length > 32) throw new Error('Use at most 32 grouped result columns.');
      const grouped = {
        ...body,
        keys,
        columns: resultColumns,
        maximumGroups: 100
      };
      if (accept('HAVING')) {
        grouped.resultFilters = [];
        do {
          const aggregate = groupedAggregates.find(({ binding }) => binding.alias.toUpperCase() === peek());
          if (!aggregate) throw new Error('HAVING must name a selected aggregate alias.');
          index++;
          const comparison = tokens[index++];
          const token = tokens[index++];
          if (!['=', '<>', '!=', '<', '<=', '>', '>='].includes(comparison))
            throw new Error('HAVING requires a numeric comparison.');
          let value = token;
          if (aggregate.binding.operation === 'LongCount') {
            if (!/^(0|[1-9][0-9]{0,18})$/.test(token ?? '') || BigInt(token) > 9223372036854775807n)
              throw new Error('HAVING requires a comparison to a nonnegative 64-bit count.');
          } else if (aggregate.binding.operation === 'Average') {
            value = exactDecimal(token);
          } else {
            value = integer(token, -2147483648, 2147483647);
          }
          grouped.resultFilters.push({ alias: aggregate.binding.alias, operator: comparisons[comparison], value });
          if (grouped.resultFilters.length > 32) throw new Error('Use at most 32 HAVING comparisons.');
        } while (accept('AND'));
      }
      if (accept('ORDER')) {
        expect('BY');
        grouped.resultOrder = [];
        do {
          const alias = resultColumns.find(column => column.alias.toUpperCase() === peek())?.alias;
          if (!alias) throw new Error('Order grouped results by a selected column alias.');
          if (grouped.resultOrder.some(item => item.alias === alias))
            throw new Error('Use each grouped ordering alias only once.');
          index++;
          const descending = accept('DESC');
          if (!descending) accept('ASC');
          grouped.resultOrder.push({ alias, descending });
        } while (accept(','));
      }
      if (accept('LIMIT')) grouped.resultTake = integer(tokens[index++], 1, 100);
      if (accept('OFFSET')) {
        if (!grouped.resultOrder) throw new Error('Use ORDER BY before paging grouped results.');
        grouped.resultSkip = integer(tokens[index++], 0, 100);
      }
      accept(';');
      if (index !== tokens.length) throw new Error('Unexpected grouped query clause.');
      const filterCount = body.filters.length + (body.anyOf?.length ?? 0);
      if (body.anyChildren || body.anyDescendants || filterCount > 12)
        throw new Error('Grouped queries support up to twelve filters on the source records.');
      return { path: 'data/query-cql/grouped', body: grouped };
    }
    if (!operation && accept('ORDER')) {
      expect('BY');
      const field = fields[tokens[index++]?.toLowerCase()]?.[0];
      if (!['Name', 'Version', 'Id'].includes(field)) throw new Error('Order by Name, Version, or Id.');
      body.orderBy = field;
      if (accept('DESC')) body.descending = true;
      else accept('ASC');
    }
    if (!operation && accept('LIMIT')) body.take = integer(tokens[index++], 1, 100);
    if (!operation && accept('OFFSET')) body.skip = integer(tokens[index++], 0, 1000);
    if (accept('TIMEOUT')) {
      if (columns.length) throw new Error('Selected columns use the server timeout.');
      if (operation) throw new Error('TIMEOUT applies to row queries. Scalar queries use the server timeout.');
      body.maximumDurationMilliseconds = integer(tokens[index++], 1, 30000);
    }
    accept(';');
    if (index !== tokens.length) throw new Error('Unexpected clause near token ' + (index + 1) + '.');
    const relationships = [...(body.anyChildren ?? []), ...(body.anyDescendants ?? [])];
    if (relationships.length > 4) throw new Error('Use at most four relationship predicates.');
    const filterCount = [body, ...relationships].reduce(
      (total, scope) => total + scope.filters.length + (scope.anyOf?.length ?? 0), 0);
    if (filterCount > 12) throw new Error('Use at most twelve filters across the query.');
    if (holo && (operation || body.orderBy !== 'None' || relationships.length ||
        [...body.filters, ...(body.anyOf ?? [])].some(item =>
          item.field !== 'Id' || !['Equal', 'In'].includes(item.operator)))) {
      throw new Error('HoloOASIS supports row queries with Id equality or IN filters, LIMIT, and OFFSET.');
    }
    for (const accountProvider of accountProviders) {
      const { key, accepts, maximumKeys = 8 } = accountProfiles[accountProvider];
      const invalidFilter = [...body.filters, ...(body.anyOf ?? [])].some(filter => {
        if (filter.scalar !== 'String' || filter.metadataPath?.length !== 1 || filter.metadataPath[0] !== key ||
            !['Equal', 'In'].includes(filter.operator)) return true;
        const values = Array.isArray(filter.value) ? filter.value : [filter.value];
        return values.length > maximumKeys || values.some(value => !accepts(value));
      });
      if (operation || body.orderBy !== 'None' || relationships.length || invalidFilter) {
        throw new Error(accountProvider + ' supports row queries with ' + key +
          ' equality or IN (up to ' + maximumKeys + ' keys), LIMIT, and OFFSET.');
      }
    }
    if (columns.length) {
      delete body.includeMetadata;
      return { path: 'data/query-cql/projection', body: { ...body, columns } };
    }
    if (operation) body.operation = operation;
    if (hasSelection) body.selection = { field: 'Version' };
    if (selected.length > 1) {
      const { provider: _, skip, take, maximumDurationMilliseconds, ...source } = body;
      return { path: 'data/query-cql/federation', body: {
        scope: 'Named', providers: selected, source: { ...source, skip: 0, take: 100 },
        identityMode: 'PreserveCopies', skip, take, maximumInputRows: 300, maximumRowsPerProvider: 100,
        maximumInputBytes: 4194304, maximumOutputBytes: 1048576, maximumWork: 100000,
        maximumProviderAttempts: selected.length, maximumDurationMilliseconds: maximumDurationMilliseconds ?? 5000
      } };
    }
    return { path: operation ? 'data/query-cql/scalar' : 'data/query-cql', body };
  }

  function publicExample(provider, request) {
    const expectedKey = accountProfiles[provider]?.key;
    const [filter] = request?.filters ?? [];
    if (request?.provider !== provider || request.filters?.length !== 1 || filter?.operator !== 'In' ||
        !Array.isArray(filter.value) || !filter.value.length || request.orderBy !== 'None' ||
        request.descending || request.includeMetadata !== true ||
        request.anyOf?.length || request.anyChildren?.length || request.anyDescendants?.length || request.graph)
      return null;
    const field = provider === 'HoloOASIS' && filter.field === 'Id' && filter.scalar === 'Guid' ? 'Id'
      : expectedKey && filter.metadataPath?.length === 1 && filter.metadataPath[0] === expectedKey &&
        filter.scalar === 'String' ? 'metadata.' + expectedKey : null;
    if (!field || filter.value.some(key => typeof key !== 'string') ||
        !Number.isInteger(request.take) || request.take < 1 || request.take > 100 || request.skip)
      return null;
    const keys = filter.value.map(key => "'" + key.replace(/'/g, "''") + "'").join(', ');
    const text = `SELECT * FROM ${provider} WHERE ${field} IN (${keys}) LIMIT ${request.take}${request.maximumDurationMilliseconds ? ' TIMEOUT ' + request.maximumDurationMilliseconds : ''}`;
    compile(text);
    return text;
  }

  const api = { compile, publicExample };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CqlText = api;
})(globalThis);
