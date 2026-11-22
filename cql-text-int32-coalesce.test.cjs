const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
test('COALESCE captures nullable Int32 metadata and a safely bound zero',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const q=compile('SELECT COALESCE(CAST(metadata.stock AS INT32), @zero) AS Stock FROM '+provider+' ORDER BY Stock LIMIT 3',{}, {zero:0});
  assert.equal(q.path,'data/query-cql/projection');
  assert.deepEqual(q.body.columns[0],{metadataPath:['stock'],valueType:'Int32',nullable:true,function:'Int32Coalesce',int32Replacement:0,alias:'Stock'});
  assert.deepEqual(q.body.selectedOrder,[{alias:'Stock',descending:false}]);
 }
});
test('Integer replacement bounds and formula identity are explicit',()=>{
 for(const n of [-2147483648,2147483647])
  assert.equal(compile('SELECT COALESCE(CAST(metadata.stock AS INT32), '+n+') AS Stock FROM MongoDBOASIS').body.columns[0].int32Replacement,n);
 for(const token of ['2147483648','-2147483649','1.5','TRUE','NULL',"'0'"])
  assert.throws(()=>compile('SELECT COALESCE(CAST(metadata.stock AS INT32), '+token+') AS Stock FROM MongoDBOASIS'));
 const q=compile('SELECT COALESCE(CAST(metadata.stock AS INT32), 1) AS Stock FROM Neo4jOASIS ORDER BY COALESCE(CAST(metadata.stock AS INT32), 1) DESC LIMIT 3');
 assert.deepEqual(q.body.selectedOrder,[{alias:'Stock',descending:true}]);
 assert.throws(()=>compile('SELECT COALESCE(CAST(metadata.stock AS INT32), 1) AS Stock FROM Neo4jOASIS ORDER BY COALESCE(CAST(metadata.stock AS INT32), 2)'),/selected/);
});
test('Integer coalescing refuses unadmitted source and aggregate or mapped contracts',()=>{
 for(const expression of ['COALESCE(Version, 0)','COALESCE(CAST(metadata.stock AS INT64), 0)','COALESCE(CAST(metadata.flag AS BOOLEAN), 0)'])
  assert.throws(()=>compile('SELECT '+expression+' AS Value FROM MongoDBOASIS'));
 assert.throws(()=>compile('SELECT SUM(COALESCE(CAST(metadata.stock AS INT32), 0)) FROM MongoDBOASIS'),/row columns/);
 assert.throws(()=>compile('SELECT DISTINCT COALESCE(CAST(metadata.stock AS INT32), 0) AS Stock FROM MongoDBOASIS'),/Computed/);
 assert.throws(()=>compile("SELECT COALESCE(CAST(metadata.stock AS INT32), 0) AS Stock FROM MongoDBOASIS WITH VIRTUAL MAPPING '20000000-0000-0000-0000-000000000000'"));
});
