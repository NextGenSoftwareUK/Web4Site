# Combined selection response display

2026-11-23 COMBINED-SELECTION GRID DISPLAY FIXED. The single columnar renderer now recognizes the shipping cql-set-projection-v1 response, so aliased cells appear as selected columns instead of blank canonical record fields. No new render path, query/data evaluation or backend change. Two new controls exercise actual client run/render boundaries for an aliased selected-set row and COUNT over the set route; three affected plain-text/scalar-alias/false-ANY controls retained green. Five focused UI controls passed in RAM. Cache versions advanced together. Backend75a6769d rollout continues independently; public promotion/live browser acceptance remain separate.


The server returns columns and scalar-cell row arrays for cql-set-projection-v1. Treat it as the existing columnar contract, preserve alias order, null/plain-text handling and scalar-result rendering. Count remains cql-scalar-v1 even when dispatched through data/query-cql/set. Five controlled UI journeys passed; no real API/inference/browser evidence is inferred.
