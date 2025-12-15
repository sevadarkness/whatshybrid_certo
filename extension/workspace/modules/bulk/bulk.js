// workspace/modules/bulk/bulk.js
const BulkModule = (function () {
  'use strict';

  const state = {
    iframe: null,
    url: null,
  };

  function getUrl() {
    try {
      if (chrome?.runtime?.getURL) return chrome.runtime.getURL('bulk.html');
    } catch (_) {}
    return 'bulk.html';
  }

  function openInNewTab() {
    const url = state.url || getUrl();
    try {
      chrome.tabs.create({ url });
    } catch (e) {
      console.warn('[BulkModule] Falha ao abrir em nova guia:', e);
      window.open(url, '_blank');
    }
  }

  function reloadIframe() {
    if (!state.iframe) return;
    try {
      state.iframe.contentWindow?.location?.reload();
    } catch (_) {
      // Fallback: reset src
      state.iframe.src = state.url || getUrl();
    }
  }

  async function init(container) {
    state.url = getUrl();

    const iframe = container.querySelector('#whs-bulk-iframe');
    const btnOpen = container.querySelector('#whs-bulk-open');
    const btnReload = container.querySelector('#whs-bulk-reload');

    state.iframe = iframe;

    if (btnOpen) btnOpen.addEventListener('click', openInNewTab);
    if (btnReload) btnReload.addEventListener('click', reloadIframe);

    if (iframe) {
      iframe.src = state.url;
    }
  }

  return {
    init,
    onShow() {
      // opcional
    }
  };
})();

window.BulkModule = BulkModule;
