const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mount } = require('./web4-tabs.js');

function fixture(hash = '', cardId = 'cql-waku-store-catalogue') {
  const elements = new Map();
  const scrolled = [];
  function element(id, panel) {
    const result = { id, active: false, handlers: {},
      classList: { toggle(name, value) { assert.equal(name, 'active'); result.active = value; } },
      addEventListener(name, callback) { result.handlers[name] = callback; },
      closest(selector) { assert.equal(selector, '.panel'); return panel ?? result; },
      scrollIntoView() { scrolled.push(id); } };
    elements.set(id, result); return result;
  }
  const panels = ['hyperdrive', 'cql', 'failover'].map(name => element('panel-' + name));
  const tabs = panels.map(panel => { const tab = element('tab-' + panel.id);
    tab.dataset = { tab: panel.id.slice(6) }; return tab; });
  tabs[0].active = panels[0].active = true;
  const card = element(cardId, panels[1]);
  const window = { location: { hash }, handlers: {}, addEventListener(name, callback) { this.handlers[name] = callback; } };
  const document = { querySelectorAll(selector) { return selector === '.tab' ? tabs : panels; },
    getElementById(id) { return elements.get(id) ?? null; } };
  return { document, window, tabs, panels, card, scrolled };
}

test('a direct provider card link opens its containing panel before scrolling', () => {
  const f = fixture('#cql-waku-store-catalogue'); mount(f.document, f.window);
  assert.deepEqual(f.panels.map(panel => panel.active), [false, true, false]);
  assert.deepEqual(f.tabs.map(tab => tab.active), [false, true, false]);
  assert.deepEqual(f.scrolled, ['cql-waku-store-catalogue']);
});
test('priority walkthrough fragments target the CQL panel markup', () => {
  const html = fs.readFileSync(`${__dirname}/web4-sandbox.html`, 'utf8');
  const cql = html.slice(html.indexOf('id="panel-cql"'), html.indexOf('id="panel-failover"'));
  for (const name of ['eosio', 'solid', 'ton', 'hedera']) {
    const id = 'cql-' + name + '-catalogue';
    assert.ok(cql.includes('href="#' + id + '"'), id);
    assert.equal(cql.split('id="' + id + '"').length, 2, id);
    const f = fixture('#' + id, id);
    mount(f.document, f.window);
    assert.equal(f.panels[1].active, true, id);
    assert.deepEqual(f.scrolled, [id]);
  }
});

test('an in-page panel link changes the active panel', () => {
  const f = fixture(); mount(f.document, f.window); f.window.location.hash = '#panel-cql';
  f.window.handlers.hashchange();
  assert.deepEqual(f.panels.map(panel => panel.active), [false, true, false]);
  assert.deepEqual(f.scrolled, ['panel-cql']);
});
test('tab buttons still switch panels without adding hash navigation', () => {
  const f = fixture(); mount(f.document, f.window); f.tabs[2].handlers.click();
  assert.deepEqual(f.panels.map(panel => panel.active), [false, false, true]);
  assert.equal(f.window.location.hash, '');
});
test('unknown and malformed fragments preserve the selected panel', () => {
  for (const hash of ['#unknown', '#%not-encoded']) {
    const f = fixture(hash); mount(f.document, f.window);
    assert.deepEqual(f.panels.map(panel => panel.active), [true, false, false]);
    assert.deepEqual(f.scrolled, []);
  }
});
test('an encoded fragment resolves its observed card identity', () => {
  const f = fixture('#cql%2Dwaku%2Dstore%2Dcatalogue'); mount(f.document, f.window);
  assert.equal(f.panels[1].active, true); assert.deepEqual(f.scrolled, [f.card.id]);
});
