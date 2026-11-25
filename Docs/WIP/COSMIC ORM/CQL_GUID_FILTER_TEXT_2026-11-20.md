# Typed UUID filters in SQL-like queries

The editor compiles CAST(metadata.identity AS GUID) equality and inequality, including saved virtual mappings and selected ordering/grouping. It keeps UUID literals typed rather than treating identifiers as text. The backend normalizes admitted native representations. Relational UUID comparisons, mapped IN and LENGTH(UUID) remain explicit refusals.

Eleven new parser cases passed (ten retained from the initial run, only the failed assertion retried after matching the existing early ordered-comparison refusal) using the existing Node executable with source and tests in memory: equality/inequality across MongoDB, SQLite and Neo4j; grouped composition; malformed UUID, unsupported range, membership and coercion refusal. No prior accepted suite rerun, npm install, environment, generated test files or live data calls. Native API run44674937928 is separately pending; parser success is not hosted browser or full ORM acceptance. Protected preview and free-model configuration remain the existing owner actions.

Examples:
SELECT Id, CAST(metadata.identity AS GUID) AS Identity FROM MongoDBOASIS WITH VIRTUAL MAPPING '764b78ae-df26-4637-9bbd-1d0530954fea' WHERE CAST(metadata.identity AS GUID) = 'AB8079E8-5E72-4FF9-81B7-8FECE973C50A' ORDER BY Id LIMIT 10
