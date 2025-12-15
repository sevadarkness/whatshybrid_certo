// workspace/modules/analytics/analytics.js
const AnalyticsModule = (function () {
  'use strict';

  const state = {
    iframe: null,
    url: null,
  };

  function getUrl() {
    try {
      if (chrome?.runtime?.getURL) return chrome.runtime.getURL('analytics.html');
    } catch (_) {}
    return 'analytics.html';
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

    state.iframe = container.querySelector('#whs-analytics-iframe');
    const btnOpen = container.querySelector('#whs-analytics-open');
    const btnReload = container.querySelector('#whs-analytics-reload');

    if (btnOpen) btnOpen.addEventListener('click', openInNewTab);
    if (btnReload) btnReload.addEventListener('click', reloadIframe);

    if (state.iframe) {
      state.iframe.src = state.url;
    }
  }

  return { init };
})();

window.AnalyticsModule = AnalyticsModule;
