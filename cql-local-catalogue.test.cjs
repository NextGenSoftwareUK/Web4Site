const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('different CQL catalogue cards never send users to the same local demo address', () => {
  const html = fs.readFileSync(path.join(__dirname, 'web4-sandbox.html'), 'utf8');
  const cards = [...html.matchAll(/<div class="card" id="(cql-[^"]+)">/g)];
  const owners = new Map();
  for (let i = 0; i < cards.length; i++) {
    const end = i + 1 < cards.length ? cards[i + 1].index : html.indexOf('</section>', cards[i].index);
    const contents = html.slice(cards[i].index, end);
    const addresses = new Set([...contents.matchAll(/href="(http:\/\/127\.0\.0\.1:\d+\/)[^"]*"/g)].map(match => match[1]));
    for (const address of addresses) {
      const ids = owners.get(address) ?? [];
      ids.push(cards[i][1]);
      owners.set(address, ids);
    }
  }
  assert.ok(owners.size > 30, 'Inspect the actual local catalogue, not an empty selection.');
  const conflicts = [...owners].filter(([, ids]) => ids.length > 1);
  assert.deepEqual(conflicts, [], 'A link must identify its provider even when another local demo is running.');
});
