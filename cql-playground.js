/* WEB4 CQL playground. JSON describes a bounded query; it is never evaluated as code. */
(function (root) {
  'use strict';

  const providers = ['MongoDBOASIS', 'SQLLiteDBOASIS', 'Neo4jOASIS'];
  const presets = {
    browse: 'Browse · ordered page',
    name: 'Name · exact match',
    description: 'Description · contains text',
    metadata: 'Metadata · category equals coffee',
    either: 'AND / OR · coffee or tea',
    count: 'Aggregate · count coffee records',
    federation: 'Federation · MongoDB + SQLite + Neo4j'
  };

  function metadata(value) {
    return { metadataPath: ['category'], scalar: 'String', operator: 'Equal', value };
  }

  // A preset owns both its endpoint and body. Editing JSON never changes the endpoint.
  function preset(name, provider) {
    if (!Object.hasOwn(presets, name) || !providers.includes(provider)) {
      throw new Error('Choose a supported preset and provider.');
    }

    const body = { provider, filters: [], orderBy: 'Name', skip: 0, take: 10, includeMetadata: true };
    let path = 'data/query-cql';
    if (name === 'name') body.filters.push({ field: 'Name', scalar: 'String', operator: 'Equal', value: 'Espresso' });
    if (name === 'description') body.filters.push({ field: 'Description', scalar: 'String', operator: 'Contains', value: 'coffee' });
    if (name === 'metadata' || name === 'count') body.filters.push(metadata('coffee'));
    if (name === 'either') {
      body.filters.push({ field: 'IsActive', scalar: 'Boolean', operator: 'Equal', value: true });
      body.anyOf = [metadata('coffee'), metadata('tea')];
    }
    if (name === 'count') {
      path += '/scalar';
      delete body.take; // Count all qualifying records, rather than just the first page.
      delete body.includeMetadata;
      body.operation = 'LongCount';
    }
    if (name === 'federation') {
      delete body.provider;
      return {
        path: path + '/federation',
        body: {
          scope: 'Named', providers: [...providers], source: body,
          identityMode: 'PreserveCopies', skip: 0, take: 10,
          maximumInputRows: 300, maximumRowsPerProvider: 100,
          maximumInputBytes: 4194304, maximumOutputBytes: 1048576,
          maximumWork: 100000, maximumProviderAttempts: 3,
          maximumDurationMilliseconds: 5000
        }
      };
    }
    return { path, body };
  }

  function parse(text) {
    if (new TextEncoder().encode(text).length > 32768) throw new Error('Request exceeds the API’s 32 KiB limit.');
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Enter a JSON request object.');
    return body;
  }

  function unwrap(data) {
    // WEB4 data controllers may wrap their OASISResult in an outer result object.
    return data?.result && typeof data.result === 'object' && 'isError' in data.result ? data.result : data;
  }

  function init({ getToken, getBase }) {
    const $ = id => document.getElementById(id);
    let controller = null;
    let generation = 0;
    let endpoint = '';
    let sessionToken = null;

    function note(message, error = false) {
      $('cql-note').textContent = message;
      $('cql-note').className = error ? 'note err' : 'note';
    }

    function controls() {
      const busy = controller !== null;
      $('cql-run').disabled = busy || !getToken();
      $('cql-cancel').disabled = !busy;
      $('cql-preset').disabled = busy;
      $('cql-provider').disabled = busy || $('cql-preset').value === 'federation';
      $('cql-reset').disabled = busy;
      $('cql-request').readOnly = busy;
    }

    function loadPreset() {
      const chosen = preset($('cql-preset').value, $('cql-provider').value);
      endpoint = chosen.path;
      $('cql-endpoint').textContent = 'POST /api/' + endpoint;
      $('cql-request').value = JSON.stringify(chosen.body, null, 2);
      $('cql-results').replaceChildren();
      $('cql-response').textContent = 'Run a query to see the actual API response.';
      note('Edit the JSON, then run. Provider capabilities and access are checked by WEB4.');
      controls();
    }

    function render(result) {
      const payload = result.result;
      $('cql-response').textContent = JSON.stringify(result, null, 2);
      if (payload && Object.hasOwn(payload, 'value')) {
        note(`${payload.provider} · ${payload.operation}: ${payload.value}`);
        return;
      }
      if (!payload || !Array.isArray(payload.rows)) throw new Error('The API returned no CQL rows envelope. See the response.');
      const table = document.createElement('table');
      const header = table.createTHead().insertRow();
      for (const label of ['Provider', 'Name', 'Description', 'Version', 'ID', 'Metadata']) {
        const th = document.createElement('th');
        th.textContent = label;
        header.append(th);
      }
      const tbody = table.createTBody();
      for (const item of payload.rows) {
        const row = item.selected ? item.selected.row : item;
        const provider = item.selected ? item.selected.provider : payload.provider;
        const tr = tbody.insertRow();
        for (const value of [provider, row.name, row.description, row.version, row.id, JSON.stringify(row.metadata ?? {})]) {
          tr.insertCell().textContent = String(value ?? ''); // Stored text must never become HTML.
        }
      }
      $('cql-results').replaceChildren(table);
      note(`${payload.rows.length} returned rows · ${payload.provider || payload.providers?.join(', ') || 'federated response'}. ` +
        'Copies and selection details are available in the full response below.');
    }

    async function run() {
      if (controller || !getToken()) return;
      let body;
      try { body = parse($('cql-request').value); }
      catch (error) { note(error.message, true); return; }

      const token = getToken();
      const base = getBase();
      const current = ++generation;
      const requestKey = crypto.randomUUID();
      $('cql-operation').textContent = `Idempotency-Key: ${requestKey}\nOperation ID: awaiting API response`;
      const pending = new AbortController();
      controller = pending;
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; pending.abort(); }, 15000);
      controls();
      $('cql-results').replaceChildren();
      $('cql-response').textContent = '';
      note('Executing on WEB4…');
      try {
        const response = await fetch(`${base}/api/${endpoint}`, {
          method: 'POST', signal: pending.signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token, 'Idempotency-Key': requestKey },
          body: JSON.stringify(body)
        });
        const operationId = response.headers.get('X-OASIS-Operation-Id');
        if (current === generation) $('cql-operation').textContent =
          `Idempotency-Key: ${requestKey}\nOperation ID: ${operationId || 'not supplied / not exposed by this host'}`;
        const data = await response.json();
        // A response from a former identity/environment must never be displayed in a new session.
        if (current !== generation || token !== getToken() || base !== getBase()) return;
        const result = unwrap(data);
        $('cql-response').textContent = JSON.stringify(data, null, 2);
        if (!response.ok || !result || result.isError) {
          throw new Error(`HTTP ${response.status}${result?.errorCode ? ' · ' + result.errorCode : ''}: ` +
            (result?.message || data?.message || 'The API rejected this query.'));
        }
        render(result);
      } catch (error) {
        if (current === generation) note(pending.signal.aborted
          ? (timedOut ? 'Request timed out. No automatic retry was made.' : 'Request cancelled. Server work may already have executed.')
          : error.message, true);
      } finally {
        clearTimeout(timeout);
        if (current === generation) { controller = null; controls(); }
      }
    }

    function syncAuth() {
      generation++;
      controller?.abort();
      controller = null;
      if (sessionToken !== getToken()) {
        sessionToken = getToken();
        $('cql-results').replaceChildren();
        $('cql-response').textContent = '';
        $('cql-operation').textContent = '';
      }
      note(getToken() ? 'Ready. Choose a preset or edit the request.' : 'Start a demo session or sign in above to query your visible records.');
      controls();
    }

    for (const provider of providers) $('cql-provider').add(new Option(provider, provider));
    for (const [key, label] of Object.entries(presets)) $('cql-preset').add(new Option(label, key));
    $('cql-provider').addEventListener('change', loadPreset);
    $('cql-preset').addEventListener('change', loadPreset);
    $('cql-reset').addEventListener('click', loadPreset);
    $('cql-run').addEventListener('click', run);
    $('cql-cancel').addEventListener('click', () => controller?.abort());
    loadPreset();
    syncAuth();
    return { syncAuth };
  }

  const api = { providers, presets, preset, parse, unwrap, init };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CqlPlayground = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
