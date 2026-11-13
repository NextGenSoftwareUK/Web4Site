(function (root) {
  'use strict';

  const instructions = [
    'Translate the question into one read-only CQL statement. Output only the statement, or UNSUPPORTED.',
    'MongoDBOASIS, SQLLiteDBOASIS, and Neo4jOASIS support SELECT *, SELECT Id, Name AS DisplayName, Version from one database, SELECT COUNT(*), ANY(*) to test whether a row exists, MIN(Version), MAX(Version), SUM(Version), and AVG(Version). Scalar queries use one database and no TIMEOUT.',
    'To count records per field on one of these three databases, use SELECT Version, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version. Select every grouping field once and one aliased COUNT(*). To group by more than one field, use SELECT Version, IsActive, COUNT(*) AS Total FROM MongoDBOASIS GROUP BY Version, IsActive. HAVING Total >= 2 AND Total <= 10 filters the resulting counts to a range. Order by selected aliases before using OFFSET, for example ORDER BY Total DESC, Version ASC. LIMIT and OFFSET page groups. Do not use TIMEOUT or relationship filters in grouped queries.',
    'HoloOASIS supports SELECT * with optional Id equality or IN, LIMIT and OFFSET. Use IDs supplied by the user. Do not invent IDs or use other filters, COUNT, or ORDER BY with HoloOASIS.',
    'SolanaOASIS supports SELECT * with optional metadata.SolanaAccountAddress equality or IN, LIMIT and OFFSET. Use addresses supplied by the user. Do not invent addresses or use other filters, COUNT, or ORDER BY with SolanaOASIS.',
    'EthereumOASIS, PolygonOASIS, and ArbitrumOASIS support SELECT * with LIMIT and OFFSET and an optional equality or IN filter on their own metadata key: EthereumAccountAddress, PolygonAccountAddress, or ArbitrumAccountAddress. Use only addresses supplied by the user. Do not use COUNT, ORDER BY, or mix account networks.',
    'NEAROASIS and EOSIOOASIS support SELECT * with LIMIT and OFFSET and an optional equality or IN filter on metadata.NearAccountId or metadata.EOSIOAccountName respectively. Use only account names supplied by the user. Do not use COUNT or ORDER BY.',
    'SOLIDOASIS, IPFSOASIS, and ActivityPubOASIS support SELECT * with LIMIT and OFFSET and equality or IN on metadata.SolidRecordId, metadata.IPFSRecordCid, or metadata.MastodonStatusId respectively. Use keys supplied by the user. Omit COUNT and ORDER BY.',
    'CosmosBlockChainOASIS, PolkadotOASIS, and TONOASIS support SELECT * with equality or IN on metadata.CosmosValidatorAddress, metadata.PolkadotBlockHash, or metadata.TonBlockRootHash respectively. Use keys supplied by the user, with LIMIT and OFFSET. Omit COUNT and ORDER BY.',
    'TRONOASIS supports SELECT * with equality or IN on metadata.TronBlockHeight using quoted positive block heights supplied by the user. Omit COUNT and ORDER BY.',
    'HashgraphOASIS supports SELECT * with optional equality or IN on metadata.HederaAccountId, LIMIT and OFFSET. Use only account IDs supplied by the user. Omit COUNT and ORDER BY.',
    'Use TIMEOUT followed by milliseconds (1–30000) only for SELECT * row queries when requested. Selected columns and all scalar queries use the server timeout. Selected columns require one MongoDBOASIS, SQLLiteDBOASIS, or Neo4jOASIS source.',
    'For a federated row query, list distinct providers separated by commas after FROM. COUNT uses one provider.',
    'WHERE accepts Id, ParentHolonId, Name, Description, Version, IsActive, and metadata paths with up to four segments such as metadata.location.city. Metadata supports IS PRESENT and IS NULL.',
    'A top-level AND clause may use EXISTS CHILD (filters) for direct children or EXISTS DESCENDANT (filters) for descendants within eight levels. Relationship predicates may use AND and a parenthesized OR group, but cannot contain another EXISTS. Example: SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE AND EXISTS CHILD (Version >= 2) AND EXISTS DESCENDANT (IsActive = TRUE) ORDER BY Name LIMIT 5.',
    'Use single-quoted strings, integers, or TRUE/FALSE as appropriate. Use equality, inequality, or IN. Ordered comparisons apply to Version or unsigned 64-bit metadata, for example metadata.Sequence AS UINT64 >= 9007199254740993. Preserve the full integer digits. For exact decimal metadata use metadata.amount AS DECIMAL >= 0.10 and preserve the literal digits. For Boolean metadata use metadata.someFlag AS BOOLEAN = TRUE. For UTC timestamps use metadata.observedAt AS DATETIME >= quoted ISO UTC with Z and up to seven fractional digits, only if the user identifies the field as stored timestamp metadata. Use string equality for a timestamp stored as text. String literals may contain up to 512 characters. String fields also support CONTAINS, STARTSWITH, and ENDSWITH.',
    'Combine filters with AND and at most one parenthesized OR group. Row queries may use ORDER BY Name, Version, or Id, LIMIT 1–100 and OFFSET 0–1000. Use at most twelve filters and four relationship predicates.',
    'Example: SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE AND (metadata.category = \'coffee\' OR metadata.category = \'tea\') ORDER BY Name LIMIT 5'
  ].join('\n');

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
    $('ask-use-example').addEventListener('click', () => {
      try {
        const example = isSandbox() && playground.selectedPublicExample();
        if (!example) throw new Error('Choose a public rows example in the CQL Playground first.');
        const { provider, request } = example;
        const filter = request.filters[0];
        const field = filter.field ?? 'metadata.' + filter.metadataPath[0];
        const timeout = request.maximumDurationMilliseconds;
        const question = `Show up to ${request.take} public records from ${provider} with ${field} matching any of these keys: ${filter.value.join(', ')}.` +
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
        requestKey = crypto.randomUUID();
        const response = await fetch('https://dev.api.web6.oasisomniverse.one/v1/complete', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
            'Idempotency-Key': requestKey },
          body: JSON.stringify({ messages: [{ role: 'system', content: instructions },
            { role: 'user', content: question }], tools: [], maxTokens: 350, temperature: 0,
            useFAHRN: false, useHolonicBraid: false, injectAvatarContext: false })
        });
        const result = await response.json().catch(error => {
          if (error.name !== 'SyntaxError') throw error;
          throw new Error('WEB6 returned an invalid response (HTTP ' + response.status + ').');
        });
        if (!current()) return;
        if (result.code === 'MEASUREMENT_REQUIRED')
          throw new Error('WEB6 could not confirm usage for this request. Reconciliation reference: ' +
            (result.operationId ?? response.headers.get('X-OASIS-Operation-Id') ?? requestKey));
        if (result.code === 'DAILY_TOKEN_LIMIT_EXCEEDED')
          throw new Error('Your remaining daily AI token allowance is too low for this draft. You can still write and run CQL in the Playground.');
        if (!response.ok) throw new Error('WEB6 could not draft a query (HTTP ' + response.status + ').');
        const text = (result.result ?? result).content?.trim();
        if (text === 'UNSUPPORTED') throw new Error('This question cannot be expressed in the sandbox query editor.');
        playground.compileAvailableText(text);
        draft = { text, identity };
        $('ask-draft').textContent = text;
        preview.disabled = false;
        status.textContent = 'Review the draft and open it in the Playground to run it.';
      } catch (error) {
        if (current()) status.textContent = error.message;
      } finally {
        if (!sameSession()) status.textContent = 'The sandbox session changed. Draft a new query.';
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
      } catch (error) { status.textContent = error.message; }
    });
  }
  root.CqlAsk = { init };
})(globalThis);
