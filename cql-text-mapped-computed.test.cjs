const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
const mapping=" WITH VIRTUAL MAPPING '20000000-0000-0000-0000-000000000000'";
test('Mapped row SQL captures all computed functions and selected alias ordering',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const q=compile("SELECT Id, COALESCE(CAST(metadata.textAlias AS STRING), '$literal') AS Text, CASE WHEN CAST(metadata.flagAlias AS BOOLEAN) THEN 'yes' ELSE 'no' END AS Label, COALESCE(CAST(metadata.stockAlias AS INT32), 7) AS Stock FROM "+provider+mapping+" ORDER BY Stock DESC, Id LIMIT 10");
  assert.equal(q.path,'data/query-cql/projection/mixed');
  assert.equal(q.body.columns[1].nullReplacement,'$literal');
  assert.equal(q.body.columns[2].whenFalse,'no');
  assert.equal(q.body.columns[2].nullable,false);
  assert.equal(q.body.columns[3].int32Replacement,7);
  assert.equal(q.body.columns[3].nullable,true);
  assert.deepEqual(q.body.selectedOrder,[{alias:'Stock',descending:true},{alias:'Id',descending:false}]);
 }
});
test('Mapped coalescing preserves separate replacement identities',()=>{
 const q=compile("SELECT Id, COALESCE(CAST(metadata.textAlias AS STRING), 'a') AS First, COALESCE(CAST(metadata.textAlias AS STRING), 'b') AS Second FROM MongoDBOASIS"+mapping+" ORDER BY Id LIMIT 10");
 assert.equal(q.body.columns[1].nullReplacement,'a');
 assert.equal(q.body.columns[2].nullReplacement,'b');
});
test('Mapped computed SQL retains identity, domain and grouped restrictions',()=>{
 for(const query of [
  "SELECT COALESCE(CAST(metadata.textAlias AS STRING), 'a') AS Text FROM MongoDBOASIS",
  "SELECT Id, COALESCE(Name, 'a') AS Text FROM MongoDBOASIS",
  "SELECT Id, COALESCE(CAST(metadata.stockAlias AS INT64), 7) AS Stock FROM MongoDBOASIS",
  "SELECT DISTINCT Id, COALESCE(CAST(metadata.textAlias AS STRING), 'a') AS Text FROM MongoDBOASIS",
  "SELECT SUM(COALESCE(CAST(metadata.stockAlias AS INT32), 7)) FROM MongoDBOASIS"
 ]) assert.throws(()=>compile(query+mapping));
});
