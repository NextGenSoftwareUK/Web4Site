const {test}=require('node:test');
const assert=require('node:assert/strict');
const {virtualSnapshotQuery}=require('./cql-playground.js');

test('unfiltered final-page snapshots request original fields across the complete 200-row source bound',()=>{
  const body={filters:[],skip:150,take:10,columns:[
    {field:'Id',alias:'Id'},
    {metadataPath:['name'],valueType:'String',alias:'Name'},
    {metadataPath:['name'],valueType:'String',function:'Utf16Length',alias:'NameLength'}]};
  assert.deepEqual(virtualSnapshotQuery(body),{filters:[],select:['name'],take:200});
  assert.equal(body.skip,150);
  assert.equal(body.take,10);
});
