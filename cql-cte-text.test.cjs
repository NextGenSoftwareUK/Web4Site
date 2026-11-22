const test = require('node:test');
const assert = require('node:assert/strict');
const {compile} = require('./cql-text.js');

test('bounded selected CTE preserves source page, Boolean stages and final aliases on three providers', () => {
  for (const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']) {
    const query = compile(`WITH sample AS (
      SELECT Id, Name, Version FROM ${provider} ORDER BY Id LIMIT 25
    ) SELECT Name AS Label, Version AS Revision FROM sample AS s
      WHERE s.Name NOT LIKE @prefix AND (s.Version BETWEEN 1 AND 3 OR s.Version = 7)
      ORDER BY Revision DESC, Label LIMIT 5 OFFSET 1`, {}, {prefix:'x%'});
    assert.equal(query.path,'data/query-cql/composition');
    assert.equal(query.body.provider,provider);
    assert.equal(query.body.source.provider,undefined);
    assert.equal(query.body.source.take,25);
    const stages=query.body.stages;
    assert.equal(stages.filter(stage=>stage.operation === 'Where').length,4);
    assert.deepEqual(stages.find(stage=>stage.operation === 'OrderBy').order,
      [{alias:'Version',descending:true},{alias:'Name',descending:false}]);
    assert.deepEqual(stages.slice(-3),
      [{operation:'Skip',count:1},{operation:'Take',count:5},
       {operation:'Select',columns:[{alias:'Label',sourceAlias:'Name'},{alias:'Revision',sourceAlias:'Version'}]}]);
  }
});

test('chained CTEs keep visible binding history and source-bound parameters', () => {
  const query=compile(`WITH seed AS (
      SELECT Name, Version FROM MongoDBOASIS WHERE Name <> @excluded ORDER BY Id LIMIT 20
    ), named AS (
      SELECT Name AS Label, Version AS Revision FROM seed WHERE Version >= 1
    ) SELECT Label FROM named WHERE Revision < @maximum ORDER BY Label LIMIT 2`,
    {},{excluded:"WITH ' FROM UNION",maximum:3});
  assert.equal(query.body.source.take,20);
  assert.equal(query.body.stages.filter(stage=>stage.operation==='Select').length,2);
  assert.deepEqual(query.body.stages.at(-1),{operation:'Select',columns:[{alias:'Label',sourceAlias:'Label'}]});
  assert.ok(query.body.stages.some(stage=>stage.filters?.some(filter=>filter.alias==='Revision' && filter.value===3)));
});

test('selected NOT LIKE match-all remains false for null as well as non-null strings', () => {
  const query=compile("WITH q AS (SELECT Name FROM MongoDBOASIS ORDER BY Id LIMIT 10) SELECT * FROM q WHERE Name NOT LIKE '%'");
  const filters=query.body.stages.flatMap(stage=>stage.filters??[]);
  assert.deepEqual(filters,[{alias:'Name',operator:'IsNull'},{alias:'Name',operator:'NotEqual',value:null}]);
});

test('CTEs refuse implicit source truncation, recursion, provider shadowing and hidden alias reentry', () => {
  assert.throws(()=>compile('WITH q AS (SELECT Name FROM MongoDBOASIS) SELECT * FROM q'),/explicit TOP, LIMIT or FETCH/);
  assert.throws(()=>compile('WITH RECURSIVE q AS (SELECT Name FROM q LIMIT 10) SELECT * FROM q'),/Recursive/);
  assert.throws(()=>compile('WITH MongoDBOASIS AS (SELECT Name FROM MongoDBOASIS LIMIT 10) SELECT * FROM MongoDBOASIS'),/replacing a provider/);
  assert.throws(()=>compile('WITH seed AS (SELECT Name, Version FROM MongoDBOASIS LIMIT 10), named AS (SELECT Name FROM seed) SELECT Version FROM named'),/does not expose/);
});

