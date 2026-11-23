# Late selection after entity sets — 23 November 2026

The SQL editor can select native columns from an entity UNION/UNION ALL/INTERSECT/EXCEPT through a derived table or WITH source. It sends outputColumns on the existing set request, preserving identity equality and all source and combined windows. Selecting columns in the operands continues to use selected-value equality.

Representative checks cover MongoDB, SQLite and Neo4j, all four operators, named parameters and source/output window preservation. Existing set, WITH and parameter suites pass. Tests run from frozen Git sources in memory; no environment, database, build output or test artifact was installed or retained.

This is source-qualified only. The matching API qualification and deployment are pending. Outer result filtering, ordering, paging, DISTINCT and further composition after this late selection remain open; unsupported clauses fail explicitly instead of changing their position. Ask guidance and live browser acceptance remain open. Full EF/NHibernate parity is not claimed.
