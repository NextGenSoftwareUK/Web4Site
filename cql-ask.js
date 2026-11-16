(function (root) {
  'use strict';

  const instructions = 'Translate the question into one read-only CQL statement. Output only the statement, or UNSUPPORTED.';

  const databaseProviders = ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS'];
  const databaseInstructions = [
    'MongoDBOASIS, SQLLiteDBOASIS, and Neo4jOASIS support SELECT *, SELECT Id, Name AS DisplayName, Version from one database, SELECT COUNT(*), ANY(*) to test whether a row exists, MIN(Version), MAX(Version), SUM(Version), and AVG(Version). For a known numeric metadata path and type, use SELECT SUM(CAST(metadata.amount AS DECIMAL)) FROM MongoDBOASIS. Scalar MIN, MAX, SUM and AVG support this syntax with INT32, INT64, UINT64 and DECIMAL. Scalar queries use one database and no TIMEOUT.',
    'For a known metadata field and type on these databases, use SELECT CAST(metadata.stock AS INT64) AS Stock FROM MongoDBOASIS ORDER BY Stock DESC LIMIT 5. Supported types are STRING, BOOLEAN, INT32, INT64, UINT64, DECIMAL, GUID and DATETIME. Do not guess metadata paths or types. Double-quote a metadata segment containing spaces, dots, or punctuation, such as metadata."catalog.v1"."display name". For unique values, use SELECT DISTINCT CAST(metadata.stock AS INT64) AS Stock FROM MongoDBOASIS ORDER BY Stock LIMIT 5. GROUP BY can use the same typed CAST expression without its alias.',
    'To count records per field on one of these three databases, use SELECT Version, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version. Include grouping fields in SELECT when the user wants to see them. For visibility and type groups, select and group by IsPublic or HolonType. Filter selected aliases with HAVING IsPublic = TRUE or HAVING HolonType = \'Avatar\'. For counts only, use SELECT COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version. Include only the requested aggregates. COUNT(1) has the same meaning as COUNT(*). In a group, COUNT(Description) counts non-null values including duplicates, for example SELECT Version, COUNT(Description) AS Descriptions FROM MongoDBOASIS GROUP BY Version HAVING Descriptions > 1. Supported grouped aggregates also include COUNT(*), MIN(Version), MAX(Version), SUM(Version), and AVG(Version). HAVING can compare selected grouping-key and aggregate aliases. Use COUNT(Description) to count non-null values while retaining duplicates. Count unique non-null values with COUNT(DISTINCT Description) or COUNT(DISTINCT CAST(metadata.category AS STRING)). For one ungrouped aggregate a result alias is allowed, for example SELECT COUNT(*) AS Total FROM MongoDBOASIS. SUM and AVG accept explicitly typed SINGLE and DOUBLE metadata on the three databases. HAVING over those aliases uses the same floating-point type. For a nullable numeric metadata average, use HAVING Mean IS NULL to find groups with no participating values. For selected text keys it also accepts LIKE with the same wildcard and ESCAPE rules as WHERE. Use the exact type of the selected alias, for example SELECT Version AS Revision, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version HAVING Revision >= 2 AND Total >= 1. For example, SELECT IsActive, COUNT(*) AS Total, AVG(Version) AS Mean, SUM(Version) AS Combined FROM MongoDBOASIS GROUP BY IsActive HAVING Total >= 2 AND Mean >= 1.5 AND Combined >= 3. To group by more than one field, use SELECT Version, IsActive, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version, IsActive. HAVING Total BETWEEN 2 AND 10 filters the resulting counts to an inclusive range. Order by selected aliases before using OFFSET, for example ORDER BY Total DESC, Version ASC. LIMIT and OFFSET page groups. Do not use TIMEOUT or relationship filters in grouped queries.',
    'Use SELECT DISTINCT Version, IsActive FROM MongoDBOASIS ORDER BY Version LIMIT 5 to return unique combinations of explicitly selected fields. DISTINCT works on one MongoDBOASIS, SQLLiteDBOASIS or Neo4jOASIS source. It takes no aggregate, GROUP BY or HAVING. Order by selected aliases before OFFSET.',
    "For MongoDBOASIS, SQLLiteDBOASIS and Neo4jOASIS, use LIKE with text fields. Example: SELECT * FROM MongoDBOASIS WHERE Name LIKE '%coffee%' LIMIT 5. Put % at the start for suffix matching, at the end for prefix matching, or at both ends for substring matching. Escape a literal % or _ with ESCAPE, for example Name LIKE '%100!%%' ESCAPE '!'. Consecutive % wildcards act as one. On Name or Description, LIKE with only % matches any non-null value. Unescaped internal wildcards and _ wildcards are unsupported.",
    'On MongoDBOASIS, SQLLiteDBOASIS or Neo4jOASIS, a single selected Description alias or multiple selected aliases can order the first 100 matching records taken in Id order, then apply result paging. For example, SELECT Id, Description AS Detail FROM SQLLiteDBOASIS ORDER BY Detail DESC LIMIT 3. Multi-column example: SELECT Id, Version FROM Neo4jOASIS ORDER BY Version DESC, Id ASC LIMIT 5 OFFSET 1.',
    'Selected columns and all scalar queries use the server timeout. Selected columns require one MongoDBOASIS, SQLLiteDBOASIS, or Neo4jOASIS source.',
    'Use inclusive BETWEEN for numeric and UTC timestamp filters in AND clauses, for example WHERE Version BETWEEN 2 AND 5. Do not place BETWEEN inside an OR alternative.',
    'WHERE accepts Id, ParentHolonId, Name, Description, Version, IsActive, and metadata paths with up to four segments such as metadata.location.city. Use Description IS NULL or Name IS NOT NULL for canonical text. Metadata supports IS PRESENT, IS MISSING, IS NULL, and IS NOT NULL. IS NOT NULL requires the path to exist with a non-null value.',
    'A top-level AND clause may use EXISTS CHILD (filters) for direct children or EXISTS DESCENDANT (filters) for descendants within eight levels. Relationship predicates may use AND and a parenthesized OR group, but cannot contain another EXISTS. Example: SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE AND EXISTS CHILD (Version >= 2) AND EXISTS DESCENDANT (IsActive = TRUE) ORDER BY Name LIMIT 5.',
    'Use single-quoted strings, integers, or TRUE/FALSE as appropriate. Use equality, inequality, or IN. For numeric and UTC timestamp filters, NOT BETWEEN selects values strictly outside the range and uses the one OR group for that scope. Ordered comparisons apply to Version or signed and unsigned 64-bit metadata, for example metadata.Sequence AS INT64 >= -9007199254740993 or metadata.Sequence AS UINT64 >= 9007199254740993. Preserve the full integer digits. For exact decimal metadata use metadata.amount AS DECIMAL >= 0.10 and preserve the literal digits. For known floating-point metadata use metadata.reading AS DOUBLE >= 0.01 or metadata.reading AS SINGLE IN (0.25, 0.5). Use CAST(metadata.reading AS DOUBLE) or CAST(metadata.reading AS SINGLE) to select or deduplicate those values. For Boolean metadata use metadata.someFlag AS BOOLEAN = TRUE. For UTC timestamps use metadata.observedAt AS DATETIME >= quoted ISO UTC with Z and up to seven fractional digits, only if the user identifies the field as stored timestamp metadata. Use string equality for a timestamp stored as text. String literals may contain up to 512 characters. String fields also support CONTAINS, STARTSWITH, and ENDSWITH.',
    'Use a flat OR list on its own, or combine filters with AND and at most one parenthesized OR group. Row queries may use ORDER BY Name, Version, or Id, LIMIT 1–100 and OFFSET 0–1000, or the equivalent OFFSET n ROWS FETCH NEXT n ROWS ONLY. Use at most twelve filters and four relationship predicates. On MongoDBOASIS, SQLLiteDBOASIS and Neo4jOASIS, use NOT IN with non-null literals on Id, Version, Name, Description or metadata in an AND scope. Each distinct excluded value uses one filter. Text and metadata also use one filter to exclude nulls and missing values.',
    'Example: SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE AND (metadata.category = \'coffee\' OR metadata.category = \'tea\') ORDER BY Name LIMIT 5',
  ];

  const providerInstructions = [
    [['HoloOASIS'], 'HoloOASIS supports SELECT * with optional Id equality or IN, LIMIT and OFFSET. Use IDs supplied by the user. Do not invent IDs or use other filters, COUNT, or ORDER BY with HoloOASIS.'],
    [['SolanaOASIS'], 'SolanaOASIS supports SELECT * with optional metadata.SolanaAccountAddress equality or IN, LIMIT and OFFSET. Use addresses supplied by the user. Do not invent addresses or use other filters, COUNT, or ORDER BY with SolanaOASIS.'],
    [['EthereumOASIS', 'PolygonOASIS', 'ArbitrumOASIS'], 'EthereumOASIS, PolygonOASIS, and ArbitrumOASIS support SELECT * with LIMIT and OFFSET and an optional equality or IN filter on their own metadata key: EthereumAccountAddress, PolygonAccountAddress, or ArbitrumAccountAddress. Use only addresses supplied by the user. Do not use COUNT, ORDER BY, or mix account networks.'],
    [['BNBChainOASIS', 'AvalancheOASIS', 'BaseOASIS', 'OptimismOASIS'], 'BNBChainOASIS, AvalancheOASIS, BaseOASIS and OptimismOASIS support SELECT * with one equality or IN filter on their respective metadata key: BNBChainAccountAddress, AvalancheAccountAddress, BaseAccountAddress or OptimismAccountAddress. Use at most eight distinct supplied 0x addresses. Use LIMIT and OFFSET without COUNT or ORDER BY, and query each account network separately.'],
    [['SuiOASIS', 'AptosOASIS', 'StarknetOASIS', 'FantomOASIS'], 'SuiOASIS and AptosOASIS use metadata.SuiObjectId or metadata.AptosAccountAddress with quoted 0x followed by 64 lowercase hexadecimal digits. StarknetOASIS uses metadata.StarknetBlockHash with a quoted canonical lowercase 0x field element. FantomOASIS uses metadata.FantomAccountAddress with a quoted 0x address. Use SELECT * with one equality or IN filter of at most eight distinct supplied keys, and no COUNT or ORDER BY.'],
    [['AlgorandOASIS', 'FilecoinOASIS', 'ZcashOASIS', 'RadixOASIS'], 'AlgorandOASIS, FilecoinOASIS, ZcashOASIS and RadixOASIS support SELECT * with one equality or IN filter on metadata.AlgorandAddress, metadata.FilecoinAccountAddress, metadata.ZcashBlockHash or metadata.RadixResourceAddress respectively. Use up to eight distinct supplied keys and quote each key. Use an uppercase Algorand address, a 0x Filecoin EVM address, a lowercase 64-digit Zcash block hash, or a Mainnet resource_rdx1 Radix address. Do not invent keys or use COUNT or ORDER BY.'],
    [['NEAROASIS', 'EOSIOOASIS'], 'NEAROASIS and EOSIOOASIS support SELECT * with LIMIT and OFFSET and an optional equality or IN filter on metadata.NearAccountId or metadata.EOSIOAccountName respectively. Use only account names supplied by the user. Do not use COUNT or ORDER BY.'],
    [['SOLIDOASIS', 'IPFSOASIS', 'ActivityPubOASIS'], 'SOLIDOASIS, IPFSOASIS, and ActivityPubOASIS support SELECT * with LIMIT and OFFSET and equality or IN on metadata.SolidRecordId, metadata.IPFSRecordCid, or metadata.MastodonStatusId respectively. Use keys supplied by the user. Omit COUNT and ORDER BY.'],
    [['CosmosBlockChainOASIS', 'PolkadotOASIS', 'TONOASIS'], 'CosmosBlockChainOASIS, PolkadotOASIS, and TONOASIS support SELECT * with equality or IN on metadata.CosmosValidatorAddress, metadata.PolkadotBlockHash, or metadata.TonBlockRootHash respectively. Use keys supplied by the user, with LIMIT and OFFSET. Omit COUNT and ORDER BY.'],
    [['TRONOASIS'], 'TRONOASIS supports SELECT * with equality or IN on metadata.TronBlockHeight using quoted positive block heights supplied by the user. Omit COUNT and ORDER BY.'],
    [['AxelarOASIS'], 'AxelarOASIS supports SELECT * with equality or IN on metadata.AxelarBlockHeight. Use only supplied quoted positive block heights, at most eight keys. Omit COUNT and ORDER BY.'],
    [['BitcoinOASIS', 'CardanoOASIS', 'XRPLOASIS', 'StellarOASIS'], 'BitcoinOASIS and CardanoOASIS use metadata.BitcoinBlockHash and metadata.CardanoBlockHash respectively, with quoted lowercase 64-digit hexadecimal hashes. XRPLOASIS uses metadata.XRPLLedgerHash with quoted uppercase 64-digit hexadecimal hashes. StellarOASIS uses metadata.StellarLedgerSequence with quoted positive unsigned 32-bit sequences. Use SELECT * and one equality or IN filter of at most eight distinct supplied keys. Do not invent keys or use COUNT or ORDER BY.'],
    [['HashgraphOASIS'], 'HashgraphOASIS supports SELECT * with optional equality or IN on metadata.HederaAccountId, LIMIT and OFFSET. Use only account IDs supplied by the user. Omit COUNT and ORDER BY.'],
    [['NostrOASIS'], 'NostrOASIS supports SELECT * with equality or IN on metadata.NostrEventId, LIMIT and OFFSET. Use only supplied 64-character lowercase hexadecimal event IDs, at most eight. Omit COUNT and ORDER BY.'],
  ];

  function queryInstructions(providers) {
    const ready = new Set(providers);
    const joinProvider = databaseProviders.find(provider => ready.has(provider));
    return [instructions,
      'Use TIMEOUT followed by milliseconds (1–30000) only for SELECT * row queries when requested.',
      'For a federated row query, list distinct providers separated by commas after FROM. COUNT uses one provider. A federated query shares one filter across providers. Use one key field per query; HoloOASIS and public account providers with different key fields require separate queries.',
      ...(joinProvider ? databaseInstructions.map(rule => rule.replace(
        /\bFROM (MongoDBOASIS|SQLLiteDBOASIS|Neo4jOASIS)\b/g,
        (example, provider) => ready.has(provider) ? example : 'FROM ' + joinProvider
      )) : []),
      ...(joinProvider ? [
        'For an exact same-provider INNER JOIN, LEFT JOIN, RIGHT JOIN or FULL OUTER JOIN on MongoDBOASIS, SQLLiteDBOASIS or Neo4jOASIS, use two aliased (SELECT * FROM provider ... LIMIT n) inputs with explicit LIMIT 1 through 10 in each. Both inputs must use the same available provider. Each input may use OFFSET 0 through 1000 after LIMIT. Put the offset on its specific input. A join input may use one parenthesized OR group with its own AND filters. Select qualified columns with distinct aliases. ON supports exact field equalities between inputs, joined by AND. FULL OUTER JOIN includes unmatched rows from both inputs. For a Cartesian product of two bounded inputs, use CROSS JOIN without ON. For known typed metadata use CAST(l.metadata.path AS INT64) and the same declared type on the other side.',
        `Example: SELECT l.Id AS LeftId, r.Id AS RightId FROM (SELECT * FROM ${joinProvider} ORDER BY Id LIMIT 2) AS l LEFT JOIN (SELECT * FROM ${joinProvider} ORDER BY Id LIMIT 2) AS r ON l.Id = r.Id AND l.Version = r.Version`
      ] : []),
      ...providerInstructions.filter(([names]) => names.some(provider => ready.has(provider))).map(([, rule]) => rule)
    ].join('\n');
  }

  function init({ playground, isSandbox, getIdentity, ensureAccessToken }) {
    const $ = id => document.getElementById(id);
    const status = $('ask-status');
    const generate = $('ask-generate');
    const preview = $('ask-preview');
    let draft;
    const questionInput = $('ask-question');
    let questionVersion = 0;

    function clearDraft() {
      questionVersion++;
      draft = null;
      preview.disabled = true;
      $('ask-draft').textContent = '';
    }
    questionInput.addEventListener('input', () => {
      clearDraft();
      status.textContent = '';
    });
    $('cql-compile').addEventListener('click', () => {
      try { playground.loadText($('cql-text').value); }
      catch (error) { $('cql-note').textContent = error.message; }
    });
    $('cql-run-text').addEventListener('click', () => {
      try {
        playground.loadText($('cql-text').value);
        $('cql-run').click();
      } catch (error) { $('cql-note').textContent = error.message; }
    });
    $('ask-use-example').addEventListener('click', () => {
      try {
        const example = isSandbox() && playground.publicQuestionExample();
        if (!example) throw new Error('No public query example is ready on this WEB4 host.');
        const { provider, request } = example;
        const filter = request.filters[0];
        const field = filter.field ?? 'metadata.' + filter.metadataPath[0];
        const timeout = request.maximumDurationMilliseconds;
        const predicate = filter.operator === 'Equal'
        ? `${field} exactly equal to ${JSON.stringify(filter.value)}`
        : `${field} matching any of these keys: ${[].concat(filter.value).map(value => JSON.stringify(value)).join(', ')}`;
      const question = `Show up to ${request.take} public records from ${provider} with ${predicate}.` +
          (timeout ? ` Use a query timeout of ${timeout} milliseconds.` : '');
        if (question.length > 1000) throw new Error('This example exceeds the question length limit.');
        clearDraft();
        questionInput.value = question;
        status.textContent = 'Review the question, then select Draft query.';
      } catch (error) { status.textContent = error.message; }
    });
    generate.addEventListener('click', async () => {
      const question = questionInput.value.trim();
      if (!question || question.length > 1000 || !isSandbox()) {
        status.textContent = 'Select WEB4 Development and enter a question of up to 1,000 characters.';
        return;
      }
      const identity = getIdentity();
      const sameSession = () => isSandbox() && getIdentity() === identity;
      clearDraft();
      const version = questionVersion;
      const current = () => sameSession() && version === questionVersion;
      generate.disabled = true;
      status.textContent = 'Drafting with WEB6…';
      let requestKey;
      try {
        const token = await ensureAccessToken();
        if (!current() || !token) throw new Error('Sign in to the Development sandbox first.');
        const providers = playground.availableTextProviders();
        if (!providers.length) throw new Error('Wait for WEB4 provider discovery before drafting a query.');
        const providerScope = 'Use only these currently available WEB4 providers: ' + providers.join(', ') + '.';
        const keyProfiles = Object.entries(playground.availableTextProfiles())
          .map(([provider, { key, maximumKeys }]) => provider + ':metadata.' + key + '(' + maximumKeys + ')');
        const keyScope = keyProfiles.length
          ? '\nAdditional ready sources (provider:metadata key, maximum IN keys). Use SELECT * and one equality on a supplied quoted key. IN is allowed only when the bound is positive. No ORDER BY or aggregation. ' + keyProfiles.join(', ')
          : '';
        requestKey = crypto.randomUUID();
        const response = await fetch('https://dev.api.web6.oasisomniverse.one/v1/complete', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
            'Idempotency-Key': requestKey },
          body: JSON.stringify({ messages: [{ role: 'system', content: queryInstructions(providers) + '\n' + providerScope + keyScope },
            { role: 'user', content: question }], tools: [], maxTokens: 350, temperature: 0,
            useFAHRN: false, useHolonicBraid: false, injectAvatarContext: false })
        });
        const result = await response.json().catch(error => {
          if (error.name !== 'SyntaxError') throw error;
          throw new Error('WEB6 returned an invalid response (HTTP ' + response.status + ').');
        });
        if (!current()) return;
        if (!result || typeof result !== 'object' || Array.isArray(result))
          throw new Error('WEB6 returned an invalid response (HTTP ' + response.status + ').');
        if (result.code === 'MEASUREMENT_REQUIRED')
          throw new Error('WEB6 could not confirm usage for this request. Reconciliation reference: ' +
            (result.operationId ?? response.headers.get('X-OASIS-Operation-Id') ?? requestKey));
        if (result.code === 'DAILY_TOKEN_LIMIT_EXCEEDED')
          throw new Error('Your remaining daily AI token allowance is too low for this draft. You can still write and run CQL in the Playground.');
        if (response.status === 400 && result.isError === true &&
            result.message === 'Error calling AI provider(s). Reason: No LeelaAI model in the catalogue is admitted by your plan.')
          throw new Error('Your Development plan has no available WEB6 model. You can still write and run CQL in the Playground.');
        if (!response.ok || result.isError === true)
          throw new Error('WEB6 could not draft a query (HTTP ' + response.status + ').');
        const content = (result.result ?? result).content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('WEB6 returned no CQL statement.');
        const text = content.trim();
        if (text === 'UNSUPPORTED') throw new Error('This question cannot be expressed in the sandbox query editor.');
        playground.compileAvailableText(text);
        draft = { text, identity };
        $('ask-draft').textContent = text;
        preview.disabled = false;
        status.textContent = 'Review the draft and open it in the Playground to run it.';
      } catch (error) {
        if (current()) status.textContent = error.message;
      } finally {
        if (!sameSession() && version === questionVersion)
          status.textContent = 'The sandbox session changed. Draft a new query.';
        generate.disabled = false;
      }
    });
    preview.addEventListener('click', () => {
      try {
        if (!draft || !isSandbox() || getIdentity() !== draft.identity)
          throw new Error('The sandbox session changed. Draft a new query.');
        playground.loadText(draft.text);
        $('cql-text').value = draft.text;
        $('cql-text-editor').open = true;
        document.querySelector('[data-tab="cql"]').click();
        $('cql-text').focus();
      } catch (error) { status.textContent = error.message; }
    });

    return {
      resetSession() {
        clearDraft();
        questionInput.value = '';
        status.textContent = '';
        $('cql-text').value = '';
      }
    };
  }
  root.CqlAsk = { init };
})(globalThis);
