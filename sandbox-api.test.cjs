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
  const context = vm.createContext({fetch, jwt:'controlled-token', base:()=> 'https://example.invalid',
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
