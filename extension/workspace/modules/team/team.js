// workspace/modules/team/team.js
const TeamModule = (function () {
  'use strict';

  const state = {
    iframe: null,
    url: null,
  };

  function getUrl() {
    try {
      if (chrome?.runtime?.getURL) return chrome.runtime.getURL('team.html');
    } catch (_) {}
    return 'team.html';
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
    state.iframe = container.querySelector('#whs-team-iframe');
    const btnOpen = container.querySelector('#whs-team-open');
    const btnReload = container.querySelector('#whs-team-reload');

    if (btnOpen) btnOpen.addEventListener('click', openInNewTab);
    if (btnReload) btnReload.addEventListener('click', reloadIframe);

    if (state.iframe) {
      state.iframe.src = state.url;
    }
  }

  return { init };
})();

window.TeamModule = TeamModule;
