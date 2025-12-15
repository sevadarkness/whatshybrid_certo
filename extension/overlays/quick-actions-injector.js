// overlays/quick-actions-injector.js
// Injeção de botões de ação rápida (resiliente) com SelectorEngine + posicionamento responsivo

const QuickActionsInjector = (function() {
    'use strict';

    // ============================================
    // CONFIGURAÇÃO
    // ============================================

    const CONFIG = {
        recheckInterval: 2000,
        debounceDelay: 300
    };

    // ============================================
    // AÇÕES RÁPIDAS (mantidas + aprimoradas)
    // ============================================

    const QUICK_ACTIONS = {
        addLabel: {
            id: 'add-label',
            icon: '🏷️',
            label: 'Rótulo',
            dynamic: true,
            loadItems: loadLabels
        },
        moveStage: {
            id: 'move-stage',
            icon: '📊',
            label: 'Estágio',
            dynamic: true,
            loadItems: loadCRMStages
        },
        assignAgent: {
            id: 'assign-agent',
            icon: '👤',
            label: 'Atribuir',
            dynamic: true,
            loadItems: loadTeamMembers,
            requiresTeam: true
        },
        setFollowUp: {
            id: 'followup',
            icon: '⏰',
            label: 'Follow-up',
            submenu: [
                { id: 'followup-1h', label: 'Em 1 hora', delay: 3600000 },
                { id: 'followup-3h', label: 'Em 3 horas', delay: 10800000 },
                { id: 'followup-tomorrow', label: 'Amanhã', delay: 86400000 },
                { id: 'followup-week', label: 'Em 1 semana', delay: 604800000 },
                { id: 'followup-custom', label: 'Personalizado...', custom: true }
            ]
        },
        addNote: {
            id: 'add-note',
            icon: '📝',
            label: 'Nota'
        },
        more: {
            id: 'more',
            icon: '⋯',
            label: 'Mais',
            submenu: [
                { id: 'full-backup', icon: '💾', label: 'Backup completo (ZIP + Bloqueados)' },
                { id: 'export-chat', icon: '📥', label: 'Exportar conversa' },
                { id: 'view-profile', icon: '👁️', label: 'Ver perfil' },
                { id: 'sync-crm', icon: '🔄', label: 'Sincronizar CRM' },
                { id: 'open-panel', icon: '🧩', label: 'Abrir painel' }
            ]
        }
    };

    // ============================================
    // ESTADO
    // ============================================

    let injected = false;
    let currentChatId = null;
    let observer = null;
    let recheckTimer = null;
    let resizeHandlerBound = false;

    // ============================================
    // HELPERS
    // ============================================

    function toast(type, title, message, opts = {}) {
        // Prefer NotificationCenter
        if (window.NotificationCenter) {
            if (type === 'success') return NotificationCenter.success(title || 'OK', message || '', opts);
            if (type === 'error') return NotificationCenter.error(title || 'Erro', message || '', opts);
            if (type === 'warning') return NotificationCenter.warning(title || 'Atenção', message || '', opts);
            return NotificationCenter.info(title || 'Info', message || '', opts);
        }

        // Fallback OverlayManager
        if (window.OverlayManager && typeof OverlayManager.showToast === 'function') {
            OverlayManager.showToast(message || title || '', type || 'info');
            return null;
        }

        // Fallback Workspace
        if (window.Workspace && typeof Workspace.showToast === 'function') {
            Workspace.showToast(message || title || '', type || 'info');
            return null;
        }

        console.log('[QuickActions]', type, title, message);
        return null;
    }

    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function findChatHeader() {
        if (window.SelectorEngine && typeof SelectorEngine.find === 'function') {
            return SelectorEngine.find('chatHeader');
        }
        return document.querySelector('#main header');
    }

    function findMainPanel() {
        if (window.SelectorEngine && typeof SelectorEngine.find === 'function') {
            return SelectorEngine.find('mainPanel');
        }
        return document.querySelector('#main');
    }

    function getActiveChatIdFallback(headerEl) {
        // Tentar título do chat como identificador (fallback)
        try {
            const titleEl = headerEl?.querySelector('span[title], span[dir="auto"]');
            return titleEl?.getAttribute('title') || titleEl?.textContent || null;
        } catch {
            return null;
        }
    }

    function getCurrentChatId() {
        // Prefer SelectorEngine helper
        if (window.SelectorEngine && typeof SelectorEngine.getActiveChat === 'function') {
            const chat = SelectorEngine.getActiveChat();
            return chat?.phone || chat?.title || null;
        }

        // Fallback
        const header = findChatHeader();
        return getActiveChatIdFallback(header);
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    function init() {
        if (injected) return;

        injectStyles();
        setupObserver();
        startRecheckTimer();
        setupResizeHandler();

        injected = true;

        // Se houver EventBus, tentar reinjetar quando WhatsApp ficar pronto
        if (window.EventBus?.on && window.EventBus?.EVENTS?.WHATSAPP_READY) {
            window.EventBus.on(window.EventBus.EVENTS.WHATSAPP_READY, () => {
                checkAndInject();
            });
        }

        // Melhor esforço inicial
        checkAndInject();

        console.log('[QuickActions] Inicializado');
    }

    function setupObserver() {
        const mainPanel = findMainPanel();

        if (!mainPanel) {
            setTimeout(setupObserver, 1000);
            return;
        }

        const debounced = debounce(checkAndInject, CONFIG.debounceDelay);

        observer = new MutationObserver(() => debounced());
        observer.observe(mainPanel, { childList: true, subtree: true });
    }

    function startRecheckTimer() {
        recheckTimer = setInterval(() => {
            const header = findChatHeader();
            const existing = document.querySelector('.quantum-quick-actions');

            if (header && !existing) {
                checkAndInject();
            }
        }, CONFIG.recheckInterval);
    }

    function setupResizeHandler() {
        if (resizeHandlerBound) return;
        resizeHandlerBound = true;

        window.addEventListener('resize', debounce(() => {
            const container = document.querySelector('.quantum-quick-actions');
            if (container) applyResponsiveClass(container);
        }, 200));
    }

    // ============================================
    // INJEÇÃO
    // ============================================

    function checkAndInject() {
        const header = findChatHeader();
        if (!header) return;

        // Já existe?
        if (header.parentElement?.querySelector('.quantum-quick-actions')) return;

        const newChatId = getCurrentChatId();
        if (newChatId !== currentChatId) currentChatId = newChatId;

        injectQuickActionsBar(header);
    }

    function applyResponsiveClass(container) {
        container.classList.remove('compact', 'medium', 'full');
        const width = window.innerWidth;

        if (width < 768) container.classList.add('compact');
        else if (width < 1024) container.classList.add('medium');
        else container.classList.add('full');
    }

    function injectQuickActionsBar(header) {
        // Remover existente próximo
        const existing = header.parentElement?.querySelector('.quantum-quick-actions');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'quantum-quick-actions';
        applyResponsiveClass(container);

        container.innerHTML = `
            <div class="quick-actions-bar">
                ${Object.values(QUICK_ACTIONS).map(action => `
                    <button class="quick-action-btn" data-action="${action.id}" title="${action.label}">
                        <span class="action-icon">${action.icon}</span>
                        <span class="action-label">${action.label}</span>
                        ${action.submenu || action.dynamic ? '<span class="action-arrow">▾</span>' : ''}
                    </button>
                `).join('')}
            </div>
        `;

        // Inserir após o header
        header.parentNode.insertBefore(container, header.nextSibling);

        bindEvents(container);
        console.log('[QuickActions] Barra injetada');
    }

    function bindEvents(container) {
        container.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const actionId = btn.dataset.action;
                const action = Object.values(QUICK_ACTIONS).find(a => a.id === actionId);

                if (!action) return;

                if (action.submenu) {
                    showSubmenu(btn, action.submenu, actionId);
                    return;
                }

                if (action.dynamic) {
                    await showDynamicSubmenu(btn, action);
                    return;
                }

                await executeAction(actionId);
            });
        });
    }

    // ============================================
    // SUBMENUS
    // ============================================

    function closeAllSubmenus() {
        document.querySelectorAll('.quantum-submenu').forEach(el => el.remove());
    }

    function showSubmenu(button, items, parentId) {
        closeAllSubmenus();

        const submenu = document.createElement('div');
        submenu.className = 'quantum-submenu';
        submenu.innerHTML = items.map(item => `
            <button class="submenu-item" data-action="${item.id}" data-parent="${parentId}">
                ${item.icon ? `<span class="item-icon">${item.icon}</span>` : ''}
                <span class="item-label">${item.label}</span>
            </button>
        `).join('');

        // Inserir (inicialmente invisível) para medir
        submenu.style.opacity = '0';
        submenu.style.position = 'fixed';
        submenu.style.left = '0px';
        submenu.style.top = '0px';
        document.body.appendChild(submenu);

        // Calcular posição real
        const pos = calculateSubmenuPosition(button.getBoundingClientRect(), submenu);
        submenu.style.left = `${pos.left}px`;
        submenu.style.top = `${pos.top}px`;
        submenu.style.opacity = '1';

        // Bind clicks
        submenu.querySelectorAll('.submenu-item').forEach(itemBtn => {
            itemBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const itemId = itemBtn.dataset.action;
                const parent = itemBtn.dataset.parent;
                const itemData = items.find(i => i.id === itemId) || null;

                await executeAction(parent, itemData);
                closeAllSubmenus();
            });
        });

        // Fechar ao clicar fora
        setTimeout(() => {
            document.addEventListener('click', closeAllSubmenus, { once: true });
        }, 0);
    }

    function calculateSubmenuPosition(buttonRect, submenu) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const submenuWidth = submenu.offsetWidth || 220;
        const submenuHeight = submenu.offsetHeight || 280;

        let left = buttonRect.left;
        let top = buttonRect.bottom + 6;

        // Ajuste direita
        if (left + submenuWidth > viewportWidth - 16) {
            left = Math.max(16, viewportWidth - submenuWidth - 16);
        }

        // Ajuste baixo
        if (top + submenuHeight > viewportHeight - 16) {
            top = buttonRect.top - submenuHeight - 6;
        }

        // Clamp
        left = Math.max(16, Math.min(left, viewportWidth - submenuWidth - 16));
        top = Math.max(16, Math.min(top, viewportHeight - submenuHeight - 16));

        return { top, left };
    }

    async function showDynamicSubmenu(button, action) {
        const rect = button.getBoundingClientRect();

        // Loading
        closeAllSubmenus();
        const loading = document.createElement('div');
        loading.className = 'quantum-submenu loading';
        loading.innerHTML = '<div class="submenu-loading"><div class="spinner"></div> Carregando...</div>';
        loading.style.position = 'fixed';
        loading.style.left = `${rect.left}px`;
        loading.style.top = `${rect.bottom + 6}px`;
        document.body.appendChild(loading);

        try {
            // Exigência de time (plano)
            if (action.requiresTeam) {
                const allowed = !!SubscriptionManager?.getFeature?.('team');
                if (!allowed) {
                    loading.remove();
                    toast('warning', 'Recurso Bloqueado', 'Disponível a partir do plano Pro', {
                        action: {
                            label: 'Ver planos',
                            callback: () => window.SubscriptionUI?.showUpgradeModal('plan_required', 'pro')
                        }
                    });
                    return;
                }
            }

            const items = await action.loadItems();
            loading.remove();

            if (!items || items.length === 0) {
                toast('info', 'Sem itens', 'Não há itens disponíveis');
                return;
            }

            showSubmenu(button, items, action.id);

        } catch (error) {
            console.error('[QuickActions] Erro submenu dinâmico:', error);
            loading.innerHTML = '<div class="submenu-error">❌ Erro ao carregar</div>';
            setTimeout(() => loading.remove(), 2000);
        }
    }

    // ============================================
    // EXECUÇÃO
    // ============================================

    async function executeAction(actionId, itemData = null) {
        // FeatureGate (se existir)
        if (window.FeatureGate?.check) {
            const checkKey = `action:${actionId}`;
            const perm = FeatureGate.check(checkKey);
            if (perm && perm.allowed === false) {
                FeatureGate.handleBlocked?.(checkKey, perm);
                return;
            }
        }

        try {
            switch (actionId) {
                // MENU PRINCIPAL
                case 'add-label':
                    // itemData: {id,label,color}
                    await addLabelToChat(itemData?.id);
                    break;

                case 'move-stage':
                    await moveToStage(itemData?.id);
                    break;

                case 'assign-agent':
                    await assignAgent(itemData?.id);
                    break;

                case 'followup':
                    await scheduleFollowUp(itemData);
                    break;

                case 'add-note':
                    showAddNoteModal();
                    break;

                case 'more':
                    // é submenu; nada aqui
                    break;

                // ITENS DE SUBMENU "more"
                case 'full-backup':
                    if (window.WppBackupTool?.start) {
                        await window.WppBackupTool.start();
                    } else {
                        toast('error', 'Backup indisponível', 'Módulo de backup não carregado');
                    }
                    break;

                case 'export-chat':
                    await exportCurrentChat();
                    break;

                case 'view-profile':
                    await viewProfile();
                    break;

                case 'sync-crm':
                    await syncCRM();
                    break;

                case 'open-panel':
                    await openPanel();
                    break;

                default:
                    // Subitens do followup (quando chamado direto)
                    if (actionId && actionId.startsWith('followup-')) {
                        const follow = QUICK_ACTIONS.setFollowUp.submenu.find(i => i.id === actionId);
                        await scheduleFollowUp(follow);
                        break;
                    }

                    console.warn('[QuickActions] Ação desconhecida:', actionId);
            }
        } catch (error) {
            console.error('[QuickActions] Erro na ação:', actionId, error);
            toast('error', 'Erro', error.message || 'Falha ao executar ação');
        }
    }

    // ============================================
    // IMPLEMENTAÇÕES
    // ============================================

    async function getCurrentChatInfo() {
        // Prefer WhatsHybridBridge
        if (window.WhatsHybridBridge?.getCurrentChat) {
            return await WhatsHybridBridge.getCurrentChat();
        }

        // Fallback via SelectorEngine
        if (window.SelectorEngine?.getActiveChat) {
            return SelectorEngine.getActiveChat();
        }

        return {
            id: currentChatId,
            title: currentChatId,
            phone: currentChatId
        };
    }

    async function addLabelToChat(labelId) {
        if (!labelId) return;

        const chat = await getCurrentChatInfo();
        const ok = await WhatsHybridBridge?.addLabel?.(chat, labelId);

        if (ok) toast('success', 'Rótulo adicionado', '');
        else toast('error', 'Erro', 'Falha ao adicionar rótulo');
    }

    async function moveToStage(stageId) {
        if (!stageId) return;

        const chat = await getCurrentChatInfo();
        const ok = await WhatsHybridBridge?.moveToStage?.(chat, stageId);

        if (ok) toast('success', 'Estágio atualizado', '');
        else toast('error', 'Erro', 'Falha ao mover estágio');
    }

    async function assignAgent(agentId) {
        if (!agentId) return;

        const chat = await getCurrentChatInfo();
        const ok = await WhatsHybridBridge?.assignAgent?.(chat, agentId);

        if (ok) toast('success', 'Atribuído', 'Conversa atribuída ao agente');
        else toast('error', 'Erro', 'Falha ao atribuir agente');
    }

    async function scheduleFollowUp(itemData) {
        if (!itemData) return;

        if (itemData.custom) {
            showCustomFollowUpModal();
            return;
        }

        const chat = await getCurrentChatInfo();
        const followUpTime = Date.now() + (itemData.delay || 86400000);

        const ok = await WhatsHybridBridge?.scheduleFollowUp?.(chat, followUpTime);
        if (ok) toast('success', 'Follow-up agendado', itemData.label || '');
        else toast('error', 'Erro', 'Falha ao agendar follow-up');
    }

    async function exportCurrentChat() {
        const chat = await getCurrentChatInfo();
        const messages = await WhatsHybridBridge?.exportChat?.(chat);

        if (!messages) {
            toast('error', 'Erro', 'Falha ao exportar conversa');
            return;
        }

        // Download JSON
        const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_${chat.phone || 'export'}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        toast('success', 'Exportado', 'Conversa baixada');
    }

    async function viewProfile() {
        const chat = await getCurrentChatInfo();
        const profile = await WhatsHybridBridge?.getProfile?.(chat);

        if (profile) {
            const info = `Nome: ${profile.name || '-'}\nTelefone: ${profile.phone || '-'}\nSobre: ${profile.about || '-'}`;
            if (window.NotificationCenter?.alert) {
                await NotificationCenter.alert('Perfil', info.replace(/\n/g, '<br>'));
            } else {
                alert(info);
            }
        } else {
            toast('warning', 'Sem dados', 'Perfil não disponível');
        }
    }

    async function syncCRM() {
        toast('info', 'Sincronizando', 'Sincronizando com CRM...');
        const ok = await WhatsHybridBridge?.syncCRM?.();
        if (ok) toast('success', 'Sincronizado', 'CRM atualizado');
        else toast('error', 'Erro', 'Falha ao sincronizar CRM');
    }

    async function openPanel() {
        if (window.Workspace?.togglePanel) {
            Workspace.togglePanel();
            toast('success', 'Painel', 'Abrindo painel');
            return;
        }

        // fallback: evento
        if (window.EventBus?.emit) {
            window.EventBus.emit('ui:open_panel', {});
        }

        toast('info', 'Painel', 'Comando enviado para abrir painel');
    }

    function showAddNoteModal() {
        toast('info', 'Em breve', 'Funcionalidade de notas em desenvolvimento');
    }

    function showCustomFollowUpModal() {
        toast('info', 'Em breve', 'Follow-up personalizado em desenvolvimento');
    }

    // ============================================
    // LOADERS
    // ============================================

    async function loadCRMStages() {
        try {
            const result = await chrome.storage.local.get('crmStages');
            const stages = result.crmStages;
            if (Array.isArray(stages) && stages.length) {
                return stages.map(s => ({ id: s.id, label: s.label || s.name || 'Stage' }));
            }
        } catch {}

        // fallback
        return [
            { id: '1', label: 'Novo' },
            { id: '2', label: 'Em contato' },
            { id: '3', label: 'Proposta' },
            { id: '4', label: 'Fechado' }
        ];
    }

    async function loadLabels() {
        try {
            const labels = await WhatsHybridBridge?.getLabels?.();
            if (Array.isArray(labels)) return labels;
        } catch {}

        return [
            { id: '1', label: 'Cliente VIP' },
            { id: '2', label: 'Suporte' }
        ];
    }

    async function loadTeamMembers() {
        try {
            const members = SubscriptionManager?.getTeamMembers?.();
            if (Array.isArray(members) && members.length) {
                return members.map(m => ({ id: m.id, label: m.name || m.email || 'Membro' }));
            }
        } catch {}

        return [
            { id: 'me', label: 'Eu' }
        ];
    }

    // ============================================
    // ESTILOS
    // ============================================

    function injectStyles() {
        if (document.getElementById('quantum-quick-actions-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'quantum-quick-actions-styles';
        styles.textContent = `
            .quantum-quick-actions {
                background: #111b21;
                border-bottom: 1px solid #2a3942;
                padding: 8px 16px;
                position: relative;
                z-index: 100;
            }

            .quick-actions-bar {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                align-items: center;
            }

            .quick-action-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                background: #202c33;
                border: none;
                border-radius: 20px;
                color: #e9edef;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
            }

            .quick-action-btn:hover {
                background: #2a3942;
                transform: translateY(-1px);
            }

            .quick-action-btn:active {
                transform: translateY(0);
            }

            .quick-action-btn .action-icon { font-size: 14px; }
            .quick-action-btn .action-arrow { font-size: 10px; opacity: 0.6; margin-left: 2px; }

            /* Responsivo */
            .quantum-quick-actions.compact .action-label { display: none; }
            .quantum-quick-actions.compact .quick-action-btn { padding: 8px 10px; }

            .quantum-quick-actions.medium .quick-action-btn { padding: 6px 10px; }
            .quantum-quick-actions.medium .action-label {
                max-width: 72px;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Submenu */
            .quantum-submenu {
                position: fixed;
                background: #202c33;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
                padding: 4px;
                z-index: 100001;
                min-width: 180px;
                max-width: 300px;
                max-height: 320px;
                overflow-y: auto;
                animation: submenuIn 0.15s ease;
            }

            @keyframes submenuIn {
                from { opacity: 0; transform: translateY(-8px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .submenu-item {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                padding: 10px 12px;
                background: none;
                border: none;
                border-radius: 6px;
                color: #e9edef;
                font-size: 13px;
                cursor: pointer;
                text-align: left;
                transition: background 0.15s;
            }

            .submenu-item:hover { background: #2a3942; }
            .submenu-item .item-icon { width: 18px; text-align: center; }

            .submenu-loading,
            .submenu-error {
                padding: 20px;
                text-align: center;
                color: #8696a0;
                font-size: 13px;
            }

            .submenu-loading .spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid #3a4a54;
                border-top-color: #8b5cf6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 8px;
                vertical-align: middle;
            }

            @keyframes spin { to { transform: rotate(360deg); } }

            .submenu-error { color: #ea0038; }

            /* Scrollbar */
            .quantum-submenu::-webkit-scrollbar { width: 6px; }
            .quantum-submenu::-webkit-scrollbar-track { background: transparent; }
            .quantum-submenu::-webkit-scrollbar-thumb { background: #3a4a54; border-radius: 3px; }
        `;

        document.head.appendChild(styles);
    }

    // ============================================
    // CLEANUP
    // ============================================

    function destroy() {
        try {
            if (observer) {
                observer.disconnect();
                observer = null;
            }

            if (recheckTimer) {
                clearInterval(recheckTimer);
                recheckTimer = null;
            }

            document.querySelectorAll('.quantum-quick-actions, .quantum-submenu').forEach(el => el.remove());

        } finally {
            injected = false;
        }
    }

    // ============================================
    // EXPORT
    // ============================================

    return {
        init,
        destroy,
        executeAction,
        QUICK_ACTIONS
    };
})();

window.QuickActionsInjector = QuickActionsInjector;
