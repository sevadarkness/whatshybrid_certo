/**
 * crm_runtime.js
 * Runtime do CRM - Gerencia estágios, ações automáticas e sincronização
 */

(function() {
  'use strict';

  // Evitar múltiplas instâncias
  if (window.__QUANTUM_CRM_RUNTIME_LOADED__) {
    console.log('[CRMRuntime] Já carregado, ignorando...');
    return;
  }
  window.__QUANTUM_CRM_RUNTIME_LOADED__ = true;

  console.log('[CRMRuntime] Iniciando...');

  /**
   * Classe principal do CRM Runtime
   */
  class CRMRuntime {
    constructor() {
      this.contacts = {};
      this.stages = [];
      this.stageActions = {};
      this.templates = {};
      this.settings = {};
      this.initialized = false;
      this.pendingActions = [];
      this.activityLog = [];
    }

    /**
     * Inicializa o runtime
     */
    async init() {
      if (this.initialized) return;

      console.log('[CRMRuntime] Inicializando...');

      // Carregar dados
      await this.loadData();

      // Configurar listeners
      this.setupEventListeners();
      this.setupMessageListeners();

      // Sincronizar com WhatsApp
      await this.syncWithWhatsApp();

      this.initialized = true;
      console.log('[CRMRuntime] Inicializado com sucesso!');

      // Notificar que está pronto
      this.broadcast('CRM_RUNTIME_READY', { contactsCount: Object.keys(this.contacts).length });
    }

    /**
     * Carrega dados do storage
     */
    async loadData() {
      return new Promise((resolve) => {
        chrome.storage.local.get([
          'quantum_crm_contacts',
          'quantum_crm_stages',
          'quantum_crm_stage_actions',
          'quantum_templates',
          'quantum_crm_settings',
        ], (result) => {
          this.contacts = result.quantum_crm_contacts || {};
          this.stages = result.quantum_crm_stages || (window.CRMSchema && CRMSchema.DefaultStages) || [];
          this.stageActions = result.quantum_crm_stage_actions || {};
          this.templates = result.quantum_templates || {};
          this.settings = result.quantum_crm_settings || {};

          console.log(`[CRMRuntime] Carregados ${Object.keys(this.contacts).length} contatos`);
          resolve();
        });
      });
    }

    /**
     * Salva dados no storage
     */
    async saveContacts() {
      return new Promise((resolve) => {
        chrome.storage.local.set({ 
          quantum_crm_contacts: this.contacts,
        }, resolve);
      });
    }

    /**
     * Salva configurações de estágios
     */
    async saveStages() {
      return new Promise((resolve) => {
        chrome.storage.local.set({ 
          quantum_crm_stages: this.stages,
          quantum_crm_stage_actions: this.stageActions,
        }, resolve);
      });
    }

    /**
     * Configura listeners de eventos
     */
    setupEventListeners() {
      // Escutar mensagens do background/popup
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleExtensionMessage(message, sendResponse);
        return true;
      });
    }

    /**
     * Configura listeners de mensagens (postMessage)
     */
    setupMessageListeners() {
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        // Mensagens do inject.js
        if (event.data?.source === 'QUANTUM_INJECT') {
          this.handleInjectMessage(event.data);
        }

        // Mensagens do dashboard/kanban
        if (event.data?.source === 'QUANTUM_KANBAN') {
          this.handleKanbanMessage(event.data);
        }
      });

      // Eventos customizados
      document.addEventListener('quantum:crm:stage_change', (e) => {
        this.handleStageChange(e.detail);
      });
    }

    /**
     * Sincroniza contatos com WhatsApp
     */
    async syncWithWhatsApp() {
      console.log('[CRMRuntime] Sincronizando com WhatsApp...');

      // Solicitar lista de chats do inject.js
      window.postMessage({
        source: 'QUANTUM_CRM',
        action: 'GET_ALL_CHATS',
      }, '*');
    }

    /**
     * Processa mensagem da extensão
     */
    handleExtensionMessage(message, sendResponse) {
      switch (message.type) {
        case 'GET_CRM_CONTACTS':
          sendResponse({ contacts: this.contacts });
          break;

        case 'GET_CRM_CONTACT':
          sendResponse({ contact: this.contacts[message.chatId] });
          break;

        case 'UPDATE_CONTACT_STAGE':
          this.changeStage(message.chatId, message.newStage, message.options)
            .then(result => sendResponse(result));
          return true; // Manter canal aberto

        case 'CREATE_CONTACT':
          this.createOrUpdateContact(message.chatId, message.data)
            .then(result => sendResponse(result));
          return true;

        case 'DELETE_CONTACT':
          this.deleteContact(message.chatId)
            .then(result => sendResponse(result));
          return true;

        case 'GET_STAGES':
          sendResponse({ stages: this.stages });
          break;

        case 'UPDATE_STAGES':
          this.stages = message.stages;
          this.saveStages().then(() => sendResponse({ success: true }));
          return true;

        case 'GET_STAGE_ACTIONS':
          sendResponse({ actions: this.stageActions });
          break;

        case 'UPDATE_STAGE_ACTIONS':
          this.stageActions = message.actions;
          this.saveStages().then(() => sendResponse({ success: true }));
          return true;

        case 'SYNC_WITH_WHATSAPP':
          this.syncWithWhatsApp().then(() => sendResponse({ success: true }));
          return true;

        case 'GET_CRM_STATS':
          sendResponse(this.getStats());
          break;

        case 'BULK_UPDATE_STAGE':
          this.bulkUpdateStage(message.chatIds, message.newStage)
            .then(result => sendResponse(result));
          return true;

        default:
          // ignorar tipos desconhecidos
          break;
      }
    }

    /**
     * Processa mensagem do inject.js
     */
    handleInjectMessage(data) {
      switch (data.type) {
        case 'CHATS_LIST':
          this.processChatsFromWhatsApp(data.chats || []);
          break;

        case 'CHAT_UPDATED':
          if (data.chat) this.updateContactFromWhatsApp(data.chat);
          break;

        case 'NEW_MESSAGE':
          if (data.message) this.handleNewMessage(data.message);
          break;
      }
    }

    /**
     * Processa mensagem do Kanban
     */
    handleKanbanMessage(data) {
      switch (data.action) {
        case 'MOVE_CARD':
          this.changeStage(data.chatId, data.newStage, {
            previousStage: data.previousStage,
            triggeredBy: 'kanban',
          });
          break;

        case 'UPDATE_CONTACT':
          this.createOrUpdateContact(data.chatId, data.data);
          break;

        case 'REQUEST_CONTACTS':
          this.broadcastContacts();
          break;
      }
    }

    /**
     * Processa lista de chats do WhatsApp
     */
    processChatsFromWhatsApp(chats) {
      console.log(`[CRMRuntime] Processando ${chats.length} chats do WhatsApp`);

      for (const chat of chats) {
        const chatId = chat.id?._serialized || chat.id;
        if (!chatId) continue;

        if (!this.contacts[chatId]) {
          // Novo contato - criar com estágio inicial
          this.contacts[chatId] = (window.CRMSchema && CRMSchema.createContact)
            ? CRMSchema.createContact(chatId, {
                name: chat.name || chat.pushname || '',
                pushname: chat.pushname || '',
                lastMessageAt: chat.lastMessage?.timestamp,
              })
            : {
                id: chatId,
                chatId: chatId,
                name: chat.name || chat.pushname || '',
                stage: 'new',
                createdAt: new Date().toISOString(),
              };
        } else {
          // Atualizar informações existentes
          const contact = this.contacts[chatId];
          contact.name = chat.name || contact.name;
          contact.pushname = chat.pushname || contact.pushname;
          contact.lastMessageAt = chat.lastMessage?.timestamp || contact.lastMessageAt;
          contact.updatedAt = new Date().toISOString();
        }
      }

      this.saveContacts();
      this.broadcastContacts();
      this.requestBadgeUpdate();
    }

    /**
     * Atualiza contato a partir de dados do WhatsApp
     */
    updateContactFromWhatsApp(chat) {
      const chatId = chat.id?._serialized || chat.id;
      if (!chatId || !this.contacts[chatId]) return;

      const contact = this.contacts[chatId];
      contact.name = chat.name || contact.name;
      contact.pushname = chat.pushname || contact.pushname;
      contact.updatedAt = new Date().toISOString();

      this.saveContacts();
      this.broadcastContactUpdate(chatId);
    }

    /**
     * Processa nova mensagem
     */
    handleNewMessage(message) {
      const chatId = message.chatId || message.from || message.to;
      if (!chatId) return;

      if (!this.contacts[chatId]) {
        // Criar novo contato
        this.createOrUpdateContact(chatId, {
          name: message.notifyName || message.pushname || '',
          pushname: message.pushname || '',
          lastMessageAt: new Date().toISOString(),
        });
        return;
      }

      const contact = this.contacts[chatId];
      contact.lastMessageAt = new Date().toISOString();
      contact.messagesCount = (contact.messagesCount || 0) + 1;

      if (!message.fromMe) {
        contact.lastContactAt = new Date().toISOString();
      }

      this.saveContacts();
      this.broadcastContactUpdate(chatId);
    }

    /**
     * Cria ou atualiza um contato
     */
    async createOrUpdateContact(chatId, data = {}) {
      const isNew = !this.contacts[chatId];

      if (isNew) {
        this.contacts[chatId] = (window.CRMSchema && CRMSchema.createContact)
          ? CRMSchema.createContact(chatId, data)
          : {
              id: chatId,
              chatId: chatId,
              stage: data.stage || 'new',
              createdAt: new Date().toISOString(),
              ...data,
            };
      } else {
        Object.assign(this.contacts[chatId], data, {
          updatedAt: new Date().toISOString(),
        });
      }

      await this.saveContacts();

      // Notificar
      this.broadcastContactUpdate(chatId);
      this.requestBadgeUpdate();

      // Log de atividade
      this.logActivity(chatId, isNew ? 'contact_created' : 'contact_updated', data);

      return { success: true, contact: this.contacts[chatId], isNew };
    }

    /**
     * Muda o estágio de um contato
     */
    async changeStage(chatId, newStage, options = {}) {
      if (!chatId || !newStage) {
        return { success: false, error: 'chatId ou newStage inválido' };
      }

      const isNew = !this.contacts[chatId];
      if (isNew) {
        await this.createOrUpdateContact(chatId, { stage: newStage });
        return { success: true, contact: this.contacts[chatId] };
      }

      const contact = this.contacts[chatId];
      const previousStage = contact.stage;

      // Se é o mesmo estágio, não fazer nada
      if (previousStage === newStage && !options.force) {
        return { success: true, contact: contact, noChange: true };
      }

      console.log(`[CRMRuntime] Mudando estágio de ${chatId}: ${previousStage} -> ${newStage}`);

      // Atualizar contato
      contact.previousStage = previousStage;
      contact.stage = newStage;
      contact.updatedAt = new Date().toISOString();

      // Salvar
      await this.saveContacts();

      // Contexto para ações
      const context = {
        chatId: chatId,
        contact: contact,
        previousStage: previousStage,
        newStage: newStage,
        triggeredBy: options.triggeredBy || 'manual',
      };

      // Executar ações de saída do estágio anterior
      await this.executeStageActions(previousStage, 'onExit', context);

      // Executar ações de entrada no novo estágio
      await this.executeStageActions(newStage, 'onEnter', context);

      // Notificar todos os listeners
      this.broadcastStageChange(chatId, previousStage, newStage);
      this.broadcastContactUpdate(chatId);
      this.requestBadgeUpdate();

      // Log de atividade
      this.logActivity(chatId, 'stage_change', {
        previousStage,
        newStage,
        triggeredBy: options.triggeredBy,
      });

      // Disparar evento para flows
      document.dispatchEvent(new CustomEvent('quantum:crm:stage_changed', {
        detail: context,
      }));

      return { success: true, contact: contact, previousStage, newStage };
    }

    /**
     * Executa ações configuradas para um estágio
     */
    async executeStageActions(stageId, trigger, context) {
      if (!stageId) return;

      // Buscar estágio
      const stage = this.stages.find(s => s.id === stageId);
      if (!stage) return;

      // Ações definidas no estágio
      const stageDefinedActions = stage.actions?.[trigger] || [];

      // Ações customizadas
      const customActions = this.stageActions[`${stageId}_${trigger}`] || [];

      // Combinar ações
      const allActions = [...stageDefinedActions, ...customActions];

      if (allActions.length === 0) return;

      console.log(`[CRMRuntime] Executando ${allActions.length} ações para ${stageId}.${trigger}`);

      // Converter strings para objetos de ação
      const actionObjects = allActions.map(action => {
        if (typeof action === 'string') {
          return { type: action, enabled: true, config: {} };
        }
        return action;
      });

      // Executar via CRMActions
      if (window.CRMActions && CRMActions.executeActions) {
        try {
          return await CRMActions.executeActions(actionObjects, context);
        } catch (e) {
          console.error('[CRMRuntime] Erro ao executar ações de estágio:', e);
        }
      } else {
        // Fallback mínimo
        for (const action of actionObjects) {
          if (!action.enabled) continue;
          await this.executeActionFallback(action, context);
        }
      }
    }

    /**
     * Executa uma ação individual (fallback mínimo)
     */
    async executeActionFallback(action, context) {
      const { chatId } = context;

      switch (action.type) {
        case 'send_message':
          this.sendToInject('SEND_MESSAGE', {
            chatId,
            content: this.interpolate(action.config?.message || '', context),
          });
          break;

        case 'mark_as_read':
          this.sendToInject('MARK_AS_READ', { chatId });
          break;

        case 'mark_as_unread':
          this.sendToInject('MARK_AS_UNREAD', { chatId });
          break;

        case 'archive_chat':
          this.sendToInject('ARCHIVE_CHAT', { chatId });
          break;

        case 'unarchive_chat':
          this.sendToInject('UNARCHIVE_CHAT', { chatId });
          break;

        case 'pin_chat':
          this.sendToInject('PIN_CHAT', { chatId });
          break;

        case 'unpin_chat':
          this.sendToInject('UNPIN_CHAT', { chatId });
          break;

        default:
          console.warn('[CRMRuntime] Ação fallback desconhecida:', action.type);
      }
    }

    /**
     * Atualização em massa de estágios
     */
    async bulkUpdateStage(chatIds, newStage) {
      const results = [];

      for (const chatId of chatIds || []) {
        const result = await this.changeStage(chatId, newStage, { triggeredBy: 'bulk' });
        results.push({ chatId, ...result });
      }

      return { success: true, results };
    }

    /**
     * Deleta um contato
     */
    async deleteContact(chatId) {
      if (!this.contacts[chatId]) {
        return { success: false, error: 'Contato não encontrado' };
      }

      delete this.contacts[chatId];
      await this.saveContacts();

      this.broadcast('CRM_CONTACT_DELETED', { chatId });
      this.requestBadgeUpdate();

      return { success: true };
    }

    /**
     * Obtém estatísticas do CRM
     */
    getStats() {
      const contacts = Object.values(this.contacts);
      const stageCount = {};

      for (const stage of this.stages) {
        stageCount[stage.id] = 0;
      }

      let totalValue = 0;

      for (const contact of contacts) {
        if (stageCount[contact.stage] !== undefined) {
          stageCount[contact.stage]++;
        }
        totalValue += contact.value || 0;
      }

      return {
        totalContacts: contacts.length,
        stageCount,
        totalValue,
        stages: this.stages,
      };
    }

    /**
     * Envia comando para inject.js
     */
    sendToInject(action, data) {
      window.postMessage({
        source: 'QUANTUM_CRM',
        action: action,
        ...data,
      }, '*');
    }

    /**
     * Broadcast para todos os listeners
     */
    broadcast(type, data) {
      // Via postMessage
      window.postMessage({
        source: 'QUANTUM_CRM_RUNTIME',
        type: type,
        data: data,
      }, '*');

      // Via chrome.runtime para outras partes da extensão
      try {
        chrome.runtime.sendMessage({
          type: type,
          data: data,
        });
      } catch (e) {
        // Ignorar se não houver listeners
      }

      // Via CustomEvent
      document.dispatchEvent(new CustomEvent(`quantum:crm:${type.toLowerCase()}`, {
        detail: data,
      }));
    }

    /**
     * Broadcast de todos os contatos
     */
    broadcastContacts() {
      this.broadcast('CRM_CONTACTS_UPDATED', { 
        contacts: this.contacts,
        stages: this.stages,
      });
    }

    /**
     * Broadcast de atualização de contato
     */
    broadcastContactUpdate(chatId) {
      this.broadcast('CRM_CONTACT_UPDATED', { 
        chatId,
        contact: this.contacts[chatId],
      });
    }

    /**
     * Broadcast de mudança de estágio
     */
    broadcastStageChange(chatId, previousStage, newStage) {
      this.broadcast('CRM_STAGE_CHANGED', {
        chatId,
        previousStage,
        newStage,
        contact: this.contacts[chatId],
      });
    }

    /**
     * Solicita atualização dos badges visuais
     */
    requestBadgeUpdate() {
      this.broadcast('CRM_UPDATE_BADGES', {
        contacts: this.contacts,
        stages: this.stages,
      });
    }

    /**
     * Registra atividade
     */
    logActivity(chatId, type, data) {
      const activity = (window.CRMSchema && CRMSchema.createActivity)
        ? CRMSchema.createActivity(type, { chatId, ...data })
        : {
            id: Date.now().toString(),
            type,
            chatId,
            data,
            timestamp: new Date().toISOString(),
          };

      this.activityLog.push(activity);

      // Manter apenas últimas 1000 atividades
      if (this.activityLog.length > 1000) {
        this.activityLog = this.activityLog.slice(-1000);
      }

      // Salvar periodicamente
      this.saveActivityLog();
    }

    /**
     * Salva log de atividades (debounce)
     */
    async saveActivityLog() {
      if (this._saveActivityTimeout) {
        clearTimeout(this._saveActivityTimeout);
      }

      this._saveActivityTimeout = setTimeout(() => {
        chrome.storage.local.set({ quantum_crm_activity_log: this.activityLog });
      }, 5000);
    }

    /**
     * Interpola variáveis
     */
    interpolate(template, context) {
      if (!template || typeof template !== 'string') return template;

      return template.replace(/\{\{([^^}]+)\}\}/g, (match, path) => {
        const parts = path.trim().split('.');
        let value = context;

        for (const part of parts) {
          value = value?.[part];
          if (value === undefined) return match;
        }

        return String(value);
      });
    }
  }

  // Criar instância global
  window.__QUANTUM_CRM_RUNTIME__ = new CRMRuntime();

  // Inicializar quando DOM estiver pronto
  if (document.readyState === 'complete') {
    window.__QUANTUM_CRM_RUNTIME__.init();
  } else {
    window.addEventListener('load', () => {
      window.__QUANTUM_CRM_RUNTIME__.init();
    });
  }

})();
