// workspace/state-manager.js
// Gerenciador de estado global para o workspace

const StateManager = (function() {
    'use strict';

    // ============================================
    // EVENTBUS BRIDGE
    // ============================================

    function emitEventBus(event, data) {
        try {
            const eb = window.EventBus;
            if (eb && typeof eb.emit === 'function') {
                eb.emit((eb.EVENTS && eb.EVENTS[event]) ? eb.EVENTS[event] : event, data);
            }
        } catch (e) {
            // Silencioso
        }
    }

    // ============================================
    // EVENTBUS LISTENERS (OPCIONAL)
    // ============================================

    let _eventBusBound = false;
    function setupEventBusListeners() {
        if (_eventBusBound) return;

        const eb = window.EventBus;
        if (!eb || typeof eb.on !== 'function' || !eb.EVENTS) return;

        _eventBusBound = true;

        try {
            eb.on(eb.EVENTS.WHATSAPP_READY, () => {
                setState('connection.status', 'connected');
            });

            eb.on(eb.EVENTS.BRIDGE_CONNECTED, () => {
                setState('connection.status', 'connected');
            });

            eb.on(eb.EVENTS.BRIDGE_DISCONNECTED, () => {
                setState('connection.status', 'disconnected');
            });

            eb.on(eb.EVENTS.SUBSCRIPTION_UPDATED, (data) => {
                if (!data || typeof data !== 'object') return;
                if (typeof data.plan === 'string') setState('user.plan', data.plan);
                if (typeof data.active === 'boolean') setState('user.subscriptionActive', data.active);
                if (typeof data.credits === 'number') setState('user.credits', data.credits);
            });

            eb.on(eb.EVENTS.CREDITS_UPDATED, (data) => {
                if (data && typeof data.credits === 'number') {
                    setState('user.credits', data.credits);
                }
            });

            eb.on(eb.EVENTS.CREDITS_LOW, (data) => {
                // Manter estado e também notificação de conveniência
                if (data && typeof data.credits === 'number') {
                    setState('user.credits', data.credits);
                }

                addNotification({
                    type: 'warning',
                    title: 'Créditos baixos',
                    message: 'Seus créditos estão baixos. Considere recarregar para continuar usando as automações.'
                });
            });
        } catch (e) {
            // Silencioso
        }
    }


    // ============================================
    // ESTADO INICIAL
    // ============================================

    const initialState = {
        // Usuário
        user: {
            id: null,
            name: 'Usuário',
            email: null,
            plan: 'free',
            avatar: null
        },

        // Conexão com WhatsApp
        connection: {
            status: 'disconnected', // disconnected, connecting, connected
            phone: null,
            lastSync: null
        },

        // Navegação
        navigation: {
            currentModule: 'dashboard',
            previousModule: null,
            history: [],
            breadcrumb: []
        },

        // Módulos carregados
        modules: {
            loaded: {},
            cache: {}
        },

        // Dados em cache
        data: {
            contacts: [],
            chats: [],
            groups: [],
            labels: [],
            campaigns: [],
            flows: [],
            team: []
        },

        // UI State
        ui: {
            sidebarCollapsed: false,
            contextPanelOpen: false,
            contextPanelContent: null,
            searchOpen: false,
            commandPaletteOpen: false,
            theme: 'dark'
        },

        // Notificações
        notifications: {
            unreadCount: 0,
            items: []
        },

        // Configurações
        settings: {
            language: 'pt-BR',
            autoSync: true,
            syncInterval: 30000,
            notifications: true,
            sounds: true
        }
    };

    // Estado atual
    let state = JSON.parse(JSON.stringify(initialState));

    // Listeners de mudança
    const listeners = new Map();
    let listenerId = 0;

    // ============================================
    // MÉTODOS PÚBLICOS
    // ============================================

    /**
     * Obtém o estado completo ou uma parte específica
     */
    function getState(path = null) {
        if (!path) return JSON.parse(JSON.stringify(state));

        const parts = path.split('.');
        let current = state;

        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
        }

        return JSON.parse(JSON.stringify(current));
    }

    /**
     * Define um valor no estado
     */
    function setState(path, value) {
        const parts = path.split('.');
        let current = state;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in current)) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }

        const lastPart = parts[parts.length - 1];
        const oldValue = current[lastPart];
        current[lastPart] = value;

        // Notificar listeners
        notifyListeners(path, value, oldValue);

        // Emitir evento global (EventBus)
        emitEventBus(
            (window.EventBus?.EVENTS?.STATE_CHANGED || 'workspace:state_changed'),
            { key: path, value, oldValue }
        );

        // Persistir estado importante
        persistState();

        return true;
    }

    /**
     * Atualiza múltiplos valores de uma vez
     */
    function updateState(updates) {
        for (const [path, value] of Object.entries(updates)) {
            setState(path, value);
        }
    }

    /**
     * Adiciona um listener para mudanças de estado
     */
    function subscribe(path, callback) {
        const id = ++listenerId;

        if (!listeners.has(path)) {
            listeners.set(path, new Map());
        }

        listeners.get(path).set(id, callback);

        // Retorna função para cancelar inscrição
        return () => {
            const pathListeners = listeners.get(path);
            if (pathListeners) {
                pathListeners.delete(id);
            }
        };
    }

    /**
     * Adiciona listener global para qualquer mudança
     */
    function subscribeAll(callback) {
        return subscribe('*', callback);
    }

    /**
     * Notifica listeners sobre mudança
     */
    function notifyListeners(path, newValue, oldValue) {
        // Notificar listeners específicos do path
        if (listeners.has(path)) {
            for (const callback of listeners.get(path).values()) {
                try {
                    callback(newValue, oldValue, path);
                } catch (e) {
                    console.error('[StateManager] Erro no listener:', e);
                }
            }
        }

        // Notificar listeners de paths pais
        const parts = path.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            if (listeners.has(parentPath)) {
                const parentValue = getState(parentPath);
                for (const callback of listeners.get(parentPath).values()) {
                    try {
                        callback(parentValue, null, parentPath);
                    } catch (e) {
                        console.error('[StateManager] Erro no listener pai:', e);
                    }
                }
            }
        }

        // Notificar listeners globais
        if (listeners.has('*')) {
            for (const callback of listeners.get('*').values()) {
                try {
                    callback(newValue, oldValue, path);
                } catch (e) {
                    console.error('[StateManager] Erro no listener global:', e);
                }
            }
        }
    }

    /**
     * Reseta o estado para o inicial
     */
    function resetState() {
        state = JSON.parse(JSON.stringify(initialState));
        notifyListeners('*', state, null);
        persistState();
    }

    /**
     * Persiste estado importante no storage
     */
    async function persistState() {
        try {
            const toPersist = {
                user: state.user,
                settings: state.settings,
                ui: {
                    sidebarCollapsed: state.ui.sidebarCollapsed,
                    theme: state.ui.theme
                },
                navigation: {
                    currentModule: state.navigation.currentModule
                }
            };

            await chrome.storage.local.set({ workspaceState: toPersist });
        } catch (e) {
            console.warn('[StateManager] Erro ao persistir estado:', e);
        }
    }

    /**
     * Carrega estado persistido
     */
    async function loadPersistedState() {
        try {
            const result = await chrome.storage.local.get('workspaceState');
            if (result.workspaceState) {
                // Merge com estado inicial
                const persisted = result.workspaceState;

                if (persisted.user) state.user = { ...state.user, ...persisted.user };
                if (persisted.settings) state.settings = { ...state.settings, ...persisted.settings };
                if (persisted.ui) state.ui = { ...state.ui, ...persisted.ui };
                if (persisted.navigation?.currentModule) {
                    state.navigation.currentModule = persisted.navigation.currentModule;
                }

                console.log('[StateManager] Estado restaurado');
            }
        } catch (e) {
            console.warn('[StateManager] Erro ao carregar estado:', e);
        }
    }

    // ============================================
    // MÉTODOS DE CONVENIÊNCIA
    // ============================================

    /**
     * Atualiza status de conexão
     */
    function setConnectionStatus(status, phone = null) {
        setState('connection.status', status);
        if (phone) setState('connection.phone', phone);
        if (status === 'connected') setState('connection.lastSync', new Date().toISOString());
    }

    /**
     * Define módulo atual
     */
    function setCurrentModule(moduleName) {
        const previous = state.navigation.currentModule;
        setState('navigation.previousModule', previous);
        setState('navigation.currentModule', moduleName);

        // Adicionar ao histórico
        const history = state.navigation.history;
        if (history[history.length - 1] !== moduleName) {
            history.push(moduleName);
            if (history.length > 20) history.shift();
            setState('navigation.history', history);
        }
    }

    /**
     * Adiciona notificação
     */
    function addNotification(notification) {
        const notifications = state.notifications.items;
        notifications.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            read: false,
            ...notification
        });

        if (notifications.length > 50) notifications.pop();

        setState('notifications.items', notifications);
        setState('notifications.unreadCount', notifications.filter(n => !n.read).length);
    }

    /**
     * Marca notificação como lida
     */
    function markNotificationRead(id) {
        const notifications = state.notifications.items;
        const notification = notifications.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            setState('notifications.items', notifications);
            setState('notifications.unreadCount', notifications.filter(n => !n.read).length);
        }
    }

    /**
     * Toggle sidebar
     */
    function toggleSidebar() {
        setState('ui.sidebarCollapsed', !state.ui.sidebarCollapsed);
    }

    /**
     * Toggle context panel
     */
    function toggleContextPanel(content = null) {
        if (content) {
            setState('ui.contextPanelContent', content);
            setState('ui.contextPanelOpen', true);
        } else {
            setState('ui.contextPanelOpen', !state.ui.contextPanelOpen);
        }
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    // Carregar estado persistido ao iniciar
    loadPersistedState();
    // Vincular listeners do EventBus (se existir)
    setupEventBusListeners();

    // ============================================
    // EXPORT
    // ============================================

    return {
        getState,
        setState,
        updateState,
        subscribe,
        subscribeAll,
        resetState,
        loadPersistedState,

        // Métodos de conveniência
        setConnectionStatus,
        setCurrentModule,
        addNotification,
        markNotificationRead,
        toggleSidebar,
        toggleContextPanel
    };
})();

// Export para uso global
window.StateManager = StateManager;
