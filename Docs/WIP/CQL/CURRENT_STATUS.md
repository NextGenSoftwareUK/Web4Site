# CQL website current status

Updated 1 November 2026. Breadth-first live demo; full ORM/parity remains incomplete.

- **35 providers** have scoped hosted HTTP proof; **5** browser-verified, **30** browser gates open. HTTP and byte-publication checks do not certify browser interaction.
- Live website main **0228db6adca82f3c457e30aa836b117d9690577d** includes Radix, Elrond, Sui and Hedera, with spaced setup examples and pinned C# links.
- Published HTML:150955bytes; SHA25654588e7bd9c0368714d9b57b6f4f370c772d93b648665ada00d6a3dc8dbfca42.
- Session frontend implementation **43af923**, task branch only, passes **80/80** client tests. New JS URLs are versioned; login/demo/refresh/logout share serialized cookie ownership, bearer stays in memory, stable avatar/environment identity survives renewal, uncertain outcomes stop without replay.
- Backend4434e2c28 deployed successfully but live protocol rejected a refresh cookie missing Secure. Original test session and sealed response retained; no replacement avatar or provider saves.
- Root correction **b0b308037** explicitly clears default proxy trust lists so Railway forwarded HTTPS is processed. **16/16** API/schema and **9/9** credential-tool tests pass. Exact job **e52770a9-42e7-401b-9d08-4ed4b7f1ee05** last observed QUEUED.
- **Next:** observe that exact job, reconcile the original issued session through normal same-avatar rotation and revoke/clear. Publish this frontend only after live cookie protocol passes. Verify committed HTML, web4-session.js and cql-playground.js exact bytes.
- Browser transport remains unavailable; no OS control resumed or request for David to reopen the page.
- Azure/Oracle hosting explicitly deferred; TRON real429 remains unadmitted. Starknet native header reads qualified, native CQL not implemented.
- Backend authority: C:/Source/OASIS-cosmic/Docs/WIP/COSMIC ORM/CURRENT_STATUS.md, SESSION_RENEWAL_STATUS.md and PROVIDER_CQL_AND_SANDBOX_STATUS.md. Resource ledger remains beside this file.

[Earlier milestone history](Archive/STATUS_BEFORE_SESSION_RENEWAL_PUBLICATION_2026-11-01.md).
