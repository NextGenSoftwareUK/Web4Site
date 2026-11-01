# CQL website current status

Updated 1 November 2026. Breadth-first live demo; full ORM/parity remains incomplete.

- **36 providers** have scoped hosted HTTP proof; **5** browser-verified, **31** browser gates open. HTTP and byte-publication checks do not certify browser interaction.
- Live website main **80ba51052c14a2f705e24e9825a9fe8b495fe642** includes Radix, Elrond, Sui and Hedera, with spaced setup examples and pinned C# links.
- Published HTML:152265bytes; SHA25658bd2b0b5edec25c29d16f9351006dc4621dd6ca2818df5d08dec1551163a2a6. Starknet card and both pinned guide/C# links are live. Session JS assets remain unchanged from verified9e18b7d.
- Session frontend implementation **43af923**, published, passes **80/80** client tests. New JS URLs are versioned; login/demo/refresh/logout share serialized cookie ownership, bearer stays in memory, stable avatar/environment identity survives renewal, uncertain outcomes stop without replay.
- Backend **d9332469ddf4587ebca3d74ed3ccec914bad2ef4/Coreb835014** is live (9724c407 SUCCESS). Original visitor securely renewed, normal logout revoked the refresh credential/cleared its cookie, and revoked refresh was rejected. No replacement avatar or provider saves.
- Live HTTP lifecycle proof SHA256af9cdf4e7d4c64b1ba081c9f72b17c24231b369c8a44a8168604862a3acee399. Browser interaction and real expiry waiting are not inferred; expiry-triggered behavior has separate controlled-clock tests.
- **Next:** Cardano read-only qualification on the backend, then further breadth. Session lifecycle and Starknet card are published; actual browser interaction remains separate.
- Browser transport remains unavailable; no OS control resumed or request for David to reopen the page.
- Azure/Oracle hosting explicitly deferred; TRON real429 remains unadmitted. Starknet native CQL/CLI/API/local Mongo/privacy and actual presets pass on the backend task branch; hosted enrollment/card remain pending.
- Backend authority: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/CURRENT_STATUS.md, SESSION_RENEWAL_STATUS.md and PROVIDER_CQL_AND_SANDBOX_STATUS.md. Resource ledger remains beside this file.

[Earlier milestone history](Archive/STATUS_BEFORE_SESSION_RENEWAL_PUBLICATION_2026-11-01.md).

Starknet hosted acceptance is complete: backendcafd0f8c8/Core8a5ab45, app151477e9/settings03760bc9 SUCCESS. Native3/2, Mongo5/4, repeat0new/2existing, foreign-private0/public3, replicas2/2. Original cohort completion ACK retained; no reruns. Card now states only verified HTTP scope; guide pinned164b4bb96, actual C#cafd0f8c8. HTML now published/byte-verified at80ba510; browser remains open.

Cardano card staged on task branch only, with spaced local DLL command and first-checkout guide/commented C# links pinnedac29a07b2. Backend35controls/native-CLI3/2/API-localHTTP3/2+Mongo5/4/privacy/actual presets pass; selected release build underway. No Cardano host settings applied yet. Publish only after hosted native/federation/reuse/isolation/replicas pass.
