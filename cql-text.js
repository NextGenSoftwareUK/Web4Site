/* SQL-like sandbox syntax compiled to the existing typed WEB4 request. */
(function (root) {
  'use strict';

  const providers = ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS'];
  const fields = { id: ['Id', 'Guid'], name: ['Name', 'String'],
    description: ['Description', 'String'], version: ['Version', 'Integer'],
    isactive: ['IsActive', 'Boolean'] };
  const comparisons = { '=': 'Equal', '<>': 'NotEqual', '!=': 'NotEqual',
    '<': 'LessThan', '<=': 'LessThanOrEqual', '>': 'GreaterThan',
    '>=': 'GreaterThanOrEqual', CONTAINS: 'Contains' };

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
        expect('.');
        const key = tokens[index++];
        if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key ?? '')) throw new Error('Expected a metadata key.');
        selector = { metadataPath: [key] };
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
      const operator = comparisons[tokens[index++]?.toUpperCase()];
      if (!operator) throw new Error('Expected a supported comparison.');
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
      if (!provider || selected.includes(provider)) throw new Error('Choose distinct MongoDBOASIS, SQLLiteDBOASIS, or Neo4jOASIS providers.');
      selected.push(provider);
      index++;
    } while (accept(','));
    if (count && selected.length > 1) throw new Error('COUNT requires a single provider.');
    const [provider] = selected;
    const body = { provider, filters: [], orderBy: 'Name', skip: 0 };
    if (!count) Object.assign(body, { take: 10, includeMetadata: true });
    if (accept('WHERE')) {
      do {
        if (accept('(')) {
          if (body.anyOf) throw new Error('Use one parenthesized OR group.');
          body.anyOf = [filter()];
          while (accept('OR')) body.anyOf.push(filter());
          expect(')');
        } else {
          body.filters.push(filter());
        }
      } while (accept('AND'));
    }
    if (!count && accept('ORDER')) {
      expect('BY');
      const field = fields[tokens[index++]?.toLowerCase()]?.[0];
      if (!['Name', 'Version', 'Id'].includes(field)) throw new Error('Order by Name, Version, or Id.');
      body.orderBy = field;
      if (accept('DESC')) body.descending = true;
      else accept('ASC');
    }
    if (!count && accept('LIMIT')) body.take = integer(tokens[index++], 1, 100);
    if (!count && accept('OFFSET')) body.skip = integer(tokens[index++], 0, 10000);
    accept(';');
    if (index !== tokens.length) throw new Error('Unexpected clause near token ' + (index + 1) + '.');
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

  const api = { compile };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CqlText = api;
})(globalThis);
