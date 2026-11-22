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
