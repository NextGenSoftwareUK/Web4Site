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
