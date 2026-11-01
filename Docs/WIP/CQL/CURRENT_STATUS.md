# CQL website current status

Updated 1 November 2026. Breadth-first live demo; full ORM/parity remains incomplete.

- 39 providers have scoped hosted HTTP proof; 5 browser-verified and 34 browser gates open. HTTP and byte-publication checks do not certify browser interaction.
- Live website main6cfa7dcf91097108d8de679a1dc317ecc33da29d includes TON with spaced local commands, setup guide34ae56281 and C#fb29aa936 links.
- Public HTML200/156743bytes SHA25667f86c263203e2f88d3a485abe72d938f9847a229f12ee6c29b771f172719612 exactly matches its committed git blob.
- Preparation JS9876bytes SHA256cac962d8a7d14ebf98e9395209d76fb29978041a935da2e600c5c940eca3ee13 and query JS21871bytes SHA2567cb6210b9adda1e83630fc966926772f8338c43163c24d1abd88c626ad1ad649 also match committed blobs; versioned URLs use cql-duration-v2.
- All90client controls pass: session lifecycle, safe demo preparation, query timeout plus actual run() one-dispatch regression. Reversible TON card content was verified by pinned paths and exact published bytes; no unnecessary new tests.
- Backend TON acceptance: fb29aa936/Core2ac915f, settings e3ae497c SUCCESS. Original cohort native3/2, Mongo5/4, reuse0/2, privacy0/3, replicas2/2; both private saves version1. Completion ACK blocks replay.
- No TON source transaction, arbitrary metadata scan, independent consensus or full ORM guarantee is inferred. The card explicitly marks browser verification open.
- Browser control remains closed; no OS automation resumed or repeat request for David. Azure/Oracle hosting remains explicitly deferred.
- Next: continue backend breadth on remaining unsupported providers. Keep generic CQL discovery/preparation reusable; add a card only after its scoped hosted proof passes.
- Backend authority: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/CURRENT_STATUS.md and PROVIDER_CQL_AND_SANDBOX_STATUS.md. Resource ledger remains beside this file; raw outputs live in backend TestResults.

[Preserved milestone history](Archive/STATUS_BEFORE_SESSION_RENEWAL_PUBLICATION_2026-11-01.md).

Azure Blob helper milestone (1 November): explicit512-character AzureStorageOASIS keys now prepare/reuse private snapshots; other profiles retain128. All root client tests pass; raw report C:/Source/OASIS-cosmic/TestResults/AzurePublicSourceCurrent/frontend-tests.log. Source change staged on work/cosmic-cql, not published. Backend/source guide tracked in OASIS-cosmic Docs/WIP/COSMIC ORM/AZURE_PUBLIC_BLOB_STATUS.md.

Azure hosted proof completed at backendbccef53d6/Cored133cc2/settings8e382a80 SUCCESS: native3/2, Mongo5/4, reuse0new/2existing, foreign-private0/public3, exactSQLite/Neo2/2, savesversion1; completion ACK prevents replay. Frontend Azure card and512-character preparation support ready for publication; guideb887f1262/C#bccef53d6 pinned. Programme now40hosted, browser5/open35. No Azure account/source write or Cosmos DB hosting claim.
