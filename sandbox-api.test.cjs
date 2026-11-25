const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Exercise the shipped helper rather than a separate copy of its request logic.
const html = fs.readFileSync(`${__dirname}/web4-sandbox.html`, 'utf8');
const start = html.indexOf('async function call(');
const end = html.indexOf('\n// 1 ', start);
assert.ok(start >= 0 && end > start);
function client(fetch) {
  // call() consumes the session snapshot; lifecycle behavior is tested separately.
  const access = { base: 'https://example.invalid', token: 'controlled-token' };
  const session = { accessContext: async () => access,
    assertContext: observed => assert.equal(observed, access) };
  const context = vm.createContext({fetch, session, CqlLosslessMetadata:require('./lossless-metadata.js'),
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


test('virtual mappings use saved MongoDB or Neo4j connections and configured sandbox samples', () => {
  const start = html.indexOf('function virtualConnectionName()');
  const end = html.indexOf('function virtualSourceContext()', start);
  assert.ok(start >= 0 && end > start);
  let provider = 'Neo4jOASIS', mode = 'own', sandbox = false, saved = 'warehouse';
  const ctx = vm.createContext({native: () => provider, importMode: () => mode,
    isSandbox: () => sandbox, savedName: () => saved});
  vm.runInContext(html.slice(start, end), ctx);
  assert.equal(ctx.virtualConnectionName(), 'warehouse');
  provider = 'MongoDBOASIS';
  assert.equal(ctx.virtualConnectionName(), 'warehouse');
  saved = null;
  assert.equal(ctx.virtualConnectionName(), null);
  provider = 'SQLLiteDBOASIS';
  saved = 'warehouse';
  assert.equal(ctx.virtualConnectionName(), null);
  mode = 'demo';
  assert.equal(ctx.virtualConnectionName(), null);
  sandbox = true;
  assert.equal(ctx.virtualConnectionName(), 'oasis-sandbox-native-fixture');
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
    native: () => 'MongoDBOASIS',
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
  assert.deepEqual(withVirtualMapping(body, 'data/query-cql/projection', id),
    {path:'data/query-cql/projection/mixed',body:{...body,virtualMappingId:id}});
  assert.deepEqual(withVirtualMapping(body, 'data/query-cql/projection', ''),
    {path:'data/query-cql/projection',body});
  assert.equal(withVirtualMapping({...body,virtualMappingId:id}, 'data/query-cql/projection').path,
    'data/query-cql/projection/mixed');
  assert.throws(() => withVirtualMapping(body, 'data/query-cql', id), /projection/);
  assert.throws(() => withVirtualMapping(body, 'data/query-cql/projection', 'invalid'), /valid/);
});


test('mixed result labels align with the exact returned rows', () => {
  const source = fs.readFileSync(__dirname + '/cql-playground.js', 'utf8');
  const start = source.indexOf('    function render(result, scalarAlias,');
  const end = source.indexOf('    async function run()', start);
  assert.ok(start >= 0 && end > start);
  const cells = [];
  const buttons = [];
  const row = () => ({append: () => {}, insertCell: () => {
    const cell = {append: button => buttons.push(button)};
    cells.push(cell);
    return cell;
  }});
  const table = {createTHead: () => ({insertRow: row}), createTBody: () => ({insertRow: row})};
  const elements = {'cql-response': {}, 'cql-results': {replaceChildren: () => {}}};
  const ctx = vm.createContext({$: key => elements[key], note: () => {},
    document: {createElement: tag => tag === 'table' ? table :
      {addEventListener: function (event, action) { this[event] = action; }}}});
  vm.runInContext(source.slice(start, end), ctx);
  const payload = {version:'cql-projection-v1', columns:[{alias:'Id'}], rows:[['left'], ['right']],
    provenance:[{representation:'Materialized'}, {representation:'Virtual', alsoMaterialized:true}]};
  ctx.render({result: payload});
  assert.deepEqual(cells.map(cell => cell.textContent),
    ['left', 'Stored Holon', 'right', 'Live mapping · stored copy exists']);
  assert.throws(() => ctx.render({result: {...payload, provenance: []}}), /incomplete row provenance/);
  const virtual = {representation:'Virtual', mappingId:'owned-mapping'};
  const calls = [];
  ctx.render({result:{...payload, rows:[...payload.rows,['new']],
    provenance:[...payload.provenance,virtual]}}, undefined, (...args) => calls.push(args));
  assert.equal(buttons.length,1);
  assert.equal(buttons[0].textContent,'Save snapshot');
  assert.equal(calls.length,0);
  buttons[0].click();
  assert.deepEqual(calls,[[virtual,'new',buttons[0]]]);

});


test('SQLite virtual example compiles a MongoDB materialized read with a shared supplier predicate', () => {
  const sql = html.match(/cql-sqlite-virtual-example'\)\.addEventListener\('click', \(\) => loadVirtualExample\(\s*"([^"]+)"/)?.[1];
  assert.ok(sql);
  const query = require('./cql-text.js').compile(sql);
  assert.equal(query.path,'data/query-cql/projection');
  assert.equal(query.body.provider,'MongoDBOASIS');
  assert.deepEqual(query.body.filters,[{metadataPath:['country'],scalar:'String',operator:'Equal',value:'United Kingdom'}]);
});


test('snapshot keeps all exact filters and their fields from the mixed projection', () => {
  const {virtualSnapshotQuery} = require('./cql-playground.js');
  const filters = [
    {metadataPath:['points'],scalar:'Integer',operator:'Equal',value:'9007199254740993'},
    {metadataPath:['active'],scalar:'Boolean',operator:'Equal',value:true}
  ];
  const query = virtualSnapshotQuery({
    filters, columns:[{field:'Id'},{metadataPath:['name']},{metadataPath:['name']}]
  });
  assert.deepEqual(query,{filters,select:['name','points','active'],take:100});
  assert.deepEqual(virtualSnapshotQuery({filters: filters.slice(0, 1),
    columns:[{field:'Id'},{metadataPath:['name']}]}),
    {filters:filters.slice(0,1),select:['name','points'],take:100});
});

test('single length snapshot retains its function, operator, bound and source text field', () => {
  const {virtualSnapshotQuery} = require('./cql-playground.js');
  const filter = {metadataPath:['name'],scalar:'String',function:'Utf16Length',
    operator:'GreaterThanOrEqual',value:'9007199254740993'};
  const query = virtualSnapshotQuery({filters:[filter],
    columns:[{field:'Id'},{metadataPath:['label'],valueType:'String'}]});
  assert.deepEqual(query.select,['label','name']);
  assert.deepEqual(query.filters,[filter]);
  filter.function = null;
  filter.operator = 'Equal';
  filter.metadataPath[0] = 'changed';
  assert.equal(query.filters[0].function,'Utf16Length');
  assert.equal(query.filters[0].operator,'GreaterThanOrEqual');
  assert.deepEqual(query.filters[0].metadataPath,['name']);
  assert.equal(query.filters[0].value,'9007199254740993');
});

test('actual snapshot transport sends exact prepared metadata to the save endpoint', async () => {
  const sent=[];
  const source='{"result":{"id":"row","isPublic":false,"metaData":{"points":9007199254740993,"maximum":9223372036854775807}}}';
  const call=client(async(url,init)=>{
    sent.push({url,init});
    if(url.endsWith('/snapshot/prepare')) return {ok:true,status:200,headers:{get:()=>null},
      text:async()=>source,json:async()=>assert.fail('Snapshot parsing must retain numeric source tokens.')};
    return response(200,{result:{id:'row'}});
  });
  const prepared=await call('POST','native-data/MongoDBOASIS/virtual-mappings/owned/snapshot/prepare',
    {rowId:'row'},{preserveMetadata:true});
  await call('POST','data/save-holon',{operationId:'one-save',holon:prepared.result});
  assert.equal(sent.length,2);
  assert.ok(sent[1].init.body.includes('"points":9007199254740993'));
  assert.ok(sent[1].init.body.includes('"maximum":9223372036854775807'));
});
