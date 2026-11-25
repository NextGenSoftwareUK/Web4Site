# Native counts over combined records

2026-11-23 COMBINED-RECORD COUNTS IN SQL/ASK SOURCE. COUNT(*)/COUNT(1) and ANY(*) over bounded full-record entity sets now lower to the existing set route's native Reduction contract. Original entity equality, occurrence semantics, earlier windows/stages and final predicates remain in place; no input rows or selection mode rewritten.44 SQL controls accepted (3 new,41 affected retained),73 mocked Ask controls and one displayed-count-example capture passed in RAM. Two fixture assumptions corrected without changing product SQL; only3 new SQL controls reran. Existing freeOnly/no-avatar-context/ready-provider/explicit-review boundaries retained. Native count SDK45210297591 passed3 real providers/actual WEB4; API compiler/real HTTP45211741407 and legacy regression45211741386 still pending. Source/preview only; no real inference, populated hosted acceptance or public promotion.


```sql
SELECT COUNT(*) AS Total FROM (
  SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE
  UNION ALL
  SELECT * FROM MongoDBOASIS WHERE Version = 2
  ORDER BY Id LIMIT 25
) AS records
WHERE Version >= 1
```

UNION ALL counts occurrences; UNION/INTERSECT/EXCEPT retain entity identity membership. The ReductionWhere predicate runs after the preceding combined source window and entity stages. Count the bounded source by putting LIMIT/OFFSET inside it. Scalar output aliases are preserved. COUNT(Name), COUNT(DISTINCT Name), numeric aggregates and selected-tuple reductions remain unsupported here. Genuine WEB6 inference and native/API/hosted acceptance are distinct gates.
