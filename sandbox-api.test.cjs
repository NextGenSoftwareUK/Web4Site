const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Exercise the shipped helper rather than a separate copy of its request logic.
const html = fs.readFileSync(`${__dirname}/web4-sandbox.html`, 'utf8');
const start = html.indexOf('async function call(method, path, body){');
const end = html.indexOf('\n// 1 ', start);
assert.ok(start >= 0 && end > start);
function client(fetch) {
  // call() consumes the session snapshot; lifecycle behavior is tested separately.
  const access = { base: 'https://example.invalid', token: 'controlled-token' };
  const session = { accessContext: async () => access,
    assertContext: observed => assert.equal(observed, access) };
  const context = vm.createContext({fetch, session,
    crypto:{randomUUID:()=> 'new-key'}});
  vm.runInContext(html.slice(start, end), context);
  return context.call;
}
function response(status, data, operation) {
  return {ok:status === 200, status, headers:{get:()=> operation}, json:async()=> data};
}
test('save uses the same explicit operation key and bearer, without modifying the body', async()=> {
  let request;
  const call = client(async(url, init)=> {request={url,init};return response(200,{result:{isError:false,result:{id:'saved'}}});});
  const body={operationId:'write-key',holon:{name:'Coffee'}};
  assert.equal((await call('POST','data/save-holon',body)).result.id,'saved');
  assert.equal(request.init.headers['Idempotency-Key'],'write-key');
  assert.equal(request.init.headers.Authorization,'Bearer controlled-token');
  assert.equal(request.init.body,JSON.stringify(body));
});
test('a request without a write operation receives an explicit key', async()=> {
  const call=client(async(url,init)=> {assert.equal(init.headers['Idempotency-Key'],'new-key');return response(200,{result:[]});});
  await call('GET','sandbox/refusals');
});
test('transport uncertainty retains the key and never retries the provider', async()=> {
  let attempts=0;
  const call=client(async()=> {attempts++;throw new Error('Connection lost');});
  await assert.rejects(call('POST','data/save-holon',{operationId:'uncertain-key'}),/uncertain-key.*Outcome unknown/);
  assert.equal(attempts,1);
});
test('accounting rejection retains the key and server operation identity',async()=> {
  const call=client(async()=> response(503,{message:'Settlement pending',operationId:'body-op'},'header-op'));
  await assert.rejects(call('POST','data/save-holon',{operationId:'write-key'}),/Settlement pending.*write-key.*header-op/);
});

for (const captured of [true, false]) test(`failover display uses only this response's diagnostics (captured=${captured})`, async()=> {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value:'MongoDBOASIS', innerHTML:'',
      addEventListener:(_, handler)=> {elements.get(id).handler=handler;}});
    return elements.get(id);
  };
  let refusalReads = 0;
  const calls = [];
  const context = vm.createContext({$:element, holonId:'owned-record',
    performance:{now:()=>1}, esc:value=>String(value), setNote:()=>{},
    api:()=> {throw new Error('Shared status must never provide per-request route evidence.');},
    call:async(method,path)=> {
      calls.push(path);
      if (path === 'sandbox/refusals') return {result:{MongoDBOASIS:refusalReads++}};
      if (path !== 'data/load-holon') throw new Error('Unexpected operation');
      return {result:{id:'owned-record',name:'Coffee'}, metaData:captured ? {
        hyperDriveFailoverDiagnostic:JSON.stringify({SelectedProvider:'SQLLiteDBOASIS',marker:'this-failover'}),
        hyperDriveRoute:JSON.stringify({InitialProvider:'MongoDBOASIS',ServingProvider:'SQLLiteDBOASIS',marker:'this-route'})
      } : {}};
    }});
  const from = html.indexOf("$('fo-load').addEventListener('click'");
  const to = html.indexOf('// Import Your Data',from);
  assert.ok(from >= 0 && to > from);
  vm.runInContext(html.slice(from,to),context);
  await element('fo-load').handler();
  assert.equal(element('fo-load').disabled,false);
  assert.deepEqual(calls,['sandbox/refusals','data/load-holon','sandbox/refusals']);
  assert.equal(element('fo-trace').innerHTML.includes('this-route'),captured);
  assert.equal(element('fo-trace').innerHTML.includes('this-failover'),captured);
});


