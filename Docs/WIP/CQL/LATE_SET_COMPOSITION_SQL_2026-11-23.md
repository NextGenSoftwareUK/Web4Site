2026-11-23 DIRECT DISTINCT OVER COMBINED RECORDS: SQL lowering, Ask grounding and the displayed example now support SELECT DISTINCT explicit columns over a full-record entity set. Identity membership and earlier entity windows remain before selection; visible-tuple deduplication precedes selected ordering/paging. Leading table qualifiers are removed without losing same-named metadata path segments.41 SQL controls and72 mocked Ask controls plus one exact displayed-example capture passed in RAM. Uses already native-qualified backend f954/Coreef05 SelectedStages; backend Development4b8 rollout remains pending WEB4 startup. No real inference, populated hosted walkthrough or public promotion claimed.

# Selected stages after entity sets

The full-record set retains entity identity equality. Later explicit selection establishes visible columns; chained WITH/derived steps filter, sort, page, rename and optionally deduplicate selected values. Earlier pages are not moved across filters. Selected DISTINCT compares only the visible tuple after preceding selected windows.

```sql
WITH records AS (
  SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE
  UNION
  SELECT * FROM MongoDBOASIS WHERE Version = 2
  ORDER BY Id LIMIT 25
), chosen AS (
  SELECT Id, Name AS Label FROM records LIMIT 20
), matches AS (
  SELECT Label FROM chosen
  WHERE Label LIKE 'a%' ORDER BY Label DESC LIMIT 10
)
SELECT DISTINCT Label FROM matches ORDER BY Label LIMIT 5
```

MongoDBOASIS, SQLLiteDBOASIS and Neo4jOASIS captures use /api/data/query-cql/set, preserving OutputColumns and putting later steps in SelectedStages. Native source operands are unchanged. Direct DISTINCT over a full entity-set source with explicit selected columns is now supported; aggregates and arbitrary nested set trees remain open.

38 SQL controls (3 new +35 affected),72 mocked-reply Ask controls and3 focused load/review controls passed without local outputs or data/model calls. Free demo drafts retain freeOnly, no avatar-context injection, ready-provider scoping and explicit review. Actual WEB6 inference remains unverified.

Backend qualification is pending/unaccepted on db681a71/Coref9be1a1f. Source, controlled replies and parser captures do not establish native/hosted acceptance. No public promotion.
