# CQL website current status

Updated 1 November 2026. Breadth-first live demo; full ORM/parity remains incomplete.

- **36 providers** have scoped hosted HTTP proof; **5** browser-verified, **31** browser gates open. HTTP and byte-publication checks do not certify browser interaction.
- Live website main **9e18b7dedda7c4e6cfaa358fa8987774616deaac** includes Radix, Elrond, Sui and Hedera, with spaced setup examples and pinned C# links.
- Published HTML:150878bytes; SHA2564a046882f2afb01373f2077329cb789fdb3ccd60b55f42c4543c9a695e0cf26a. Both versioned JS assets also match9e18b7d exactly.
- Session frontend implementation **43af923**, published, passes **80/80** client tests. New JS URLs are versioned; login/demo/refresh/logout share serialized cookie ownership, bearer stays in memory, stable avatar/environment identity survives renewal, uncertain outcomes stop without replay.
- Backend **d9332469ddf4587ebca3d74ed3ccec914bad2ef4/Coreb835014** is live (9724c407 SUCCESS). Original visitor securely renewed, normal logout revoked the refresh credential/cleared its cookie, and revoked refresh was rejected. No replacement avatar or provider saves.
- Live HTTP lifecycle proof SHA256af9cdf4e7d4c64b1ba081c9f72b17c24231b369c8a44a8168604862a3acee399. Browser interaction and real expiry waiting are not inferred; expiry-triggered behavior has separate controlled-clock tests.
- **Next:** Starknet hosted application/configuration/acceptance, then its card publication. Existing session frontend is published and all three changed files byte-verified.
- Browser transport remains unavailable; no OS control resumed or request for David to reopen the page.
- Azure/Oracle hosting explicitly deferred; TRON real429 remains unadmitted. Starknet native CQL/CLI/API/local Mongo/privacy and actual presets pass on the backend task branch; hosted enrollment/card remain pending.
- Backend authority: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/CURRENT_STATUS.md, SESSION_RENEWAL_STATUS.md and PROVIDER_CQL_AND_SANDBOX_STATUS.md. Resource ledger remains beside this file.

[Earlier milestone history](Archive/STATUS_BEFORE_SESSION_RENEWAL_PUBLICATION_2026-11-01.md).

Starknet hosted acceptance is complete: backendcafd0f8c8/Core8a5ab45, app151477e9/settings03760bc9 SUCCESS. Native3/2, Mongo5/4, repeat0new/2existing, foreign-private0/public3, replicas2/2. Original cohort completion ACK retained; no reruns. Card now states only verified HTTP scope; guide pinned164b4bb96, actual C#cafd0f8c8. Publish and byte-verify HTML next; browser remains open.
