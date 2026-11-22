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
