(function (root) {
  'use strict';

  function mount(document, window) {
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const panels = Array.from(document.querySelectorAll('.panel'));
    function activate(panel) {
      if (!panels.includes(panel)) return false;
      const selected = tabs.find(tab => 'panel-' + tab.dataset.tab === panel.id);
      if (!selected) return false;
      tabs.forEach(tab => tab.classList.toggle('active', tab === selected));
      panels.forEach(candidate => candidate.classList.toggle('active', candidate === panel));
      return true;
    }
    function followHash() {
      let id;
      try { id = decodeURIComponent(window.location.hash.slice(1)); }
      catch { return; }
      const target = document.getElementById(id);
      const panel = target?.closest('.panel');
      if (activate(panel)) target.scrollIntoView({ block: 'start' });
    }
    tabs.forEach(tab => tab.addEventListener('click', () =>
      activate(document.getElementById('panel-' + tab.dataset.tab))));
    window.addEventListener('hashchange', followHash);
    followHash();
  }

  const api = { mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Web4Tabs = api;
})(globalThis);