test('WITH declared column aliases bind positionally across chained native results',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const query=compile('WITH seed(label, revision) AS (SELECT Name, Version FROM '+provider+
   ' ORDER BY Id LIMIT 20), page(title, rank) AS (SELECT label, revision FROM seed WHERE revision >= 1 ORDER BY label LIMIT 5) SELECT title FROM page WHERE rank < 4 ORDER BY title LIMIT 2');
  assert.equal(query.body.provider,provider);assert.equal(query.body.source.take,20);
  const selects=query.body.stages.filter(s=>s.operation==='Select');
  assert.deepEqual(selects[0].columns,[{alias:'label',sourceAlias:'Name'},{alias:'revision',sourceAlias:'Version'}]);
  assert.deepEqual(selects[1].columns,[{alias:'title',sourceAlias:'label'},{alias:'rank',sourceAlias:'revision'}]);
  assert.deepEqual(selects[2].columns,[{alias:'title',sourceAlias:'title'}]);
  assert.ok(query.body.stages.some(s=>s.filters?.some(f=>f.alias==='rank'&&f.value===4)));
 }
});
test('WITH column declarations reject ambiguity, wrong cardinality and original alias reentry',()=>{
 assert.throws(()=>compile('WITH q(x,X) AS (SELECT Name, Version FROM MongoDBOASIS LIMIT 10) SELECT * FROM q'),/distinct WITH/);
 assert.throws(()=>compile('WITH q(x) AS (SELECT Name, Version FROM MongoDBOASIS LIMIT 10) SELECT * FROM q'),/count must match/);
 assert.throws(()=>compile('WITH q(x) AS (SELECT Name FROM MongoDBOASIS LIMIT 10) SELECT Name FROM q'),/does not expose/);
 assert.throws(()=>compile('WITH q() AS (SELECT Name FROM MongoDBOASIS LIMIT 10) SELECT * FROM q'),/column alias/);
 const identity=compile('WITH q(Name) AS (SELECT Name FROM MongoDBOASIS LIMIT 10) SELECT * FROM q');
 assert.equal(identity.path,'data/query-cql/projection');
 const quoted=compile('WITH q("Label") AS (SELECT Name FROM MongoDBOASIS LIMIT 10) SELECT "Label" FROM q');
 assert.equal(quoted.body.stages[0].columns[0].alias,'Label');
});

test('derived selected tables preserve native source bounds and current aliases on three providers',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const query=compile('SELECT picked.Name AS Label, picked.Version FROM (SELECT Name, Version FROM '+
   provider+' ORDER BY Id LIMIT 20) AS picked WHERE picked.Version >= @minimum ORDER BY Label LIMIT 3',{}, {minimum:1});
  assert.equal(query.path,'data/query-cql/composition');
  assert.equal(query.body.provider,provider);assert.equal(query.body.source.take,20);
  assert.equal(query.body.stages.find(s=>s.operation==='Where').filters[0].value,1);
  assert.deepEqual(query.body.stages.at(-1),{operation:'Select',columns:[{alias:'Label',sourceAlias:'Name'},{alias:'Version',sourceAlias:'Version'}]});
 }
 const nested=compile('SELECT d.label FROM (SELECT n.Name AS label FROM (SELECT Name FROM MongoDBOASIS LIMIT 10) n WHERE n.Name IS NOT NULL) d ORDER BY d.label LIMIT 2');
 assert.equal(nested.body.source.take,10);
 assert.ok(nested.body.stages.some(s=>s.operation==='Select'&&s.columns[0].alias==='label'));
});
test('derived tables reject unbounded initial sources, missing aliases and hidden-field reentry',()=>{
 assert.throws(()=>compile('SELECT * FROM (SELECT Name FROM MongoDBOASIS) q'),/explicit TOP, LIMIT or FETCH/);
 assert.throws(()=>compile('SELECT * FROM (SELECT Name FROM MongoDBOASIS LIMIT 10)'),/derived table alias/);
 assert.throws(()=>compile('SELECT * FROM (SELECT Name FROM MongoDBOASIS LIMIT 10) WHERE Name IS NOT NULL'),/explicit table alias/);
 assert.throws(()=>compile('SELECT q.Version FROM (SELECT Name FROM MongoDBOASIS LIMIT 10) q'),/does not expose/);
 const chained=compile('WITH seed(label) AS (SELECT Name FROM MongoDBOASIS LIMIT 10) SELECT q.label FROM (SELECT label FROM seed) q LIMIT 2');
 assert.equal(chained.body.source.take,10);assert.equal(chained.body.stages.at(-1).count,2);
});

