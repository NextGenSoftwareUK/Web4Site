# Exact Int32 SQL and Ask contracts

SQL CAST and direct metadata AS INT32 filters now retain JSON numeric Int32 width, including equality, comparisons and BETWEEN. Overflow, fractional and quoted literals are refused before dispatch. Saved mappings retain selected global ordering and paging. INT64 retains its existing Integer/string wire domain. Ask guidance preserves the declared Int32 type and review before execution.

Fourteen NEW focused cases passed in the existing Node runtime with source/tests in RAM:13 SQL parser cases and1 Ask actual-flow/compiler test using a synthetic model response. No existing accepted suite rerun, actual model claim, remote API request, dependency install, environment or generated source/test files. The backend Int32 enum/native guards and native/mixed HTTP qualification remain pending and this is not hosted demo acceptance. The existing qualified UUID/cache/shutdown release candidate excludes this new typed32 work. Full ORM parity remains open.
