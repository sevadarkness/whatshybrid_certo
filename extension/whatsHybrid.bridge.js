// whatsHybrid.bridge.js
// Bridge entre a extensão e o WhatsApp Web - VERSÃO ATUALIZADA

const WhatsHybridBridge = (function() {
    'use strict';

    // ============================================
    // ESTADO
    // ============================================

    let connected = false;
    let whatsappTabId = null;
    const eventListeners = new Map();
    const pendingRequests = new Map();
    let requestId = 0;

    // ============================================
    // CONEXÃO
    // ============================================

    /**
     * Conecta com o WhatsApp Web
     */
    async function connect() {
        console.log('[Bridge] Conectando ao WhatsApp Web...');

        try {
            // Encontrar tab do WhatsApp
            const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });

            if (tabs.length === 0) {
                throw new Error('WhatsApp Web não está aberto. Abra web.whatsapp.com em uma aba.');
            }

            whatsappTabId = tabs[0].id;

            // Verificar se content script (extractor_content) está pronto.
            // IMPORTANTE: o extractor_content filtra por `message.target === 'extractor_content'`.
            // Sem o target, o ping nunca recebe resposta e o Bridge fica sempre "disconnected".
            const response = await sendToContentScript({ target: 'extractor_content', action: 'ping' });

            if (response?.status === 'ok') {
                connected = true;
                emit('connection_status', 'connected');
	                // Integração com EventBus (se disponível)
	                try {
	                    if (window.EventBus?.emit && window.EventBus?.EVENTS?.BRIDGE_CONNECTED) {
	                        window.EventBus.emit(window.EventBus.EVENTS.BRIDGE_CONNECTED, {
	                            tabId: whatsappTabId
	                        });
	                    }
	                } catch (_) {}
                console.log('[Bridge] Conectado com sucesso');
                return true;
            }

            throw new Error('Content script não respondeu');

	        } catch (error) {
            connected = false;
            emit('connection_status', 'disconnected');
            emit('error', { message: error.message });
	            // Integração com EventBus (se disponível)
	            try {
	                if (window.EventBus?.emit && window.EventBus?.EVENTS?.BRIDGE_DISCONNECTED) {
	                    window.EventBus.emit(window.EventBus.EVENTS.BRIDGE_DISCONNECTED, {
	                        error: error?.message || String(error)
	                    });
	                }
	            } catch (_) {}
            throw error;
        }
    }

    /**
     * Desconecta
     */
    function disconnect() {
        connected = false;
        whatsappTabId = null;
        emit('connection_status', 'disconnected');
	        // Integração com EventBus (se disponível)
	        try {
	            if (window.EventBus?.emit && window.EventBus?.EVENTS?.BRIDGE_DISCONNECTED) {
	                window.EventBus.emit(window.EventBus.EVENTS.BRIDGE_DISCONNECTED);
	            }
	        } catch (_) {}
    }

    /**
     * Verifica se está conectado
     */
    function isConnected() {
        return connected;
    }

    // ============================================
    // COMUNICAÇÃO COM CONTENT SCRIPT
    // ============================================

    /**
     * Envia mensagem para content script
     */
    async function sendToContentScript(message, timeout = 30000) {
        if (!whatsappTabId) {
            throw new Error('Não conectado ao WhatsApp Web');
        }

        return new Promise((resolve, reject) => {
            const id = ++requestId;

            const timeoutId = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error('Timeout na comunicação'));
            }, timeout);

            pendingRequests.set(id, { resolve, reject, timeoutId });

            chrome.tabs.sendMessage(whatsappTabId, {
                ...message,
                bridgeRequestId: id
            }, (response) => {
                clearTimeout(timeoutId);
                pendingRequests.delete(id);

                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response?.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response?.error || 'Erro desconhecido'));
                }
            });
        });
    }

    /**
     * Envia mensagem para o background (service worker).
     * Útil para comandos que precisam passar pelo wweb_content.js + inject.js
     * (ex.: enviar mensagens), porque esses retornos NÃO seguem o wrapper
     * {success,data} usado pelo extractor_content.
     */
    async function sendToBackground(message, timeout = 30000) {
        return new Promise((resolve, reject) => {
            let finished = false;
            const t = setTimeout(() => {
                finished = true;
                reject(new Error('Timeout na comunicação com o background'));
            }, timeout);

            try {
                // Usamos callback para compatibilidade ampla.
                const maybePromise = chrome.runtime.sendMessage(message, (response) => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(t);

                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(response);
                });

                // Em alguns ambientes, sendMessage pode retornar Promise.
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise
                        .then((response) => {
                            if (finished) return;
                            finished = true;
                            clearTimeout(t);
                            resolve(response);
                        })
                        .catch((err) => {
                            if (finished) return;
                            finished = true;
                            clearTimeout(t);
                            reject(err);
                        });
                }
            } catch (e) {
                if (finished) return;
                finished = true;
                clearTimeout(t);
                reject(e);
            }
        });
    }

    /**
     * Executa um comando no WhatsApp Web via background -> wweb_content -> inject.
     */
    async function executeWhatsApp(command, timeout = 30000) {
        const response = await sendToBackground({ action: 'execute_script', data: command }, timeout);

        // Padrão de erro do background
        if (response && typeof response === 'object' && response.error) {
            throw new Error(response.error);
        }

        // Padrão de erro do wweb_content/inject
        if (response && typeof response === 'object' && response.success === false) {
            throw new Error(response.error || 'Falha ao executar comando no WhatsApp');
        }

        return response;
    }

    // ============================================
    // EVENTOS
    // ============================================

    /**
     * Registra listener para evento
     */
    function on(event, callback) {
        if (!eventListeners.has(event)) {
            eventListeners.set(event, []);
        }
        eventListeners.get(event).push(callback);

        return () => off(event, callback);
    }

    /**
     * Remove listener
     */
    function off(event, callback) {
        const listeners = eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) listeners.splice(index, 1);
        }
    }

    /**
     * Emite evento
     */
    function emit(event, data) {
        const listeners = eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error('[Bridge] Erro no listener:', e);
                }
            });
        }
    }

    // ============================================
    // API DE CONTATOS
    // ============================================

    /**
     * Obtém todos os contatos
     */
    async function getContacts() {
        return sendToContentScript({
            target: 'extractor_content',
            action: 'extractAllContacts'
        });
    }

    /**
     * Busca contatos
     */
    async function searchContacts(query) {
        const contacts = await getContacts();
        const q = query.toLowerCase();

        return contacts.filter(c => 
            c.name?.toLowerCase().includes(q) ||
            c.number?.includes(q) ||
            c.pushname?.toLowerCase().includes(q)
        );
    }

    /**
     * Obtém contato por ID
     */
    async function getContact(contactId) {
        const contacts = await getContacts();
        return contacts.find(c => c.id === contactId);
    }

    // ============================================
    // API DE CHATS
    // ============================================

    /**
     * Obtém todos os chats
     */
    async function getChats(options = {}) {
        return sendToContentScript({
            target: 'extractor_content',
            action: 'extractAllChats',
            options
        });
    }

    /**
     * Obtém chat por ID
     */
    async function getChat(chatId) {
        const chats = await getChats();
        return chats.find(c => c.id === chatId);
    }

    /**
     * Obtém mensagens de um chat
     */
    async function getChatMessages(chatId, limit = 50) {
        return sendToContentScript({
            target: 'extractor_content',
            action: 'extractChatMessages',
            chatId,
            limit
        });
    }

    // ============================================
    // API DE GRUPOS
    // ============================================

    /**
     * Obtém todos os grupos
     */
    async function getGroups() {
        return sendToContentScript({
            target: 'extractor_content',
            action: 'extractAllGroups'
        });
    }

    /**
     * Obtém participantes de um grupo
     */
    async function getGroupParticipants(groupId) {
        return sendToContentScript({
            target: 'extractor_content',
            action: 'extractGroupParticipants',
            groupId
        });
    }

    // ============================================
    // API DE LABELS
    // ============================================

    /**
     * Obtém todos os labels
     */
    async function getLabels() {
        return sendToContentScript({
            target: 'extractor_content',
            action: 'extractAllLabels'
        });
    }

    // ============================================
    // API DE MENSAGENS
    // ============================================

    function isChatId(value) {
        if (typeof value !== 'string') return false;
        return /@(c\.us|g\.us|s\.whatsapp\.net|broadcast)$/i.test(value.trim());
    }

    function onlyDigits(value) {
        return String(value || '').replace(/[^\d]/g, '');
    }

    /**
     * Tenta resolver o "to" para um chatId do WhatsApp Web.
     * Aceita:
     * - chatId (ex.: 5511999999999@c.us)
     * - número (ex.: +55 11 99999-9999)
     * - nome (tentará buscar nos contatos, se conectado)
     */
    async function resolveChatId(to) {
        if (!to) throw new Error('Destinatário inválido');

        const raw = String(to).trim();
        if (isChatId(raw)) return raw;

        const digits = onlyDigits(raw);
        if (digits.length >= 8) {
            return `${digits}@c.us`;
        }

        // Se não parece número/chatId, tenta resolver por nome nos contatos.
        // Isso depende do extractor_content, então tentamos conectar se necessário.
        if (!connected) {
            try {
                await connect();
            } catch (_) {
                // Ignora aqui para tentar o fallback abaixo
            }
        }

        try {
            const matches = await searchContacts(raw);
            const found = matches?.[0];
            if (found?.id) return found.id;
        } catch (_) {
            // ignora
        }

        throw new Error(
            'Não foi possível identificar o destinatário. Use um número com DDD/país (ex.: 5511999999999) ' +
            'ou um chatId (ex.: 5511999999999@c.us).'
        );
    }

    /**
     * Envia mensagem de texto
     */
    async function sendMessage(to, message, options = {}) {
        if (message === undefined || message === null) {
            throw new Error('Mensagem inválida');
        }

        const chatId = await resolveChatId(to);
        const response = await executeWhatsApp({
            type: 'send_message_to_user',
            data: {
                chatId,
                message: String(message),
                options: options || {}
            }
        });

        return response;
    }

    /**
     * Envia mensagem com mídia
     */
    async function sendMedia(to, mediaUrl, caption = '', options = {}) {
        if (!mediaUrl) throw new Error('mediaUrl é obrigatório');

        // Fallback simples: envia o link (e a legenda) como texto.
        const text = caption ? `${caption}\n${mediaUrl}` : String(mediaUrl);
        return sendMessage(to, text, options);
    }

    /**
     * Envia mensagens em massa
     */
    async function sendBulkMessages(recipients, message, options = {}) {
        const results = [];
        const { delay = 3000, onProgress } = options;

        for (let i = 0; i < recipients.length; i++) {
            try {
                await sendMessage(recipients[i], message);
                results.push({ recipient: recipients[i], success: true });
            } catch (error) {
                results.push({ recipient: recipients[i], success: false, error: error.message });
            }

            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total: recipients.length,
                    percent: Math.round(((i + 1) / recipients.length) * 100)
                });
            }

            // Delay entre mensagens
            if (i < recipients.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return results;
    }

    // ============================================
    // API DE EXTRAÇÃO
    // ============================================

    /**
     * Extrai todos os dados
     */
    async function extractAll(options = {}) {
        return sendToContentScript({
            target: 'extractor_content',
            action: 'extractEverything',
            options
        });
    }

    /**
     * Obtém mensagens apagadas detectadas
     */
    async function getDeletedMessages() {
        return sendToContentScript({
            target: 'extractor_content',
            action: 'getDeletedMessages'
        });
    }

    /**
     * Obtém mensagens editadas detectadas
     */
    async function getEditedMessages() {
        return sendToContentScript({
            target: 'extractor_content',
            action: 'getEditedMessages'
        });
    }

    // ============================================
    // API DE AUTOMAÇÃO
    // ============================================

    /**
     * Cria um flow de automação
     */
    async function createFlow(flowConfig) {
        // Salvar flow no storage
        const flows = await getFlows();
        const newFlow = {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            active: false,
            ...flowConfig
        };

        flows.push(newFlow);
        await chrome.storage.local.set({ automation_flows: flows });

        return newFlow;
    }

    /**
     * Obtém flows salvos
     */
    async function getFlows() {
        const result = await chrome.storage.local.get('automation_flows');
        return result.automation_flows || [];
    }

    /**
     * Atualiza um flow
     */
    async function updateFlow(flowId, updates) {
        const flows = await getFlows();
        const index = flows.findIndex(f => f.id === flowId);

        if (index > -1) {
            flows[index] = { ...flows[index], ...updates };
            await chrome.storage.local.set({ automation_flows: flows });
            return flows[index];
        }

        throw new Error('Flow não encontrado');
    }

    /**
     * Remove um flow
     */
    async function deleteFlow(flowId) {
        const flows = await getFlows();
        const filtered = flows.filter(f => f.id !== flowId);
        await chrome.storage.local.set({ automation_flows: filtered });
    }

    // ============================================
    // API DE CAMPANHAS (BULK)
    // ============================================

    /**
     * Cria uma campanha
     */
    async function createCampaign(campaignConfig) {
        const campaigns = await getCampaigns();
        const newCampaign = {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            status: 'draft',
            stats: {
                total: 0,
                sent: 0,
                delivered: 0,
                read: 0,
                failed: 0
            },
            ...campaignConfig
        };

        campaigns.push(newCampaign);
        await chrome.storage.local.set({ bulk_campaigns: campaigns });

        return newCampaign;
    }

    /**
     * Obtém campanhas
     */
    async function getCampaigns() {
        const result = await chrome.storage.local.get('bulk_campaigns');
        return result.bulk_campaigns || [];
    }

    /**
     * Executa uma campanha
     */
    async function executeCampaign(campaignId, onProgress) {
        const campaigns = await getCampaigns();
        const campaign = campaigns.find(c => c.id === campaignId);

        if (!campaign) throw new Error('Campanha não encontrada');

        // Atualizar status
        await updateCampaign(campaignId, { status: 'running' });

        try {
            const results = await sendBulkMessages(
                campaign.recipients,
                campaign.message,
                {
                    delay: campaign.delay || 3000,
                    onProgress: (progress) => {
                        // Atualizar stats
                        updateCampaign(campaignId, {
                            stats: {
                                ...campaign.stats,
                                sent: progress.current
                            }
                        });

                        if (onProgress) onProgress(progress);
                    }
                }
            );

            // Finalizar
            const successCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;

            await updateCampaign(campaignId, {
                status: 'completed',
                completedAt: new Date().toISOString(),
                stats: {
                    ...campaign.stats,
                    total: results.length,
                    sent: successCount,
                    failed: failedCount
                },
                results
            });

            return results;

        } catch (error) {
            await updateCampaign(campaignId, { status: 'failed', error: error.message });
            throw error;
        }
    }

    /**
     * Atualiza uma campanha
     */
    async function updateCampaign(campaignId, updates) {
        const campaigns = await getCampaigns();
        const index = campaigns.findIndex(c => c.id === campaignId);

        if (index > -1) {
            campaigns[index] = { ...campaigns[index], ...updates };
            await chrome.storage.local.set({ bulk_campaigns: campaigns });
            return campaigns[index];
        }
    }

    // ============================================
    // API DE EQUIPE
    // ============================================

    /**
     * Obtém membros da equipe
     */
    async function getTeamMembers() {
        const result = await chrome.storage.local.get('team_members');
        return result.team_members || [];
    }

    /**
     * Adiciona membro à equipe
     */
    async function addTeamMember(member) {
        const members = await getTeamMembers();
        const newMember = {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            role: 'agent',
            ...member
        };

        members.push(newMember);
        await chrome.storage.local.set({ team_members: members });

        return newMember;
    }

    // ============================================
    // LISTENER DE MENSAGENS DO CONTENT SCRIPT
    // ============================================

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Mensagens do content script do WhatsApp
        if (sender.tab?.url?.includes('web.whatsapp.com')) {
            switch (message.type) {
                case 'NEW_MESSAGE':
                    emit('new_message', message.data);
                    try {
                        if (window.EventBus?.emit && window.EventBus?.EVENTS?.BRIDGE_MESSAGE) {
                            window.EventBus.emit(window.EventBus.EVENTS.BRIDGE_MESSAGE, {
                                type: 'NEW_MESSAGE',
                                data: message.data,
                                sender
                            });
                        }
                    } catch (_) {}
                    break;
                case 'MESSAGE_SENT':
                    emit('message_sent', message.data);
                    try {
                        if (window.EventBus?.emit && window.EventBus?.EVENTS?.BRIDGE_MESSAGE) {
                            window.EventBus.emit(window.EventBus.EVENTS.BRIDGE_MESSAGE, {
                                type: 'MESSAGE_SENT',
                                data: message.data,
                                sender
                            });
                        }
                    } catch (_) {}
                    break;
                case 'MESSAGE_DELETED':
                    emit('message_deleted', message.data);
                    try {
                        if (window.EventBus?.emit && window.EventBus?.EVENTS?.BRIDGE_MESSAGE) {
                            window.EventBus.emit(window.EventBus.EVENTS.BRIDGE_MESSAGE, {
                                type: 'MESSAGE_DELETED',
                                data: message.data,
                                sender
                            });
                        }
                    } catch (_) {}
                    break;
                case 'MESSAGE_EDITED':
                    emit('message_edited', message.data);
                    try {
                        if (window.EventBus?.emit && window.EventBus?.EVENTS?.BRIDGE_MESSAGE) {
                            window.EventBus.emit(window.EventBus.EVENTS.BRIDGE_MESSAGE, {
                                type: 'MESSAGE_EDITED',
                                data: message.data,
                                sender
                            });
                        }
                    } catch (_) {}
                    break;
                case 'CONNECTION_CHANGED':
                    if (message.data.connected) {
                        connected = true;
                        emit('connection_status', 'connected');
                        try {
                            if (window.EventBus?.emit && window.EventBus?.EVENTS?.BRIDGE_CONNECTED) {
                                window.EventBus.emit(window.EventBus.EVENTS.BRIDGE_CONNECTED, {
                                    via: 'content_message',
                                    sender
                                });
                            }
                        } catch (_) {}
                    } else {
                        connected = false;
                        emit('connection_status', 'disconnected');
                        try {
                            if (window.EventBus?.emit && window.EventBus?.EVENTS?.BRIDGE_DISCONNECTED) {
                                window.EventBus.emit(window.EventBus.EVENTS.BRIDGE_DISCONNECTED, {
                                    via: 'content_message',
                                    sender
                                });
                            }
                        } catch (_) {}
                    }
                    break;
            }
        }
    });

    // ============================================
    // EXPORT
    // ============================================

    return {
        // Conexão
        connect,
        disconnect,
        isConnected,

        // Eventos
        on,
        off,
        emit,

        // Contatos
        getContacts,
        searchContacts,
        getContact,

        // Chats
        getChats,
        getChat,
        getChatMessages,

        // Grupos
        getGroups,
        getGroupParticipants,

        // Labels
        getLabels,

        // Mensagens
        sendMessage,
        sendMessageToUser: sendMessage,
        sendMedia,
        sendBulkMessages,

        // Extração
        extractAll,
        getDeletedMessages,
        getEditedMessages,

        // Automação
        createFlow,
        getFlows,
        updateFlow,
        deleteFlow,

        // Campanhas
        createCampaign,
        getCampaigns,
        executeCampaign,
        updateCampaign,

        // Equipe
        getTeamMembers,
        addTeamMember
    };
})();

// Export para uso global
window.WhatsHybridBridge = WhatsHybridBridge;
