const test=require('node:test'),assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
test('count and any reduce native combined records without changing identity equality',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']) {
  const sql='SELECT COUNT(*) AS Total FROM (SELECT * FROM '+provider+' UNION ALL SELECT * FROM '+provider+' ORDER BY Id LIMIT 5) AS records WHERE records.Version = 1';
  const result=compile(sql);
  assert.equal(result.path,'data/query-cql/set');assert.equal(result.scalarAlias,'Total');
  assert.equal(result.body.provider,provider);assert.equal(result.body.kind,'Concat');assert.equal(result.body.take,5);
  assert.equal(result.body.reduction,'LongCount');assert.equal(result.body.includeMetadata,false);
  assert.equal(result.body.left.columns,undefined);assert.equal(result.body.right.columns,undefined);
  assert.equal(result.body.outputColumns,undefined);
  assert.deepEqual(result.body.reductionWhere,{kind:'Filter',filter:{field:'Version',scalar:'Integer',operator:'Equal',value:1}});
  const any=compile('SELECT ANY(*) FROM (SELECT * FROM '+provider+' INTERSECT SELECT * FROM '+provider+' LIMIT 5) AS records');
  assert.equal(any.body.reduction,'Any');assert.equal(any.body.kind,'Intersect');
 }
});
test('count retains earlier WITH stages and qualified metadata paths',()=>{
 const sql='WITH records AS (SELECT * FROM MongoDBOASIS UNION SELECT * FROM MongoDBOASIS LIMIT 5), bounded AS (SELECT * FROM records LIMIT 1) SELECT COUNT(1) AS Total FROM bounded WHERE Version = 1';
 const result=compile(sql);
 assert.equal(result.body.reduction,'LongCount');assert.equal(result.body.take,5);
 assert.deepEqual(result.body.entityStages,[{operation:'Take',count:1}]);
 assert.equal(result.scalarAlias,'Total');
 const qualified=compile("SELECT COUNT(*) FROM (SELECT * FROM MongoDBOASIS EXCEPT SELECT * FROM MongoDBOASIS LIMIT 5) AS records WHERE records.metadata.records.stock = 'one'");
 assert.equal(qualified.body.kind,'Except');
 assert.deepEqual(qualified.body.reductionWhere.filter.metadataPath,['records','stock']);
});
test('combined counts reject unimplemented value reductions and misplaced scalar pages',()=>{
 const records='SELECT * FROM MongoDBOASIS UNION ALL SELECT * FROM MongoDBOASIS LIMIT 5';
 for(const selection of ['COUNT(Name)','COUNT(DISTINCT Name)','SUM(Version)','DISTINCT COUNT(*)'])
  assert.throws(()=>compile('SELECT '+selection+' FROM ('+records+') AS records'),/aggregate|selected-value/);
 assert.throws(()=>compile('SELECT COUNT(*) FROM ('+records+') AS records LIMIT 1'),/inside.*source|Unexpected clause/);
});
