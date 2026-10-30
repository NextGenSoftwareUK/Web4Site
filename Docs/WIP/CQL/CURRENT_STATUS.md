# WEB4 sandbox CQL tab — current implementation

30 October 2026. Work in the existing C:/Source/Web4Site checkout, branch work/cosmic-cql.

The CQL tab now sends bounded JSON requests to the selected WEB4 API, using the
current page bearer and a new explicit Idempotency-Key per logical query.
Seven readable presets cover row paging, exact Name, Description Contains, string
metadata equality, AND/OR, LongCount and named Mongo/SQLite/Neo4j federation.
The editor is JSON; it does not execute C#, SQL or Cypher.

Start a demo session, save records using the existing ORM/Failover tabs, select a
query and provider, edit its filters and Run. Metadata keys are case-sensitive:
the coffee example requires records with category=coffee. Empty results stay empty.
Inspect the response for provider copies, errors and federation selection details.
Each Run starts a new logical operation. Retain its key/operation ID for uncertain
outcomes; cancellation only stops browser waiting. No automatic retries occur.
Tokens remain in page memory. Sign-out clears CQL output and aborts outstanding reads.

Run checks with `node --check cql-playground.js` and
`node --test cql-playground.test.cjs` (11 client tests; no packages required).
Serve locally with `python -m http.server 5151 --bind 127.0.0.1` and open
http://127.0.0.1:5151/web4-sandbox.html. Stop the server after checking.

Live verification: session creation succeeds on dev.api.web4.oasisomniverse.one;
row query returns HTTP503 CQL_ADMISSION_REQUIRED. Successful hosted rows/counts/
federation are not yet verified. Host admission/usage route enrollment is next;
no authentication/accounting bypass or mock success has been added.

Resource ledger: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/ENVIRONMENT_AND_CLEANUP_LEDGER.md.
Node24.19.0 and existing Python3.12/browser reused, no installation or dependency
restore. Static server127.0.0.1:5151 and disposable evidence under
C:/Source/OASIS-cosmic/TestResults/Web4SandboxCqlCurrent belong to cosmic-cql.
See the shared ledger for lifecycle/process details; preserve source and commits.
Full programme/status: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/CURRENT_STATUS.md.

Request ownership checkpoint: the existing ORM/Failover helper now sends an explicit Idempotency-Key (the write operation ID when present). Network failures retain the key and warn against repeating uncertain writes; server errors retain the accounting operation ID. Four regression tests plus11 CQL tests pass. No UI layout change. Backend receipt/profile fixes remain task-branch candidates; hosted filtered-query acceptance and main publication remain pending.
