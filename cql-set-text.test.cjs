const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
test('native entity set text preserves both input windows and named values',()=>{
  for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS'])
    for(const [operator,kind] of [['UNION','Union'],['UNION ALL','Concat'],['INTERSECT','Intersect'],['EXCEPT','Except']]){
      const query=compile(`(SELECT * FROM ${provider} WHERE Name = @name ORDER BY Name LIMIT 3 OFFSET 1) ${operator} (SELECT * FROM ${provider} WHERE Version >= 2 LIMIT 4 OFFSET 2)`,{}, {name:"UNION'; DELETE FROM Holon; --"});
      assert.equal(query.path,'data/query-cql/set');assert.equal(query.body.kind,kind);
      assert.equal(query.body.left.skip,1);assert.equal(query.body.left.take,3);
      assert.equal(query.body.right.skip,2);assert.equal(query.body.right.take,4);
      assert.equal(query.body.left.filters[0].value,"UNION'; DELETE FROM Holon; --");
    }
});
test('set grammar refuses ambiguous windows and unsupported authority or projections',()=>{
  const left='(SELECT * FROM MongoDBOASIS LIMIT 2)';
  assert.throws(()=>compile('SELECT * FROM MongoDBOASIS UNION SELECT * FROM MongoDBOASIS'),/parentheses/);
  assert.throws(()=>compile(left+' UNION (SELECT * FROM Neo4jOASIS LIMIT 2)'),/same provider/);
  assert.throws(()=>compile(left+' UNION (SELECT Name FROM MongoDBOASIS LIMIT 2)'),/SELECT \*/);
  assert.throws(()=>compile(left+' UNION '+left+' EXCEPT '+left),/two parenthesized/);
});
test('nested Boolean filters and quoted set keywords retain ordinary meaning',()=>{
  const query=compile("(SELECT * FROM MongoDBOASIS WHERE (Name = 'UNION' OR Name = 'EXCEPT') AND Version >= 1 LIMIT 2) UNION ALL (SELECT * FROM MongoDBOASIS WHERE Name = 'INTERSECT' LIMIT 2);");
  assert.equal(query.body.left.anyOf.length,2);assert.equal(query.body.kind,'Concat');
  assert.equal(compile("SELECT * FROM MongoDBOASIS WHERE Name = 'UNION' LIMIT 2").path,'data/query-cql');
});

test('outer set paging stays separate from both native operand pages',()=>{
  const query=compile('(SELECT * FROM MongoDBOASIS LIMIT 4 OFFSET 1) UNION ALL (SELECT * FROM MongoDBOASIS LIMIT 2 OFFSET 3) LIMIT @count OFFSET 1',{}, {count:3});
  assert.equal(query.body.left.take,4);assert.equal(query.body.left.skip,1);
  assert.equal(query.body.right.take,2);assert.equal(query.body.right.skip,3);
  assert.equal(query.body.take,3);assert.equal(query.body.skip,1);
  assert.throws(()=>compile('(SELECT * FROM MongoDBOASIS) UNION (SELECT * FROM MongoDBOASIS) ORDER BY Name'),/only outer/);
});
