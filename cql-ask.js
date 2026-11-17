(function (root) {
  'use strict';

  const instructions = 'Translate the question into one read-only CQL statement. Output only the statement, or UNSUPPORTED.';

  const databaseProviders = ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS'];
  const databaseInstructions = [
    'MongoDBOASIS, SQLLiteDBOASIS, and Neo4jOASIS support SELECT *, SELECT Id, Name AS DisplayName, Version from one database, SELECT COUNT(*), ANY(*) to test whether a row exists, MIN(Version), MAX(Version), SUM(Version), and AVG(Version). For a known numeric metadata path and type, use SELECT SUM(CAST(metadata.amount AS DECIMAL)) FROM MongoDBOASIS. Scalar MIN, MAX, SUM and AVG support this syntax with INT32, INT64, UINT64 and DECIMAL. Scalar queries use one database and no TIMEOUT.',
    'For a known metadata field and type on these databases, use SELECT CAST(metadata.stock AS INT64) AS Stock FROM MongoDBOASIS ORDER BY Stock DESC LIMIT 5. Supported types are STRING, BOOLEAN, INT32, INT64, UINT64, DECIMAL, SINGLE, DOUBLE, GUID and DATETIME. Do not guess metadata paths or types. Double-quote a metadata segment containing spaces, dots, or punctuation, such as metadata."catalog.v1"."display name". For unique values, use SELECT DISTINCT CAST(metadata.stock AS INT64) AS Stock FROM MongoDBOASIS ORDER BY Stock LIMIT 5. GROUP BY can use the same typed CAST expression or its selected alias when the alias is not a source field name.',
    'Use GROUP BY for selected scalar keys, for example SELECT Version, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version. Include grouping keys only when requested. SELECT COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version returns counts alone. COUNT(1) means COUNT(*); COUNT(Description) counts non-null values with duplicates. COUNT(DISTINCT Description) or COUNT(DISTINCT CAST(metadata.category AS STRING)) counts unique non-null values. Ungrouped aggregates may use one result alias.',
    'Grouped aggregates are COUNT, MIN, MAX, SUM and AVG. Typed SINGLE and DOUBLE metadata support SUM and AVG. HAVING compares selected aliases or repeats the selected aggregate or typed key expression in its exact type, including text LIKE and NOT LIKE, nullable IS NULL and numeric BETWEEN. For example, SELECT IsActive, COUNT(*) AS Total, AVG(Version) AS Mean, SUM(Version) AS Combined FROM MongoDBOASIS GROUP BY IsActive HAVING Total >= 2 AND Mean >= 1.5 AND Combined >= 3. GROUP BY may list multiple keys. Use selected aliases or repeat selected expressions in ORDER BY before OFFSET. LIMIT and OFFSET page groups. No TIMEOUT or relationship filters in grouped queries.',
    'Use SELECT DISTINCT Version, IsActive FROM MongoDBOASIS ORDER BY Version LIMIT 5 to return unique combinations of explicitly selected fields. DISTINCT works on one MongoDBOASIS, SQLLiteDBOASIS or Neo4jOASIS source. It takes no aggregate, GROUP BY or HAVING. Order by selected aliases before OFFSET.',
    "For MongoDBOASIS, SQLLiteDBOASIS and Neo4jOASIS, use LIKE with text fields. Example: SELECT * FROM MongoDBOASIS WHERE Name LIKE '%coffee%' LIMIT 5. Put % at the start for suffix matching, at the end for prefix matching, or at both ends for substring matching. Escape a literal % or _ with ESCAPE, for example Name LIKE '%100!%%' ESCAPE '!'. Consecutive % wildcards act as one. On Name or Description, LIKE with only % matches any non-null value. Use NOT LIKE to exclude matching text. It also excludes nulls and missing metadata. Unescaped internal wildcards and _ wildcards are unsupported.",
    'On MongoDBOASIS, SQLLiteDBOASIS or Neo4jOASIS, a single selected Description alias, selected typed CAST expressions, or multiple selected aliases order matching records in the native provider before applying LIMIT and OFFSET. Full rows on those stores can also use ORDER BY Name, Description, Version or Id, for example SELECT * FROM MongoDBOASIS ORDER BY Name ASC, Id ASC LIMIT 5. For example, SELECT Id, Description AS Detail FROM SQLLiteDBOASIS ORDER BY Detail DESC LIMIT 3. Multi-column example: SELECT Id, Version FROM Neo4jOASIS ORDER BY Version DESC, Id ASC LIMIT 5 OFFSET 1.',
    'Selected columns and all scalar queries use the server timeout. Selected columns require one MongoDBOASIS, SQLLiteDBOASIS, or Neo4jOASIS source.',
    'Use inclusive BETWEEN for numeric and UTC timestamp filters in AND clauses, for example WHERE Version BETWEEN 2 AND 5. Do not place BETWEEN inside an OR alternative.',
    'WHERE accepts Id, ParentHolonId, Name, Description, Version, IsActive, and metadata paths with up to four segments such as metadata.location.city. Use Description IS NULL or Name IS NOT NULL for canonical text. Metadata supports IS PRESENT, IS MISSING, IS NULL, and IS NOT NULL. IS NOT NULL requires the path to exist with a non-null value.',
    'A top-level AND clause may use EXISTS CHILD (filters) for direct children or EXISTS DESCENDANT (filters) for descendants within eight levels. Use NOT EXISTS CHILD or NOT EXISTS DESCENDANT for absence of a visible match. Omit parentheses to match any visible related record. Relationship predicates may use AND and a parenthesized OR group, with no nested EXISTS. Example: SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE AND EXISTS CHILD (Version >= 2) AND EXISTS DESCENDANT (IsActive = TRUE) ORDER BY Name LIMIT 5.',
    'Use single-quoted strings (512 characters max), exact numbers, TRUE or FALSE. Use equality, inequality and IN. NOT BETWEEN is exclusive and consumes the single OR group in numeric and UTC timestamp scopes. Typed metadata predicates use metadata.path AS TYPE, such as metadata.Sequence AS INT64 >= -9007199254740993. Preserve INT64, UINT64 and DECIMAL digits; use SINGLE or DOUBLE only for known floating values. CAST(metadata.path AS TYPE) selects or deduplicates typed values. Use BOOLEAN = TRUE for known Boolean fields. DATETIME requires a known stored timestamp with quoted UTC ISO Z and up to seven fractional digits. Use string equality for stored text. Text also supports CONTAINS, STARTSWITH and ENDSWITH.',
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
        'For an exact same-provider INNER JOIN, LEFT JOIN, RIGHT JOIN or FULL OUTER JOIN on MongoDBOASIS, SQLLiteDBOASIS or Neo4jOASIS, use two aliased (SELECT * FROM provider ... LIMIT n) inputs with explicit LIMIT 1 through 10 in each. Both inputs must use the same available provider. Each input may use OFFSET 0 through 1000 after LIMIT. Put the offset on its specific input. A join input may use one parenthesized OR group with its own AND filters. Select qualified columns with distinct aliases. Combine ON comparisons with AND and OR. AND binds more tightly than OR, so A AND B OR C matches when both A and B match or C matches. Use parentheses when OR must bind before AND. The expanded clause must contain at most eight comparisons. An OR join returns each matching pair once even when multiple conditions match. Use = on compatible scalar fields. For matching signed integer fields, also use <>, <, <=, > or >=. FULL OUTER JOIN includes unmatched rows from both inputs. For a Cartesian product of two bounded inputs, use CROSS JOIN without ON. Use CHILD JOIN without ON for visible children of the admitted left parents. The right LIMIT applies after scoping that relationship. For result paging, append ORDER BY selected aliases and LIMIT n OFFSET m outside both inputs. For known typed metadata use CAST(l.metadata.path AS INT64) and the same declared type on the other side. For known nullable Boolean fields, use CAST(l.metadata.enabled AS BOOLEAN) IS NOT DISTINCT FROM CAST(r.metadata.enabled AS BOOLEAN). Use the same null-safe operators with matching nullable GUID, UTC timestamp, signed integer, UINT64 or DECIMAL metadata. IS NOT DISTINCT FROM matches null to null. IS DISTINCT FROM matches one null to a value or two differing values.',
        `Example: SELECT l.Id AS LeftId, r.Id AS RightId FROM (SELECT * FROM ${joinProvider} ORDER BY Id LIMIT 2) AS l LEFT JOIN (SELECT * FROM ${joinProvider} ORDER BY Id LIMIT 2) AS r ON l.Id = r.Id AND l.Version = r.Version`
      ] : []),
      ...providerInstructions.filter(([names]) => names.some(provider => ready.has(provider))).map(([, rule]) => rule)
    ].join('\n');
  }

  function init({ playground, isSandbox, getIdentity, ensureAccessToken, isDemoSession = () => false }) {
    const $ = id => document.getElementById(id);
    const status = $('ask-status');
    const generate = $('ask-generate');
    const preview = $('ask-preview');
    let draft, activeExample;
    const questionInput = $('ask-question');
    let questionVersion = 0;

    const exampleProvider = $('ask-example-provider');
    function refreshExampleProviders() {
      const selected = exampleProvider.value;
      const options = [['', 'Any ready provider'], ...playground.availableQuestionProviders().map(provider => [provider, provider])];
      exampleProvider.replaceChildren(...options.map(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }));
      if (options.some(([value]) => value === selected)) exampleProvider.value = selected;
    }


    function clearDraft() {
      questionVersion++;
      draft = null;
      preview.disabled = true;
      $('ask-draft').textContent = '';
    }
    questionInput.addEventListener('input', () => {
      activeExample = null;
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
        const example = isSandbox() && playground.publicQuestionExample(exampleProvider.value);
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
        activeExample = { question, provider, request };
        questionInput.focus();
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
        const example = activeExample?.question === question ? activeExample : null;
        const readyProviders = playground.availableTextProviders();
        const providers = example ? readyProviders.filter(provider => provider === example.provider) : readyProviders;
        if (!providers.length) throw new Error('Wait for WEB4 provider discovery before drafting a query.');
        const providerScope = 'Use only these currently available WEB4 providers: ' + providers.join(', ') + '.';
        const keyProfiles = Object.entries(playground.availableTextProfiles())
          .filter(([provider]) => !example || provider === example.provider)
          .map(([provider, { key, maximumKeys }]) => provider + ':metadata.' + key + '(' + maximumKeys + ')');
        const keyScope = keyProfiles.length
          ? '\nAdditional ready sources (provider:metadata key, maximum IN keys). Use SELECT * and one equality on a supplied quoted key. IN is allowed only when the bound is positive. No ORDER BY or aggregation. ' + keyProfiles.join(', ')
          : '';
        const exampleScope = example
          ? '\nFor this public example, select all fields and use exactly one WHERE comparison on the supplied field. ' +
            'Preserve every supplied key verbatim, using IN for multiple keys. Include the requested LIMIT and, ' +
            'if requested, append TIMEOUT followed by the duration in milliseconds after LIMIT.'
          : '';
        requestKey = crypto.randomUUID();
        const response = await fetch('https://dev.api.web6.oasisomniverse.one/v1/complete', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
            'Idempotency-Key': requestKey },
          body: JSON.stringify({ messages: [{ role: 'system', content: queryInstructions(providers) + '\n' + providerScope + keyScope + exampleScope },
            { role: 'user', content: question }], tools: [], maxTokens: 350, temperature: 0,
            useFAHRN: false, useHolonicBraid: false, injectAvatarContext: false,
            ...(isDemoSession() ? { freeOnly: true } : {}) })
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
        if (result.errorCode === 'WEB6_FREE_ROUTE_UNAVAILABLE')
          throw new Error('Free AI drafting is temporarily unavailable. You can still write and run CQL in the Playground.');
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
        const compiled = playground.compileAvailableText(text);
        if (example) {
          const body = compiled.body;
          const actual = body.filters?.[0];
          const expected = example.request.filters[0];
          const key = filter => JSON.stringify(filter.metadataPath ?? [filter.field]);
          const values = filter => [].concat(filter.value).map(value => JSON.stringify(value)).sort();
          if (compiled.path !== 'data/query-cql' || body.provider !== example.provider
              || body.filters?.length !== 1 || body.anyOf?.length || body.anyChildren?.length || body.anyDescendants?.length
              || !['Equal', 'In'].includes(actual?.operator) || key(actual) !== key(expected)
              || JSON.stringify(values(actual)) !== JSON.stringify(values(expected))
              || body.selection || body.projection || (body.skip ?? 0) !== 0
              || (body.maximumDurationMilliseconds ?? null) !== (example.request.maximumDurationMilliseconds ?? null)
              || body.take < values(expected).length
              || body.take > example.request.take)
            throw new Error('The draft did not preserve the reviewed public example. Nothing was run.');
        }
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
      refreshExampleProviders,
      resetSession() {
        clearDraft();
        questionInput.value = '';
        activeExample = null;
        status.textContent = '';
        $('cql-text').value = '';
      }
    };
  }
  root.CqlAsk = { init };
})(globalThis);
