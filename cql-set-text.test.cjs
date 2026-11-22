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
  assert.throws(()=>compile('SELECT * FROM MongoDBOASIS LIMIT 2 UNION SELECT * FROM MongoDBOASIS'),/parentheses/);
  assert.throws(()=>compile(left+' UNION (SELECT * FROM Neo4jOASIS LIMIT 2)'),/same provider/);
  assert.throws(()=>compile(left+' UNION (SELECT Name FROM MongoDBOASIS LIMIT 2)'),/both inputs/);
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
  assert.throws(()=>compile('(SELECT * FROM MongoDBOASIS) UNION (SELECT * FROM MongoDBOASIS) ORDER BY metadata.hidden'),/declared entity/);
});

test('outer set ordering binds native terms before independent output paging',()=>{
  const sql='(SELECT * FROM MongoDBOASIS LIMIT 4) UNION ALL (SELECT * FROM MongoDBOASIS LIMIT 2)';
  const query=compile(sql+' ORDER BY Name DESC, Version ASC LIMIT 3 OFFSET 1');
  assert.deepEqual(query.body.ordering,[{field:'Name',descending:true},{field:'Version',descending:false}]);
  assert.equal(query.body.take,3);assert.equal(query.body.skip,1);
  assert.equal(query.body.left.take,4);assert.equal(query.body.right.take,2);
  const ordered=compile(sql+' ORDER BY Id DESC');
  assert.deepEqual(ordered.body.ordering,[{field:'Id',descending:true}]);
  assert.equal(Object.hasOwn(ordered.body,'take'),false);
});

test('standard unparenthesized set inputs are complete and global windows stay outside',()=>{
  for(const [operator,kind] of [['UNION','Union'],['UNION ALL','Concat'],['INTERSECT','Intersect'],['EXCEPT','Except']]){
    const query=compile('SELECT * FROM MongoDBOASIS WHERE Name = @name '+operator+' SELECT * FROM MongoDBOASIS WHERE Version >= 2 ORDER BY Id LIMIT 3 OFFSET 1',{}, {name:'Coffee'});
    assert.equal(query.body.kind,kind);
    assert.equal(Object.hasOwn(query.body.left,'take'),false);assert.equal(Object.hasOwn(query.body.right,'take'),false);
    assert.equal(query.body.left.filters[0].value,'Coffee');
    assert.equal(query.body.take,3);assert.equal(query.body.skip,1);
    assert.deepEqual(query.body.ordering,[{field:'Id',descending:false}]);
  }
});

test('selected-column set SQL preserves native sources, visible aliases and global windows',()=>{
  for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS'])
    for(const [operator,kind] of [['UNION','Union'],['UNION ALL','Concat'],['INTERSECT','Intersect'],['EXCEPT','Except']]){
      const query=compile('SELECT Name AS label FROM '+provider+' WHERE Name = @name '+operator+
        ' SELECT Name AS other FROM '+provider+' ORDER BY label DESC LIMIT @count OFFSET 1',{}, {name:'UNION',count:3});
      assert.equal(query.path,'data/query-cql/set');assert.equal(query.body.kind,kind);
      assert.deepEqual(query.body.left.columns,[{field:'Name',alias:'label'}]);
      assert.deepEqual(query.body.right.columns,[{field:'Name',alias:'other'}]);
      assert.equal(Object.hasOwn(query.body.left,'take'),false);
      assert.equal(Object.hasOwn(query.body.right,'take'),false);
      assert.equal(query.body.left.filters[0].value,'UNION');
      assert.deepEqual(query.body.ordering,[{field:'label',descending:true}]);
      assert.equal(query.body.take,3);assert.equal(query.body.skip,1);
      assert.equal(query.body.includeMetadata,false);
    }
});
test('selected set column positions and source windows keep separate scope',()=>{
  const query=compile('(SELECT Name AS label FROM MongoDBOASIS LIMIT 3 OFFSET 1) UNION ALL '+
    '(SELECT Name AS other FROM MongoDBOASIS LIMIT 2) ORDER BY 1');
  assert.deepEqual(query.body.ordering,[{field:'label',descending:false}]);
  assert.equal(Object.hasOwn(query.body,'take'),false);
  assert.equal(query.body.left.take,3);assert.equal(query.body.left.skip,1);
  assert.equal(query.body.right.take,2);
});
test('selected sets reject hidden ordering and incompatible shape before dispatch',()=>{
  const left='SELECT Name AS label FROM MongoDBOASIS',right='SELECT Name AS other FROM MongoDBOASIS';
  for(const order of ['Id','other','label, label','0','2','label,'])
    assert.throws(()=>compile(left+' UNION '+right+' ORDER BY '+order),/visible|selected|Unexpected/);
  assert.throws(()=>compile(left+' UNION SELECT Name, Version FROM MongoDBOASIS'),/column count/);
  assert.throws(()=>compile(left+' UNION '+right+' ORDER BY label DELETE FROM MongoDBOASIS'),/selected set/);
});
