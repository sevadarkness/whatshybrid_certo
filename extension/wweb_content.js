// WhatsApp Web.js Manager - Enhanced Content Script
// This script runs on WhatsApp Web pages to provide integration

(function() {
    'use strict';

    // Global error capture for wweb_content
    (function(){
      function _send(payload) {
        try { chrome.runtime.sendMessage({ type: 'EXTENSION_ERROR', payload }); } catch(e) {
          try {
            chrome.storage.local.get(['extension_errors'], (res) => {
              const arr = res && res.extension_errors ? res.extension_errors : [];
              arr.push({ ...payload, ts: new Date().toISOString() });
              chrome.storage.local.set({ extension_errors: arr });
            });
          } catch(_){}
        }
      }

      window.addEventListener('unhandledrejection', (ev) => {
        try {
          _send({ type: 'unhandledrejection', message: ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason), stack: ev.reason && ev.reason.stack ? ev.reason.stack : null, url: location.href });
        } catch(_){}
      });

      window.addEventListener('error', (ev) => {
        try {
          _send({ type: 'error', message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, stack: ev.error && ev.error.stack ? ev.error.stack : null, url: location.href });
        } catch(_){}
      });
    })();

    let injectScriptLoaded = false;
    let injectScriptLoadingPromise = null;
    let isExtensionContextValid = true;

    // Check if extension context is still valid
    function checkExtensionContext() {
        try {
            // Try to access chrome.runtime to check if context is valid
            if (chrome.runtime && chrome.runtime.id) {
                return true;
            }
        } catch (error) {
            console.warn('Extension context invalidated:', error);
            isExtensionContextValid = false;
            return false;
        }
        return true;
    }

    // Safe function to send messages to background script
    // Compatível com ambientes onde chrome.runtime.sendMessage retorna Promise *ou* usa apenas callback.
    function sendToBackground(message) {
        if (!checkExtensionContext()) {
            console.warn('Cannot send message - extension context invalid');
            return;
        }

        try {
            const maybePromise = chrome.runtime.sendMessage(message);
            // MV3: em muitos ambientes retorna Promise; em outros retorna undefined.
            if (maybePromise && typeof maybePromise.catch === 'function') {
                maybePromise.catch(error => {
                    console.error('Failed to send message to background script:', error);
                    // Don't mark context as invalid for communication errors
                    // as they might be temporary
                });
            }
        } catch (error) {
            console.error('Error sending message to background script:', error);
            if (String(error?.message || error).includes('Extension context invalidated')) {
                isExtensionContextValid = false;
            }
        }
    }

    // Inject the main script into the page context (idempotent)
    function injectScript() {
        if (injectScriptLoaded) return Promise.resolve(true);
        if (injectScriptLoadingPromise) return injectScriptLoadingPromise;

        injectScriptLoadingPromise = new Promise((resolve, reject) => {
            try {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('inject.js');
                script.dataset.whatsHybridInject = '1';

                script.onload = function() {
                    this.remove();
                    injectScriptLoaded = true;
                    injectScriptLoadingPromise = null;
                    console.log('WhatsApp Web.js Manager inject script loaded');
                    resolve(true);
                };

                script.onerror = function() {
                    injectScriptLoadingPromise = null;
                    console.error('Failed to load inject script');
                    sendToBackground({
                        action: 'whatsapp_event',
                        data: {
                            type: 'integration_failed',
                            data: { error: 'Failed to load inject script' }
                        }
                    });
                    reject(new Error('Failed to load inject script'));
                };

                (document.head || document.documentElement).appendChild(script);
            } catch (e) {
                injectScriptLoadingPromise = null;
                reject(e);
            }
        });

        return injectScriptLoadingPromise;
    }

    function ensureInjectScriptLoaded() {
        if (injectScriptLoaded) return Promise.resolve(true);
        return injectScript();
    }

    // Communication bridge between injected script and extension
    window.addEventListener('message', function(event) {
        // Only accept messages from same origin
        if (event.source !== window) return;

        if (event.data && event.data.type === 'FROM_INJECT_SCRIPT') {
            // Forward to background script
            sendToBackground({
                action: 'whatsapp_event',
                data: event.data.payload
            });
        }
    });

    // Listen for messages from extension
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!checkExtensionContext()) {
            try { sendResponse({ success: false, error: 'Extension context invalid' }); } catch (_) {}
            return false;
        }

        if (message && message.action === 'execute_script') {
            let done = false;
            const safeRespond = (payload) => {
                if (done) return;
                done = true;
                try { sendResponse(payload); } catch (e) {}
            };

            (async () => {
                try {
                    await ensureInjectScriptLoaded();
                } catch (e) {
                    safeRespond({
                        success: false,
                        error: e?.message || 'WhatsApp Web integration failed to load'
                    });
                    return;
                }

                const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                const commandPayload = Object.assign({}, message.data || {}, { requestId });

                const responseListener = (event) => {
                    if (event.source !== window) return;
                    if (!event.data || event.data.type !== 'FROM_INJECT_SCRIPT') return;

                    const payload = event.data.payload || {};
                    const payloadRequestId =
                        payload.requestId ||
                        payload.data?.requestId ||
                        payload.data?.request_id;

                    if (payloadRequestId !== requestId) return;

                    window.removeEventListener('message', responseListener);
                    safeRespond(payload.data);
                };

                window.addEventListener('message', responseListener);

                // Send command to inject context
                window.postMessage({
                    type: 'FROM_EXTENSION',
                    payload: commandPayload
                }, '*');

                // Set timeout for response
                setTimeout(() => {
                    window.removeEventListener('message', responseListener);
                    safeRespond({
                        success: false,
                        error: 'No response from WhatsApp Web',
                        requestId
                    });
                }, 15000); // 15 second timeout
            })();

            // Resposta é assíncrona (listener de window.postMessage ou timeout)
            return true;
        }

        return false;
    });

    // Inject script when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            injectScript().catch(() => {});
        });
    } else {
        injectScript().catch(() => {});
    }

    // Also inject when page is updated (for SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            injectScriptLoaded = false;
            injectScriptLoadingPromise = null;
            injectScript().catch(() => {});
        }
    }).observe(document, { subtree: true, childList: true });

    // Periodic context check
    setInterval(() => {
        checkExtensionContext();
    }, 5000);

    console.log('WhatsApp Web.js Manager content script loaded');
})();
