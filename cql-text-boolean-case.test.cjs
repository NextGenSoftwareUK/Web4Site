const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
test('CASE compiles canonical Boolean conditions and safely bound literal branches',()=>{
  for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
    const q=compile("SELECT CASE WHEN IsActive THEN @yes ELSE '' END AS Status FROM "+provider+" ORDER BY Status LIMIT 5",{}, {yes:"active'); DELETE --"});
    assert.equal(q.path,'data/query-cql/projection');
    assert.deepEqual(q.body.columns[0],{field:'IsActive',function:'BooleanTextCase',whenTrue:"active'); DELETE --",whenFalse:'',alias:'Status'});
    assert.deepEqual(q.body.selectedOrder,[{alias:'Status',descending:false}]);
  }
});
test('CASE ordering identifies both literal branches',()=>{
  const q=compile("SELECT CASE WHEN IsPublic THEN 'yes' ELSE 'no' END AS Visibility FROM Neo4jOASIS ORDER BY CASE WHEN IsPublic THEN 'yes' ELSE 'no' END DESC LIMIT 3");
  assert.deepEqual(q.body.selectedOrder,[{alias:'Visibility',descending:true}]);
  assert.throws(()=>compile("SELECT CASE WHEN IsPublic THEN 'yes' ELSE 'no' END AS Visibility FROM Neo4jOASIS ORDER BY CASE WHEN IsPublic THEN 'yes' ELSE 'other' END"),/selected/);
});
test('CASE explicitly refuses unsupported domains, predicates, branches and aggregate contracts',()=>{
  for(const expression of [
    "CASE WHEN Name THEN 'yes' ELSE 'no' END",
    "CASE WHEN CAST(metadata.flag AS STRING) THEN 'yes' ELSE 'no' END",
    "CASE WHEN IsPublic = true THEN 'yes' ELSE 'no' END",
    "CASE WHEN IsPublic THEN 1 ELSE 0 END",
    "CASE WHEN IsPublic THEN NULL ELSE 'no' END",
    "CASE WHEN IsPublic THEN 'yes' END"])
    assert.throws(()=>compile('SELECT '+expression+' AS Label FROM MongoDBOASIS'));
  assert.throws(()=>compile("SELECT MIN(CASE WHEN IsPublic THEN 'yes' ELSE 'no' END) FROM MongoDBOASIS"),/row columns/);
  assert.throws(()=>compile("SELECT DISTINCT CASE WHEN IsPublic THEN 'yes' ELSE 'no' END AS Label FROM MongoDBOASIS"),/Computed/);
  assert.throws(()=>compile("SELECT CASE WHEN IsPublic THEN 'yes' ELSE 'no' END AS Label FROM MongoDBOASIS WITH VIRTUAL MAPPING '20000000-0000-0000-0000-000000000000'"));
});

test('CASE captures typed Boolean metadata as a required native input',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const q=compile("SELECT CASE WHEN CAST(metadata.flag AS BOOLEAN) THEN @yes ELSE 'no' END AS Label FROM "+provider+" ORDER BY Label LIMIT 3",{}, {yes:'yes'});
  assert.deepEqual(q.body.columns[0],{metadataPath:['flag'],valueType:'Boolean',nullable:false,function:'BooleanTextCase',whenTrue:'yes',whenFalse:'no',alias:'Label'});
 }
 assert.throws(()=>compile("SELECT CASE WHEN CAST(metadata.flag AS INT64) THEN 'yes' ELSE 'no' END AS Label FROM MongoDBOASIS"));
});
