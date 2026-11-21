const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compile}=require('./cql-text.js');
const plain=value=>JSON.parse(JSON.stringify(value));

test('SQL precedence preserves nested Boolean groups on each canonical store',()=>{
  for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
    const q=compile('SELECT Id, Name FROM '+provider+
      " WHERE (Name = 'Coffee' AND Version >= 2) OR (Name = 'Tea' AND Version <= 5) ORDER BY Name LIMIT 3");
    assert.equal(q.body.where.kind,'Or');
    assert.equal(q.body.where.terms.length,2);
    assert.ok(q.body.where.terms.every(term=>term.kind==='And'));
    assert.equal(q.body.take,3);
    const precedence=compile('SELECT * FROM '+provider+
      " WHERE Name = 'Coffee' OR Version = 2 AND Name = 'Tea'");
    assert.equal(precedence.body.where.kind,'Or');
    assert.equal(precedence.body.where.terms[1].kind,'And');
  }
});
test('NOT and nested relationships compile through one typed WHERE description',()=>{
  const q=compile("SELECT * FROM Neo4jOASIS WHERE NOT (Name = 'Coffee' OR EXISTS CHILD (EXISTS DESCENDANT (Name = 'Tea'))) LIMIT 5");
  assert.equal(q.body.where.kind,'Not');
  const child=q.body.where.terms[0].terms[1];
  assert.equal(child.kind,'Child');assert.equal(child.match.kind,'Descendant');
  assert.equal(child.match.match.filter.value,'Tea');
});
test('representable forms retain admitted flat request fields',()=>{
  const q=compile("SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE AND (Name = 'Coffee' OR Name = 'Tea') LIMIT 5");
  assert.equal(q.body.where,undefined);assert.equal(q.body.filters[0].field,'IsActive');
  assert.deepEqual(plain(q.body.anyOf.map(x=>x.value)),['Coffee','Tea']);
  const related=compile("SELECT * FROM Neo4jOASIS WHERE NOT EXISTS CHILD (Name = 'Coffee')");
  assert.equal(related.body.where,undefined);assert.equal(related.body.anyChildren[0].negated,true);
  const bracket=compile("SELECT * FROM SQLLiteDBOASIS WHERE (Version BETWEEN 2 AND 5 AND Name = 'Coffee')");
  assert.equal(bracket.body.where,undefined);assert.equal(bracket.body.filters.length,3);
});
test('WHERE shares bounded filters, depth and source-profile restrictions',()=>{
  assert.throws(()=>compile("SELECT * FROM MongoDBOASIS WHERE "+Array.from({length:13},()=> "Name = 'Coffee'").join(' AND ')),/twelve filters/);
  assert.throws(()=>compile("SELECT * FROM Neo4jOASIS WHERE "+'NOT '.repeat(9)+"Name = 'Coffee'"),/eight WHERE levels/);
  assert.throws(()=>compile("SELECT * FROM HoloOASIS WHERE NOT (Id = '11111111-1111-1111-1111-111111111111')"),/Nested Boolean WHERE/);
  assert.throws(()=>compile("SELECT * FROM MongoDBOASIS WHERE "+'('.repeat(20)+"Name = 'Coffee'"+')'.repeat(20)),/nested too deeply/);
});
