// workspace/modules/settings/settings.js
const SettingsModule = (function () {
  'use strict';

  const state = {
    iframe: null,
    url: null,
  };

  function getUrl() {
    try {
      if (chrome?.runtime?.getURL) return chrome.runtime.getURL('options.html');
    } catch (_) {}
    return 'options.html';
  }

  function openOptions() {
    try {
      if (chrome?.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        return;
      }
    } catch (_) {}

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
    state.iframe = container.querySelector('#whs-settings-iframe');

    const btnOpen = container.querySelector('#whs-settings-open');
    const btnReload = container.querySelector('#whs-settings-reload');

    if (btnOpen) btnOpen.addEventListener('click', openOptions);
    if (btnReload) btnReload.addEventListener('click', reloadIframe);

    if (state.iframe) {
      state.iframe.src = state.url;
    }
  }

  return { init };
})();

window.SettingsModule = SettingsModule;
