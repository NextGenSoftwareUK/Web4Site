# GUID grouped text queries

Source prepared20November2026; six targeted Node controls pending. Native GUID counts passed three real stores in OASIS run44637895235; four GUID JSON/compiler controls passed44640939541. Mixed stored/virtual GUID HTTP run44643544052 remains under qualification. The live Development API still needs the qualified Neo/GUID image batch; no hosted/browser acceptance is claimed.

SQL editor now preserves Guid metadata casts and canonical Id distinct counts. Canonical Version is normalized to its actual Int32 projection type rather than its coarse Integer filter label. Ordinary and distinct expressions remain independently bound in HAVING/order clauses. Saved mappings retain their source-filter and bounded direct-field restrictions. Date/Decimal/UInt64 distinct domains remain refused.

Examples: COUNT(DISTINCT Id), COUNT(DISTINCT Version), and COUNT(DISTINCT CAST(metadata.identity AS GUID)) with GROUP BY, HAVING and ORDER BY. Mapped queries use WITH VIRTUAL MAPPING '<saved mapping UUID>' and an approved metadata filter; source must map the selected aliases.

This source change makes no data/API calls. Existing accepted client tests are retained; only six new GUID/canonicalVersion controls should run in CI. Vercel protected-preview authorization and real Free-model owner configuration remain separate recorded gates.
