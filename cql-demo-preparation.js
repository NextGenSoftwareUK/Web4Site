/* Private demo snapshots use Core-mapped identities and normal admitted WEB4 APIs. */
(function (root) {
  'use strict';
  const dataset = 'COSMIC.CQL.Demo.v1';
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const nonemptyGuid = value => typeof value === 'string' && guid.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value);
  const clone = value => JSON.parse(JSON.stringify(value));

  function recipe(source, example) {
    const body = example?.request;
    const input = body?.source;
    const filter = input?.filters?.[0];
    if (!source?.available || !source.federationAvailable || example?.operation !== 'Federation' ||
        example.available === false || source.provider === 'MongoDBOASIS' || body.scope !== 'Named' ||
        body.providers?.length !== 2 || !body.providers.includes('MongoDBOASIS') || !body.providers.includes(source.provider) ||
        input?.filters?.length !== 1 || input.orderBy !== 'None' || input.skip || input.descending || input.graph ||
        [input.anyOf, input.anyChildren, input.anyDescendants].some(group => group?.length) ||
        filter.field != null || filter.operator !== 'In' || filter.scalar !== 'String' || filter.metadataPath?.length !== 1 ||
        !/^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(filter.metadataPath[0]) ||
        ['constructor', 'prototype', 'COSMIC.Demo.Dataset', 'COSMIC.Demo.SourceHolonId',
          'oasis.native.provider', 'oasis.native.source'].includes(filter.metadataPath[0]) ||
        !Array.isArray(filter.value) || !filter.value.length || filter.value.length > 40 ||
        filter.value.some(key => typeof key !== 'string' || !/^[!-~]{1,128}$/.test(key)) ||
        new Set(filter.value).size !== filter.value.length) return null;
    const keys = filter.value.slice(0, 2);
    const read = clone(input);
    read.provider = source.provider;
    read.filters[0].value = keys;
    read.take = keys.length;
    read.includeMetadata = true;
    return { provider: source.provider, metadataKey: filter.metadataPath[0], keys, read };
  }

  async function prepare({ recipe: supplied, request, storage, base, isCurrent, randomUUID }) {
    const plan = clone(supplied);
    if (!plan || !Array.isArray(plan.keys) || plan.keys.length < 1 || plan.keys.length > 2 ||
        !storage || typeof storage.key !== 'function' || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' ||
        typeof storage.removeItem !== 'function') throw new Error('Safe preparation storage is unavailable. No save was sent.');
    const current = () => { if (!isCurrent()) throw new Error('Session changed. No further preparation requests were sent.'); };
    const call = async (path, body) => { current(); const result = await request(path, body); current(); return result; };
    const native = await call('data/query-cql', plan.read);
    const rows = native?.result?.rows;
    if (!Array.isArray(rows) || rows.length !== plan.keys.length)
      throw new Error('The source did not return the selected records. No save was sent.');
    const sourceRows = new Map();
    for (const row of rows) {
      const key = row.metadata?.[plan.metadataKey];
      if (!plan.keys.includes(key) || sourceRows.has(key) || !nonemptyGuid(row.id) || typeof row.name !== 'string')
        throw new Error('Source identity did not match the configured example. No save was sent.');
      sourceRows.set(key, row);
    }
    const mapped = await call('data/query-cql/demo-identities', { provider: plan.provider, keys: plan.keys });
    const identity = mapped?.result;
    if (!nonemptyGuid(identity?.ownerId) || identity.provider !== plan.provider || identity.records?.length !== plan.keys.length ||
        new Set(identity.records.map(record => record.id)).size !== plan.keys.length ||
        new Set(identity.records.map(record => record.nativeKey)).size !== plan.keys.length)
      throw new Error('WEB4 did not acknowledge the preparation identities. No save was sent.');
    const result = { saved: 0, existing: 0, keys: [] };
    for (const record of identity.records) {
      current();
      if (!nonemptyGuid(record.id) || !sourceRows.has(record.nativeKey) ||
          record.metadata?.['oasis.native.provider'] !== plan.provider ||
          record.metadata?.['oasis.native.source'] !== 'cosmic-cql-demo' ||
          record.metadata?.['oasis.native.key'] !== record.nativeKey)
        throw new Error('WEB4 returned an invalid mapped record. No further saves were sent.');
      const prefix = `oasis.cql.preparation.v1:${base}:${identity.ownerId}:${record.id}:`;
      // Entries have unique operation keys: concurrent tabs cannot overwrite an
      // earlier uncertain intent. Native create-only CAS remains the write owner.
      for (let index = 0; index < storage.length; index++)
        if (storage.key(index)?.startsWith(prefix))
          throw new Error('An earlier save requires reconciliation. Do not repeat it. ' + storage.key(index).slice(prefix.length));
      const source = sourceRows.get(record.nativeKey);
      const metadata = { ...record.metadata, [plan.metadataKey]: record.nativeKey,
        'COSMIC.Demo.Dataset': dataset, 'COSMIC.Demo.SourceHolonId': source.id };
      const loaded = await call('data/query-cql', { provider: 'MongoDBOASIS', orderBy: 'Id', take: 1, includeMetadata: true,
        filters: [{ field: 'Id', scalar: 'Guid', operator: 'Equal', value: record.id }] });
      const existing = loaded?.result?.rows;
      if (!Array.isArray(existing) || existing.length > 1) throw new Error('Invalid Mongo lookup. No further saves were sent.');
      if (existing.length) {
        const row = existing[0];
        if (row.id !== record.id || row.createdByAvatarId !== identity.ownerId || row.isPublic !== false ||
            row.name !== source.name || (row.description ?? null) !== (source.description ?? null) ||
            Object.entries(metadata).some(([key, value]) => row.metadata?.[key] !== value))
          throw new Error('An existing record differs from the demo. It has been left untouched.');
        result.existing++;
        continue;
      }
      const operation = randomUUID();
      if (!nonemptyGuid(operation)) throw new Error('A valid save operation key is required.');
      const journal = prefix + operation;
      if (storage.getItem(journal) !== null) throw new Error('Save intent already exists. Reconcile it before continuing.');
      storage.setItem(journal, JSON.stringify({ ownerId: identity.ownerId, id: record.id, provider: 'MongoDBOASIS',
        operationId: operation, createdUtc: new Date().toISOString() })); // No token or private payload.
      const saved = await call('data/save-holon', { operationId: operation, providerType: 'MongoDBOASIS',
        expectedRevisions: { [record.id]: null }, saveChildren: false, autoFailOverMode: 'OFF', autoReplicationMode: 'ON',
        waitForAutoReplicationResult: false,
        holon: { id: record.id, name: source.name, description: source.description ?? null,
          isNewHolon: true, isPublic: false, isActive: true, metaData: metadata } });
      if (saved?.isSaved !== true || saved.result?.id !== record.id || saved.result.createdByAvatarId !== identity.ownerId ||
          saved.result.isPublic !== false)
        throw new Error('Save acknowledgement is incomplete. Retain and reconcile request key ' + operation + '.');
      storage.removeItem(journal);
      result.saved++;
      result.keys.push(operation);
    }
    return result;
  }

  const api = { recipe, prepare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CqlDemoPreparation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
