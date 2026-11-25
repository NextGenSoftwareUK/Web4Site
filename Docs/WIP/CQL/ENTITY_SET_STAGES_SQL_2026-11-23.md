# Ordered entity-set SQL and Ask — 23 November 2026

The SQL editor supports WHERE, ORDER BY, TOP/LIMIT/OFFSET/FETCH after an entity UNION/UNION ALL/INTERSECT/EXCEPT source. Each clause becomes a separate EntityStages operation after earlier source and combined windows, then OutputColumns selects the displayed values. Table qualifiers and direct selected ordering aliases are supported. Chained full-entity WITH steps retain their ordered stages.

The demo example chooses25 combined records, then filters, reorders and displays five. Ask guidance uses the same semantics and requires review before execution.7 changed SQL checks,28 existing affected SQL checks and71 Ask client checks pass in memory. Mocked model replies prove client handling only. Metadata keyword segments are not treated as ordering/page clauses.

Matching API source8f379886 is qualifying native HTTP/actor/metering tests; this source is not live acceptance. Post-set selected DISTINCT/aggregates, arbitrary computed result ordering and general selected-result composition remain open. No full SQL/EF parity claim.

All tests and captures used frozen source in RAM; no local environment, database, download, browser or generated outputs. Compact preparation journals retain provenance; draft source arrays are removed after verified push.
