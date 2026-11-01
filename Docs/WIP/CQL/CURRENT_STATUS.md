# CQL website current status

Updated 1 November 2026. Breadth-first live demo; full ORM/parity remains incomplete.

- **35 providers** have scoped hosted HTTP proof; **5** browser-verified, **30** browser gates open. HTTP and byte-publication checks do not certify browser interaction.
- Live website main **0228db6adca82f3c457e30aa836b117d9690577d** includes Radix, Elrond, Sui and Hedera, with spaced setup examples and pinned C# links.
- Published HTML:150955bytes; SHA25654588e7bd9c0368714d9b57b6f4f370c772d93b648665ada00d6a3dc8dbfca42.
- Session frontend implementation **43af923**, task branch only, passes **80/80** client tests. New JS URLs are versioned; login/demo/refresh/logout share serialized cookie ownership, bearer stays in memory, stable avatar/environment identity survives renewal, uncertain outcomes stop without replay.
- Backend **d9332469ddf4587ebca3d74ed3ccec914bad2ef4/Coreb835014** is live (9724c407 SUCCESS). Original visitor securely renewed, normal logout revoked the refresh credential/cleared its cookie, and revoked refresh was rejected. No replacement avatar or provider saves.
- Live HTTP lifecycle proof SHA256af9cdf4e7d4c64b1ba081c9f72b17c24231b369c8a44a8168604862a3acee399. Browser interaction and real expiry waiting are not inferred; expiry-triggered behavior has separate controlled-clock tests.
- **Next:** publish reviewed frontend and verify committed HTML, web4-session.js and cql-playground.js exact bytes. New asset URLs are versioned.
- Browser transport remains unavailable; no OS control resumed or request for David to reopen the page.
- Azure/Oracle hosting explicitly deferred; TRON real429 remains unadmitted. Starknet native CQL/CLI/API/local Mongo/privacy and actual presets pass on the backend task branch; hosted enrollment/card remain pending.
- Backend authority: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/CURRENT_STATUS.md, SESSION_RENEWAL_STATUS.md and PROVIDER_CQL_AND_SANDBOX_STATUS.md. Resource ledger remains beside this file.

[Earlier milestone history](Archive/STATUS_BEFORE_SESSION_RENEWAL_PUBLICATION_2026-11-01.md).
