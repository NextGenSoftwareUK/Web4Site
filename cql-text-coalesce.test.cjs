const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
test('COALESCE compiles text fields and named literal metadata replacements into native columns',()=>{
  for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
    const query=compile('SELECT COALESCE(Description, @replacement) AS Display, COALESCE(CAST(metadata.label AS STRING), \'\') AS Label FROM '+provider+' ORDER BY Display LIMIT 5',{}, {replacement:"unknown'); DELETE --"});
    assert.equal(query.path,'data/query-cql/projection');
    assert.deepEqual(query.body.columns[0],{field:'Description',function:'TextCoalesce',nullReplacement:"unknown'); DELETE --",alias:'Display'});
    assert.equal(query.body.columns[1].function,'TextCoalesce');
    assert.equal(query.body.columns[1].nullReplacement,'');
    assert.deepEqual(query.body.columns[1].metadataPath,['label']);
    assert.deepEqual(query.body.selectedOrder,[{alias:'Display',descending:false}]);
  }
});
test('COALESCE requires exact text input and refuses unsupported aggregate or mapped contracts',()=>{
  for(const expression of ["COALESCE(Version, 'x')","COALESCE(CAST(metadata.n AS INT64), 'x')","COALESCE(Name, NULL)","COALESCE(Name, 4)","COALESCE(LENGTH(Name), 'x')"])
    assert.throws(()=>compile('SELECT '+expression+' AS Label FROM MongoDBOASIS'));
  assert.throws(()=>compile("SELECT MIN(COALESCE(Name, 'x')) FROM MongoDBOASIS"),/row columns/);
  assert.throws(()=>compile("SELECT DISTINCT COALESCE(Name, 'x') AS Label FROM MongoDBOASIS"),/Computed/);
  assert.throws(()=>compile("SELECT COALESCE(Name, 'x') AS Label FROM MongoDBOASIS WITH VIRTUAL MAPPING '20000000-0000-0000-0000-000000000000'"));
});
test('COALESCE expression ordering includes its literal while existing LENGTH remains unchanged',()=>{
  const query=compile("SELECT COALESCE(Name, 'a') AS Label FROM Neo4jOASIS ORDER BY COALESCE(Name, 'a') DESC LIMIT 3");
  assert.deepEqual(query.body.selectedOrder,[{alias:'Label',descending:true}]);
  assert.throws(()=>compile("SELECT COALESCE(Name, 'a') AS Label FROM Neo4jOASIS ORDER BY COALESCE(Name, 'b')"),/selected/);
  const length=compile('SELECT LENGTH(Name) AS Units FROM MongoDBOASIS LIMIT 3');
  assert.equal(length.body.columns[0].function,'Utf16Length');
});
