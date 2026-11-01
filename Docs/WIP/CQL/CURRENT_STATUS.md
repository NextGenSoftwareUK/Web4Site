# CQL website current status

Updated 1 November 2026. Breadth-first live demo; full ORM/parity remains incomplete.

- **39 providers** have scoped hosted HTTP proof; **5** browser-verified, **34** browser gates open. HTTP and byte-publication checks do not certify browser interaction.
- Live website main **299c376** includes Arweave, Cardano, Starknet, Radix, Elrond, Sui and Hedera, with spaced setup examples and pinned C# links.
- Published duration-fix assets match commit299c376: HTML155244bytes SHA256398fcc04d365105535114cdb565a13b66e758071f903481e62025e179307eef0; preparation JS9876bytes SHA256cac962d8a7d14ebf98e9395209d76fb29978041a935da2e600c5c940eca3ee13; query JS21871bytes SHA2567cb6210b9adda1e83630fc966926772f8338c43163c24d1abd88c626ad1ad649. HTTP/git-blob checks only, no browser proof.
- Session frontend implementation **43af923**, published, passes **80/80** client tests. New JS URLs are versioned; login/demo/refresh/logout share serialized cookie ownership, bearer stays in memory, stable avatar/environment identity survives renewal, uncertain outcomes stop without replay.
- Backend **d9332469ddf4587ebca3d74ed3ccec914bad2ef4/Coreb835014** is live (9724c407 SUCCESS). Original visitor securely renewed, normal logout revoked the refresh credential/cleared its cookie, and revoked refresh was rejected. No replacement avatar or provider saves.
- Live HTTP lifecycle proof SHA256af9cdf4e7d4c64b1ba081c9f72b17c24231b369c8a44a8168604862a3acee399. Browser interaction and real expiry waiting are not inferred; expiry-triggered behavior has separate controlled-clock tests.
- **Next:** Continue backend breadth; Arweave card is published/byte-verified; Cardano card is published/byte-verified. Session lifecycle and Starknet card are published; actual browser interaction remains separate.
- Browser transport remains unavailable; no OS control resumed or request for David to reopen the page.
- Azure/Oracle hosting explicitly deferred; TRON real429 remains unadmitted. Starknet and Cardano hosted HTTP flows and published cards are verified; browser interaction remains open.
- Backend authority: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/CURRENT_STATUS.md, SESSION_RENEWAL_STATUS.md and PROVIDER_CQL_AND_SANDBOX_STATUS.md. Resource ledger remains beside this file.

[Earlier milestone history](Archive/STATUS_BEFORE_SESSION_RENEWAL_PUBLICATION_2026-11-01.md).

Starknet hosted acceptance is complete: backendcafd0f8c8/Core8a5ab45, app151477e9/settings03760bc9 SUCCESS. Native3/2, Mongo5/4, repeat0new/2existing, foreign-private0/public3, replicas2/2. Original cohort completion ACK retained; no reruns. Card now states only verified HTTP scope; guide pinned164b4bb96, actual C#cafd0f8c8. HTML now published/byte-verified at80ba510; browser remains open.

Cardano hosted acceptance complete at backendaffe57190/Corebe397f1, settingscfe35470 SUCCESS: native3/2, Mongo5/4, repeat0new/2existing, foreign-private0/public3, replicas2/2. Original cohort completion ACK retained. Card5d9845c is published with guide64f448f84 and actual C#affe57190; public HTML exactly matches committed git blob. Browser remains open.

Arweave hosted acceptance complete at37a530a87/Core5fd361d job3da7f986 SUCCESS; tested codeb158bda61 unchanged except David-list docs. Native3/2, Mongo5/4, repeat0new/2existing, foreign-private0/public3, replicas2/2. Original cohort completion ACK retained. Card61e85b7 is published with guided089a778c/C#b158bda61; public HTML exactly matches committed git-blob bytes. Original settings job was removed; no rollout or writes replayed. TON local native/manager and HTTP native3/2, paired5/4 and privacy0/3 now pass. Backend24f548550/Core2ac915f code deployment4f6eba6c remains queued; no TON live settings or card yet.

Browser duration correction is published at7a02a23: query timer uses the admitted top-level budget plus5s transport allowance, minimum15s/maximum35s. Default behavior stays15s; no automatic retry. All89client tests pass, including actual shipped run() dispatch/timer regression. Four pre-existing sandbox-api tests were updated to supply the current session snapshot interface. Public HTML and versioned JS exactly match the committed blobs; no browser interaction claim.

Preparation duration correction: a reproduced regression showed paired30s budget was omitted from its derived native setup query. The recipe now validates/carries the explicit global budget into that independent leaf read, before any saves. Controlled end-to-end preparation test passes and all90client tests pass. Published at299c376 and public HTML/preparation/query scripts match exact git blobs; no new TON cohort or live grant.

TON card is staged only on the website task branch: spaced local command and guide/C# links pinned to reviewed fb29aa936. It explicitly states hosted rollout pending; no main publication until original normal-visitor acceptance/replicas pass. Both pinned files exist in that commit. Live main remains299c376; hosted count38/browser5/open33 unchanged.

TON hosted acceptance complete: backend fb29aa936/Core2ac915f, settings e3ae497c SUCCESS. Original cohort proves native3/2, Mongo5/4, reuse0/2, privacy0/3 and replicas2/2; completion ACK prevents replay. Card now states only this proven HTTP scope, guide pinned34ae56281d14cce85a1099482953851a5f8f6182, C#fb29aa936. Publish and byte-verify next; browser gate remains open.
