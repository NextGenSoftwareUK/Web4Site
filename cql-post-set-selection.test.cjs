const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
test('late entity selection preserves identity membership and every existing window',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS'])
 for(const operator of ['UNION','UNION ALL','INTERSECT','EXCEPT']){
  const inner='SELECT * FROM '+provider+' WHERE Name = @name '+operator+
    ' SELECT * FROM '+provider+' ORDER BY Id LIMIT 3 OFFSET 1';
  const expected=compile(inner,{}, {name:'same'});
  const actual=compile('SELECT Name AS Label, Id FROM ('+inner+') AS records',{}, {name:'same'});
  assert.equal(actual.path,'data/query-cql/set');
  assert.deepEqual(actual.body,{...expected.body,includeMetadata:false,
    outputColumns:[{field:'Name',alias:'Label'},{field:'Id',alias:'Id'}]});
  assert.equal(actual.body.left.columns,undefined);
  assert.equal(actual.body.right.columns,undefined);
 }
});
test('WITH entity membership uses the same late selection and bound capture',()=>{
 const sql='WITH records AS (SELECT * FROM MongoDBOASIS UNION ALL SELECT * FROM MongoDBOASIS LIMIT @n) SELECT Name AS Label FROM records';
 const actual=compile(sql,{}, {n:4});
 assert.equal(actual.body.take,4);
 assert.deepEqual(actual.body.outputColumns,[{field:'Name',alias:'Label'}]);
});
test('late entity stages preserve source windows and bind qualified visible ordering',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const sql='SELECT records.Name AS Label, records.Id FROM (SELECT * FROM '+provider+
   ' UNION ALL SELECT * FROM '+provider+' ORDER BY Id LIMIT 5 OFFSET 1) AS records'+
   ' WHERE records.Version >= @minimum ORDER BY Label DESC LIMIT @count OFFSET 1';
  const q=compile(sql,{}, {minimum:2,count:3});
  assert.equal(q.body.kind,'Concat');assert.equal(q.body.skip,1);assert.equal(q.body.take,5);
  assert.deepEqual(q.body.ordering,[{field:'Id',descending:false}]);
  assert.deepEqual(q.body.entityStages.map(s=>s.operation),['Where','OrderBy','Skip','Take']);
  assert.equal(q.body.entityStages[0].where.filter.field,'Version');
  assert.equal(q.body.entityStages[0].where.filter.value,2);
  assert.deepEqual(q.body.entityStages[1].ordering,[{field:'Name',descending:true}]);
  assert.equal(q.body.entityStages[3].count,3);
  assert.deepEqual(q.body.outputColumns,[{field:'Name',alias:'Label'},{field:'Id',alias:'Id'}]);
 }
});
test('TOP and chained entity CTE stages retain earlier membership windows',()=>{
 const q=compile('WITH records AS (SELECT * FROM Neo4jOASIS UNION SELECT * FROM Neo4jOASIS LIMIT 5), '+
  'filtered AS (SELECT * FROM records WHERE Version >= 1 LIMIT 3) SELECT TOP 2 Name FROM filtered');
 assert.equal(q.body.take,5);
 assert.deepEqual(q.body.entityStages.map(s=>s.operation),['Where','Take','Take']);
 assert.equal(q.body.entityStages[1].count,3);assert.equal(q.body.entityStages[2].count,2);
});
test('entity result filters retain typed metadata and Boolean relationship intent',()=>{
 const q=compile("SELECT Id FROM (SELECT * FROM MongoDBOASIS UNION SELECT * FROM MongoDBOASIS LIMIT 5) AS r "+
  "WHERE (r.Version >= 2 AND CAST(r.metadata.stock AS INT32) >= 1 AND r.Name = 'Coffee') OR NOT EXISTS CHILD");
 const predicate=q.body.entityStages[0].where;
 assert.equal(predicate.kind,'Or');
 assert.equal(predicate.terms[0].kind,'And');
 assert.match(JSON.stringify(predicate),/stock/);
 assert.match(JSON.stringify(predicate),/Int32/);
 assert.equal(predicate.terms[1].kind,'Not');
 assert.equal(predicate.terms[1].terms[0].kind,'Child');
});
test('late selected DISTINCT stays separate from operand value equality',()=>{
 const inner='SELECT * FROM MongoDBOASIS UNION SELECT * FROM MongoDBOASIS LIMIT 3';
 const selected=compile('SELECT DISTINCT Name FROM ('+inner+') AS records');
 assert.equal(selected.body.kind,'Union');assert.equal(selected.body.take,3);
 assert.equal(selected.body.left.columns,undefined);assert.equal(selected.body.right.columns,undefined);
 assert.deepEqual(selected.body.outputColumns,[{field:'Name',alias:'Name'}]);
 assert.deepEqual(selected.body.selectedStages,[{operation:'Distinct'}]);
 const tuple=compile('SELECT Name FROM MongoDBOASIS UNION SELECT Name FROM MongoDBOASIS LIMIT 3');
 assert.ok(tuple.body.left.columns);assert.equal(tuple.body.outputColumns,undefined);
});

test('metadata keyword segments are not mistaken for an outer ordering or a complete-source page',()=>{
 const inner='SELECT * FROM MongoDBOASIS UNION SELECT * FROM MongoDBOASIS LIMIT 5';
 const q=compile('SELECT Id FROM ('+inner+') AS r WHERE CAST(r.metadata.order AS INT32) >= 1');
 assert.deepEqual(q.body.entityStages.map(s=>s.operation),['Where']);
 assert.throws(()=>compile('WITH sample AS (SELECT Name FROM MongoDBOASIS WHERE metadata.limit AS INT32 >= 1) SELECT * FROM sample'),/explicit TOP, LIMIT or FETCH/);
});
