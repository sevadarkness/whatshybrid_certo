// workspace/modules/dashboard/dashboard.js

window.DashboardModule = window.DashboardModule || (function() {
    'use strict';

    let container = null;
    let refreshInterval = null;

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    async function init(containerEl) {
        container = containerEl;
        console.log('[Dashboard] Inicializando...');

        await loadData();
        startAutoRefresh();
    }

    function onShow() {
        loadData();
    }

    function onHide() {
        stopAutoRefresh();
    }

    function destroy() {
        stopAutoRefresh();
        container = null;
    }

    // ============================================
    // DADOS
    // ============================================

    async function loadData() {
        try {
            await Promise.all([
                loadStats(),
                loadRecentChats(),
                loadRecentCampaigns(),
                loadActivityFeed()
            ]);
        } catch (error) {
            console.error('[Dashboard] Erro ao carregar dados:', error);
        }
    }

    async function loadStats() {
        try {
            if (window.WhatsHybridBridge?.isConnected()) {
                const [contacts, chats, campaigns, aiState] = await Promise.all([
                    window.WhatsHybridBridge?.getContacts(),
                    window.WhatsHybridBridge?.getChats(),
                    window.WhatsHybridBridge?.getCampaigns(),
                    fetchAiTrainingState()
                ]);

                updateStat('stat-contacts', contacts.length);
                updateStat('stat-chats', chats.filter(c => c.unreadCount > 0).length);
                updateStat('stat-automations', aiState?.metrics?.totalInteractions || 0);

                // Contar mensagens enviadas hoje
                const today = new Date().toDateString();
                const sentToday = campaigns
                    .filter(c => c.completedAt && new Date(c.completedAt).toDateString() === today)
                    .reduce((acc, c) => acc + (c.stats?.sent || 0), 0);
                updateStat('stat-sent', sentToday);
            }
        } catch (error) {
            console.warn('[Dashboard] Erro ao carregar stats:', error);
        }
    }

    

    async function fetchAiTrainingState() {
        try {
            const config = await new Promise((resolve) => {
                try {
                    chrome.storage.sync.get(['backendUrl','extensionKey','licenseKey'], (res) => resolve(res || {}));
                } catch (e) {
                    resolve({});
                }
            });

            const backendUrl = (config.backendUrl || '').toString().trim().replace(/\/$/, '');
            const licenseKey = (config.licenseKey || '').toString().trim();
            const extensionKey = (config.extensionKey || '').toString().trim();

            if (!backendUrl || !licenseKey) return null;

            const resp = await fetch(`${backendUrl}/ai/training/state`, {
                method: 'GET',
                headers: {
                    'x-extension-key': extensionKey || '',
                    'x-license-key': licenseKey
                }
            });

            if (!resp.ok) return null;
            const data = await resp.json().catch(() => null);
            return data;
        } catch (e) {
            return null;
        }
    }

    function updateStat(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = PanelUtils.formatNumber(value);
        }
    }

    async function loadRecentChats() {
        const list = document.getElementById('recent-chats');
        if (!list) return;

        try {
            if (!window.WhatsHybridBridge?.isConnected()) {
                list.innerHTML = '<p class="empty-state">Conecte ao WhatsApp para ver conversas</p>';
                return;
            }

            const chats = await window.WhatsHybridBridge?.getChats();
            const recent = chats.slice(0, 5);

            if (recent.length === 0) {
                list.innerHTML = '<p class="empty-state">Nenhuma conversa</p>';
                return;
            }

            list.innerHTML = recent.map(chat => `
                <div class="chat-item" data-chat-id="${chat.id}">
                    <div class="chat-avatar">${chat.isGroup ? '👥' : '👤'}</div>
                    <div class="chat-info">
                        <span class="chat-name">${chat.name || 'Desconhecido'}</span>
                        <span class="chat-preview">${chat.lastMessage?.body || ''}</span>
                    </div>
                    ${chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount}</span>` : ''}
                </div>
            `).join('');

            // Bind click events
            list.querySelectorAll('.chat-item').forEach(item => {
                item.addEventListener('click', () => {
                    Workspace.navigateTo('chats', { chatId: item.dataset.chatId });
                });
            });

        } catch (error) {
            list.innerHTML = '<p class="empty-state">Erro ao carregar conversas</p>';
        }
    }

    async function loadRecentCampaigns() {
        const list = document.getElementById('recent-campaigns');
        if (!list) return;

        try {
            const campaigns = await window.WhatsHybridBridge?.getCampaigns() || [];
            const recent = campaigns.slice(-5).reverse();

            if (recent.length === 0) {
                list.innerHTML = '<p class="empty-state">Nenhuma campanha</p>';
                return;
            }

            list.innerHTML = recent.map(campaign => `
                <div class="campaign-item">
                    <div class="campaign-info">
                        <span class="campaign-name">${campaign.name || 'Sem nome'}</span>
                        <span class="campaign-date">${PanelUtils.formatDate(campaign.createdAt)}</span>
                    </div>
                    <div class="campaign-stats">
                        <span class="stat-sent">${campaign.stats?.sent || 0} enviadas</span>
                        <span class="campaign-status status-${campaign.status}">${campaign.status}</span>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            list.innerHTML = '<p class="empty-state">Erro ao carregar campanhas</p>';
        }
    }

    async function loadActivityFeed() {
        const list = document.getElementById('activity-feed');
        if (!list) return;

        // Placeholder: poderia ser integrado com eventos reais
        const activities = [
            { icon: '📨', text: 'Campanha "Black Friday" iniciada', time: '5 min atrás' },
            { icon: '🤖', text: 'Automação "Boas-vindas" ativada', time: '1 hora atrás' },
            { icon: '👥', text: '15 novos contatos importados', time: '2 horas atrás' }
        ];

        list.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <span class="activity-icon">${activity.icon}</span>
                <div class="activity-info">
                    <span class="activity-text">${activity.text}</span>
                    <span class="activity-time">${activity.time}</span>
                </div>
            </div>
        `).join('');
    }

    // ============================================
    // AUTO REFRESH
    // ============================================

    function startAutoRefresh() {
        stopAutoRefresh();
        refreshInterval = setInterval(loadData, 30000); // 30 segundos
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    // ============================================
    // AÇÕES
    // ============================================

    async function syncData() {
        Workspace.showToast('Sincronizando dados...', 'info');

        try {
            await loadData();
            Workspace.showToast('Dados sincronizados!', 'success');
        } catch (error) {
            Workspace.showToast('Erro na sincronização', 'error');
        }
    }

    // ============================================
    // EXPORT
    // ============================================

    return {
        init,
        onShow,
        onHide,
        destroy,
        loadData,
        syncData
    };
})();
