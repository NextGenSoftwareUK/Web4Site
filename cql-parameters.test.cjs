const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('./cql-text.js');

test('named parameters preserve typed requests and keep supplied text out of SQL grammar', () => {
  for (const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']) {
    const text = "Coffee'; DELETE FROM Holon; -- @unused";
    const sql = 'SELECT Id, Name FROM ' + provider + ' WHERE Name = @name AND Version >= @minimum LIMIT 5';
    const actual = compile(sql, {}, { name:text, minimum:2 });
    const expected = compile(sql.replace('@name', "'" + text.replace(/'/g, "''") + "'").replace('@minimum','2'));
    assert.deepEqual(actual, expected);
    const wide = 'SELECT * FROM ' + provider + ' WHERE metadata.sequence AS INT64 = @value LIMIT 5';
    assert.deepEqual(compile(wide, {}, { value:{type:'INT64',value:'9007199254740993'} }),
      compile(wide.replace('@value','9007199254740993')));
    const decimal = 'SELECT * FROM ' + provider + ' WHERE metadata.amount AS DECIMAL >= @value LIMIT 5';
    assert.deepEqual(compile(decimal, {}, { value:{type:'DECIMAL',value:'0.1234567890123456789012345678'} }),
      compile(decimal.replace('@value','0.1234567890123456789012345678')));
  }
});

test('parameter admission rejects missing and lossy values without evaluating accessors', () => {
  const sql = 'SELECT * FROM MongoDBOASIS WHERE Name = @name LIMIT 5';
  assert.throws(() => compile(sql), /Missing data value/);
  assert.throws(() => compile(sql, {}, []), /JSON object/);
  assert.throws(() => compile(sql, {}, {name:Number.MAX_SAFE_INTEGER + 1}), /safe JSON number/);
  assert.throws(() => compile(sql, {}, {name:{type:'INT64',value:'9223372036854775808'}}), /INT64/);
  let calls=0;
  const values={};Object.defineProperty(values,'name',{get(){calls++;return 'unsafe';}});
  assert.throws(() => compile(sql, {}, values), /Missing data value/);assert.equal(calls,0);
  assert.deepEqual(compile("SELECT * FROM MongoDBOASIS WHERE Name = '@literal' LIMIT 5"),
    compile("SELECT * FROM MongoDBOASIS WHERE Name = @name LIMIT 5", {}, {name:'@literal'}));
});


test('list parameters preserve typed IN and NOT IN requests across ready databases', () => {
  for (const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']) {
    for (const operator of ['IN','NOT IN']) {
      const query='SELECT * FROM '+provider+' WHERE Name '+operator+' (@names) LIMIT 5';
      const names=["Coffee'; DELETE FROM x", 'Tea'];
      assert.deepEqual(compile(query, {}, {names}),
        compile(query.replace('@names',names.map(value=>"'"+value.replace(/'/g,"''")+"'").join(','))));
    }
    const query='SELECT * FROM '+provider+' WHERE metadata.sequence AS INT64 IN (@ids) LIMIT 5';
    assert.deepEqual(compile(query, {}, {ids:[
      {type:'INT64',value:'9007199254740993'},{type:'INT64',value:'9007199254740994'}]}),
      compile(query.replace('@ids','9007199254740993,9007199254740994')));
  }
});

test('list parameter admission refuses empty nested null and structural substitutions', () => {
  const query='SELECT * FROM MongoDBOASIS WHERE Name IN (@names) LIMIT 5';
  for (const names of [[],Array(41).fill('x'),[null],[['x']]])
    assert.throws(()=>compile(query, {}, {names}), /List parameters/);
  assert.throws(()=>compile(query.replace('IN (@names)','= @names'), {}, {names:['x']}), /complete value list/);
  assert.throws(()=>compile(query.replace('(@names)',"(@names, 'y')"), {}, {names:['x']}), /complete value list/);
  assert.deepEqual(compile(query.replace('@names','/* value */ @names /* end */'), {}, {names:['x','y']}),
    compile(query.replace('@names',"'x','y'")));
});
