const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./cql-text.js');
const query = (provider, value) => 'SELECT * FROM ' + provider + ' WHERE metadata.observedAt AS DATETIME >= ' + value;

test('timestamp offsets retain exact UTC payloads on all three stores', () => {
  for (const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']) {
    assert.deepEqual(compile(query(provider, "TIMESTAMP '2026-11-21T12:34:56.1234567+02:00'")),
      compile(query(provider, "'2026-11-21T10:34:56.1234567Z'")));
    assert.deepEqual(compile(query(provider, "'2026-11-21T05:04:56.1234567-05:30'")),
      compile(query(provider, "'2026-11-21T10:34:56.1234567Z'")));
  }
});
test('timestamp conversion retains fractional ticks through calendar boundaries', () => {
  for (const [input, utc] of [
    ["'2026-12-31T23:30:00.0000001-02:00'", "'2027-01-01T01:30:00.0000001Z'"],
    ["'2026-01-01T00:30:00+01:00'", "'2025-12-31T23:30:00Z'"],
    ["'0001-01-01T14:00:00+14:00'", "'0001-01-01T00:00:00Z'"],
    ["'9999-12-31T09:59:59.9999999-14:00'", "'9999-12-31T23:59:59.9999999Z'"]
  ]) assert.deepEqual(compile(query('MongoDBOASIS', input)), compile(query('MongoDBOASIS', utc)));
});
test('TIMESTAMP preserves existing UTC values without rounding', () => {
  for (const value of ['2026-11-21T10:34:56Z','2026-11-21T10:34:56.0Z',
      '2026-11-21T10:34:56.1234567Z','0001-01-01T00:00:00Z'])
    assert.deepEqual(compile(query('Neo4jOASIS', "TIMESTAMP '" + value + "'")),
      compile(query('Neo4jOASIS', "'" + value + "'")));
});
test('timestamp literals refuse invalid calendars, offsets, precision and UTC overflow', () => {
  for (const value of ['2026-02-30T12:00:00+01:00','2026-01-01T24:00:00Z',
      '2026-01-01T12:00:00+14:01','2026-01-01T12:00:00-15:00',
      '2026-01-01T12:00:00+01:60','2026-01-01T12:00:00',
      '2026-01-01T12:00:00.12345678Z','0001-01-01T00:00:00+01:00',
      '9999-12-31T23:59:59-01:00','0000-01-01T00:00:00Z'])
    assert.throws(() => compile(query('SQLLiteDBOASIS', "TIMESTAMP '" + value + "'")), /timestamp|offset/i, value);
});
