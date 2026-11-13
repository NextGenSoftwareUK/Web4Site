(function (root) {
  'use strict';

  const instructions = [
    'Translate the question into one read-only CQL statement. Output only the statement, or UNSUPPORTED.',
    'Use SELECT * or SELECT COUNT(*) FROM MongoDBOASIS, SQLLiteDBOASIS, or Neo4jOASIS.',
    'HoloOASIS supports SELECT * with optional Id equality or IN, LIMIT and OFFSET. Use IDs supplied by the user. Do not invent IDs or use other filters, COUNT, or ORDER BY with HoloOASIS.',
    'SolanaOASIS supports SELECT * with optional metadata.SolanaAccountAddress equality or IN, LIMIT and OFFSET. Use addresses supplied by the user. Do not invent addresses or use other filters, COUNT, or ORDER BY with SolanaOASIS.',
    'EthereumOASIS, PolygonOASIS, and ArbitrumOASIS support SELECT * with LIMIT and OFFSET and an optional equality or IN filter on their own metadata key: EthereumAccountAddress, PolygonAccountAddress, or ArbitrumAccountAddress. Use only addresses supplied by the user. Do not use COUNT, ORDER BY, or mix account networks.',
    'NEAROASIS and EOSIOOASIS support SELECT * with LIMIT and OFFSET and an optional equality or IN filter on metadata.NearAccountId or metadata.EOSIOAccountName respectively. Use only account names supplied by the user. Do not use COUNT or ORDER BY.',
    'SOLIDOASIS, IPFSOASIS, and ActivityPubOASIS support SELECT * with LIMIT and OFFSET and equality or IN on metadata.SolidRecordId, metadata.IPFSRecordCid, or metadata.MastodonStatusId respectively. Use keys supplied by the user. Omit COUNT and ORDER BY.',
    'CosmosBlockChainOASIS, PolkadotOASIS, and TONOASIS support SELECT * with equality or IN on metadata.CosmosValidatorAddress, metadata.PolkadotBlockHash, or metadata.TonBlockRootHash respectively. Use keys supplied by the user, with LIMIT and OFFSET. Omit COUNT and ORDER BY.',
    'For a federated row query, list distinct providers separated by commas after FROM. COUNT uses one provider.',
    'WHERE accepts Id, Name, Description, Version, IsActive, and metadata paths with up to four segments such as metadata.location.city. Metadata supports IS PRESENT and IS NULL.',
    'A top-level AND clause may use EXISTS CHILD (filters) for direct children or EXISTS DESCENDANT (filters) for descendants within eight levels. Relationship fields use the same rules.',
    'Use single-quoted strings, integers, or TRUE/FALSE as appropriate. Use comparisons or IN. String fields also support CONTAINS, STARTSWITH, and ENDSWITH.',
    'Combine filters with AND and at most one parenthesized OR group. Row queries may use ORDER BY Name, Version, or Id, LIMIT 1–100 and OFFSET 0–1000. Use at most twelve filters and four relationship predicates.',
    'Example: SELECT * FROM MongoDBOASIS WHERE IsActive = TRUE AND (metadata.category = \'coffee\' OR metadata.category = \'tea\') ORDER BY Name LIMIT 5'
  ].join('\n');

  function init({ playground, isSandbox, getIdentity, ensureAccessToken }) {
    const $ = id => document.getElementById(id);
    const status = $('ask-status');
    const generate = $('ask-generate');
    const preview = $('ask-preview');
    let draft;
    $('cql-compile').addEventListener('click', () => {
      try { playground.loadText($('cql-text').value); }
      catch (error) { $('cql-note').textContent = error.message; }
    });
    $('ask-use-example').addEventListener('click', () => {
      try {
        const example = isSandbox() && playground.selectedPublicExample();
        if (!example) throw new Error('Choose a provider with a public example in the CQL Playground first.');
        const { provider, request } = example;
        const filter = request.filters[0];
        const field = filter.field ?? 'metadata.' + filter.metadataPath[0];
        const question = `Show up to ${request.take} public records from ${provider} with ${field} matching any of these keys: ${filter.value.join(', ')}.`;
        if (question.length > 1000) throw new Error('This example exceeds the question length limit.');
        $('ask-question').value = question;
        status.textContent = 'Review the question, then select Draft query.';
      } catch (error) { status.textContent = error.message; }
    });
    generate.addEventListener('click', async () => {
      const question = $('ask-question').value.trim();
      if (!question || question.length > 1000 || !isSandbox()) {
        status.textContent = 'Select WEB4 Development and enter a question of up to 1,000 characters.';
        return;
      }
      const identity = getIdentity();
      const current = () => isSandbox() && getIdentity() === identity;
      draft = null;
      preview.disabled = true;
      generate.disabled = true;
      $('ask-draft').textContent = '';
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
        const result = await response.json();
        if (!current()) return;
        if (result.code === 'MEASUREMENT_REQUIRED')
          throw new Error('WEB6 could not confirm usage for this request. Reconciliation reference: ' +
            (result.operationId ?? response.headers.get('X-OASIS-Operation-Id') ?? requestKey));
        if (result.code === 'DAILY_TOKEN_LIMIT_EXCEEDED')
          throw new Error('Your remaining daily AI token allowance is too low for this draft. You can still write and run CQL in the Playground.');
        if (!response.ok) throw new Error('WEB6 could not draft a query (HTTP ' + response.status + ').');
        const text = (result.result ?? result).content?.trim();
        if (text === 'UNSUPPORTED') throw new Error('This question cannot be expressed in the sandbox query editor.');
        root.CqlText.compile(text);
        draft = { text, identity };
        $('ask-draft').textContent = text;
        preview.disabled = false;
        status.textContent = 'Review the draft and open it in the Playground to run it.';
      } catch (error) {
        if (current()) status.textContent = error.message;
      } finally {
        if (!current()) status.textContent = 'The sandbox session changed. Draft a new query.';
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
