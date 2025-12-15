// workspace/workspace.js
// Core do sistema de workspace unificado

const Workspace = (function() {
    'use strict';

    // ============================================
    // VARIÁVEIS PRIVADAS
    // ============================================

    let initialized = false;
    let currentModule = null;

    // Elementos do DOM
    const elements = {};

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    async function init() {
        if (initialized) return;

        console.log('[Workspace] Inicializando...');

        // Cachear elementos
        cacheElements();

        // Configurar event listeners
        setupEventListeners();

        // Configurar atalhos de teclado
        setupKeyboardShortcuts();

        // Carregar estado persistido
        await StateManager.loadPersistedState();

        // Aplicar estado da UI
        applyUIState();

        // Pré-carregar módulos
        ModuleLoader.preloadModules();

        // Carregar módulo inicial (hash na URL tem prioridade)
        const hash = (location.hash || '').replace('#', '');
        const specialAction = hash === 'quick-message' ? 'quick-message' : null;

        let initialModule = StateManager.getState('navigation.currentModule') || 'dashboard';

        if (hash) {
            if (hash === 'quick-message') {
                // Ação especial: abre modal de nova mensagem após carregar módulo base
                initialModule = 'dashboard';
            } else if (ModuleLoader.getModuleConfig(hash)) {
                initialModule = hash;
            } else {
                console.warn('[Workspace] Hash de módulo desconhecido:', hash, '- redirecionando para dashboard');
                initialModule = 'dashboard';
                // Clear invalid hash
                history.replaceState(null, '', '#dashboard');
            }
        }

        await navigateTo(initialModule);

        // Ações especiais via hash
        if (specialAction === 'quick-message') {
            openQuickMessage();
        }

        // Conectar com WhatsApp via Bridge
        connectToWhatsApp();

        // Configurar listeners de estado
        setupStateListeners();

        initialized = true;

        // Emitir evento de workspace pronto (EventBus)
        try {
            window.EventBus?.emit(window.EventBus.EVENTS?.WORKSPACE_READY || 'workspace:ready', {
                timestamp: Date.now()
            });
        } catch (e) {}

        console.log('[Workspace] Inicializado com sucesso');
    }

    function cacheElements() {
        elements.sidebar = document.getElementById('sidebar');
        elements.mainContent = document.getElementById('main-content');
        elements.moduleContainer = document.getElementById('module-container');
        elements.moduleContent = document.getElementById('module-content');
        elements.moduleLoading = document.getElementById('module-loading');
        elements.moduleError = document.getElementById('module-error');
        elements.pageTitle = document.getElementById('page-title');
        elements.pageSubtitle = document.getElementById('page-subtitle');
        elements.breadcrumb = document.getElementById('breadcrumb');
        elements.breadcrumbCurrent = document.getElementById('breadcrumb-current');
        elements.connectionStatus = document.getElementById('connection-status');
        elements.contextPanel = document.getElementById('context-panel');
        elements.searchModal = document.getElementById('search-modal');
        elements.commandPalette = document.getElementById('command-palette');
        elements.toastContainer = document.getElementById('toast-container');
        elements.notificationCount = document.getElementById('notification-count');
        elements.navItems = document.querySelectorAll('.nav-item[data-module]');
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    function setupEventListeners() {
        // Toggle Sidebar
        document.getElementById('btn-toggle-sidebar')?.addEventListener('click', toggleSidebar);

        // Navegação por itens do menu
        elements.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const module = item.dataset.module;
                if (module) navigateTo(module);
            });
        });

        // Botão voltar
        document.getElementById('btn-back')?.addEventListener('click', goBack);

        // Refresh
        document.getElementById('btn-refresh')?.addEventListener('click', refreshCurrentModule);

        // Fullscreen
        document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);

        // Notificações
        document.getElementById('btn-notifications')?.addEventListener('click', openNotifications);

        // Quick message
        document.getElementById('btn-quick-message')?.addEventListener('click', openQuickMessage);

        // Search
        const globalSearchEl = document.getElementById('global-search');
        if (globalSearchEl) {
            // Global search is now a command palette launcher (Ctrl+K)
            globalSearchEl.addEventListener('click', (e) => {
                e.preventDefault();
                openCommandPalette();
            });
            globalSearchEl.addEventListener('focus', (e) => {
                try { e.target.blur(); } catch(_) {}
                openCommandPalette();
            });
        }

        document.getElementById('btn-close-context')?.addEventListener('click', closeContextPanel);

        // Modais
        setupModalListeners();

        // Retry button
        document.getElementById('btn-retry')?.addEventListener('click', retryLoadModule);

        // Breadcrumb
        elements.breadcrumb?.addEventListener('click', handleBreadcrumbClick);
    }

    function setupModalListeners() {
        // Search Modal
        const searchModal = elements.searchModal;
        if (searchModal) {
            searchModal.querySelector('.modal-overlay')?.addEventListener('click', closeSearchModal);
            searchModal.querySelector('.btn-close')?.addEventListener('click', closeSearchModal);

            const searchInput = document.getElementById('search-modal-input');
            searchInput?.addEventListener('input', handleSearchInput);

            // Ações rápidas
            searchModal.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
            });
        }

        // Generic Modal
        const genericModal = document.getElementById('generic-modal');
        if (genericModal) {
            genericModal.querySelector('.modal-overlay')?.addEventListener('click', closeModal);
            document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
        }

        // Command Palette
        const palette = elements.commandPalette;
        if (palette) {
            palette.querySelector('.palette-overlay')?.addEventListener('click', closeCommandPalette);
            document.getElementById('command-input')?.addEventListener('input', handleCommandInput);
        }
    }

    // ============================================
    // ATALHOS DE TECLADO
    // ============================================

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignorar se estiver digitando em input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                if (e.key === 'Escape') {
                    e.target.blur();
                }
                return;
            }
            // Ctrl/Cmd + K: Command Palette
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                openCommandPalette();
                return;
            }

            // Ctrl/Cmd + Shift + F: Busca global (legado)
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                openSearchModal();
                return;
            }

            // Ctrl/Cmd + Shift + P: Command Palette (atalho alternativo)
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                openCommandPalette();
                return;
            }

            // Escape: Fechar modais
            if (e.key === 'Escape') {
                closeAllModals();
                return;
            }

            // F5: Refresh
            if (e.key === 'F5') {
                e.preventDefault();
                refreshCurrentModule();
                return;
            }

            // F11: Fullscreen
            if (e.key === 'F11') {
                e.preventDefault();
                toggleFullscreen();
                return;
            }

            // Atalhos de navegação (com Alt)
            if (e.altKey) {
                // Alt+N: Criar nota interna
                if (e.key && e.key.toLowerCase() === 'n') {
                    e.preventDefault();
                    openInternalNoteModal();
                    return;
                }
                const shortcuts = {
                    // Core 5-areas
                    'i': 'chats',      // Inbox
                    'c': 'contacts',   // CRM
                    'b': 'bulk',       // Campanhas
                    'a': 'analytics',  // Analytics

                    // Utilitários
                    'd': 'dashboard',
                    's': 'settings',
                    'h': 'help',
                    'r': 'smart-replies',
                    'l': 'labels',
                    'e': 'extractor',
                    't': 'team'
                };

                const module = shortcuts[e.key.toLowerCase()];
                if (module) {
                    e.preventDefault();
                    navigateTo(module);
                }
            }
        });
    }

    // ============================================
    // NAVEGAÇÃO
    // ============================================

    async function navigateTo(moduleName, params = {}) {
        if (currentModule === moduleName && !params.force) {
            console.log(`[Workspace] Já está no módulo: ${moduleName}`);
            return;
        }

        console.log(`[Workspace] Navegando para: ${moduleName}`);

        // Atualizar hash da URL (para abertura direta)
        try {
            if (location.hash !== `#${moduleName}`) {
                history.replaceState(null, '', `#${moduleName}`);
            }
        } catch (e) {
            // Ignorar se não permitido
        }

        // Mostrar loading
        showLoading();

        // Ocultar módulo atual
        if (currentModule) {
            ModuleLoader.unloadModule(currentModule);
        }

        try {
            // Carregar novo módulo
            const moduleInstance = await ModuleLoader.renderModule(moduleName, elements.moduleContent);

            // Atualizar estado
            StateManager.setCurrentModule(moduleName);
            currentModule = moduleName;

            // Atualizar UI
            updateNavigationUI(moduleName);
            updatePageHeader(moduleInstance.config);

            // Ocultar loading
            hideLoading();

        } catch (error) {
            console.error('[Workspace] Erro na navegação:', error);
            showError(error.message);
        }
    }

    function goBack() {
        const previous = StateManager.getState('navigation.previousModule');
        if (previous) {
            navigateTo(previous);
        }
    }

    function updateNavigationUI(moduleName) {
        // Atualizar itens do menu
        elements.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.module === moduleName);
        });

        // Mostrar/ocultar botão voltar
        const btnBack = document.getElementById('btn-back');
        const hasPrevious = StateManager.getState('navigation.previousModule');
        btnBack?.classList.toggle('hidden', !hasPrevious);
    }

    function updatePageHeader(config) {
        if (elements.pageTitle) {
            elements.pageTitle.textContent = config.name;
        }

        // Atualizar breadcrumb
        if (elements.breadcrumb && elements.breadcrumbCurrent) {
            elements.breadcrumbCurrent.textContent = config.name;
            elements.breadcrumb.classList.remove('hidden');
        }
    }

    // ============================================
    // LOADING & ERROR STATES
    // ============================================

    function showLoading() {
        elements.moduleLoading?.classList.remove('hidden');
        elements.moduleError?.classList.add('hidden');
        elements.moduleContent?.classList.add('hidden');
    }

    function hideLoading() {
        elements.moduleLoading?.classList.add('hidden');
        elements.moduleContent?.classList.remove('hidden');
    }

    function showError(message) {
        elements.moduleLoading?.classList.add('hidden');
        elements.moduleContent?.classList.add('hidden');
        elements.moduleError?.classList.remove('hidden');

        const errorMsg = document.getElementById('error-message');
        if (errorMsg) errorMsg.textContent = message;
    }

    async function retryLoadModule() {
        if (currentModule) {
            await navigateTo(currentModule, { force: true });
        }
    }

    // ============================================
    // SIDEBAR
    // ============================================

    function toggleSidebar() {
        StateManager.toggleSidebar();
    }

    function applyUIState() {
        const state = StateManager.getState('ui');

        // Sidebar
        if (state.sidebarCollapsed) {
            elements.sidebar?.classList.add('collapsed');
        }

        // Theme
        document.body.dataset.theme = state.theme || 'dark';
    }

    // ============================================
    // CONTEXT PANEL
    // ============================================

    function openContextPanel(title, content) {
        if (elements.contextPanel) {
            elements.contextPanel.classList.remove('hidden');
            document.getElementById('context-title').textContent = title;
            document.getElementById('context-content').innerHTML = content;
        }
        StateManager.setState('ui.contextPanelOpen', true);
    }

    function closeContextPanel() {
        elements.contextPanel?.classList.add('hidden');
        StateManager.setState('ui.contextPanelOpen', false);
    }

    // ============================================
    // MODAIS
    // ============================================

    function openSearchModal() {
        elements.searchModal?.classList.remove('hidden');
        document.getElementById('search-modal-input')?.focus();
        StateManager.setState('ui.searchOpen', true);
    }

    function closeSearchModal() {
        elements.searchModal?.classList.add('hidden');
        StateManager.setState('ui.searchOpen', false);
    }

    function openCommandPalette() {
        elements.commandPalette?.classList.remove('hidden');
        document.getElementById('command-input')?.focus();
        populateCommands();
        StateManager.setState('ui.commandPaletteOpen', true);
    }

    function closeCommandPalette() {
        elements.commandPalette?.classList.add('hidden');
        StateManager.setState('ui.commandPaletteOpen', false);
    }

    function closeAllModals() {
        closeSearchModal();
        closeCommandPalette();
        closeModal();
        closeContextPanel();
    }

    function openModal(title, content, footer = '') {
        const modal = document.getElementById('generic-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-body').innerHTML = content;
            document.getElementById('modal-footer').innerHTML = footer;
        }
    }

    function closeModal() {
        document.getElementById('generic-modal')?.classList.add('hidden');
    }

    // ============================================
    // SEARCH
    // ============================================

    async function handleSearchInput(e) {
        const query = e.target.value.trim().toLowerCase();
        const resultsList = document.getElementById('search-results-list');

        if (!query) {
            resultsList.innerHTML = '<p class="empty-state">Digite para buscar contatos, conversas, campanhas...</p>';
            return;
        }

        // Buscar em dados
        const results = await searchAll(query);
        renderSearchResults(results);
    }

    async function searchAll(query) {
        const results = {
            modules: [],
            contacts: [],
            chats: [],
            campaigns: []
        };

        // Buscar módulos
        const modules = ModuleLoader.listModules();
        results.modules = modules.filter(m => 
            m.name.toLowerCase().includes(query)
        );

        // Buscar em dados via Bridge (se conectado)
        if (window.WhatsHybridBridge?.isConnected()) {
            try {
                const contacts = await WhatsHybridBridge.searchContacts(query);
                results.contacts = contacts.slice(0, 5);
            } catch (e) {}
        }

        return results;
    }

    function renderSearchResults(results) {
        const container = document.getElementById('search-results-list');

        let html = '';

        // Módulos
        if (results.modules.length > 0) {
            html += '<div class="search-group"><h5>Módulos</h5>';
            results.modules.forEach(m => {
                html += `<button class="search-result-item" data-navigate="${m.id}">
                    <span class="result-icon">${m.icon}</span>
                    <span class="result-text">${m.name}</span>
                </button>`;
            });
            html += '</div>';
        }

        // Contatos
        if (results.contacts.length > 0) {
            html += '<div class="search-group"><h5>Contatos</h5>';
            results.contacts.forEach(c => {
                html += `<button class="search-result-item" data-contact="${c.id}">
                    <span class="result-icon">👤</span>
                    <span class="result-text">${c.name || c.number}</span>
                </button>`;
            });
            html += '</div>';
        }

        if (!html) {
            html = '<p class="empty-state">Nenhum resultado encontrado</p>';
        }

        container.innerHTML = html;

        // Bind click events
        container.querySelectorAll('[data-navigate]').forEach(btn => {
            btn.addEventListener('click', () => {
                navigateTo(btn.dataset.navigate);
                closeSearchModal();
            });
        });
    }

    // ============================================
    // COMMAND PALETTE
    // ============================================

    function populateCommands() {
        const commands = [
            // Navegação (5 áreas)
            { icon: '📥', name: 'Inbox', subtitle: 'Conversas / Atendimento', shortcut: 'Alt+I', keywords: 'inbox chats conversas atendimento', action: () => navigateTo('chats') },
            { icon: '👥', name: 'Contato / CRM', subtitle: 'Contatos, campos, tags', shortcut: 'Alt+C', keywords: 'crm contatos', action: () => navigateTo('contacts') },
            { icon: '📨', name: 'Campanhas (Bulk)', subtitle: 'Wizard de envios em massa', shortcut: 'Alt+B', keywords: 'bulk campanha disparo massa', action: () => navigateTo('bulk') },
            { icon: '📈', name: 'Analytics', subtitle: 'Resultados e métricas', shortcut: 'Alt+A', keywords: 'analytics metricas dashboard', action: () => navigateTo('analytics') },

            // IA / Produtividade
            { icon: '🤖', name: 'Responder com IA', subtitle: 'Respostas inteligentes (revisão humana)', shortcut: 'Alt+R', keywords: 'ia responder smart replies', action: () => navigateTo('smart-replies') },
            { icon: '📝', name: 'Criar nota interna', subtitle: 'Anexa ao contato selecionado na Inbox', shortcut: 'Alt+N', keywords: 'nota interna note', action: () => openInternalNoteModal() },

            // Sistema
            { icon: '📊', name: 'Overview', subtitle: 'Visão geral', shortcut: 'Alt+D', keywords: 'dashboard overview', action: () => navigateTo('dashboard') },
            { icon: '⚙️', name: 'Configurações', subtitle: 'Backend, licença, preferências', shortcut: 'Alt+S', keywords: 'settings config', action: () => navigateTo('settings') },
            { icon: '🔌', name: 'Reconectar WhatsApp', subtitle: 'Revalidar bridge e conexão', keywords: 'reconectar bridge', action: reconnectWhatsApp },
            { icon: '🔄', name: 'Atualizar módulo atual', subtitle: 'Recarregar dados/telas', shortcut: 'F5', keywords: 'refresh recarregar', action: refreshCurrentModule },
            { icon: '⛶', name: 'Tela cheia', subtitle: 'Alternar fullscreen', shortcut: 'F11', keywords: 'fullscreen', action: toggleFullscreen },
        ];

        const container = document.getElementById('command-list');
        if (!container) return;

        // Persist base + current list
        container._commands = commands;
        container._currentList = commands;

        renderCommandList(commands);
    }

    function renderCommandList(list) {
        const container = document.getElementById('command-list');
        if (!container) return;

        const safeList = Array.isArray(list) ? list : [];
        container._currentList = safeList;

        if (!safeList.length) {
            container.innerHTML = `
                <div class="state state-empty" style="padding:16px;">
                    <div class="state-icon">🔎</div>
                    <div class="state-title">Nenhum comando encontrado</div>
                    <div class="state-text">Tente outro termo (ex.: <strong>bulk</strong>, <strong>inbox</strong>, <strong>analytics</strong>).</div>
                </div>
            `;
            return;
        }

        container.innerHTML = safeList
            .map((cmd, index) => `
                <div class="command-item" data-index="${index}">
                    <span class="command-icon">${cmd.icon || '•'}</span>
                    <div class="command-main">
                        <span class="command-name">${cmd.name || ''}</span>
                        ${cmd.subtitle ? `<span class="command-subtitle">${cmd.subtitle}</span>` : ''}
                    </div>
                    ${cmd.shortcut ? `<span class="command-shortcut">${cmd.shortcut}</span>` : ''}
                </div>
            `)
            .join('');

        // Bind click events
        container.querySelectorAll('.command-item').forEach((item) => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.getAttribute('data-index') || '-1', 10);
                const list = container._currentList || [];
                const cmd = list[idx];
                try {
                    cmd?.action?.();
                } catch (e) {
                    console.warn('[CommandPalette] action failed', e);
                }
                closeCommandPalette();
            });
        });
    }

    function handleCommandInput(e) {
        const query = String(e?.target?.value || '').trim().toLowerCase();
        const container = document.getElementById('command-list');
        const base = container?._commands || [];

        if (!query) {
            renderCommandList(base);
            return;
        }

        const filtered = base.filter((cmd) => {
            const hay = `${cmd.name || ''} ${cmd.subtitle || ''} ${cmd.keywords || ''}`.toLowerCase();
            return hay.includes(query);
        });

        renderCommandList(filtered);
    }

    // ============================================
    // QUICK ACTIONS
    // ============================================

    function handleQuickAction(action) {
        closeSearchModal();

        switch (action) {
            case 'new-message':
                openQuickMessage();
                break;
            case 'new-campaign':
                navigateTo('bulk');
                break;
case 'export-data':
                navigateTo('extractor');
                break;
        }
    }



    // ============================================
    // INTERNAL NOTES (used by Contact Context Panel + Command Palette)
    // ============================================

    function openInternalNoteModal() {
        const selectedChatId = StateManager.getState('context.selectedChatId');
        const selectedName = StateManager.getState('context.selectedChatName') || selectedChatId || '';

        const infoLine = selectedChatId
            ? `<div class="help-text" style="margin-bottom:10px;">Anexando esta nota ao contato: <strong>${selectedName}</strong></div>`
            : `<div class="help-text" style="margin-bottom:10px;">Abra um contato na <strong>Inbox</strong> para anexar notas internas.</div>`;

        openModal(
            'Nota interna',
            `
                ${infoLine}
                <div class="field">
                    <label for="internal-note-text">Conteúdo</label>
                    <textarea id="internal-note-text" class="input" rows="6" placeholder="Escreva uma nota que só sua equipe verá..."></textarea>
                    <div class="help-text">Dica: use para contexto, próximos passos e SLA (ex.: "retornar amanhã 10h").</div>
                </div>
            `,
            `
                <button class="btn secondary" onclick="Workspace.closeModal()">Cancelar</button>
                <button class="btn primary" onclick="Workspace.saveInternalNote()">Salvar nota</button>
            `
        );

        setTimeout(() => {
            try { document.getElementById('internal-note-text')?.focus(); } catch(_) {}
        }, 50);
    }

    function storageLocalGet(keys) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get(keys, (res) => resolve(res || {}));
            } catch (e) {
                resolve({});
            }
        });
    }

    function storageLocalSet(obj) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.set(obj, () => {
                    const err = chrome.runtime?.lastError;
                    if (err) reject(new Error(err.message));
                    else resolve(true);
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    async function saveInternalNote() {
        const selectedChatId = StateManager.getState('context.selectedChatId');
        const text = (document.getElementById('internal-note-text')?.value || '').trim();

        if (!selectedChatId) {
            showToast('Selecione um contato na Inbox para anexar a nota.', 'warning');
            return;
        }
        if (!text) {
            showToast('Escreva algum conteúdo para salvar.', 'warning');
            return;
        }

        const KEY = 'whs_internal_notes';
        const res = await storageLocalGet([KEY]);
        const map = (res && res[KEY] && typeof res[KEY] === 'object') ? res[KEY] : {};
        const existing = Array.isArray(map[selectedChatId]) ? map[selectedChatId] : [];

        existing.unshift({
            id: `note_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            ts: Date.now(),
            text
        });

        map[selectedChatId] = existing.slice(0, 200);

        try {
            await storageLocalSet({ [KEY]: map });
            showToast('Nota salva.', 'success');
            closeModal();

            try {
                window.dispatchEvent(new CustomEvent('whs:internalNoteUpdated', {
                    detail: { chatId: selectedChatId }
                }));
            } catch(_) {}
        } catch (e) {
            showToast('Falha ao salvar nota: ' + (e?.message || String(e)), 'error');
        }
    }

    function openQuickMessage() {
        openModal(
            'Nova Mensagem',
            `
            <div class="form-group">
                <label>Destinatário</label>
                <input type="text" id="quick-msg-to" placeholder="Número ou nome do contato" class="input">
            </div>
            <div class="form-group">
                <label>Mensagem</label>
                <textarea id="quick-msg-body" placeholder="Digite sua mensagem..." class="input" rows="4"></textarea>
            </div>
            `,
            `
            <button class="btn secondary" onclick="Workspace.closeModal()">Cancelar</button>
            <button class="btn primary" onclick="Workspace.sendQuickMessage()">Enviar</button>
            `
        );
    }

    async function sendQuickMessage() {
        const to = document.getElementById('quick-msg-to')?.value;
        const body = document.getElementById('quick-msg-body')?.value;

        if (!to || !body) {
            showToast('Preencha todos os campos', 'warning');
            return;
        }

        try {
            await WhatsHybridBridge.sendMessage(to, body);
            showToast('Mensagem enviada!', 'success');
            closeModal();
        } catch (e) {
            showToast('Erro ao enviar: ' + e.message, 'error');
        }
    }

    function openNotifications() {
        const notifications = StateManager.getState('notifications.items');

        let content = '<div class="notifications-list">';

        if (notifications.length === 0) {
            content += '<p class="empty-state">Nenhuma notificação</p>';
        } else {
            notifications.forEach(n => {
                content += `
                    <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
                        <span class="notification-icon">${n.icon || '🔔'}</span>
                        <div class="notification-content">
                            <p class="notification-title">${n.title || ''}</p>
                            <p class="notification-message">${n.message || ''}</p>
                            <span class="notification-time">${formatTime(n.timestamp)}</span>
                        </div>
                    </div>
                `;
            });
        }

        content += '</div>';

        openContextPanel('Notificações', content);

        // Marcar como lidas
        notifications.forEach(n => {
            if (!n.read) StateManager.markNotificationRead(n.id);
        });
    }

    // ============================================
    // WHATSAPP CONNECTION
    // ============================================

    async function connectToWhatsApp() {
        if (!window.WhatsHybridBridge) {
            console.warn('[Workspace] WhatsHybridBridge não disponível');
            // Atualiza estado e UI sem causar loop de eventos
            StateManager.setConnectionStatus('disconnected');
            updateConnectionStatus('disconnected');
            return;
        }

        // Atualiza estado + UI. (O listener de estado também atualiza a UI, mas aqui
        // garantimos feedback imediato mesmo antes de `setupStateListeners()`.)
        StateManager.setConnectionStatus('connecting');
        updateConnectionStatus('connecting');

        try {
            await WhatsHybridBridge.connect();
            StateManager.setConnectionStatus('connected');
            updateConnectionStatus('connected');
        } catch (e) {
            console.error('[Workspace] Erro ao conectar:', e);
            StateManager.setConnectionStatus('disconnected');
            updateConnectionStatus('disconnected');
        }
    }

    async function reconnectWhatsApp() {
        showToast('Reconectando...', 'info');
        await connectToWhatsApp();
    }

    function updateConnectionStatus(status) {
        // IMPORTANTE: esta função atualiza APENAS a UI.
        // O estado deve ser atualizado via `StateManager.setConnectionStatus(...)`.
        // Isso evita recursão infinita quando há um `subscribe('connection.status', ...)`.

        if (elements.connectionStatus) {
            elements.connectionStatus.className = `connection-status ${status}`;
            const textEl = elements.connectionStatus.querySelector('.status-text');
            if (textEl) {
                textEl.textContent =
                    status === 'connected' ? 'Conectado' :
                    status === 'connecting' ? 'Conectando...' : 'Desconectado';
            }
        }
    }

    // ============================================
    // STATE LISTENERS
    // ============================================

    function setupStateListeners() {
        // Sidebar state
        StateManager.subscribe('ui.sidebarCollapsed', (collapsed) => {
            elements.sidebar?.classList.toggle('collapsed', collapsed);
        });

        // Connection status
        StateManager.subscribe('connection.status', (status) => {
            updateConnectionStatus(status);
        });

        // Notifications
        StateManager.subscribe('notifications.unreadCount', (count) => {
            if (elements.notificationCount) {
                elements.notificationCount.textContent = count > 99 ? '99+' : count;
                elements.notificationCount.dataset.count = count;
            }
        });
    }

    // ============================================
    // UTILITIES
    // ============================================

    function refreshCurrentModule() {
        if (currentModule) {
            navigateTo(currentModule, { force: true });
        }
    }

    function toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    }

    async function copyCurrentData() {
        // Copiar dados do módulo atual
        showToast('Funcionalidade em desenvolvimento', 'info');
    }

    function handleBreadcrumbClick(e) {
        if (e.target.dataset.module) {
            e.preventDefault();
            navigateTo(e.target.dataset.module);
        }
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Agora';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m atrás`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
        return date.toLocaleDateString('pt-BR');
    }

    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================

    function showToast(message, type = 'info', duration = 4000) {
        const container = elements.toastContainer;
        if (!container) return;

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <div class="toast-content">
                <span class="toast-message">${message}</span>
            </div>
            <button class="toast-close">✕</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.remove();
        });

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ============================================
    // EXPORT
    // ============================================

    return {
        init,
        navigateTo,
        goBack,
        refreshCurrentModule,
        toggleSidebar,
        openContextPanel,
        closeContextPanel,
        openModal,
        closeModal,
        showToast,
        openSearchModal,
        closeSearchModal,
        openCommandPalette,
        closeCommandPalette,
        connectToWhatsApp,
        reconnectWhatsApp,
        sendQuickMessage,
        openInternalNoteModal,
        saveInternalNote,


        // Getters
        getCurrentModule: () => currentModule,
        isInitialized: () => initialized
    };
})();

// Export para uso global
window.Workspace = Workspace;
