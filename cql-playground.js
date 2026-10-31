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

  // This separate local demo never receives the hosted page's bearer, actor or
  // editable request body. Its native host owns its synthetic source catalogues.
  const localOraclePresets = {
    name: { label: 'Exact name · 2 copies', rows: 2 },
    description: { label: 'Description contains · 4 copies', rows: 4 },
    metadata: { label: 'Metadata equality · 4 copies', rows: 4 },
    combined: { label: 'AND / OR · 2 copies', rows: 2 }
  };

  function localOraclePreset(name) {
    if (!Object.hasOwn(localOraclePresets, name)) throw new Error('Choose a supported local Oracle preset.');
    return {
      url: 'http://127.0.0.1:5090/?preset=' + encodeURIComponent(name),
      expectedRows: localOraclePresets[name].rows
    };
  }

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

  function catalogue(data) {
    const result = unwrap(data);
    if (result?.isError || !Array.isArray(result?.result) || result.result.length > 128)
      throw new Error('WEB4 returned no valid hosted provider catalogue.');
    const seen = new Set();
    return result.result.map(source => {
      if (!source || typeof source.provider !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(source.provider) || seen.has(source.provider) ||
          ['Default', 'None'].includes(source.provider) || typeof source.available !== 'boolean' ||
          typeof source.queryOnly !== 'boolean' || typeof source.federationAvailable !== 'boolean')
        throw new Error('WEB4 returned an invalid or duplicate hosted source.');
      seen.add(source.provider);
      const rows = source.examples ?? [];
      if (!Array.isArray(rows) || rows.length > 8) throw new Error('Invalid hosted examples.');
      const ids = new Set();
      const examples = rows.map(row => {
        if (!row || typeof row.id !== 'string' || !/^[A-Za-z0-9-]{1,40}$/.test(row.id) || ids.has(row.id) ||
            typeof row.label !== 'string' || !row.label.trim() || row.label.length > 100 || /[\u0000-\u001f\u007f-\u009f]/.test(row.label))
          throw new Error('Invalid hosted example identity.');
        ids.add(row.id);
        const request = parse(JSON.stringify(row.request));
        const operation = row.operation ?? 'Rows';
        if (!['Rows', 'Federation'].includes(operation) ||
            row.available !== undefined && typeof row.available !== 'boolean')
          throw new Error('Invalid hosted example operation or availability.');
        if (operation === 'Rows') {
          if (request.provider !== source.provider) throw new Error('Hosted example changed its provider scope.');
        } else if (request.scope !== 'Named' || !Array.isArray(request.providers) ||
            request.providers.length < 2 || request.providers.length > 8 ||
            request.providers.some(provider => typeof provider !== 'string' || !provider || provider.length > 40) ||
            new Set(request.providers).size !== request.providers.length || !request.providers.includes(source.provider) ||
            !request.source || Array.isArray(request.source) || typeof request.source !== 'object' ||
            request.source.provider != null || request.enableContinuation === true || request.cursor != null ||
            request.identityMode !== 'PreserveCopies') {
          throw new Error('Hosted federation changed its explicit provider scope.');
        }
        return { id: row.id, label: row.label, request, operation, available: row.available !== false };
      });
      return { provider: source.provider, available: source.available, queryOnly: source.queryOnly,
        federationAvailable: source.federationAvailable, examples };
    });
  }

  function profileChoices(source, sources) {
    if (!source?.available) return [];
    const ordinary = providers.includes(source.provider) ? Object.entries(presets)
      .filter(([id]) => id !== 'federation' || providers.every(provider => sources.some(row =>
        row.provider === provider && row.available && row.federationAvailable)))
      .map(([id, label]) => ({ id, label })) : [];
    return ordinary.concat(source.examples.map(row => {
      const disabled = row.available === false || row.operation === 'Federation' &&
        (!source.federationAvailable || !row.request.providers.every(provider => sources.some(target =>
          target.provider === provider && target.available && target.federationAvailable)));
      return { id: 'host:' + row.id, label: row.label + (disabled ? ' (unavailable)' : ''), disabled };
    }));
  }

  function profilePreset(source, id) {
    if (!source?.available) throw new Error('The hosted source is unavailable.');
    if (!id.startsWith('host:')) return preset(id, source.provider);
    const example = source.examples.find(row => 'host:' + row.id === id);
    if (!example) throw new Error('Choose a configured hosted example.');
    if (example.available === false || example.operation === 'Federation' && !source.federationAvailable)
      throw new Error('The hosted example is unavailable.');
    // Operation selects from two fixed WEB4 routes; the server cannot supply a URL.
    return { path: example.operation === 'Federation' ? 'data/query-cql/federation' : 'data/query-cql',
      body: parse(JSON.stringify(example.request)) };
  }

  function init({ getToken, getBase }) {
    const $ = id => document.getElementById(id);
    let controller = null;
    let generation = 0;
    let endpoint = '';
    let sessionToken = null;
    let sessionBase = null;
    let sources = null;
    let discovery = null;

    function note(message, error = false) {
      $('cql-note').textContent = message;
      $('cql-note').className = error ? 'note err' : 'note';
    }

    function controls() {
      const busy = controller !== null;
      const ready = sources !== null && endpoint !== '';
      $('cql-run').disabled = busy || discovery !== null || !getToken() || !ready;
      $('cql-cancel').disabled = !busy;
      $('cql-preset').disabled = busy || !ready || discovery !== null;
      $('cql-provider').disabled = busy || sources === null || discovery !== null;
      $('cql-reset').disabled = busy || !ready || discovery !== null;
      $('cql-refresh').disabled = busy || discovery !== null || !getToken();
      $('cql-request').readOnly = busy || !ready;
    }

    function loadPreset() {
      const selected = sources?.find(row => row.provider === $('cql-provider').value);
      if (!selected || !profileChoices(selected, sources).some(choice => !choice.disabled)) {
        endpoint = ''; $('cql-request').value = ''; $('cql-endpoint').textContent = '';
        controls(); return;
      }
      const chosen = profilePreset(selected, $('cql-preset').value);
      endpoint = chosen.path;
      $('cql-endpoint').textContent = 'POST /api/' + endpoint;
      $('cql-request').value = JSON.stringify(chosen.body, null, 2);
      $('cql-results').replaceChildren();
      $('cql-response').textContent = 'Run a query to see the actual API response.';
      note('Edit the JSON, then run. Provider capabilities and access are checked by WEB4.');
      controls();
    }

    function chooseProvider() {
      const selected = sources?.find(row => row.provider === $('cql-provider').value);
      $('cql-preset').replaceChildren();
      const choices = profileChoices(selected, sources ?? []);
      for (const choice of choices) {
        const option = new Option(choice.label, choice.id);
        option.disabled = !!choice.disabled;
        $('cql-preset').add(option);
      }
      $('cql-preset').value = choices.find(choice => !choice.disabled)?.id ?? '';
      loadPreset();
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
      if (controller || discovery || !getToken() || !endpoint) return;
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

    async function syncAuth(force = false) {
      const token = getToken(); const base = getBase();
      if (!force && token === sessionToken && base === sessionBase && (sources !== null || discovery)) return;
      generation++;
      controller?.abort();
      controller = null;
      discovery?.abort(); discovery = null;
      if (force || sessionToken !== token || sessionBase !== base) {
        $('cql-results').replaceChildren();
        $('cql-response').textContent = '';
        $('cql-operation').textContent = '';
      }
      sessionToken = token; sessionBase = base; sources = null; endpoint = '';
      $('cql-provider').replaceChildren(); $('cql-preset').replaceChildren();
      $('cql-request').value = ''; $('cql-endpoint').textContent = '';
      $('cql-sources').textContent = '';
      controls();
      if (!token) { note('Start a demo session or sign in above to load live providers.'); return; }
      const current = generation;
      const pending = new AbortController(); discovery = pending;
      const timeout = setTimeout(() => pending.abort(), 15000);
      note('Loading hosted provider availability…'); controls();
      try {
        const response = await fetch(`${base}/api/data/query-cql/providers?examplesVersion=2`, {
          signal: pending.signal, redirect: 'error', cache: 'no-store',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }
        });
        const data = await response.json();
        if (current !== generation || token !== getToken() || base !== getBase()) return;
        const result = unwrap(data);
        if (!response.ok || result?.isError)
          throw new Error(`Provider discovery failed: HTTP ${response.status} · ${result?.errorCode || 'CQL_CATALOGUE_UNAVAILABLE'}`);
        sources = catalogue(result);
        for (const source of sources) {
          const playable = profileChoices(source, sources).length > 0;
          const option = new Option(source.provider + (!source.available ? ' · unavailable' : !playable ? ' · examples pending' : ''), source.provider);
          option.disabled = !playable; $('cql-provider').add(option);
        }
        const first = sources.find(source => source.available && source.examples.length) ||
          sources.find(source => profileChoices(source, sources).length);
        $('cql-sources').textContent = `${sources.filter(source => source.available).length} available hosted sources. ` +
          'Separate local demo links are below. Refresh to recheck availability.';
        if (first) { $('cql-provider').value = first.provider; chooseProvider(); }
        else note('No hosted demo query is ready. Refresh providers to recheck.', true);
      } catch (error) {
        if (current === generation) note(pending.signal.aborted
          ? 'Provider discovery stopped. No automatic retry was made.' : error.message, true);
      } finally {
        clearTimeout(timeout);
        if (current === generation) { discovery = null; controls(); }
      }
    }

    $('cql-provider').addEventListener('change', chooseProvider);
    $('cql-preset').addEventListener('change', loadPreset);
    $('cql-reset').addEventListener('click', loadPreset);
    $('cql-run').addEventListener('click', run);
    $('cql-cancel').addEventListener('click', () => controller?.abort());
    $('cql-refresh').addEventListener('click', () => syncAuth(true));
    for (const [key, example] of Object.entries(localOraclePresets))
      $('cql-oracle-preset').add(new Option(example.label, key));
    function chooseOracleExample() {
      const example = localOraclePreset($('cql-oracle-preset').value);
      $('cql-oracle-open').href = example.url;
      $('cql-oracle-note').textContent = `${example.expectedRows} expected physical copies · MongoDB + Oracle · local native demo.`;
    }
    $('cql-oracle-preset').addEventListener('change', chooseOracleExample);
    chooseOracleExample();
    const ready = syncAuth();
    return { syncAuth, ready };
  }

  const api = { providers, presets, preset, parse, unwrap, catalogue, profileChoices, profilePreset,
    localOraclePresets, localOraclePreset, init };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CqlPlayground = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
