# CQL website current status

Updated 1 November 2026. Breadth-first live demo; full ORM/parity remains incomplete.

- **38 providers** have scoped hosted HTTP proof; **5** browser-verified, **33** browser gates open. HTTP and byte-publication checks do not certify browser interaction.
- Live website main **61e85b7** includes Arweave, Cardano, Starknet, Radix, Elrond, Sui and Hedera, with spaced setup examples and pinned C# links.
- Published HTML:155229bytes; SHA2566fda659c10e90bb99d7636e04b62d3dc343b3a0c36cd85bb5b3f3c3e3c5c94f3. Starknet card and both pinned guide/C# links are live. Session JS assets remain unchanged from verified9e18b7d.
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

Browser duration correction is staged: query timer uses the admitted top-level budget plus5s transport allowance, minimum15s/maximum35s. Default behavior stays15s; no automatic retry. All89client tests pass, including actual shipped run() dispatch/timer regression. Four pre-existing sandbox-api tests were updated to supply the current session snapshot interface. Publication pending; no browser interaction claim.