test('WITH visible tuples keep independent source windows through all native set operators',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  for(const [sqlOperator,kind] of [['UNION','Union'],['UNION ALL','Concat'],['INTERSECT','Intersect'],['EXCEPT','Except']]){
   const query=compile('WITH leftRows(Label, Variant) AS (SELECT Name, Description FROM '+provider+
    ' WHERE Version >= 1 ORDER BY Id LIMIT 10), rightRows AS (SELECT Name AS Key, Description AS Detail FROM '+provider+
    ' WHERE Version <= 3 ORDER BY Id LIMIT 7) (SELECT Label, Variant FROM leftRows) '+sqlOperator+
    ' (SELECT Key, Detail FROM rightRows) ORDER BY Label, 2 LIMIT 5 OFFSET 1');
   assert.equal(query.path,'data/query-cql/set');assert.equal(query.body.provider,provider);
   assert.equal(query.body.kind,kind);assert.equal(query.body.left.take,10);assert.equal(query.body.right.take,7);
   assert.deepEqual(query.body.left.columns.map(c=>[c.alias,c.field]),[['Label','Name'],['Variant','Description']]);
   assert.deepEqual(query.body.ordering,[{field:'Label',descending:false},{field:'Variant',descending:false}]);
   assert.equal(query.body.take,5);assert.equal(query.body.skip,1);
  }
 }
});
test('set operands preserve independent post-window stages before visible tuple equality',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const query=compile("WITH q AS (SELECT Name, Version FROM "+provider+" ORDER BY Id LIMIT 10) "+
   "(SELECT Name AS Label FROM q WHERE Version >= @minimum ORDER BY Name DESC LIMIT 2 OFFSET 1) "+
   "UNION ALL (SELECT Name AS Other FROM q WHERE Name NOT LIKE 'x%') ORDER BY Label LIMIT 3",{}, {minimum:2});
  assert.equal(query.path,'data/query-cql/set');assert.equal(query.body.kind,'Concat');
  assert.equal(query.body.left.take,10);assert.equal(query.body.right.take,10);
  assert.deepEqual(query.body.left.columns.map(c=>c.alias),['Name','Version']);
  assert.deepEqual(query.body.left.stages.slice(-3),[
   {operation:'Skip',count:1},{operation:'Take',count:2},
   {operation:'Select',columns:[{alias:'Label',sourceAlias:'Name'}]}]);
  assert.equal(query.body.left.stages.find(s=>s.operation==='Where').filters[0].value,2);
  assert.ok(query.body.right.stages.some(s=>s.operation==='Where'));
  assert.deepEqual(query.body.ordering,[{field:'Label',descending:false}]);
  assert.equal(query.body.take,3);
 }
 const pure=compile('(SELECT d.Name AS Label FROM (SELECT Name FROM MongoDBOASIS LIMIT 8) d) UNION (SELECT Name FROM MongoDBOASIS LIMIT 9) ORDER BY Label LIMIT 2');
 assert.equal(pure.body.left.columns[0].alias,'Label');assert.equal(pure.body.left.stages,undefined);
});

test('staged set ordering and tuple widths use final visible bindings only',()=>{
 const prefix="WITH q AS (SELECT Name, Version FROM MongoDBOASIS LIMIT 10) "+
  "(SELECT Name AS Label FROM q WHERE Version >= 1) UNION (SELECT Name FROM q)";
 assert.throws(()=>compile(prefix+" ORDER BY Version LIMIT 2"),/visible left-column/);
 assert.throws(()=>compile("WITH q AS (SELECT Name, Version FROM MongoDBOASIS LIMIT 10) "+
  "(SELECT Name FROM q WHERE Version >= 1) UNION (SELECT Name, Version FROM q)"),/same column count/);
 const ordinal=compile(prefix+" ORDER BY 1 LIMIT 2");
 assert.deepEqual(ordinal.body.ordering,[{field:'Label',descending:false}]);
});

