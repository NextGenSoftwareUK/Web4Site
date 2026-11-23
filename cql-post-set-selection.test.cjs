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
test('late selection never flattens later filtering, paging or distinct into source membership',()=>{
 const inner='SELECT * FROM MongoDBOASIS UNION SELECT * FROM MongoDBOASIS LIMIT 3';
 for(const suffix of [' WHERE Version > 1',' LIMIT 1',' ORDER BY Name'])
  assert.throws(()=>compile('SELECT Name FROM ('+inner+') AS records'+suffix),/direct SELECT list/);
 assert.throws(()=>compile('SELECT DISTINCT Name FROM ('+inner+') AS records'),/DISTINCT|explicit native/);
 assert.throws(()=>compile('SELECT TOP 1 Name FROM ('+inner+') AS records'),/TOP/);
 const tuple=compile('SELECT Name FROM MongoDBOASIS UNION SELECT Name FROM MongoDBOASIS LIMIT 3');
 assert.ok(tuple.body.left.columns);assert.equal(tuple.body.outputColumns,undefined);
});
