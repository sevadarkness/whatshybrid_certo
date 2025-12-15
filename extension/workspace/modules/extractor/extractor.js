// workspace/modules/extractor/extractor.js
const ExtractorModule = (function () {
  'use strict';

  const state = {
    iframe: null,
    url: null,
  };

  function getUrl() {
    try {
      if (chrome?.runtime?.getURL) return chrome.runtime.getURL('extractor/extractor_ui.html');
    } catch (_) {}
    return 'extractor/extractor_ui.html';
  }

  function openInNewTab() {
    const url = state.url || getUrl();
    try {
      chrome.tabs.create({ url });
    } catch (_) {
      window.open(url, '_blank');
    }
  }

  function reloadIframe() {
    if (!state.iframe) return;
    try {
      state.iframe.contentWindow?.location?.reload();
    } catch (_) {
      state.iframe.src = state.url || getUrl();
    }
  }

  async function init(container) {
    state.url = getUrl();
    state.iframe = container.querySelector('#whs-extractor-iframe');

    const btnOpen = container.querySelector('#whs-extractor-open');
    const btnReload = container.querySelector('#whs-extractor-reload');

    if (btnOpen) btnOpen.addEventListener('click', openInNewTab);
    if (btnReload) btnReload.addEventListener('click', reloadIframe);

    if (state.iframe) {
      state.iframe.src = state.url;
    }
  }

  return { init };
})();

window.ExtractorModule = ExtractorModule;
