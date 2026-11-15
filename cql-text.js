/* SQL-like sandbox syntax compiled to the existing typed WEB4 request. */
(function (root) {
  'use strict';

  const providers = ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS', 'HoloOASIS', 'SolanaOASIS', 'EthereumOASIS', 'PolygonOASIS', 'ArbitrumOASIS', 'NEAROASIS', 'EOSIOOASIS', 'SOLIDOASIS', 'IPFSOASIS', 'ActivityPubOASIS', 'CosmosBlockChainOASIS', 'PolkadotOASIS', 'TONOASIS', 'HashgraphOASIS', 'TRONOASIS', 'NostrOASIS', 'AxelarOASIS', 'BitcoinOASIS', 'XRPLOASIS', 'StellarOASIS', 'CardanoOASIS', 'BNBChainOASIS', 'AvalancheOASIS', 'BaseOASIS', 'OptimismOASIS', 'SuiOASIS', 'AptosOASIS', 'StarknetOASIS', 'FantomOASIS', 'AlgorandOASIS', 'FilecoinOASIS', 'ZcashOASIS', 'RadixOASIS'];
  const evmAddress = /^0x[0-9a-fA-F]{40}$/;
  const lowercaseHex32 = /^0x[0-9a-f]{64}$/;
  const starknetFieldPrime = (1n << 251n) + 17n * (1n << 192n) + 1n;
  const accountProfiles = {
    AlgorandOASIS: { key: 'AlgorandAddress', requiresSingleKeyFilter: true, accepts: value => /^[A-Z2-7]{58}$/.test(value) },
    FilecoinOASIS: { key: 'FilecoinAccountAddress', requiresSingleKeyFilter: true, accepts: value => evmAddress.test(value) },
    ZcashOASIS: { key: 'ZcashBlockHash', requiresSingleKeyFilter: true, accepts: value => /^[0-9a-f]{64}$/.test(value) },
    RadixOASIS: { key: 'RadixResourceAddress', requiresSingleKeyFilter: true, accepts: value =>
      /^resource_rdx1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{54}$/.test(value) },
    SuiOASIS: { key: 'SuiObjectId', requiresSingleKeyFilter: true, accepts: value => lowercaseHex32.test(value) },
    AptosOASIS: { key: 'AptosAccountAddress', requiresSingleKeyFilter: true, accepts: value => lowercaseHex32.test(value) },
    StarknetOASIS: { key: 'StarknetBlockHash', requiresSingleKeyFilter: true, accepts: value =>
      /^0x(?:0|[1-9a-f][0-9a-f]{0,62})$/.test(value) && BigInt(value) < starknetFieldPrime },
    FantomOASIS: { key: 'FantomAccountAddress', requiresSingleKeyFilter: true, accepts: value => evmAddress.test(value) },
    BitcoinOASIS: { key: 'BitcoinBlockHash', requiresSingleKeyFilter: true, accepts: value => /^[0-9a-f]{64}$/.test(value) },
    XRPLOASIS: { key: 'XRPLLedgerHash', requiresSingleKeyFilter: true, accepts: value => /^[0-9A-F]{64}$/.test(value) },
    StellarOASIS: { key: 'StellarLedgerSequence', requiresSingleKeyFilter: true, accepts: value =>
      /^[1-9][0-9]{0,9}$/.test(value) && BigInt(value) <= 4294967295n },
    CardanoOASIS: { key: 'CardanoBlockHash', requiresSingleKeyFilter: true, accepts: value => /^[0-9a-f]{64}$/.test(value) },
    BNBChainOASIS: { key: 'BNBChainAccountAddress', requiresSingleKeyFilter: true, accepts: value => evmAddress.test(value) },
    AvalancheOASIS: { key: 'AvalancheAccountAddress', requiresSingleKeyFilter: true, accepts: value => evmAddress.test(value) },
    BaseOASIS: { key: 'BaseAccountAddress', requiresSingleKeyFilter: true, accepts: value => evmAddress.test(value) },
    OptimismOASIS: { key: 'OptimismAccountAddress', requiresSingleKeyFilter: true, accepts: value => evmAddress.test(value) },
    NostrOASIS: { key: 'NostrEventId', accepts: value => /^[0-9a-f]{64}$/.test(value) },
    TRONOASIS: { key: 'TronBlockHeight', accepts: value =>
      /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n },
    AxelarOASIS: { key: 'AxelarBlockHeight', requiresSingleKeyFilter: true, accepts: value =>
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

  function discoverKeyProfiles(sources) {
    const profiles = Object.create(null);
    for (const source of sources) {
      const { provider, textKeyProfile } = source;
      if (!source.available || !source.queryOnly || !textKeyProfile || providers.includes(provider) ||
          !/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(provider) || ['Default', 'None'].includes(provider)) continue;
      const { metadataKey, maximumKeyCharacters, maximumSetKeys } = textKeyProfile;
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(metadataKey ?? '') ||
          !Number.isInteger(maximumKeyCharacters) || maximumKeyCharacters < 1 || maximumKeyCharacters > 512 ||
          !Number.isInteger(maximumSetKeys) || maximumSetKeys < 0 || maximumSetKeys > 40) continue;
      profiles[provider] = {
        key: metadataKey, maximumKeys: maximumSetKeys, requiresSingleKeyFilter: true,
        accepts: value => value.length <= maximumKeyCharacters && /^[!-~]+$/.test(value)
      };
    }
    return profiles;
  }

  function compile(text, discoveredProfiles = {}) {
    const keyProfiles = { ...discoveredProfiles, ...accountProfiles };
    const selectableProviders = [...providers, ...Object.keys(discoveredProfiles)];
    if (typeof text !== 'string' || text.length > 4096) throw new Error('Enter a query of up to 4,096 characters.');
    const lexer = /\s+|--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|[A-Za-z_][A-Za-z_0-9]*|-?\d+(?:\.\d+)?|<=|>=|<>|!=|[(),.*=<>;]/gy;
    const tokens = [];
    while (lexer.lastIndex < text.length) {
      const position = lexer.lastIndex;
      const match = lexer.exec(text);
      if (!match) throw new Error('Unexpected character at position ' + (position + 1) + '.');
      const token = match[0];
      if (token.trim() && !token.startsWith('--') && !token.startsWith('/*')) tokens.push(token);
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
    function readMetadataPath() {
      const path = [];
      do {
        expect('.');
        const key = tokens[index++];
        if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key ?? '') || key.length > 64)
          throw new Error('Expected a metadata path segment of up to 64 characters.');
        path.push(key);
        if (path.length > 4) throw new Error('Use at most four metadata path segments.');
      } while (peek() === '.');
      return path;
    }
    function filter(allowRange = false) {
      const name = tokens[index++]?.toLowerCase();
      let selector, scalar;
      if (name === 'metadata') {
        selector = { metadataPath: readMetadataPath() };
        if (accept('IS')) {
          if (accept('NULL')) return { ...selector, operator: 'IsNull' };
          if (accept('MISSING')) return { ...selector, operator: 'IsMissing' };
          if (accept('NOT')) {
            expect('NULL');
            return { ...selector, operator: 'IsNotNull' };
          }
          expect('PRESENT');
          return { ...selector, operator: 'Exists' };
        }
        scalar = 'String';
        if (accept('AS')) {
          if (accept('INT64')) scalar = 'Integer';
          else if (accept('BOOLEAN')) scalar = 'Boolean';
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
        if (scalar === 'Integer') {
            if (!selector.metadataPath) return integer(token, -2147483648, 2147483647);
            if (!/^(?:0|-?[1-9][0-9]{0,18})$/.test(token ?? '') ||
                BigInt(token) < -9223372036854775808n || BigInt(token) > 9223372036854775807n)
              throw new Error('Expected a signed 64-bit integer.');
            return token;
          }
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
      if (accept('BETWEEN')) {
        if (!allowRange) throw new Error('BETWEEN needs an AND clause outside OR alternatives.');
        if (!['Integer', 'Decimal', 'UInt64', 'DateTime'].includes(scalar))
          throw new Error('BETWEEN requires a numeric or UTC timestamp field.');
        const lower = literal();
        expect('AND');
        const upper = literal();
        return [
          { ...selector, scalar, operator: 'GreaterThanOrEqual', value: lower },
          { ...selector, scalar, operator: 'LessThanOrEqual', value: upper }
        ];
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
        throw new Error('Ordered comparisons require Version or metadata typed AS INT64, AS UINT64, AS DECIMAL, or AS DATETIME.');
      if (['Contains', 'StartsWith', 'EndsWith'].includes(operator) && scalar !== 'String')
        throw new Error('Text matching requires a string field.');
      return { ...selector, scalar, operator, value: literal() };
    }

    function readJoin() {
      const identifier = label => {
        const value = tokens[index++];
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value ?? ''))
          throw new Error('Expected a ' + label + ' alias.');
        return value;
      };
      const qualifiedField = () => {
        const cast = accept('CAST');
        if (cast) expect('(');
        const source = identifier('source').toLowerCase();
        expect('.');
        if (cast) return { source, selection: readMetadataCast() };
        const name = tokens[index++]?.toLowerCase();
        if (!Object.hasOwn(fields, name)) throw new Error('Unknown qualified join field.');
        return { source, selection: { field: fields[name][0] } };
      };
      const source = () => {
        expect('(');
        expect('SELECT');
        expect('*');
        expect('FROM');
        const provider = ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS'].find(name => name.toUpperCase() === peek());
        if (!provider) throw new Error('Join sources require MongoDBOASIS, SQLLiteDBOASIS, or Neo4jOASIS.');
        index++;
        const filters = [];
        if (accept('WHERE')) {
          do {
            filters.push(...[].concat(filter(true)));
          } while (accept('AND'));
        }
        const body = { filters, orderBy: 'Id' };
        if (accept('ORDER')) {
          expect('BY');
          const field = fields[tokens[index++]?.toLowerCase()]?.[0];
          if (!['Id', 'Name', 'Version'].includes(field)) throw new Error('Order join inputs by Id, Name, or Version.');
          body.orderBy = field;
          if (accept('DESC')) body.descending = true;
          else accept('ASC');
        }
        expect('LIMIT');
        body.take = integer(tokens[index++], 1, 10);
        expect(')');
        accept('AS');
        return { alias: identifier('source').toLowerCase(), provider, body };
      };

      const fieldsToSelect = [];
      do {
        const field = qualifiedField();
        const alias = accept('AS') ? identifier('column') : field.selection.field;
        if (!alias) throw new Error('Use AS to name a joined metadata column.');
        fieldsToSelect.push({ ...field, alias });
      } while (accept(','));
      if (fieldsToSelect.length > 32 || new Set(fieldsToSelect.map(field => field.alias.toLowerCase())).size !== fieldsToSelect.length)
        throw new Error('Use up to 32 distinct joined column aliases.');
      expect('FROM');
      const left = source();
      const leftJoin = accept('LEFT');
      if (leftJoin) accept('OUTER');
      else accept('INNER');
      expect('JOIN');
      const right = source();
      if (left.alias === right.alias || left.provider !== right.provider)
        throw new Error('Use two different aliases for one join provider.');
      const sourceSide = alias => {
        if (alias === left.alias) return 'Left';
        if (alias === right.alias) return 'Right';
        throw new Error('Unknown join source alias.');
      };
      expect('ON');
      const keys = [];
      do {
        const first = qualifiedField();
        expect('=');
        const second = qualifiedField();
        const one = sourceSide(first.source);
        if (one === sourceSide(second.source)) throw new Error('Join keys must compare both sources.');
        const [l, r] = one === 'Left' ? [first, second] : [second, first];
        if (keys.some(key => selectionKey(key.left) === selectionKey(l.selection) &&
            selectionKey(key.right) === selectionKey(r.selection)))
          throw new Error('Use each join key pair once.');
        keys.push({ alias: 'Key' + (keys.length + 1), left: l.selection, right: r.selection });
      } while (accept('AND'));
      accept(';');
      if (index !== tokens.length) throw new Error('Unexpected join clause.');
      if (keys.length > 8 || left.body.filters.length + right.body.filters.length > 12)
        throw new Error('Use up to eight join keys and twelve input filters.');
      const columns = fieldsToSelect.map(field => {
        const side = sourceSide(field.source);
        const column = { alias: field.alias, source: side, selection: field.selection };
        if (leftJoin && side === 'Right') column.allowMissing = true;
        return column;
      });
      const maximumPairs = left.body.take * right.body.take;
      return { path: 'data/query-cql/join', body: {
        provider: left.provider, kind: leftJoin ? 'Left' : 'Inner',
        left: left.body, right: right.body, keys, columns,
        maximumLeftRows: left.body.take, maximumRightRows: right.body.take, maximumPairs, maximumResults: maximumPairs
      } };
    }

    expect('SELECT');
    if (tokens.some((token, position) => token.toUpperCase() === 'FROM' && tokens[position + 1] === '('))
      return readJoin();
    const distinct = accept('DISTINCT');
    const aggregates = { COUNT: 'LongCount', ANY: 'Any', MIN: 'Min', MAX: 'Max', SUM: 'Sum', AVG: 'Average' };
    const hasGrouping = tokens.some((token, position) =>
      token.toUpperCase() === 'GROUP' && tokens[position + 1]?.toUpperCase() === 'BY');
    const startsWithGroupedAggregate = peek() !== 'ANY' &&
      (hasGrouping || ['AS', ','].includes(tokens[index + 4]?.toUpperCase()));
    const operation = !startsWithGroupedAggregate && Object.hasOwn(aggregates, peek())
      ? aggregates[tokens[index++].toUpperCase()] : null;
    if (operation) expect('(');
    const hasSelection = operation && operation !== 'LongCount' && operation !== 'Any';
    const scalarSelection = hasSelection ? readAggregateSelection() : null;
    if (operation && !hasSelection && !(operation === 'LongCount' && accept('1'))) expect('*');
    function readSelection() {
      if (!accept('CAST')) {
        const name = tokens[index++]?.toLowerCase();
        if (!Object.hasOwn(fields, name)) throw new Error('Unknown selected field.');
        return { field: fields[name][0] };
      }
      expect('(');
      return readMetadataCast();
    }

    function readMetadataCast() {
      expect('METADATA');
      const metadataPath = readMetadataPath();
      expect('AS');
      const types = { STRING: 'String', BOOLEAN: 'Boolean', INT32: 'Int32', INT64: 'Int64',
        UINT64: 'UInt64', DECIMAL: 'Decimal', GUID: 'Guid', DATETIME: 'DateTime' };
      const type = tokens[index++]?.toUpperCase();
      if (!Object.hasOwn(types, type)) throw new Error('Choose an exact metadata projection type.');
      expect(')');
      return { metadataPath, valueType: types[type], nullable: true };
    }

    function readAggregateSelection() {
      const selection = readSelection();
      if (selection.field !== 'Version' && !['Int32', 'Int64', 'UInt64', 'Decimal'].includes(selection.valueType))
        throw new Error('Aggregate Version or exact numeric metadata using CAST.');
      return selection;
    }
    function selectionKey(column) {
      return column.field ?? [column.valueType, ...column.metadataPath].join('.');
    }
    const columns = [];
    const groupedAggregates = [];
    if (!operation && !accept('*')) {
      do {
        if (peek() !== 'ANY' && Object.hasOwn(aggregates, peek())) {
          const name = tokens[index++].toUpperCase();
          const aggregate = aggregates[name];
          expect('(');
          const isCount = aggregate === 'LongCount';
          const selection = isCount ? null : readAggregateSelection();
          if (isCount && !accept('1')) expect('*');
          expect(')');
          const alias = accept('AS') ? tokens[index++] : name[0] + name.slice(1).toLowerCase();
          if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(alias ?? ''))
            throw new Error('Expected a column alias for the grouped aggregate.');
          const binding = { alias, operation: aggregate };
          if (!isCount) binding.selection = selection;
          groupedAggregates.push({ index: columns.length + groupedAggregates.length, binding });
          continue;
        }
        const selection = readSelection();
        if (selection.metadataPath) expect('AS');
        const alias = selection.metadataPath ? tokens[index++] : accept('AS') ? tokens[index++] : selection.field;
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(alias ?? ''))
          throw new Error('Expected a column alias of up to 64 letters, digits or underscores, starting with a letter.');
        if (columns.some(column => column.alias.toLowerCase() === alias.toLowerCase()))
          throw new Error('Use a distinct alias for each selected column.');
        columns.push({ ...selection, alias });
      } while (accept(','));
    }
    if (operation) expect(')');
    if (distinct && (!columns.length || groupedAggregates.length || new Set(columns.map(selectionKey)).size !== columns.length))
      throw new Error('DISTINCT requires one or more different selected fields without aggregates.');
    expect('FROM');
    const selected = [];
    do {
      const provider = selectableProviders.find(value => value.toUpperCase() === peek());
      if (!provider || selected.includes(provider)) throw new Error('Choose distinct available providers.');
      selected.push(provider);
      index++;
    } while (accept(','));
    if ((columns.length || groupedAggregates.length) && (selected.length !== 1 || !['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS'].includes(selected[0])))
      throw new Error('Selected columns require one of MongoDBOASIS, SQLLiteDBOASIS, or Neo4jOASIS.');
    if (operation && selected.length > 1) throw new Error('Scalar queries require a single provider.');
    const [provider] = selected;
    const holo = selected.includes('HoloOASIS');
    const accountProviders = selected.filter(provider => Object.hasOwn(keyProfiles, provider));
    const nativeKeys = new Set(accountProviders.map(name => keyProfiles[name].key));
    if (holo) nativeKeys.add('Id');
    if (nativeKeys.size > 1)
      throw new Error('These providers require different key fields. Run separate queries for each key field.');

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
          const predicate = filter(true);
          if (!target.filters.length && !target.anyOf && !target.anyChildren && !target.anyDescendants && accept('OR')) {
            if (Array.isArray(predicate)) throw new Error('BETWEEN needs an AND clause outside OR alternatives.');
            target.anyOf = [predicate, filter()];
            while (accept('OR')) target.anyOf.push(filter());
            if (peek() === 'AND') throw new Error('Parenthesize the OR group when combining it with AND.');
            break;
          }
          target.filters.push(...[].concat(predicate));
        }
      } while (accept('AND'));
    }
    if (accept('WHERE')) predicates(body, true);
    if (distinct || groupedAggregates.length || peek() === 'GROUP') {
      let keys = columns;
      if (!distinct) {
        expect('GROUP');
        expect('BY');
        const groupFields = [];
        do {
          groupFields.push(readSelection());
        } while (accept(','));
        const groupKeys = groupFields.map(selectionKey);
        if (groupFields.length > 8 || new Set(groupKeys).size !== groupFields.length)
          throw new Error('Use up to eight different GROUP BY fields.');
        const selectedKeys = columns.map(selectionKey);
        if ((!columns.length && !groupedAggregates.length) ||
            selectedKeys.some(key => !groupKeys.includes(key)) ||
            new Set(selectedKeys).size !== columns.length)
          throw new Error('Each selected field must match GROUP BY once.');
        const keyAliases = new Set(columns.map(column => column.alias.toLowerCase()));
        keys = groupFields.map((selection, position) => {
          const selected = columns[selectedKeys.indexOf(groupKeys[position])];
          if (selected) return selected;
          let alias = selection.field ?? 'GroupKey' + (position + 1);
          while (keyAliases.has(alias.toLowerCase())) alias += '_';
          keyAliases.add(alias.toLowerCase());
          return { ...selection, alias };
        });
      }
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
        if (distinct) throw new Error('DISTINCT does not accept a HAVING clause.');
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
          } else {
            const { operation, selection } = aggregate.binding;
            const valueType = operation === 'Average' ? 'Decimal' : selection.valueType;
            if (valueType === 'Decimal') value = exactDecimal(token);
            else if (valueType === 'Int64' || valueType === 'UInt64') {
              const signed = valueType === 'Int64';
              const minimum = signed ? -9223372036854775808n : 0n;
              const maximum = signed ? 9223372036854775807n : 18446744073709551615n;
              if (!/^(?:0|-?[1-9][0-9]{0,19})$/.test(token ?? '') || BigInt(token) < minimum || BigInt(token) > maximum)
                throw new Error('HAVING requires an exact ' + valueType + ' threshold.');
            } else value = integer(token, -2147483648, 2147483647);
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
    let selectedOrder;
    if (!operation && accept('ORDER')) {
      expect('BY');
      const order = [];
      do {
        const name = tokens[index++];
        const descending = accept('DESC');
        if (!descending) accept('ASC');
        order.push({ name, descending });
      } while (accept(','));
      if (order.length > 1) {
        if (!columns.length || order.length > 8)
          throw new Error('Multi-column ORDER BY requires selected columns and up to eight sort keys.');
        selectedOrder = order.map(({ name, descending }) => {
          const column = columns.find(item => item.alias.toLowerCase() === name?.toLowerCase());
          if (!column) throw new Error('Order by selected column aliases.');
          return { alias: column.alias, descending };
        });
        if (new Set(selectedOrder.map(item => item.alias)).size !== selectedOrder.length)
          throw new Error('Use each selected ordering alias only once.');
      } else {
        const name = order[0].name?.toLowerCase();
        const selectedColumn = columns.find(column => column.alias.toLowerCase() === name);
        const field = selectedColumn?.field ?? fields[name]?.[0];
        if (['Name', 'Version', 'Id'].includes(field)) {
          body.orderBy = field;
          if (order[0].descending) body.descending = true;
        } else if (selectedColumn) {
          selectedOrder = [{ alias: selectedColumn.alias, descending: order[0].descending }];
        } else {
          throw new Error('Order by Name, Version, Id, or a selected column alias.');
        }
      }
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
      const { key, accepts, maximumKeys = 8, requiresSingleKeyFilter } = keyProfiles[accountProvider];
      if (requiresSingleKeyFilter && (body.filters.length !== 1 || body.anyOf))
        throw new Error(accountProvider + ' requires one ' + key + ' equality or IN filter.');
      const invalidFilter = [...body.filters, ...(body.anyOf ?? [])].some(filter => {
        if (filter.scalar !== 'String' || filter.metadataPath?.length !== 1 || filter.metadataPath[0] !== key ||
            !['Equal', 'In'].includes(filter.operator)) return true;
        const values = Array.isArray(filter.value) ? filter.value : [filter.value];
        return (filter.operator === 'In' && values.length > maximumKeys) || values.some(value => !accepts(value)) ||
          (requiresSingleKeyFilter && new Set(values).size !== values.length);
      });
      if (operation || body.orderBy !== 'None' || relationships.length || invalidFilter) {
        throw new Error(accountProvider + ' supports row queries with ' + key +
          ' equality or IN (up to ' + maximumKeys + ' keys), LIMIT, and OFFSET.');
      }
    }
    if (columns.length) {
      delete body.includeMetadata;
      if (selectedOrder) {
        const { provider, take, skip, ...source } = body;
        const stages = [{ operation: 'OrderBy', order: selectedOrder }];
        if (skip) stages.push({ operation: 'Skip', count: skip });
        stages.push({ operation: 'Take', count: take });
        return { path: 'data/query-cql/composition',
          body: { provider, source: { ...source, orderBy: 'Id', take: 100, columns }, stages } };
      }
      return { path: 'data/query-cql/projection', body: { ...body, columns } };
    }
    if (operation) body.operation = operation;
    if (scalarSelection) body.selection = scalarSelection;
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

  function publicExample(provider, request, discoveredProfiles = {}) {
    const expectedKey = (accountProfiles[provider] ?? discoveredProfiles[provider])?.key;
    const [filter] = request?.filters ?? [];
    const values = filter?.operator === 'Equal' ? [filter.value] : filter?.operator === 'In' ? filter.value : null;
    if (request?.provider !== provider || request.filters?.length !== 1 || !values ||
        !Array.isArray(values) || !values.length || request.orderBy !== 'None' ||
        request.descending || request.includeMetadata !== true ||
        request.anyOf?.length || request.anyChildren?.length || request.anyDescendants?.length || request.graph)
      return null;
    const field = provider === 'HoloOASIS' && filter.field === 'Id' && filter.scalar === 'Guid' ? 'Id'
      : expectedKey && filter.metadataPath?.length === 1 && filter.metadataPath[0] === expectedKey &&
        filter.scalar === 'String' ? 'metadata.' + expectedKey : null;
    if (!field || values.some(key => typeof key !== 'string') ||
        !Number.isInteger(request.take) || request.take < 1 || request.take > 100 || request.skip)
      return null;
    const keys = values.map(key => "'" + key.replace(/'/g, "''") + "'").join(', ');
    const text = `SELECT * FROM ${provider} WHERE ${field} ${filter.operator === 'Equal' ? '= ' + keys : 'IN (' + keys + ')'} LIMIT ${request.take}${request.maximumDurationMilliseconds ? ' TIMEOUT ' + request.maximumDurationMilliseconds : ''}`;
    compile(text, discoveredProfiles);
    return text;
  }

  const api = { providers: Object.freeze([...providers]), compile, publicExample, discoverKeyProfiles };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CqlText = api;
})(globalThis);