test('captured bounds survive nested WITH and derived sources without limiting unrelated inputs',()=>{
 const nested=compile('(WITH q(Label) AS (SELECT Name FROM MongoDBOASIS LIMIT 6) SELECT Label FROM q) UNION (SELECT Name FROM MongoDBOASIS LIMIT 9)');
 assert.equal(nested.body.left.take,6);assert.equal(nested.body.right.take,9);
 const derived=compile('WITH q AS (SELECT d.Name FROM (SELECT Name FROM MongoDBOASIS LIMIT 4) d) (SELECT * FROM q) UNION (SELECT Name FROM MongoDBOASIS LIMIT 9)');
 assert.equal(derived.body.left.take,4);
 const unused=compile('(WITH q AS (SELECT Name FROM MongoDBOASIS LIMIT 6) SELECT Name FROM MongoDBOASIS) UNION (SELECT Name FROM MongoDBOASIS LIMIT 9)');
 assert.equal(unused.body.left.take,undefined,'An unrelated unbounded source must not acquire the unused CTE bound.');
});

test('DISTINCT over bounded CTE tuples selects before native equality and pages afterwards',()=>{
 for(const provider of ['MongoDBOASIS','SQLLiteDBOASIS','Neo4jOASIS']){
  const query=compile('WITH q AS (SELECT Id, Name, Description FROM '+provider+
   ' ORDER BY Id LIMIT 20) SELECT DISTINCT Name AS Label, Description AS Detail FROM q WHERE Name IS NOT NULL ORDER BY Detail, Label LIMIT 3 OFFSET 1');
  assert.equal(query.body.provider,provider);
  assert.equal(query.body.source.take,20);
  assert.deepEqual(query.body.stages,[
   {operation:'Where',filters:[{alias:'Name',operator:'NotEqual',value:null}]},
   {operation:'Select',columns:[{alias:'Label',sourceAlias:'Name'},{alias:'Detail',sourceAlias:'Description'}]},
   {operation:'Distinct'},
   {operation:'OrderBy',order:[{alias:'Detail',descending:false},{alias:'Label',descending:false}]},
   {operation:'Skip',count:1},{operation:'Take',count:3}]);
 }
});

test('chained and derived DISTINCT retain earlier tuple equality and exact visible aliases',()=>{
 const query=compile('WITH seed AS (SELECT Id, Name, Description FROM MongoDBOASIS ORDER BY Id LIMIT 20), tuples AS (SELECT DISTINCT Name AS Label, Description AS Detail FROM seed ORDER BY Label LIMIT 5) SELECT DISTINCT Label AS Display FROM tuples ORDER BY Display LIMIT 2');
 assert.equal(query.body.stages.filter(stage=>stage.operation==='Distinct').length,2);
 assert.deepEqual(query.body.stages.filter(stage=>stage.operation==='Select').map(stage=>stage.columns),[
  [{alias:'Label',sourceAlias:'Name'},{alias:'Detail',sourceAlias:'Description'}],
  [{alias:'Display',sourceAlias:'Label'}]]);
 const derived=compile('SELECT DISTINCT q.Name AS Label FROM (SELECT Id, Name FROM Neo4jOASIS ORDER BY Id LIMIT 10) q ORDER BY 1 LIMIT 2');
 assert.deepEqual(derived.body.stages.slice(0,3),[
  {operation:'Select',columns:[{alias:'Label',sourceAlias:'Name'}]},
  {operation:'Distinct'},
  {operation:'OrderBy',order:[{alias:'Label',descending:false}]}]);
 assert.throws(()=>compile('WITH q AS (SELECT Id, Name FROM MongoDBOASIS LIMIT 10) SELECT DISTINCT Name FROM q ORDER BY Id LIMIT 2'),/only columns visible/);
});
