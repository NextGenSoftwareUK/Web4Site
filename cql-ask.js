// Free-text drafting runs on WEB4 (POST api/data/query-cql/ask); this file only drives the page.
(function (root) {
  'use strict';

  const databaseProviders = ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS'];

  function init({ playground, isSandbox, getIdentity, getBase, ensureAccessToken }) {
    const $ = id => document.getElementById(id);
    const status = $('ask-status');
    const generate = $('ask-generate');
    const preview = $('ask-preview');
    let draft, activeExample;
    const questionInput = $('ask-question');
    let questionVersion = 0;
    const selectedMapping = () => $('cql-virtual-mapping')?.value.trim().toLowerCase() ?? '';
    const selectedProvider = () => $('cql-provider')?.value ?? '';
    function mappingScope(mappingId, provider) {
      if (!mappingId) return null;
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(mappingId) ||
          /^0{8}(?:-0{4}){3}-0{12}$/.test(mappingId))
        throw new Error('Select a valid saved virtual mapping in the CQL Playground first.');
      if (!databaseProviders.includes(provider))
        throw new Error('Select MongoDBOASIS, SQLLiteDBOASIS or Neo4jOASIS for this mapped draft.');
      return { mappingId, provider };
    }
    function sourceChanged() {
      clearDraft();
      status.textContent = 'The selected mapping changed. Draft a new query.';
    }
    $('cql-virtual-mapping')?.addEventListener('input', sourceChanged);
    $('cql-virtual-mapping')?.addEventListener('change', sourceChanged);
    $('cql-saved-mapping')?.addEventListener('change', sourceChanged);
    $('cql-provider')?.addEventListener('change', () => {
      if (selectedMapping() || draft?.mappingId) sourceChanged();
    });


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
    $('cql-load-parameter-example')?.addEventListener('click', () => {
      const provider = $('cql-provider').value;
      if (!databaseProviders.includes(provider)) {
        $('cql-note').textContent = 'Select a ready MongoDB, SQLite or Neo4j provider before loading this example.';
        return;
      }
      $('cql-text').value = 'SELECT Id, Name, Version FROM ' + provider +
        ' WHERE Version >= @minimum AND IsActive = @active ORDER BY Name LIMIT 5';
      $('cql-text-parameters').value = JSON.stringify({ minimum: 1, active: true }, null, 2);
      $('cql-text').focus();
      $('cql-note').textContent = 'Review the query and parameter values, then preview its request.';
    });
    function editorParameters() {
      const text = $('cql-text-parameters')?.value?.trim();
      if (!text) return {};
      if (text.length > 16384) throw new Error('Parameter JSON may contain up to 16,384 characters.');
      return JSON.parse(text);
    }
    $('cql-compile').addEventListener('click', () => {
      Promise.resolve()
        .then(() => playground.loadText($('cql-text').value, editorParameters()))
        .catch(error => { $('cql-note').textContent = error.message; });
    });
    $('cql-run-text').addEventListener('click', () => {
      Promise.resolve()
        .then(() => playground.loadText($('cql-text').value, editorParameters()))
        .then(() => $('cql-run').click())
        .catch(error => { $('cql-note').textContent = error.message; });
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
        playground.clearVirtualMapping();
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
      const mappingId = selectedMapping();
      const provider = selectedProvider();
      const sameSource = () => selectedMapping() === mappingId && (!mappingId || selectedProvider() === provider);
      clearDraft();
      const version = questionVersion;
      const current = () => sameSession() && sameSource() && version === questionVersion;
      generate.disabled = true;
      status.textContent = 'Drafting with WEB6…';
      try {
        const scope = mappingScope(mappingId, provider);
        const token = await ensureAccessToken();
        if (!current() || !token) throw new Error('Sign in to the Development sandbox first.');
        const example = activeExample?.question === question ? activeExample : null;
        const response = await fetch(`${getBase()}/api/data/query-cql/ask`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ question, execute: false,
            ...(scope ? { provider: scope.provider, virtualMappingId: scope.mappingId } : {}),
            ...(example ? { provider: example.provider, publicExample: true } : {}) })
        });
        const result = await response.json().catch(() => null);
        if (!current()) return;
        const text = result?.result?.sql ?? result?.Result?.sql;
        if (!response.ok || !text)
          throw new Error(result?.message ?? result?.Message ?? `WEB4 could not draft a query (HTTP ${response.status}).`);
        draft = { text, identity, mappingId, provider };
        $('ask-draft').textContent = text;
        preview.disabled = false;
        status.textContent = 'Review the draft and open it in the Playground to run it.';
      } catch (error) {
        if (current()) status.textContent = error.message;
      } finally {
        if (!sameSession() && version === questionVersion)
          status.textContent = 'The sandbox session changed. Draft a new query.';
        else if (!sameSource() && version === questionVersion)
          status.textContent = 'The selected mapping changed. Draft a new query.';
        generate.disabled = false;
      }
    });
    preview.addEventListener('click', async () => {
      try {
        if (!draft || !isSandbox() || getIdentity() !== draft.identity)
          throw new Error('The sandbox session changed. Draft a new query.');
        if (selectedMapping() !== draft.mappingId || (draft.mappingId && selectedProvider() !== draft.provider)) {
          clearDraft();
          throw new Error('The selected mapping changed. Draft a new query.');
        }
        const text = draft.text;
        await playground.loadText(text);
        $('cql-text').value = text;
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
