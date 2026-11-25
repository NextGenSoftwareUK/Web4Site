/* Local demo links point at 127.0.0.1 on a developer's own machine. They work only
   when this page is opened locally, so they are hidden for public visitors. */
(function (root) {
  'use strict';
  const localHosts = ['localhost', '127.0.0.1', '[::1]', '::1'];

  function isLocalHost(hostname) {
    return localHosts.includes(String(hostname || '').toLowerCase());
  }

  // Hides each local link, or its wrapping paragraph/row when that holds nothing else
  // useful (a row with the local example picker, or a paragraph with only the link).
  function hideLocalDemoLinks(doc, hostname) {
    if (isLocalHost(hostname)) return 0;
    let hidden = 0;
    for (const link of doc.querySelectorAll('a[href^="http://127.0.0.1:"]')) {
      const row = link.closest('.row');
      const paragraph = link.closest('p');
      const target = row ?? (paragraph && paragraph.textContent.trim() === link.textContent.trim() ? paragraph : link);
      if (!target.hidden) { target.hidden = true; hidden++; }
    }
    const oracleNote = doc.getElementById && doc.getElementById('cql-oracle-note');
    if (oracleNote) oracleNote.hidden = true;
    return hidden;
  }

  const api = { isLocalHost, hideLocalDemoLinks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.LocalDemoLinks = api;
    const run = () => hideLocalDemoLinks(root.document, root.location.hostname);
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', run);
    else run();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
