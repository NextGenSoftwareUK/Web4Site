const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
test('late entity-set selected aliases filter order and page without changing identity membership',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']) {
  const sql='WITH records AS (SELECT * FROM '+provider+' UNION ALL SELECT * FROM '+provider+' LIMIT 4), '+
   'chosen AS (SELECT Id, Name AS Label FROM records LIMIT 3) '+
   "SELECT Label AS Display FROM chosen WHERE Label LIKE 'alp%' ORDER BY Display DESC LIMIT 1 OFFSET 1";
  const result=compile(sql);
  assert.equal(result.path,'data/query-cql/set');assert.equal(result.body.kind,'Concat');
  assert.equal(result.body.left.columns,undefined);assert.equal(result.body.right.columns,undefined);
  assert.equal(result.body.take,4);
  assert.deepEqual(result.body.entityStages,[{operation:'Take',count:3}]);
  assert.deepEqual(result.body.outputColumns,[{field:'Id',alias:'Id'},{field:'Name',alias:'Label'}]);
  assert.deepEqual(result.body.selectedStages,[
   {operation:'Where',filters:[{alias:'Label',operator:'StartsWith',value:'alp'}]},
   {operation:'OrderBy',order:[{alias:'Label',descending:true}]},
   {operation:'Skip',count:1},{operation:'Take',count:1},
   {operation:'Select',columns:[{alias:'Display',sourceAlias:'Label'}]}]);
 }
});
test('selected DISTINCT and declared CTE aliases retain the earlier entity window',()=>{
 const sql='WITH records AS (SELECT * FROM Neo4jOASIS UNION SELECT * FROM Neo4jOASIS LIMIT 4), '+
  'chosen (key,label) AS (SELECT Id,Name FROM records LIMIT 3), '+
  'unique_names AS (SELECT DISTINCT label AS Name FROM chosen ORDER BY Name LIMIT 2) '+
  "SELECT Name FROM unique_names WHERE Name <> 'skip' LIMIT 1";
 const result=compile(sql);
 assert.equal(result.body.kind,'Union');assert.equal(result.body.left.columns,undefined);
 assert.deepEqual(result.body.entityStages,[{operation:'Take',count:3}]);
 assert.deepEqual(result.body.outputColumns,[{field:'Id',alias:'Id'},{field:'Name',alias:'Name'}]);
 const stages=result.body.selectedStages;
 assert.deepEqual(stages.map(stage=>stage.operation),['Select','Select','Distinct','OrderBy','Take','Where','Where','Take']);
 assert.deepEqual(stages[0].columns,[{alias:'key',sourceAlias:'Id'},{alias:'label',sourceAlias:'Name'}]);
 assert.deepEqual(stages[1].columns,[{alias:'Name',sourceAlias:'label'}]);
 assert.equal(stages[4].count,2);assert.equal(stages[7].count,1);
});
test('derived late set selections preserve bounded stages and refuse hidden field reentry',()=>{
 const inner='SELECT Name AS Label FROM (SELECT * FROM MongoDBOASIS UNION ALL SELECT * FROM MongoDBOASIS LIMIT 4) AS records LIMIT 2';
 const result=compile('SELECT page.Label FROM ('+inner+") AS page WHERE page.Label='alpha' LIMIT 1");
 assert.equal(result.path,'data/query-cql/set');assert.equal(result.body.take,4);
 assert.deepEqual(result.body.entityStages,[{operation:'Take',count:2}]);
 assert.deepEqual(result.body.selectedStages,[
  {operation:'Where',filters:[{alias:'Label',operator:'Equal',value:'alpha'}]},
  {operation:'Take',count:1}]);
 assert.throws(()=>compile('SELECT page.Version FROM ('+inner+') AS page LIMIT 1'),/does not expose/);
});
