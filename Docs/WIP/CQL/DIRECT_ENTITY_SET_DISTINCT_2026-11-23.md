# Direct selected DISTINCT over combined records

2026-11-23 DIRECT DISTINCT OVER COMBINED RECORDS: SQL lowering, Ask grounding and the displayed example now support SELECT DISTINCT explicit columns over a full-record entity set. Identity membership and earlier entity windows remain before selection; visible-tuple deduplication precedes selected ordering/paging. Leading table qualifiers are removed without losing same-named metadata path segments.41 SQL controls and72 mocked Ask controls plus one exact displayed-example capture passed in RAM. Uses already native-qualified backend f954/Coreef05 SelectedStages; backend Development4b8 rollout remains pending WEB4 startup. No real inference, populated hosted walkthrough or public promotion claimed.


```sql
SELECT DISTINCT Name AS Label FROM (
  SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE
  UNION ALL
  SELECT * FROM MongoDBOASIS WHERE Version = 2
  ORDER BY Id LIMIT 25
) AS records
ORDER BY Label LIMIT 5
```

The original full-record set operands retain entity identity equality. SelectedStages performs Distinct, visible-column ordering, Skip and Take after selection; operand equality is not rewritten. SELECT DISTINCT * and ordering by hidden selected columns remain rejected. Aggregates over combined records and arbitrary nested set trees remain open. Ready-provider scoping, freeOnly and review-before-execution remain enforced.
