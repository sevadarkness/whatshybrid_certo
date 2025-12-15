// panel.js
// Script principal que inicializa o workspace

(function() {
    'use strict';

    // Global error capture for panel UI
    (function(){
      function report(payload) {
        try { chrome.runtime.sendMessage({ type: 'EXTENSION_ERROR', payload }); } catch(e) {
          try { chrome.storage.local.get(['extension_errors'], (res) => {
              const arr = res && res.extension_errors ? res.extension_errors : [];
              arr.push({ ...payload, ts: new Date().toISOString() });
              chrome.storage.local.set({ extension_errors: arr });
            }); } catch(_){}
        }
      }

      window.addEventListener('unhandledrejection', (ev) => {
        try { report({ type: 'unhandledrejection', message: ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason), stack: ev.reason && ev.reason.stack ? ev.reason.stack : null, url: location.href }); } catch(_){}
      });

      window.addEventListener('error', (ev) => {
        try { report({ type: 'error', message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, stack: ev.error && ev.error.stack ? ev.error.stack : null, url: location.href }); } catch(_){}
      });
    })();

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    async function initPanel() {
        console.log('[Panel] Iniciando...');

        // Verificar dependências
        if (!window.StateManager) {
            console.error('[Panel] StateManager não encontrado');
            return;
        }

        if (!window.ModuleLoader) {
            console.error('[Panel] ModuleLoader não encontrado');
            return;
        }

        if (!window.Workspace) {
            console.error('[Panel] Workspace não encontrado');
            return;
        }

        try {
            // Inicializar workspace
            await Workspace.init();
        await initSubscription();

            // Conectar Bridge se disponível
            if (window.WhatsHybridBridge) {
                setupBridgeListeners();
            }

            console.log('[Panel] Inicializado com sucesso');

        } catch (error) {
            console.error('[Panel] Erro na inicialização:', error);
            showInitError(error);
        }
    }

    // ============================================
    // BRIDGE LISTENERS
    // ============================================

    function setupBridgeListeners() {
        const bridge = window.WhatsHybridBridge;

        // Status de conexão
        bridge.on('connection_status', (status) => {
            StateManager.setConnectionStatus(status);
        });

        // Nova mensagem
        bridge.on('new_message', (message) => {
            StateManager.addNotification({
                icon: '💬',
                title: 'Nova mensagem',
                message: `De: ${message.from}`
            });

            // Atualizar badge de chats
            updateBadge('chats', '+1');
        });

        // Mensagem enviada
        bridge.on('message_sent', (message) => {
            Workspace.showToast('Mensagem enviada', 'success');
        });

        // Erro
        bridge.on('error', (error) => {
            Workspace.showToast(error.message, 'error');
        });
    }

    // ============================================
    // BADGES
    // ============================================

    function updateBadge(module, value) {
        const badge = document.getElementById(`badge-${module}`);
        if (!badge) return;

        if (value === '+1') {
            const current = parseInt(badge.textContent) || 0;
            badge.textContent = current + 1;
        } else {
            badge.textContent = value;
        }
    }

    function clearBadge(module) {
        const badge = document.getElementById(`badge-${module}`);
        if (badge) badge.textContent = '';
    }

    // ============================================
    // ERROR HANDLING
    // ============================================

    function showInitError(error) {
        const app = document.getElementById('app');
        if (app) {
            app.innerHTML = `
                <div class="init-error">
                    <div class="error-content">
                        <span class="error-icon">⚠️</span>
                        <h1>Erro ao inicializar</h1>
                        <p>${error.message}</p>
                        <button class="btn primary" id="btn-reload-error">
                            Recarregar
                        </button>
                    </div>
                </div>
            `;
            
            // Add event listener for reload button
            const reloadBtn = document.getElementById('btn-reload-error');
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => location.reload());
            }
        }
    }

    // ============================================
    // COMUNICAÇÃO COM BACKGROUND
    // ============================================

    // Listener para mensagens do background
    // IMPORTANT: só retorne `true` quando realmente formos responder.
    // Caso contrário, a porta pode ficar aberta e causar timeouts em `sendMessage`.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || !message.action) return false;

        switch (message.action) {
            case 'NAVIGATE_TO':
                Workspace.navigateTo(message.module);
                sendResponse({ success: true });
                return true;

            case 'SHOW_NOTIFICATION':
                StateManager.addNotification(message.notification);
                sendResponse({ success: true });
                return true;

            case 'UPDATE_CONNECTION':
                StateManager.setConnectionStatus(message.status);
                sendResponse({ success: true });
                return true;

            case 'REFRESH_DATA':
                Workspace.refreshCurrentModule();
                sendResponse({ success: true });
                return true;

            default:
                return false;
        }
    });

    // ============================================
    // UTILITÁRIOS GLOBAIS
    // ============================================

    // Expor funções úteis globalmente
    window.PanelUtils = {
        updateBadge,
        clearBadge,

        formatNumber(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        },

        formatDate(date) {
            return new Date(date).toLocaleDateString('pt-BR');
        },

        formatTime(date) {
            return new Date(date).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        formatDateTime(date) {
            return new Date(date).toLocaleString('pt-BR');
        },

        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        throttle(func, limit) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        }
    };

    // ============================================
    // INICIAR
    // ============================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPanel);
    } else {
        initPanel();
    }

})();


// ============================================
// Inicialização do sistema de assinaturas
// ============================================

async function initSubscription() {
    try {
        // Inicializar managers
        if (window.SubscriptionManager && typeof SubscriptionManager.init === 'function') {
            await SubscriptionManager.init();
        }

        // Inicializar UI
        if (window.SubscriptionUI && typeof SubscriptionUI.init === 'function') {
            SubscriptionUI.init();
        }

        // Aplicar gates aos módulos
        if (window.FeatureGate && typeof applyFeatureGates === 'function') {
            applyFeatureGates();
        }
    } catch (error) {
        console.error('[Panel] Erro ao inicializar assinaturas:', error);
    }
}

function applyFeatureGates() {
    if (!window.FeatureGate) return;

    // Aplicar a todos os itens de navegação
    document.querySelectorAll('.nav-item[data-module]').forEach(item => {
        const module = item.dataset.module;
        const featureKey = `module:${module}`;

        FeatureGate.applyToElement(item, featureKey);
    });
}
