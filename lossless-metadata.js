(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CqlLosslessMetadata = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  let sourceContext = false;
  JSON.parse('0', (key, value, context) => {
    if (context?.source === '0') sourceContext = true;
    return value;
  });
  function parse(text) {
    if (!sourceContext || typeof JSON.rawJSON !== 'function' || typeof JSON.isRawJSON !== 'function')
      throw new Error('This browser cannot save exact numeric metadata. Update your browser before saving a snapshot.');
    const value = JSON.parse(text, (key, item, context) =>
      typeof item === 'number' && JSON.stringify(item) !== context.source ? JSON.rawJSON(context.source) : item);
    function restore(item, metadata) {
      if (JSON.isRawJSON(item)) return metadata ? item : Number(item.rawJSON);
      if (Array.isArray(item)) return item.map(child => restore(child, metadata));
      if (item && typeof item === 'object')
        for (const key of Object.keys(item)) item[key] = restore(item[key], metadata || key.toLowerCase() === 'metadata');
      return item;
    }
    return restore(value, false);
  }
  return Object.freeze({parse});
});
