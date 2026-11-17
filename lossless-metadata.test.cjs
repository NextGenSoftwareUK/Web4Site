const test = require('node:test');
const assert = require('node:assert/strict');
const {parse} = require('./lossless-metadata.js');
for (const token of ['9007199254740993','9223372036854775807','-9223372036854775808',
  '0.1000000000000000000001','1.2345678901234567890123456789','-0','1e30']) {
  test('snapshot metadata preserves numeric token ' + token, () => {
    const text = '{"result":{"id":"row","version":1,"isPublic":false,"metaData":{"amount":' + token + '}}}';
    const data = parse(text);
    assert.equal(data.result.version,1);
    assert.equal(data.result.isPublic,false);
    assert.equal(JSON.stringify(data.result.metaData.amount),token);
    assert.ok(JSON.stringify({holon:data.result}).includes('"amount":' + token));
  });
}
test('nested metadata arrays retain numeric values and ordinary response numbers stay ordinary', () => {
  const result = parse('{"duration":1e3,"result":{"metadata":{"rows":[{"n":9007199254740993}],"count":2}}}');
  assert.equal(result.duration,1000);
  assert.equal(result.result.metadata.count,2);
  assert.equal(JSON.stringify(result.result.metadata.rows),'[{"n":9007199254740993}]');
});
test('rawJSON-shaped source objects are data and malformed JSON is refused', () => {
  const result = parse('{"result":{"metaData":{"rawJSON":"null","__proto__":{"n":9007199254740993}}}}');
  assert.equal(result.result.metaData.rawJSON,'null');
  assert.ok(Object.hasOwn(result.result.metaData,'__proto__'));
  assert.equal(JSON.stringify(result.result.metaData.__proto__),'{"n":9007199254740993}');
  assert.equal({}.n,undefined);
  assert.throws(() => parse('{"result":'),SyntaxError);
});

for (const missing of ['raw JSON','numeric source context']) test('refuses snapshot decoding without '+missing, () => {
  const fs=require('node:fs'),vm=require('node:vm');
  const legacy = {parse:JSON.parse,stringify:JSON.stringify,rawJSON:JSON.rawJSON,isRawJSON:JSON.isRawJSON};
  if(missing==='raw JSON') delete legacy.rawJSON;
  else legacy.parse=(text,reviver)=> JSON.parse(text,reviver && function(key,value){return reviver(key,value);});
  const context=vm.createContext({JSON:legacy});
  vm.runInContext(fs.readFileSync(require.resolve('./lossless-metadata.js'),'utf8'),context);
  assert.throws(()=>context.CqlLosslessMetadata.parse('{"metaData":{"n":9007199254740993}}'),/Update your browser/);
});
