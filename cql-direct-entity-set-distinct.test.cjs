const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
test('direct selected DISTINCT keeps earlier entity windows and pages unique visible values afterwards',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']) {
  const sql='SELECT DISTINCT records.Name AS Label FROM (SELECT * FROM '+provider+
   ' UNION ALL SELECT * FROM '+provider+' ORDER BY Id LIMIT 4) AS records '+
   'WHERE records.Version >= @minimum ORDER BY Label DESC LIMIT 2 OFFSET 1';
  const result=compile(sql,{}, {minimum:2});
  assert.equal(result.path,'data/query-cql/set');assert.equal(result.body.kind,'Concat');assert.equal(result.body.take,4);
  assert.equal(result.body.left.columns,undefined);assert.equal(result.body.right.columns,undefined);
  assert.deepEqual(result.body.outputColumns,[{field:'Name',alias:'Label'}]);
  assert.deepEqual(result.body.entityStages.map(stage=>stage.operation),['Where']);
  assert.equal(result.body.entityStages[0].where.filter.field,'Version');
  assert.equal(result.body.entityStages[0].where.filter.value,2);
  assert.deepEqual(result.body.selectedStages,[{operation:'Distinct'},
   {operation:'OrderBy',order:[{alias:'Label',descending:true}]},
   {operation:'Skip',count:1},{operation:'Take',count:2}]);
 }
});
test('direct DISTINCT TOP and computed selected aliases preserve the native projection boundary',()=>{
 const records='SELECT * FROM Neo4jOASIS UNION SELECT * FROM Neo4jOASIS LIMIT 4';
 const top=compile('SELECT DISTINCT TOP 1 Name AS Label FROM ('+records+') AS records ORDER BY Label');
 assert.equal(top.body.take,4);assert.deepEqual(top.body.selectedStages.map(stage=>stage.operation),['Distinct','OrderBy','Take']);
 assert.equal(top.body.selectedStages[2].count,1);
 const width=compile('SELECT DISTINCT LENGTH(Name) AS Width FROM ('+records+') AS records ORDER BY Width DESC LIMIT 2');
 assert.equal(width.body.outputColumns[0].function,'Utf16Length');
 assert.deepEqual(width.body.selectedStages[1].order,[{alias:'Width',descending:true}]);
 const metadata=compile('SELECT DISTINCT CAST(records.metadata.records.stock AS INT32) AS Quantity FROM ('+records+') AS records ORDER BY Quantity LIMIT 2');
 assert.deepEqual(metadata.body.outputColumns[0].metadataPath,['records','stock']);

});
test('direct DISTINCT refuses full entities hidden ordering and scalar aggregation',()=>{
 const records='SELECT * FROM MongoDBOASIS UNION SELECT * FROM MongoDBOASIS LIMIT 4';
 assert.throws(()=>compile('SELECT DISTINCT * FROM ('+records+') AS records'),/explicit selected columns/);
 assert.throws(()=>compile('SELECT DISTINCT Name FROM ('+records+') AS records ORDER BY Id LIMIT 2'),/DISTINCT orders only/);
 assert.throws(()=>compile('SELECT DISTINCT COUNT(*) FROM ('+records+') AS records'),/native entity columns|aggregate/);
});
