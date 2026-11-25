const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'web4-sandbox.html'), 'utf8');
const start = html.indexOf("$('im-save-virtual').addEventListener('click', async () => {");
const end = html.indexOf("$('im-import').addEventListener", start);
assert.ok(start >= 0 && end > start);
const handlerSource = html.slice(start, end);
const mappingId = '12345678-1234-4234-8234-123456789abc';
const operationId = '22345678-1234-4234-8234-123456789abc';
const ownerId = '32345678-1234-4234-8234-123456789abc';
function setup(options = {}) {
  const nodes = new Map(); let context='session/provider/connection'; let callback;
  const writes=[]; const notes=[];
  const node=id => {
    if(!nodes.has(id)) nodes.set(id, {value: id==='im-source'?'products':id==='im-virtual-fields'?'stock=stock':'',addEventListener:(event,fn)=>{callback=fn;}});
    return nodes.get(id);
  };
  const change = phase => {
    if(options.change===phase+'Context') context='different session/provider/connection';
    if(options.change===phase+'Source') node('im-source').value='different-source';
  };
  const prepared={id:mappingId,createdByAvatarId:ownerId,isPublic:false};
  const call=async(method,url,body)=>{
    if(url==='data/save-holon') {
      writes.push(body);change('save');
      return Object.hasOwn(options,'saved')?options.saved:{isSaved:true,result:{...prepared}};
    }
    change('prepare');
    return {result: options.invalidPreparedOwner?{...prepared,createdByAvatarId:'not-an-owner'}:prepared};
  };
  new Function('$','virtualSourceContext','virtualListedContext','busy','native','crypto','call','setNote','virtualConnectionName','syncVirtualControls',handlerSource)(
    node,()=>context,context,async(btn,note,message,work)=>work(),()=> 'MongoDBOASIS',
    {randomUUID:(()=>{let n=0;return()=>n++===0?mappingId:operationId;})()},call,
    (el,text)=>notes.push(text),()=> 'saved-connection',()=>{});
  return {run:()=>callback(),node,writes,notes};
}
test('virtual mapping selection requires an acknowledged private same-owner save', async()=>{
 const app=setup();await app.run();
 assert.equal(app.writes.length,1);assert.equal(app.writes[0].operationId,operationId);
 assert.deepEqual(app.writes[0].expectedRevisions,{[mappingId]:null});
 assert.equal(app.node('cql-virtual-mapping').value,mappingId);
 assert.match(app.notes.at(-1),/saved/);
});
for(const [name,saved] of [
 ['not-saved acknowledgement',{isSaved:false,result:{id:mappingId,createdByAvatarId:ownerId,isPublic:false}}],
 ['wrong mapping identity',{isSaved:true,result:{id:operationId,createdByAvatarId:ownerId,isPublic:false}}],
 ['public mapping acknowledgement',{isSaved:true,result:{id:mappingId,createdByAvatarId:ownerId,isPublic:true}}],
 ['different owner acknowledgement',{isSaved:true,result:{id:mappingId,createdByAvatarId:operationId,isPublic:false}}],
 ['missing mapping acknowledgement',{isSaved:true}]
]) test('refuses '+name+' without selecting or repeating a save',async()=>{
 const app=setup({saved});
 await assert.rejects(app.run(),new RegExp('acknowledgement.*'+operationId));
 assert.equal(app.writes.length,1);assert.equal(app.node('cql-virtual-mapping').value,'');assert.deepEqual(app.notes,[]);
});
test('refuses an invalid prepared owner before a save',async()=>{
 const app=setup({invalidPreparedOwner:true});await assert.rejects(app.run(),/prepare the expected private mapping/);
 assert.equal(app.writes.length,0);assert.equal(app.node('cql-virtual-mapping').value,'');
});
for(const change of ['prepareContext','prepareSource']) test('source guard '+change+' prevents the save',async()=>{
 const app=setup({change});await assert.rejects(app.run(),/changed/);
 assert.equal(app.writes.length,0);assert.equal(app.node('cql-virtual-mapping').value,'');
});
for(const change of ['saveContext','saveSource']) test('source guard '+change+' preserves acknowledgement without selecting another source',async()=>{
 const app=setup({change});await assert.rejects(app.run(),/was saved for the original source/);
 assert.equal(app.writes.length,1);assert.equal(app.node('cql-virtual-mapping').value,'');assert.deepEqual(app.notes,[]);
});
