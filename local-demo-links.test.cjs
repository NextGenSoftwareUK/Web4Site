const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isLocalHost, hideLocalDemoLinks } = require('./local-demo-links.js');

function element(text, parent = null, cls = '') {
  return { textContent: text, hidden: false, parent, cls,
    closest(selector) {
      for (let e = this.parent; e; e = e.parent)
        if ((selector === '.row' && e.cls === 'row') || (selector === 'p' && e.cls === 'p')) return e;
      return null;
    } };
}
function page() {
  const onlyLink = element('OPEN AWS + MONGO QUERY', null, 'p');
  const a1 = element('OPEN AWS + MONGO QUERY', onlyLink);
  const mixed = element('See the guide or OPEN LOCAL DEMO', null, 'p');
  const a2 = element('OPEN LOCAL DEMO', mixed);
  const row = element('Local example OPEN LOCAL QUERY', null, 'row');
  const a3 = element('OPEN LOCAL QUERY', element('', row));
  const note = { hidden: false };
  return { onlyLink, mixed, a2, row, note,
    doc: { querySelectorAll: () => [a1, a2, a3], getElementById: id => id === 'cql-oracle-note' ? note : null } };
}

test('local hosts are recognised', () => {
  for (const host of ['localhost', '127.0.0.1', 'LOCALHOST', '[::1]']) assert.equal(isLocalHost(host), true);
  for (const host of ['web4.oasisomniverse.one', 'sandbox.web4.oasisomniverse.one', '']) assert.equal(isLocalHost(host), false);
});

test('public visitors do not see local demo links', () => {
  const p = page();
  assert.equal(hideLocalDemoLinks(p.doc, 'web4.oasisomniverse.one'), 3);
  assert.equal(p.onlyLink.hidden, true, 'a paragraph holding only the link is hidden');
  assert.equal(p.mixed.hidden, false, 'other text in the paragraph stays visible');
  assert.equal(p.a2.hidden, true);
  assert.equal(p.row.hidden, true, 'the local example picker row is hidden');
  assert.equal(p.note.hidden, true);
});

test('a developer opening the page locally keeps every link', () => {
  const p = page();
  assert.equal(hideLocalDemoLinks(p.doc, '127.0.0.1'), 0);
  assert.equal(p.onlyLink.hidden, false); assert.equal(p.row.hidden, false);
});
