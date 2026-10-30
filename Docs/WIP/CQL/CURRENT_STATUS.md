# WEB4 sandbox CQL tab — current implementation

Updated30 October2026. Existing C:/Source/Web4Site checkout, branch work/cosmic-cql.

## Hosted CQL

Seven bounded JSON presets cover page browsing, Name equality, Description Contains, string metadata equality, AND/OR, LongCount and named Mongo/SQLite/Neo federation. Requests use the current page bearer and a fresh explicit Idempotency-Key. The editor never executes C#/SQL/Cypher. Empty results/errors remain real API outcomes, without sample substitution or automatic retries.

The backend35-step hosted demo now passes saves, exact copies, queries/counts/federation and tenant isolation on deployment1c73a0b5-3d76-4cd6-9aab-1fb178ebd45b / parent51f3c4c3a. This is backend acceptance; it does not claim every browser/account/provider configuration is verified.

## Oracle + Mongo catalogue

CQL Playground section4 now lists four local native examples: exact name2copies, description4, metadata4 and combined AND/OR2. Select an example and OPEN LOCAL QUERY. It opens only fixed127.0.0.1:5090 with a supported preset name; the native teaching host automatically runs that read. Its independently configured synthetic authorization catalogues own access. No hosted bearer, actor or editable JSON is forwarded. Oracle is explicitly labelled local and is not added to the hosted provider selector.

Start the retained native services from C:/Source/OASIS-cosmic:

```powershell
pwsh -File Scripts/TestHosts/Run-ReusableOracleMongoTests.ps1 -Content -Serve -ArchiveCompletedDemo
```

The runner owns the build lease. Do not wrap another lease. Stop via the local page or POST/demo/shutdown for exact fixture cleanup; retained Oracle records remain unchanged.

## Verification and publication

- `node --check cql-playground.js` and `node --test cql-playground.test.cjs sandbox-api.test.cjs`:17pass/no skips, no package install.
- Browser: actual existing CQL tab -> Metadata equality -> local query page automatically returns preset=metadata/count4/Mongo2/Oracle2. Anonymous catalogue works; no hosted session was created for this check.
- Native paired runner still passes21Oracle queries/fourC#/fourHTTP/two rejected request controls and preserves source snapshot. Exact owned Mongo fixture removed and services stopped.
- Feature batch081023874adf5d2ef2606b434dee15a44f1cf7c2 pushed to main; production deployment7449727369 success. Public https://web4.oasisomniverse.one/web4-sandbox.html Oracle card verified in browser. Served client SHA25614713C357DA45E5411224F49E69E363B21BE80DB1882B43EF4B056B6BEAC50A4 exactly matches tested source.
- Evidence: C:/Source/OASIS-cosmic/TestResults/Web4SandboxCqlCurrent/web4-oracle-catalogue-proof.json, screenshot web4-oracle-catalogue.png; native result screenshot under TestResults/OracleCurrent. Raw evidence never in Docs.

## Resources and recovery

Reuse Node24.19.0, existing Windows Python and Codex IAB; no download/install/restore. Preview127.0.0.1:5151 served only Web4Site, owned PID47884 stopped after command/listener ownership checks. Backend runner25723 exited0; ports5151/5090/27029 closed, Oracle containerexited. Persistent preview ownership journal C:/Source/OASIS-cosmic/LocalState/COSMIC/Web4SitePreview/server.json statusstopped.

Shared authoritative resource ledger: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/ENVIRONMENT_AND_CLEANUP_LEDGER.md. Full programme/current next step: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/CURRENT_STATUS.md. Hosted Oracle, richer providers and full ORM parity remain separate work.