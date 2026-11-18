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
  const projectionFields = { ...fields, holontype: ['HolonType', 'HolonType'],
    ispublic: ['IsPublic', 'Boolean'], versionid: ['VersionId', 'Guid'],
    previousversionid: ['PreviousVersionId', 'Guid'], createdbyavatarid: ['CreatedByAvatarId', 'Guid'],
    modifiedbyavatarid: ['ModifiedByAvatarId', 'Guid'] };
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
    const lexer = /\s+|--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9]*|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|<=|>=|<>|!=|[(),.*=<>;]/gy;
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
    function readSelectPosition(columns, clause) {
      if (!/^-?\d+$/.test(tokens[index] ?? '')) return undefined;
      const position = Number(tokens[index++]);
      if (!Number.isSafeInteger(position) || position < 1 || position > columns.length)
        throw new Error(clause + ' position must refer to an explicit SELECT column.');
      return columns[position - 1];
    }
    function readOrderColumn(columns) {
      return readSelectPosition(columns, 'ORDER BY')?.alias ?? tokens[index++];
    }
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
    function readWindow(maximumTake, maximumSkip, minimumTake = 1) {
      let take, skip;
      if (accept('LIMIT')) {
        take = integer(tokens[index++], minimumTake, maximumTake);
        if (accept('OFFSET')) skip = integer(tokens[index++], 0, maximumSkip);
      } else {
        if (accept('OFFSET')) {
          skip = integer(tokens[index++], 0, maximumSkip);
          if (!accept('ROW') && !accept('ROWS') && peek() === 'FETCH')
            throw new Error('Use OFFSET n ROWS before FETCH.');
        }
        if (accept('FETCH')) {
          if (!accept('FIRST')) expect('NEXT');
          take = peek() === 'ROW' || peek() === 'ROWS' ? 1 : integer(tokens[index++], minimumTake, maximumTake);
          if (!accept('ROW')) expect('ROWS');
          expect('ONLY');
        }
      }
      return { take, skip };
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
        const token = tokens[index++] ?? '';
        const quoted = token.startsWith('"');
        const key = quoted ? token.slice(1, -1).replace(/""/g, '"') : token;
        if (!key.trim() || key.length > 64 || /[\x00-\x1f\x7f-\x9f]/.test(key) ||
            (!quoted && !/^[A-Za-z_][A-Za-z_0-9]*$/.test(key)))
          throw new Error('Expected a metadata path segment of up to 64 characters.');
        path.push(key);
        if (path.length > 4) throw new Error('Use at most four metadata path segments.');
      } while (peek() === '.');
      return path;
    }
    function readLiteral(scalar, wideInteger = false) {
      const token = tokens[index++];
      if (scalar === 'Integer') {
          if (!wideInteger) return integer(token, -2147483648, 2147483647);
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
      if (scalar === 'Double' || scalar === 'Single') {
        const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token ?? '');
        if (!match) throw new Error('Expected a finite floating-point literal.');
        const [, sign, whole, fraction = '', scale = '0'] = match;
        const digits = whole + fraction;
        const firstNonzero = digits.search(/[1-9]/);
        if (firstNonzero < 0) return '0';
        const magnitude = Number(token);
        if (!Number.isFinite(magnitude) || magnitude === 0)
          throw new Error('Expected a finite floating-point literal.');

        // Reformat the input digits without rounding. WEB4 validates that the result
        // is the shortest exact round-trip spelling for the declared width.
        const significant = digits.slice(firstNonzero).replace(/0+$/, '');
        const exponent = Number(scale) + whole.length - firstNonzero - 1;
        const exponentThreshold = scalar === 'Double' ? 17 : 9;
        let canonical;
        if (exponent < -4 || exponent >= exponentThreshold) {
          const mantissa = significant.length === 1 ? significant : significant[0] + '.' + significant.slice(1);
          canonical = mantissa + 'E' + (exponent < 0 ? '-' : '+') + String(Math.abs(exponent)).padStart(2, '0');
        } else if (exponent < 0) {
          canonical = '0.' + '0'.repeat(-exponent - 1) + significant;
        } else {
          const point = exponent + 1;
          canonical = significant.length > point
            ? significant.slice(0, point) + '.' + significant.slice(point)
            : significant.padEnd(point, '0');
        }
        if (sign.length + canonical.length > 24)
          throw new Error('Floating-point literals may use up to 24 canonical characters.');
        return sign + canonical;
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
      if (scalar === 'HolonType') {
        if (!/^'[A-Za-z][A-Za-z0-9_]{0,39}'$/.test(token ?? ''))
          throw new Error('Expected a quoted HolonType member.');
        return token.slice(1, -1);
      }
      if (scalar === 'String' && token?.startsWith("'")) {
        const value = token.slice(1, -1).replace(/''/g, "'");
        if (value.length > 512) throw new Error('String literals may contain up to 512 characters.');
        return value;
      }
      throw new Error('Expected a ' + scalar + ' literal.');
    }

    function readLike(scalar, allowMatchAll = false) {
      if (scalar !== 'String') throw new Error('LIKE requires a string field.');
      const pattern = readLiteral(scalar);
      const escape = accept('ESCAPE') ? readLiteral(scalar) : null;
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
          if (units[units.length - 1] !== null) units.push(null);
        } else if (character === '_') {
          throw new Error('LIKE requires escaping a literal underscore.');
        } else {
          units.push(character);
        }
      }
      if (allowMatchAll && units.length === 1 && units[0] === null) return { operator: 'IsNotNull' };
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
      return { operator, value };
    }

    function filter(allowRange = false) {
      const length = accept('LENGTH');
      if (length) expect('(');
      const name = tokens[index++]?.toLowerCase();
      let selector, scalar;
      if (name === 'metadata') {
        selector = { metadataPath: readMetadataPath() };
        if (accept('IS')) {
          if (length) throw new Error('Close LENGTH before its numeric comparison.');
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
          else if (accept('DOUBLE')) scalar = 'Double';
          else if (accept('SINGLE')) scalar = 'Single';
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
        if (accept('IS')) {
          if (length) throw new Error('Close LENGTH before its numeric comparison.');
          if (scalar !== 'String') throw new Error('Canonical null tests require a text field.');
          const negated = accept('NOT');
          expect('NULL');
          return { ...selector, operator: negated ? 'IsNotNull' : 'IsNull' };
        }
      }
      if (length) {
        if (scalar !== 'String') throw new Error('LENGTH requires a string field.');
        expect(')');
        const operator = comparisons[tokens[index++]?.toUpperCase()];
        if (!['Equal', 'NotEqual', 'GreaterThan', 'GreaterThanOrEqual', 'LessThan', 'LessThanOrEqual'].includes(operator))
          throw new Error('Use an integer comparison after LENGTH.');
        return { ...selector, scalar: 'String', function: 'Utf16Length', operator,
          value: readLiteral('Integer', true) };
      }
      const literal = () => readLiteral(scalar, Boolean(selector.metadataPath));
      const negated = accept('NOT');
      if (accept('IN')) {
        expect('(');
        const values = [literal()];
        while (accept(',')) values.push(literal());
        expect(')');
        if (values.length > 100) throw new Error('IN accepts up to 100 values.');
        if (!negated) return { ...selector, scalar, operator: 'In', value: values };
        if (!allowRange) throw new Error('NOT IN needs an AND clause outside OR alternatives.');
        if (!selector.metadataPath && !['Id', 'Version', 'Name', 'Description'].includes(selector.field))
          throw new Error('NOT IN requires Id, Version, Name, Description, or a metadata path.');
        const predicates = [...new Set(values)].map(value => ({ ...selector, scalar, operator: 'NotEqual', value }));
        if (selector.metadataPath || scalar === 'String') predicates.unshift({ ...selector, operator: 'IsNotNull' });
        if (predicates.length > 12) throw new Error('NOT IN exceeds the twelve-filter budget.');
        return predicates;
      }
      if (accept('LIKE')) {
        const match = readLike(scalar, negated || Boolean(selector.field));
        if (!negated) return match.operator === 'IsNotNull' ? { ...selector, operator: match.operator }
          : { ...selector, scalar, ...match };
        if (match.operator === 'IsNotNull') return { ...selector, scalar, operator: 'NotContains', value: '' };
        if (match.operator !== 'Equal') return { ...selector, scalar, operator: 'Not' + match.operator, value: match.value };
        if (!allowRange) throw new Error('Exact NOT LIKE needs an AND clause outside OR alternatives.');
        return [{ ...selector, operator: 'IsNotNull' }, { ...selector, scalar, operator: 'NotEqual', value: match.value }];
      }
      if (negated) expect('BETWEEN');
      if (negated || accept('BETWEEN')) {
        if (!allowRange && !negated) throw new Error('BETWEEN needs an AND clause outside OR alternatives.');
        if (!['Integer', 'Decimal', 'UInt64', 'Double', 'Single', 'DateTime'].includes(scalar))
          throw new Error('BETWEEN requires a numeric or UTC timestamp field.');
        const lower = literal();
        expect('AND');
        const upper = literal();
        if (negated) return { anyOf: [
          { ...selector, scalar, operator: 'LessThan', value: lower },
          { ...selector, scalar, operator: 'GreaterThan', value: upper }
        ] };
        return [
          { ...selector, scalar, operator: 'GreaterThanOrEqual', value: lower },
          { ...selector, scalar, operator: 'LessThanOrEqual', value: upper }
        ];
      }
      const comparison = tokens[index++]?.toUpperCase();
      const operator = Object.hasOwn(comparisons, comparison) ? comparisons[comparison] : null;
      if (!operator) throw new Error('Expected a supported comparison.');
      if (!['Integer', 'UInt64', 'Decimal', 'Double', 'Single', 'DateTime'].includes(scalar) && ['<', '<=', '>', '>='].includes(comparison))
        throw new Error('Ordered comparisons require Version or metadata typed AS INT64, AS UINT64, AS DECIMAL, AS DOUBLE, AS SINGLE, or AS DATETIME.');
      if (['Contains', 'StartsWith', 'EndsWith', 'NotContains', 'NotStartsWith', 'NotEndsWith'].includes(operator) && scalar !== 'String')
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
        const body = { filters: [], orderBy: 'Id' };
        if (accept('WHERE')) predicates(body, false);
        if (accept('ORDER')) {
          expect('BY');
          const field = fields[tokens[index++]?.toLowerCase()]?.[0];
          if (!['Id', 'Name', 'Version'].includes(field)) throw new Error('Order join inputs by Id, Name, or Version.');
          body.orderBy = field;
          if (accept('DESC')) body.descending = true;
          else accept('ASC');
        }
        const window = readWindow(10, 1000);
        if (window.take === undefined) throw new Error('Join inputs require a LIMIT or FETCH row bound.');
        body.take = window.take;
        if (window.skip !== undefined) body.skip = window.skip;
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
      const firstSource = source();
      const leftJoin = accept('LEFT');
      const rightJoin = !leftJoin && accept('RIGHT');
      const fullJoin = !leftJoin && !rightJoin && accept('FULL');
      const outerJoin = leftJoin || rightJoin || fullJoin;
      const crossJoin = !outerJoin && accept('CROSS');
      const childJoin = !outerJoin && !crossJoin && accept('CHILD');
      if (outerJoin) accept('OUTER');
      else if (!crossJoin && !childJoin) accept('INNER');
      expect('JOIN');
      const secondSource = source();
      const [left, right] = rightJoin ? [secondSource, firstSource] : [firstSource, secondSource];
      if (left.alias === right.alias || left.provider !== right.provider)
        throw new Error('Use two different aliases for one join provider.');
      const sourceSide = alias => {
        if (alias === left.alias) return 'Left';
        if (alias === right.alias) return 'Right';
        throw new Error('Unknown join source alias.');
      };
      function joinKey() {
        const first = qualifiedField();
        let nullComparison;
        if (accept('IS')) {
          const negate = accept('NOT');
          expect('DISTINCT');
          expect('FROM');
          nullComparison = negate ? 'IsNotDistinctFrom' : 'IsDistinctFrom';
        }
        const symbol = nullComparison ? undefined : tokens[index++];
        const reversed = { '=': '=', '<>': '<>', '!=': '!=', '<': '>', '<=': '>=', '>': '<', '>=': '<=' };
        if (!nullComparison && !Object.hasOwn(reversed, symbol)) throw new Error('Use an exact join comparison operator.');
        const second = qualifiedField();
        const one = sourceSide(first.source);
        if (one === sourceSide(second.source)) throw new Error('Join keys must compare both sources.');
        const [l, r] = one === 'Left' ? [first, second] : [second, first];
        const ordered = symbol !== '=';
        const operator = nullComparison ?? (ordered ? comparisons[one === 'Left' ? symbol : reversed[symbol]] : undefined);
        if (ordered) {
          const keyDomain = selection => selection.field === 'Version' ? 'Int32'
            : selection.field ? fields[selection.field.toLowerCase()][1] : selection.valueType;
          const domain = keyDomain(l.selection);
          if (nullComparison) {
            if (domain !== keyDomain(r.selection) || (domain !== 'String' &&
                (!['Boolean', 'Guid', 'DateTime', 'Int32', 'Int64', 'UInt64', 'Decimal'].includes(domain) ||
                 !l.selection.nullable || !r.selection.nullable)))
              throw new Error('Use IS DISTINCT FROM with matching nullable Boolean, GUID, UTC timestamp or supported exact numeric columns, or matching text columns.');
          } else if (!['Int32', 'Int64'].includes(domain) || domain !== keyDomain(r.selection)) {
            throw new Error('Join comparisons require matching signed integer columns.');
          }
        }
        return { left: l.selection, right: r.selection, ...(ordered ? { operator } : {}) };
      }

      const keyCount = groups => groups.reduce((count, group) => count + group.length, 0);
      const tooManyKeys = () => new Error('Use up to eight join keys after expanding the ON conditions.');
      function alternatives(depth) {
        const groups = conjunction(depth);
        while (accept('OR')) {
          const next = conjunction(depth);
          if (keyCount(groups) + keyCount(next) > 8) throw tooManyKeys();
          groups.push(...next);
        }
        return groups;
      }
      function conjunction(depth) {
        let groups = term(depth);
        while (accept('AND')) {
          const next = term(depth);
          if (keyCount(groups) * next.length + keyCount(next) * groups.length > 8) throw tooManyKeys();
          groups = groups.flatMap(group => next.map(branch => {
            if (branch.some(key => group.some(previous =>
                selectionKey(previous.left) === selectionKey(key.left) &&
                selectionKey(previous.right) === selectionKey(key.right) && previous.operator === key.operator)))
              throw new Error('Use each join key pair once in a conjunction.');
            return group.concat(branch);
          }));
        }
        return groups;
      }
      function term(depth) {
        if (!accept('(')) return [[joinKey()]];
        if (depth >= 8) throw new Error('JOIN ON conditions are nested too deeply.');
        const groups = alternatives(depth + 1);
        expect(')');
        return groups;
      }

      const keys = [], keyGroupStarts = [];
      if (!crossJoin && !childJoin) {
        expect('ON');
        for (const group of alternatives(0)) {
          keyGroupStarts.push(keys.length);
          for (const key of group) keys.push({ alias: 'Key' + (keys.length + 1), ...key });
        }
      }
      let outputOrder;
      if (accept('ORDER')) {
        expect('BY');
        const terms = [];
        do {
          let selected;
          if (tokens[index + 1] === '.' || (peek() === 'CAST' && tokens[index + 1] === '(')) {
            const field = qualifiedField();
            const expression = selectionKey(field.selection);
            selected = fieldsToSelect.find(column => column.source === field.source &&
              selectionKey(column.selection) === expression);
          } else {
            const name = readOrderColumn(fieldsToSelect)?.toLowerCase();
            selected = fieldsToSelect.find(field => field.alias.toLowerCase() === name);
          }
          if (!selected) throw new Error('Order joined results by a selected column alias or qualified expression.');
          const type = selected.selection.valueType ?? fields[selected.selection.field.toLowerCase()][1];
          if (!['Guid', 'String', 'Integer', 'Int32', 'Int64', 'UInt64', 'DateTime', 'Boolean'].includes(type))
            throw new Error('Joined ordering supports GUID, STRING, INT32, INT64, UINT64, DATETIME, and BOOLEAN outputs.');
          const descending = accept('DESC');
          if (!descending) accept('ASC');
          terms.push({ alias: selected.alias, descending });
          if (terms.length > 8) throw new Error('Use up to eight joined ordering terms.');
        } while (accept(','));
        outputOrder = terms.length === 1
          ? { outputOrderBy: terms[0].alias, outputDescending: terms[0].descending }
          : { outputOrdering: terms };
      }
      const { take, skip } = readWindow(100, 1000, 0);
      if (take === undefined && skip !== undefined)
        throw new Error('A joined output offset requires LIMIT or FETCH.');
      accept(';');
      if (index !== tokens.length) throw new Error('Unexpected join clause.');
      const filterCount = left.body.filters.length + right.body.filters.length +
        (left.body.anyOf?.length ?? 0) + (right.body.anyOf?.length ?? 0);
      if (keys.length > 8 || filterCount > 12)
        throw new Error('Use up to eight join keys and twelve input filters.');
      const columns = fieldsToSelect.map(field => {
        const side = sourceSide(field.source);
        const column = { alias: field.alias, source: side, selection: field.selection };
        if (fullJoin || (outerJoin && side === 'Right')) column.allowMissing = true;
        return column;
      });
      const product = left.body.take * right.body.take;
      const maximumPairs = childJoin ? right.body.take :
        fullJoin ? Math.max(product, left.body.take + right.body.take) : product;
      const outputLimit = take === undefined ? undefined : Math.min(take, maximumPairs);
      const window = outputLimit === undefined ? {} : { outputLimit, outputOffset: skip ?? 0 };
      return { path: 'data/query-cql/join', body: {
        provider: left.provider, kind: childJoin ? 'Child' : crossJoin ? 'Cross' : fullJoin ? 'Full' : outerJoin ? 'Left' : 'Inner',
        left: left.body, right: right.body, keys, columns, ...outputOrder, ...window,
        ...(keyGroupStarts.length <= 1 ? {} : keyGroupStarts.length === keys.length
          ? { matchAnyKey: true } : { keyGroupStarts }),
        maximumLeftRows: left.body.take, maximumRightRows: right.body.take, maximumPairs,
        maximumResults: outputLimit === undefined ? maximumPairs : Math.max(1, outputLimit)
      } };
    }

    expect('SELECT');
    if (tokens.some((token, position) => token.toUpperCase() === 'FROM' && tokens[position + 1] === '('))
      return readJoin();
    const distinct = accept('DISTINCT');
    const aggregates = { COUNT: 'LongCount', ANY: 'Any', MIN: 'Min', MAX: 'Max', SUM: 'Sum', AVG: 'Average' };
    const hasGrouping = tokens.some((token, position) =>
      token.toUpperCase() === 'GROUP' && tokens[position + 1]?.toUpperCase() === 'BY');
    const operation = !hasGrouping && Object.hasOwn(aggregates, peek())
      ? aggregates[tokens[index++].toUpperCase()] : null;
    if (operation) expect('(');
    const countDistinct = operation === 'LongCount' && accept('DISTINCT');
    const countValues = operation === 'LongCount' && !countDistinct && peek() !== '*' && peek() !== '1';
    const selectedCount = countDistinct || countValues;
    const hasSelection = selectedCount || operation && operation !== 'LongCount' && operation !== 'Any';
    const scalarSelection = selectedCount ? readSelection(true) : hasSelection ? readAggregateSelection(true) : null;
    if (operation && !hasSelection && !(operation === 'LongCount' && accept('1'))) expect('*');
    function readSelection(allowComputed = false) {
      if (allowComputed && accept('LENGTH')) {
        expect('(');
        const input = readSelection();
        expect(')');
        if (input.field ? !['Name', 'Description'].includes(input.field) : input.valueType !== 'String')
          throw new Error('Selected LENGTH requires a string field or CAST of metadata AS STRING.');
        return { ...input, function: 'Utf16Length', nullable: true };
      }
      if (!accept('CAST')) {
        const name = tokens[index++]?.toLowerCase();
        if (!Object.hasOwn(projectionFields, name)) throw new Error('Unknown selected field.');
        return { field: projectionFields[name][0] };
      }
      expect('(');
      return readMetadataCast();
    }

    function readMetadataCast() {
      expect('METADATA');
      const metadataPath = readMetadataPath();
      expect('AS');
      const types = { STRING: 'String', BOOLEAN: 'Boolean', INT32: 'Int32', INT64: 'Int64',
        UINT64: 'UInt64', DECIMAL: 'Decimal', DOUBLE: 'Double', SINGLE: 'Single', GUID: 'Guid', DATETIME: 'DateTime' };
      const type = tokens[index++]?.toUpperCase();
      if (!Object.hasOwn(types, type)) throw new Error('Choose an exact metadata projection type.');
      expect(')');
      return { metadataPath, valueType: types[type], nullable: true };
    }

    function readAggregateSelection(allowComputed = false) {
      const selection = readSelection(allowComputed);
      if (!selection.function && selection.field !== 'Version' && !['Int32', 'Int64', 'UInt64', 'Decimal', 'Single', 'Double'].includes(selection.valueType))
        throw new Error('Aggregate Version or exact numeric metadata using CAST.');
      return selection;
    }
    function selectionKey(column) {
      const input = column.field ?? JSON.stringify([column.valueType, ...column.metadataPath]);
      return column.function ? JSON.stringify([column.function, input]) : input;
    }
    function readGroupedAggregate(name) {
      const operation = aggregates[name];
      expect('(');
      const selection = operation === 'LongCount'
        ? (accept('*') || accept('1') ? null : readSelection())
        : readAggregateSelection();
      expect(')');
      return selection ? { operation, selection } : { operation };
    }
    const columns = [];
    const groupedAggregates = [];
    if (!operation && !accept('*')) {
      do {
        if (peek() !== 'ANY' && Object.hasOwn(aggregates, peek())) {
          const name = tokens[index++].toUpperCase();
          const binding = readGroupedAggregate(name);
          const alias = accept('AS') ? tokens[index++] : name[0] + name.slice(1).toLowerCase();
          if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(alias ?? ''))
            throw new Error('Expected a column alias for the grouped aggregate.');
          binding.alias = alias;
          groupedAggregates.push({ index: columns.length + groupedAggregates.length, binding });
          continue;
        }
        const selection = readSelection(true);
        const requiresAlias = selection.metadataPath || selection.function;
        if (requiresAlias) expect('AS');
        const alias = requiresAlias ? tokens[index++] : accept('AS') ? tokens[index++] : selection.field;
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(alias ?? ''))
          throw new Error('Expected a column alias of up to 64 letters, digits or underscores, starting with a letter.');
        if (columns.some(column => column.alias.toLowerCase() === alias.toLowerCase()))
          throw new Error('Use a distinct alias for each selected column.');
        columns.push({ ...selection, alias });
      } while (accept(','));
    }
    let scalarAlias;
    if (operation) {
      expect(')');
      if (accept('AS')) {
        scalarAlias = tokens[index++];
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(scalarAlias ?? ''))
          throw new Error('Expected a scalar result alias of up to 64 letters, digits or underscores.');
      }
    }
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
    if (accept('WITH')) {
      expect('VIRTUAL');
      expect('MAPPING');
      const id = readLiteral('Guid');
      if (/^0{8}(?:-0{4}){3}-0{12}$/.test(id))
        throw new Error('Use a nonempty Virtual Holon mapping ID.');
      if (columns.some(column => column.function) || columns.length < 2 || columns[0].field !== 'Id' || distinct || groupedAggregates.length || operation ||
          columns.slice(1).some(column => column.metadataPath?.length !== 1))
        throw new Error('Virtual mapping queries must select Id first and at least one mapped metadata field.');
      body.virtualMappingId = id;
    }

    function orPredicates(first) {
      const alternatives = first.anyOf ?? [first];
      while (accept('OR')) {
        const alternative = filter();
        alternatives.push(...(alternative.anyOf ?? [alternative]));
      }
      return alternatives;
    }

    function predicates(target, allowChildren) {
      do {
        if (accept('(')) {
          if (target.anyOf) throw new Error('Use one parenthesized OR group per scope.');
          target.anyOf = orPredicates(filter());
          expect(')');
        } else if (allowChildren && (peek() === 'EXISTS'
            || peek() === 'NOT' && tokens[index + 1]?.toUpperCase() === 'EXISTS')) {
          const negated = accept('NOT');
          expect('EXISTS');
          const descendant = accept('DESCENDANT');
          if (!descendant) expect('CHILD');
          const relationship = { filters: [] };
          if (negated) relationship.negated = true;
          if (accept('(')) {
            predicates(relationship, false);
            expect(')');
          }
          if (descendant) {
            Object.assign(relationship, { maximumDepth: 8, maximumNodes: 1000 });
            (target.anyDescendants ??= []).push(relationship);
          } else {
            (target.anyChildren ??= []).push(relationship);
          }
        } else {
          const predicate = filter(true);
          if (!target.filters.length && !target.anyOf && !target.anyChildren && !target.anyDescendants && peek() === 'OR') {
            if (Array.isArray(predicate)) throw new Error('BETWEEN, NOT IN and exact NOT LIKE need an AND clause outside OR alternatives.');
            target.anyOf = orPredicates(predicate);
            if (peek() === 'AND') throw new Error('Parenthesize the OR group when combining it with AND.');
            break;
          }
          if (predicate.anyOf) {
            if (target.anyOf) throw new Error('Use one OR group per scope.');
            target.anyOf = predicate.anyOf;
          } else {
            target.filters.push(...[].concat(predicate));
          }
        }
      } while (accept('AND'));
    }
    if (accept('WHERE')) predicates(body, true);
    if (body.virtualMappingId && (peek() === 'GROUP' || body.filters.length < 1 || body.filters.length > 8 ||
        body.filters.some(filter => filter.metadataPath?.length !== 1 || filter.value === null ||
            !['Equal', 'NotEqual', 'GreaterThan', 'GreaterThanOrEqual', 'LessThan', 'LessThanOrEqual',
              'Contains', 'StartsWith', 'EndsWith', 'NotContains', 'NotStartsWith', 'NotEndsWith'].includes(filter.operator) ||
            !['String', 'Boolean', 'Integer'].includes(filter.scalar) ||
            filter.function != null && (filter.function !== 'Utf16Length' || filter.scalar !== 'String' ||
              ['Contains', 'StartsWith', 'EndsWith', 'NotContains', 'NotStartsWith', 'NotEndsWith'].includes(filter.operator)) ||
            filter.function == null && filter.scalar !== 'Integer' &&
              !(filter.scalar === 'String' ? ['Equal', 'NotEqual', 'Contains', 'StartsWith', 'EndsWith', 'NotContains', 'NotStartsWith', 'NotEndsWith'] :
                ['Equal', 'NotEqual']).includes(filter.operator) ||
            ['Contains', 'StartsWith', 'EndsWith', 'NotContains', 'NotStartsWith', 'NotEndsWith'].includes(filter.operator) && filter.scalar !== 'String') ||
        body.anyOf || body.anyChildren || body.anyDescendants))
      throw new Error('Use one to eight supported typed metadata comparison filters with a Virtual Holon mapping.');
    if (distinct || groupedAggregates.length || peek() === 'GROUP') {
      if (columns.some(column => column.function))
        throw new Error('Computed SELECT grouping and DISTINCT require native grouped-function support.');
      let keys = columns;
      if (!distinct) {
        expect('GROUP');
        expect('BY');
        const selectedFields = columns.slice();
        for (const { index } of groupedAggregates) selectedFields.splice(index, 0, null);
        const groupFields = [];
        do {
          const selected = readSelectPosition(selectedFields, 'GROUP BY');
          if (selected === null) throw new Error('GROUP BY cannot refer to an aggregate position.');
          const alias = selected === undefined && !(peek() === 'CAST' && tokens[index + 1] === '(')
            && !Object.hasOwn(projectionFields, peek()?.toLowerCase())
            ? columns.find(column => column.alias.toUpperCase() === peek())
            : null;
          if (alias) index++;
          groupFields.push(selected ?? alias ?? readSelection());
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
      function readGroupedResultColumn() {
        const name = peek();
        let aggregate, key;
        if (tokens[index + 1] === '(' && name !== 'ANY' && Object.hasOwn(aggregates, name)) {
          index++;
          const expression = readGroupedAggregate(name);
          const input = expression.selection ? selectionKey(expression.selection) : null;
          aggregate = groupedAggregates.find(({ binding }) => binding.operation === expression.operation &&
            (binding.selection ? selectionKey(binding.selection) : null) === input)?.binding;
        } else if (name === 'CAST' && tokens[index + 1] === '(') {
          const expression = selectionKey(readSelection());
          key = columns.find(column => selectionKey(column) === expression);
        } else {
          aggregate = groupedAggregates.find(({ binding }) => binding.alias.toUpperCase() === name)?.binding;
          key = columns.find(column => column.alias.toUpperCase() === name) ??
            columns.find(column => column.field?.toUpperCase() === name);
          index++;
        }
        return { aggregate, key };
      }
      if (accept('HAVING')) {
        if (distinct) throw new Error('DISTINCT does not accept a HAVING clause.');
        grouped.resultFilters = [];
        function addHavingFilter(filter) {
          grouped.resultFilters.push(filter);
          if (grouped.resultFilters.length > 32) throw new Error('Use at most 32 HAVING comparisons.');
        }
        function addHavingComparison(alias, type, comparison, nullable = false) {
          if (!['=', '<>', '!=', '<', '<=', '>', '>='].includes(comparison))
            throw new Error('HAVING requires a scalar comparison.');
          if (['String', 'Boolean', 'Guid', 'HolonType'].includes(type) && !['=', '<>', '!='].includes(comparison))
            throw new Error('This grouped key supports equality and inequality in HAVING.');
          let value;
          if (type === 'Count') {
            value = tokens[index++];
            if (!/^(0|[1-9][0-9]{0,18})$/.test(value ?? '') || BigInt(value) > 9223372036854775807n)
              throw new Error('HAVING requires a comparison to a nonnegative 64-bit count.');
          } else if (type === 'UInt64') {
            value = tokens[index++];
            if (!/^(0|[1-9][0-9]{0,19})$/.test(value ?? '') || BigInt(value) > 18446744073709551615n)
              throw new Error('HAVING requires an exact UInt64 threshold.');
          } else {
            const scalar = type === 'Int32' || type === 'Int64' ? 'Integer' : type;
            try { value = readLiteral(scalar, type === 'Int64'); }
            catch (error) {
              if (type === 'Int64') throw new Error('HAVING requires an exact Int64 threshold.');
              throw error;
            }
          }
          if (nullable && ['<>', '!='].includes(comparison))
            addHavingFilter({ alias, operator: 'NotEqual', value: null });
          addHavingFilter({ alias, operator: comparisons[comparison], value });
        }
        do {
          const { aggregate, key } = readGroupedResultColumn();
          if (!aggregate && !key) throw new Error('HAVING must name a selected aggregate or grouping key by alias or expression.');
          const alias = (aggregate ?? key).alias;
          let type = key?.valueType ?? (key && projectionFields[key.field.toLowerCase()][1]);
          if (aggregate) {
            const inputType = aggregate.selection?.valueType ?? 'Int32';
            if (aggregate.operation === 'LongCount') type = 'Count';
            else if (aggregate.operation === 'Average' && !['Single', 'Double'].includes(inputType)) type = 'Decimal';
            else type = inputType;
          }
          const nullable = aggregate ? aggregate.selection?.nullable === true : key.nullable || type === 'String';
          if (key && accept('NOT')) {
            expect('LIKE');
            const match = readLike(type, true);
            if (match.operator === 'IsNotNull') {
              addHavingFilter({ alias, operator: 'NotContains', value: '' });
            } else if (match.operator === 'Equal') {
              addHavingFilter({ alias, operator: 'NotEqual', value: null });
              addHavingFilter({ alias, operator: 'NotEqual', value: match.value });
            } else {
              addHavingFilter({ alias, operator: 'Not' + match.operator, value: match.value });
            }
          } else if (key && accept('LIKE')) {
            addHavingFilter({ alias, ...readLike(type) });
          } else if (accept('IS')) {
            const not = accept('NOT');
            expect('NULL');
            if (!nullable) throw new Error('This selected alias cannot be null.');
            addHavingFilter(not ? { alias, operator: 'NotEqual', value: null } : { alias, operator: 'IsNull' });
          } else if (accept('BETWEEN')) {
            addHavingComparison(alias, type, '>=');
            expect('AND');
            addHavingComparison(alias, type, '<=');
          } else {
            addHavingComparison(alias, type, tokens[index++], nullable);
          }
        } while (accept('AND'));
      }
      if (accept('ORDER')) {
        expect('BY');
        grouped.resultOrder = [];
        do {
          const position = readSelectPosition(resultColumns, 'ORDER BY');
          const { aggregate, key } = position ? {} : readGroupedResultColumn();
          const alias = (position ?? aggregate ?? key)?.alias;
          if (!alias) throw new Error('Order grouped results by a selected column alias or expression.');
          if (grouped.resultOrder.some(item => item.alias === alias))
            throw new Error('Use each grouped ordering alias only once.');
          const descending = accept('DESC');
          if (!descending) accept('ASC');
          grouped.resultOrder.push({ alias, descending });
        } while (accept(','));
      }
      const window = readWindow(100, 100);
      if (window.take !== undefined) grouped.resultTake = window.take;
      if (window.skip !== undefined) {
        if (!grouped.resultOrder) throw new Error('Use ORDER BY before paging grouped results.');
        grouped.resultSkip = window.skip;
      }
      accept(';');
      if (index !== tokens.length) throw new Error('Unexpected grouped query clause.');
      const filterCount = body.filters.length + (body.anyOf?.length ?? 0);
      if (body.anyChildren || body.anyDescendants || filterCount > 12)
        throw new Error('Grouped queries support up to twelve filters on the source records.');
      return { path: 'data/query-cql/grouped', body: grouped };
    }
    const bindRowOrder = order => {
      if (selected.length !== 1 || !['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS'].includes(selected[0]))
        throw new Error('Multi-column row ordering requires one MongoDB, SQLite or Neo4j source.');
      const terms = order.map(({ name, descending }) => {
        const field = fields[name?.toLowerCase()]?.[0];
        if (!['Name', 'Description', 'Version', 'Id'].includes(field))
          throw new Error('Order full rows by Name, Description, Version or Id.');
        return { field, descending };
      });
      if (new Set(terms.map(term => term.field)).size !== terms.length)
        throw new Error('Use each row ordering field only once.');
      body.orderBy = 'None';
      body.ordering = terms;
    };
    let selectedOrder;
    if (!operation && accept('ORDER')) {
      expect('BY');
      const order = [];
      do {
        let name;
        if (columns.length && ['CAST', 'LENGTH'].includes(peek()) && tokens[index + 1] === '(') {
          const expression = selectionKey(readSelection(true));
          const selectedColumn = columns.find(column => selectionKey(column) === expression);
          if (!selectedColumn) throw new Error('Order by selected column aliases or expressions.');
          name = selectedColumn.alias;
        } else {
          name = readOrderColumn(columns);
        }
        const descending = accept('DESC');
        if (!descending) accept('ASC');
        order.push({ name, descending });
      } while (accept(','));
      if (order.length > 1 && !columns.length) {
        bindRowOrder(order);
      } else if (order.length > 1 || order.some(term =>
          columns.some(column => column.function && column.alias.toLowerCase() === term.name?.toLowerCase()))) {
        if (order.length > 8) throw new Error('Use up to eight selected ordering aliases.');
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
        } else if (!columns.length && field === 'Description') {
          bindRowOrder(order);
        } else if (selectedColumn) {
          selectedOrder = [{ alias: selectedColumn.alias, descending: order[0].descending }];
        } else {
          throw new Error('Order by Name, Version, Id, or a selected column alias.');
        }
      }
    }
    if (!operation) {
      const window = readWindow(100, 1000);
      if (window.take !== undefined) body.take = window.take;
      if (window.skip !== undefined) body.skip = window.skip;
    }
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
      if (body.virtualMappingId) {
        if (selectedOrder || body.orderBy !== 'Id' || body.skip >= 200 || body.take < 1)
          throw new Error('Use ORDER BY Id, a positive LIMIT and OFFSET below 200 for a Virtual Holon mapping.');
        return { path: 'data/query-cql/projection/mixed', body: { ...body, columns } };
      }
      if (selectedOrder) {
        return { path: 'data/query-cql/projection',
          body: { ...body, orderBy: 'None', columns, selectedOrder } };
      }
      return { path: 'data/query-cql/projection', body: { ...body, columns } };
    }
    if (operation) body.operation = countDistinct ? 'CountDistinct' : countValues ? 'CountValues' : operation;
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
    return { path: operation ? 'data/query-cql/scalar' : 'data/query-cql', body, ...(scalarAlias ? { scalarAlias } : {}) };
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
