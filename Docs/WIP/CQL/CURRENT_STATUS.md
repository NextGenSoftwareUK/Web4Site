# WEB4 sandbox CQL — current status

Updated 31 October 2026. Existing C:/Source/Web4Site, task work/cosmic-cql.

## Verified public release

- main 2b46dedfcfc41695ba36d232a1ff098e4ae711bc, production 7456696386 success.
- Backend Development913b9d0bf/Core249a223, Railway64bbc646-5d06-412a-a5bd-eb62ca9ae737 SUCCESS.
- Five hosted query providers: MongoDB, SQLite, Neo4j, ActivityPub, IPFS. Local-only entries are not hosted coverage.
- Fresh visitor prepared2 private Mongo records, queried AP3+Mongo2=5 rows and AP2+Mongo2=4. Repeat0 saved / 2 existing; another visitor sees3 public posts and0 foreign Mongo IDs.
- Those2 writes auto-replicated to SQLite/Neo4j with matching IDs, versions, ownership and metadata. No manual repair. Full HyperDrive fault matrix remains incomplete.
- Server operation ID visible in browser. Published scripts match tested bytes.39 client / 86 API / 383 Core controls pass, no skips.

## Try it

Start demo session → CQL Playground → ActivityPubOASIS → Public posts + my Mongo records → PREPARE MY MONGO RECORDS → RUN QUERY. Public leaf queries need no preparation. Choose the two-post subset for a smaller result.

Discovery version2 supplies fixed Rows/Federation operations and capability-checked examples. Missing dependencies disable affected choices. Invalid discovery disables queries. Native providers never receive the hosted bearer.

Preparation uses configured source examples, Core-derived private IDs and ordinary create-only saves. Edited/foreign records are preserved. Per-operation localStorage intents contain identifiers only; uncertain outcomes require reconciliation, never automatic retry. Tokens live only in page memory.

IPFS is now verified through the same generic controls: native3/2, paired5/4,
repeat0writes, other-visitor private-ID0, matching SQLite/Neo4j replicas. No client
provider case or new frontend deployment needed. Backend SDK ABI failure was
reproduced/fixed at source dependency composition; original evidence preserved.
Select IPFSOASIS, then IPFS records + my Mongo records, prepare and run.

## Prepared source-link release

- Added direct links to released C# SOLID resource selection and HTTP/host guide.
- Local protocol launcher instructions name their verified preserved source revision; hosted playground needs no local services.
- Client controls39passed/0failed/0skipped; log TestResults/CqlCurrent/solid-links-client-tests.log. No runtime installation or generated native data.
- Backend SOLID batch d41d4ec83 is pushed to Development; image/browser acceptance pending. Do not increase verified hosted count until it passes.

## Next

Actual hosted Oracle/SOLID/Solana/AWS and remaining approved providers: filtered multiple records, one Mongo pairing and minimal setup. Azure pending/free-only. Keep local runner links without counting launchers as hosted support. Deep parity paused.

## Recovery

Authoritative programme status/evidence/resources:
C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/{CURRENT_STATUS,HOSTED_SANDBOX_INTEGRATION_PLAN,ENVIRONMENT_AND_CLEANUP_LEDGER}.md.

Raw evidence: backend TestResults/HostedCqlIntegrationCurrent/browser-federation-acceptance.json and browser-activitypub-mongo-four.png. Durable ACK: backend LocalState/COSMIC/HostedSourceRolloutCurrent. Owned tabs 5/6 closed. Demo avatars/data retained under normal expiry/cleanup, not claimed removed.

Reuse Node 24.19.0; no install/download/new environment. Tests: node --test cql-playground.test.cjs cql-demo-preparation.test.cjs sandbox-api.test.cjs. Batch publication; doc-only task commits need no immediate redeploy.

[Previous checkpoints](Archive/CURRENT_STATUS_before_hosted_federation_2026-10-31.md).