test('virtual mapping prepares one definition and conditionally saves only that definition', async () => {
  const start = html.indexOf("$('im-save-virtual').addEventListener('click'");
  const end = html.indexOf("\n$('im-import').addEventListener", start);
  assert.ok(start >= 0 && end > start);
  const elements = {
    'cql-virtual-mapping': {},
    'im-save-virtual': {addEventListener: (_event, handler) => { elements.click = handler; }},
    'im-source': {value: 'inventory'},
    'im-virtual-fields': {value: 'Name=label,Stock=qty'},
    'im-virtual-note': {}
  };
  const sent = [];
  let serial = 0, current = 'saved-user-and-connection';
  const ctx = vm.createContext({
    $: id => elements[id],
    virtualSourceContext: () => current,
    virtualListedContext: current,
    virtualConnectionName: () => 'warehouse',
    busy: async (_button, _note, _label, work) => work(),
    setNote: () => {},
    syncVirtualControls: () => {},
    crypto: {randomUUID: () => `id-${++serial}`},
    call: async (method, path, body) => {
      sent.push({method, path, body: JSON.parse(JSON.stringify(body))});
      return {result: {id: body.id, isPublic: false}};
    }
  });
  vm.runInContext(html.slice(start, end), ctx);
  await elements.click();
  assert.deepEqual(sent, [
    {method: 'POST', path: 'native-data/MongoDBOASIS/virtual-mappings/prepare',
      body: {id: 'id-1', sourceName: 'inventory', connectionName: 'warehouse', fields: {Name:'label', Stock:'qty'}}},
    {method: 'POST', path: 'data/save-holon',
      body: {holon:{id:'id-1', isPublic:false}, operationId:'id-2',
        expectedRevisions:{'id-1':null}, saveChildren:false, recursive:false}}
  ]);
  current = 'other-connection';
  await elements.click();
  assert.equal(sent.length, 2);
});


test('mixed projection attaches a nonempty mapping ID without changing its filter', () => {
  const {withVirtualMapping} = require('./cql-playground.js');
  const id = '2fef1cbc-feb8-4ed3-b7de-5f406f769149';
  const body = {provider:'MongoDBOASIS', filters:[{metadataPath:['category'],operator:'Equal',value:'coffee'}]};
  assert.deepEqual(withVirtualMapping(body, 'data/query-cql/projection', id), {...body, virtualMappingId:id});
  assert.throws(() => withVirtualMapping(body, 'data/query-cql', id), /projection/);
  assert.throws(() => withVirtualMapping(body, 'data/query-cql/projection', 'invalid'), /valid/);
});


test('mixed result labels align with the exact returned rows', () => {
  const source = fs.readFileSync(__dirname + '/cql-playground.js', 'utf8');
  const start = source.indexOf('    function render(result, scalarAlias)');
  const end = source.indexOf('    async function run()', start);
  assert.ok(start >= 0 && end > start);
  const cells = [];
  const row = () => ({append: () => {}, insertCell: () => {const cell = {}; cells.push(cell); return cell;}});
  const table = {createTHead: () => ({insertRow: row}), createTBody: () => ({insertRow: row})};
  const elements = {'cql-response': {}, 'cql-results': {replaceChildren: () => {}}};
  const ctx = vm.createContext({$: key => elements[key], note: () => {},
    document: {createElement: tag => tag === 'table' ? table : {}}});
  vm.runInContext(source.slice(start, end), ctx);
  const payload = {version:'cql-projection-v1', columns:[{alias:'Id'}], rows:[['left'], ['right']],
    provenance:[{representation:'Materialized'}, {representation:'Virtual', alsoMaterialized:true}]};
  ctx.render({result: payload});
  assert.deepEqual(cells.map(cell => cell.textContent),
    ['left', 'Stored Holon', 'right', 'Live mapping · stored copy exists']);
  assert.throws(() => ctx.render({result: {...payload, provenance: []}}), /incomplete row provenance/);
});
