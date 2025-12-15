/**
 * flows_runtime.js
 * Runtime de execução de flows no WhatsApp Web
 * Este script é injetado como content script e coordena a execução de automações
 */

(function() {
  'use strict';

  // Evitar múltiplas instâncias
  if (window.__QUANTUM_FLOWS_RUNTIME_LOADED__) {
    console.log('[FlowsRuntime] Já carregado, ignorando...');
    return;
  }
  window.__QUANTUM_FLOWS_RUNTIME_LOADED__ = true;

  console.log('[FlowsRuntime] Iniciando...');

  // Quantidade máxima de mensagens guardadas por chat (para IA / contexto)
  const MAX_MESSAGE_HISTORY = 50;

  /**
   * Classe principal do Runtime
   */
  class FlowsRuntime {
    constructor() {
      this.engine = null;
      this.initialized = false;
      this.eventQueue = [];
      this.processing = false;
      this.silenceTimers = new Map();
      this.chatMessageHistory = new Map(); // Para detectar primeira mensagem
      this.lastActiveChatId = null;
      this.debugMode = false;
    }

    /**
     * Aguarda inject estar pronto
     */
    async waitForInject(timeout = 10000) {
      return new Promise((resolve) => {
        let ready = false;
        
        const handler = (event) => {
          if (event.data?.source === 'QUANTUM_INJECT' && event.data?.type === 'INJECT_READY') {
            ready = true;
            window.removeEventListener('message', handler);
            resolve(true);
          }
        };
        
        window.addEventListener('message', handler);
        
        // Timeout
        setTimeout(() => {
          if (!ready) {
            window.removeEventListener('message', handler);
            console.warn('[FlowsRuntime] Timeout aguardando inject - continuando mesmo assim');
            resolve(false);
          }
        }, timeout);
      });
    }

    /**
     * Inicializa o runtime
     */
    async init() {
      if (this.initialized) return;

      console.log('[FlowsRuntime] Inicializando...');

      // Aguardar inject estar pronto (com timeout)
      const injectReady = await this.waitForInject();
      if (!injectReady) {
        console.warn('[FlowsRuntime] Iniciando sem confirmação do inject - algumas funcionalidades podem não funcionar');
      }

      // Criar instância do engine
      this.engine = new FlowsEngine();
      
      // Carregar flows e histórico
      await this.engine.loadFlows();
      await this.engine.loadExecutionHistory();

      // Configurar listeners
      this.setupEventListeners();
      this.setupMessageListeners();
      this.setupDOMObservers();

      // Iniciar processamento da fila
      this.startQueueProcessor();

      // Iniciar verificação de silêncio
      this.startSilenceChecker();

      // Iniciar scheduler para eventos agendados
      this.startScheduler();

      this.initialized = true;
      console.log('[FlowsRuntime] Inicializado com sucesso!');
      
      // Notificar background
      this.sendToBackground({ type: 'FLOWS_RUNTIME_READY' }, () => {});
    }

    /**
     * Configura listeners de eventos da extensão
     */
    setupEventListeners() {
      // Escutar mensagens do background
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleExtensionMessage(message, sendResponse);
        return true; // Manter canal aberto para resposta assíncrona
      });

      // Escutar eventos do inject.js via postMessage
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.source === 'QUANTUM_INJECT') {
          this.handleInjectEvent(event.data);
        }
      });
    }

    /**
     * Configura listeners para eventos do DOM do WhatsApp
     */
    setupMessageListeners() {
      // Escutar eventos customizados disparados pelo inject.js
      document.addEventListener('quantum:message:received', (e) => {
        this.queueEvent('MESSAGE_RECEIVED', e.detail);
      });

      document.addEventListener('quantum:message:sent', (e) => {
        this.queueEvent('MESSAGE_SENT', e.detail);
      });

      document.addEventListener('quantum:message:deleted', (e) => {
        this.queueEvent('MESSAGE_DELETED', e.detail);
      });

      document.addEventListener('quantum:chat:changed', (e) => {
        this.handleChatChanged(e.detail);
      });

      document.addEventListener('quantum:contact:added', (e) => {
        this.queueEvent('CONTACT_ADDED', e.detail);
      });
    }

    /**
     * Configura observadores do DOM
     */
    setupDOMObservers() {
      // Observer para mudança de chat ativo
      this.observeChatChanges();
      
      // Observer para novas mensagens (fallback)
      this.observeMessages();
    }

    /**
     * Observa mudanças no chat ativo
     */
    observeChatChanges() {
      const checkActiveChat = () => {
        const header = document.querySelector('header span[title]');
        const chatId = this.getCurrentChatId();
        
        if (chatId && chatId !== this.lastActiveChatId) {
          const oldChatId = this.lastActiveChatId;
          this.lastActiveChatId = chatId;
          
          this.handleChatChanged({
            chatId: chatId,
            previousChatId: oldChatId,
            chatName: header?.getAttribute('title') || '',
          });
        }
      };

      // Observar header do chat
      const headerObserver = new MutationObserver(checkActiveChat);
      
      const waitForHeader = setInterval(() => {
        const appWrapper = document.querySelector('#app');
        if (appWrapper) {
          clearInterval(waitForHeader);
          headerObserver.observe(appWrapper, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['title'],
          });
          checkActiveChat();
        }
      }, 1000);
    }

    /**
     * Observa novas mensagens (fallback se inject.js não disparar eventos)
     */
    observeMessages() {
      let lastMessageCount = 0;
      
      const checkNewMessages = () => {
        const messageContainer = document.querySelector('[data-testid="conversation-panel-messages"]');
        if (!messageContainer) return;

        const messages = messageContainer.querySelectorAll('[data-testid="msg-container"]');
        
        if (messages.length > lastMessageCount) {
          // Nova mensagem detectada
          const newMessages = Array.from(messages).slice(lastMessageCount);
          
          for (const msgEl of newMessages) {
            const messageData = this.extractMessageFromDOM(msgEl);
            if (messageData) {
              // Verificar se já foi processada via inject.js
              if (!this.isMessageProcessed(messageData.messageId)) {
                this.queueEvent(
                  messageData.fromMe ? 'MESSAGE_SENT' : 'MESSAGE_RECEIVED',
                  messageData
                );
              }
            }
          }
        }
        
        lastMessageCount = messages.length;
      };

      // Observer para container de mensagens
      const messagesObserver = new MutationObserver(checkNewMessages);
      
      const waitForMessages = setInterval(() => {
        const container = document.querySelector('[data-testid="conversation-panel-messages"]');
        if (container) {
          clearInterval(waitForMessages);
          messagesObserver.observe(container, {
            childList: true,
            subtree: true,
          });
        }
      }, 1000);
    }

    /**
     * Extrai dados de mensagem do elemento DOM
     */
    extractMessageFromDOM(msgEl) {
      try {
        const isOutgoing = msgEl.classList.contains('message-out') || 
                          msgEl.querySelector('[data-testid="msg-meta"] [data-testid="msg-dblcheck"]');
        
        const textEl = msgEl.querySelector('[data-testid="msg-text"], .selectable-text');
        const body = textEl?.textContent || '';
        
        const timeEl = msgEl.querySelector('[data-testid="msg-meta"] span');
        const timestamp = timeEl?.textContent || '';
        
        const chatId = this.getCurrentChatId();
        
        return {
          messageId: msgEl.getAttribute('data-id') || `dom_${Date.now()}`,
          chatId: chatId,
          body: body,
          fromMe: !!isOutgoing,
          timestamp: timestamp,
          type: 'chat',
          hasMedia: !!msgEl.querySelector('[data-testid="image-thumb"], [data-testid="video-thumb"], [data-testid="audio-player"]'),
        };
      } catch (e) {
        console.error('[FlowsRuntime] Erro ao extrair mensagem do DOM:', e);
        return null;
      }
    }

    /**
     * Obtém ID do chat atual
     */
    getCurrentChatId() {
      // Tentar via inject.js
      if (window.__QUANTUM_CURRENT_CHAT_ID__) {
        return window.__QUANTUM_CURRENT_CHAT_ID__;
      }
      
      // Tentar via URL
      const match = window.location.hash.match(/@c\.us_(\d+)/);
      if (match) {
        return match[1] + '@c.us';
      }
      
      return null;
    }

    /**
     * Verifica se mensagem já foi processada
     */
    isMessageProcessed(messageId) {
      const processedKey = `processed_${messageId}`;
      if (sessionStorage.getItem(processedKey)) {
        return true;
      }
      sessionStorage.setItem(processedKey, '1');
      // Limpar após 1 minuto
      setTimeout(() => sessionStorage.removeItem(processedKey), 60000);
      return false;
    }

    /**
     * Trata mudança de chat
     */
    handleChatChanged(data) {
      this.log('Chat alterado:', data);
      
      // Resetar timer de silêncio do chat anterior
      if (data.previousChatId) {
        this.resetSilenceTimer(data.previousChatId);
      }
      
      // Disparar evento
      this.queueEvent('CHAT_CHANGED', data);
      
      // Iniciar timer de silêncio para o novo chat
      this.startSilenceTimer(data.chatId);
    }

    /**
     * Adiciona evento à fila de processamento
     */
    queueEvent(type, data) {
      this.log(`Evento na fila: ${type}`, data);
      
      // Enriquecer dados do evento
      const enrichedData = this.enrichEventData(type, data);
      
      this.eventQueue.push({
        type: type,
        data: enrichedData,
        timestamp: Date.now(),
      });
      
      // Processar fila se não estiver processando
      if (!this.processing) {
        this.processQueue();
      }
    }

    /**
     * Enriquece dados do evento com informações adicionais
     */
    enrichEventData(type, data) {
      const enriched = { ...data };

      // Guardar histórico (para detectar primeira mensagem e para ações de IA)
      if ((type === 'MESSAGE_RECEIVED' || type === 'MESSAGE_SENT') && data.chatId) {
        const history = this.chatMessageHistory.get(data.chatId);

        // Primeira mensagem: somente quando chega do contato
        if (type === 'MESSAGE_RECEIVED' && (!history || history.length === 0)) {
          enriched.isFirstMessage = true;
        }

        if (!this.chatMessageHistory.has(data.chatId)) {
          this.chatMessageHistory.set(data.chatId, []);
        }

        const list = this.chatMessageHistory.get(data.chatId);
        list.push({
          timestamp: data.timestamp || Date.now(),
          fromMe: !!data.fromMe,
          body: typeof data.body === 'string' ? data.body : (data.body ? String(data.body) : ''),
          type,
        });

        // Limitar tamanho
        while (list.length > MAX_MESSAGE_HISTORY) {
          list.shift();
        }
      }

      return enriched;
    }

    /**
     * Processa fila de eventos
     */
    async processQueue() {
      if (this.processing || this.eventQueue.length === 0) return;
      
      this.processing = true;
      
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        
        try {
          await this.processEvent(event);
        } catch (error) {
          console.error('[FlowsRuntime] Erro ao processar evento:', error);
        }
        
        // Pequeno delay entre eventos
        await this.sleep(100);
      }
      
      this.processing = false;
    }

    /**
     * Processa um evento individual
     */
    async processEvent(event) {
      this.log(`Processando evento: ${event.type}`);
      
      // Encontrar flows que correspondem ao evento
      const matchedFlows = await this.engine.processEvent(event);
      
      this.log(`${matchedFlows.length} flow(s) correspondente(s)`);
      
      // Executar cada flow correspondente
      for (const match of matchedFlows) {
        try {
          const chatId = match?.context?.chat?.id || event?.data?.chatId || event?.chatId;
          if (chatId) {
            const history = this.chatMessageHistory.get(chatId) || [];
            // Entregar apenas um recorte recente para IA (não explodir tokens)
            match.context.messageHistory = history.slice(-20);
          }
        } catch (_) {}
        await this.executeFlow(match.flow, match.context, match.matchData);
      }
    }

    /**
     * Executa um flow
     */
    async executeFlow(flow, context, matchData) {
      console.log(`[FlowsRuntime] Executando flow: ${flow.name}`);
      
      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Registrar execução ativa
      this.engine.activeExecutions.set(executionId, {
        flowId: flow.id,
        chatId: context.chat.id,
        status: 'running',
        startedAt: Date.now(),
        currentStepIndex: 0,
      });
      
      try {
        // Executar steps sequencialmente
        let currentStepIndex = 0;
        let shouldStop = false;
        
        while (currentStepIndex < flow.steps.length && !shouldStop) {
          const step = flow.steps[currentStepIndex];
          
          // Verificar condições do step
          if (step.conditions && step.conditions.length > 0) {
            const conditionsMet = step.conditions.every(cond => 
              this.engine.evaluateCondition(cond, { ...context, matchData })
            );
            
            if (!conditionsMet) {
              this.log(`Step ${step.id} ignorado (condições não atendidas)`);
              currentStepIndex++;
              continue;
            }
          }
          
          // Executar ação do step
          const result = await this.executeStep(step, context, matchData);
          
          // Atualizar estado da execução
          this.engine.activeExecutions.get(executionId).currentStepIndex = currentStepIndex;
          
          // Determinar próximo step
          if (result.stop) {
            shouldStop = true;
          } else if (result.goto) {
            const gotoIndex = flow.steps.findIndex(s => s.id === result.goto);
            if (gotoIndex >= 0) {
              currentStepIndex = gotoIndex;
            } else {
              currentStepIndex++;
            }
          } else if (result.success && step.onSuccess) {
            const successIndex = flow.steps.findIndex(s => s.id === step.onSuccess);
            if (successIndex >= 0) {
              currentStepIndex = successIndex;
            } else {
              currentStepIndex++;
            }
          } else if (!result.success && step.onFailure) {
            const failureIndex = flow.steps.findIndex(s => s.id === step.onFailure);
            if (failureIndex >= 0) {
              currentStepIndex = failureIndex;
            } else {
              currentStepIndex++;
            }
          } else {
            currentStepIndex++;
          }
        }
        
        // Registrar execução concluída
        this.engine.recordExecution(flow.id, context.chat.id);
        
        console.log(`[FlowsRuntime] Flow "${flow.name}" concluído com sucesso`);
        
      } catch (error) {
        console.error(`[FlowsRuntime] Erro ao executar flow "${flow.name}":`, error);
      } finally {
        // Remover execução ativa
        this.engine.activeExecutions.delete(executionId);
      }
    }

    /**
     * Executa um step individual
     */
    async executeStep(step, context, matchData) {
      this.log(`Executando step: ${step.actionType}`, step.config);
      
      const config = this.interpolateConfig(step.config, context, matchData);
      
      let result = { success: false };
      let retries = 0;
      const maxRetries = step.retryOnFailure ? (step.maxRetries || 3) : 1;
      
      while (retries < maxRetries) {
        try {
          result = await this.executeAction(step.actionType, config, context);
          
          if (result.success) break;
          
          retries++;
          if (retries < maxRetries) {
            await this.sleep(step.retryDelayMs || 1000);
          }
        } catch (error) {
          console.error(`[FlowsRuntime] Erro no step ${step.id}:`, error);
          retries++;
          if (retries < maxRetries) {
            await this.sleep(step.retryDelayMs || 1000);
          }
        }
      }
      
      return result;
    }

    /**
     * Executa uma ação específica
     */
    async executeAction(actionType, config, context) {
      const chatId = context.chat.id;
      
      switch (actionType) {
        case 'send_message':
          return await this.actionSendMessage(chatId, config.message, config);
        
        case 'send_media':
          return await this.actionSendMedia(chatId, config);
        
        case 'send_template':
          return await this.actionSendTemplate(chatId, config);
        
        case 'mark_as_read':
          return await this.actionMarkAsRead(chatId);
        
        case 'mark_as_unread':
          return await this.actionMarkAsUnread(chatId);
        
        case 'archive_chat':
          return await this.actionArchiveChat(chatId, true);
        
        case 'unarchive_chat':
          return await this.actionArchiveChat(chatId, false);
        
        case 'pin_chat':
          return await this.actionPinChat(chatId, true);
        
        case 'unpin_chat':
          return await this.actionPinChat(chatId, false);
        
        case 'mute_chat':
          return await this.actionMuteChat(chatId, config.duration);
        
        case 'unmute_chat':
          return await this.actionUnmuteChat(chatId);
        
        case 'add_label':
          return await this.actionAddLabel(chatId, config.labelId);
        
        case 'remove_label':
          return await this.actionRemoveLabel(chatId, config.labelId);
        
        case 'set_stage':
          return await this.actionSetStage(chatId, config.stage);
        
        case 'add_note':
          return await this.actionAddNote(chatId, config.note);
        
        case 'delay':
          await this.sleep(config.delayMs || (config.seconds || 0) * 1000);
          return { success: true };
        
        case 'webhook_call':
          return await this.actionWebhookCall(config, context);
        
        case 'ai_reply':
          return await this.actionAIReply(chatId, config, context);
        
        case 'assign_to_user':
          return await this.actionAssignToUser(chatId, config.userId);
        
        case 'stop_flow':
          return { success: true, stop: true };
        
        case 'goto_step':
          return { success: true, goto: config.stepId };
        
        case 'condition_branch':
          return await this.actionConditionBranch(config, context);
        
        default:
          console.warn(`[FlowsRuntime] Ação desconhecida: ${actionType}`);
          return { success: false, error: 'Ação desconhecida' };
      }
    }

    // ========== AÇÕES ESPECÍFICAS ==========

    /**
     * Envia mensagem de texto
     */
    async actionSendMessage(chatId, message, config = {}) {
      this.log(`Enviando mensagem para ${chatId}: ${message}`);
      
      return new Promise((resolve) => {
        this.sendToInject({
          action: 'SEND_MESSAGE',
          chatId: chatId,
          content: message,
          options: {
            quotedMessageId: config.quotedMessageId,
            mentionedIds: config.mentionedIds,
          },
        }, (response) => {
          resolve({ 
            success: response?.success ?? false,
            messageId: response?.messageId,
          });
        });
      });
    }

    /**
     * Envia mídia
     */
    async actionSendMedia(chatId, config) {
      this.log(`Enviando mídia para ${chatId}`);
      
      return new Promise((resolve) => {
        this.sendToInject({
          action: 'SEND_MEDIA',
          chatId: chatId,
          mediaUrl: config.mediaUrl,
          mediaType: config.mediaType,
          caption: config.caption,
          filename: config.filename,
        }, (response) => {
          resolve({ success: response?.success ?? false });
        });
      });
    }

    /**
     * Envia template (mensagem pré-definida)
     */
    async actionSendTemplate(chatId, config) {
      // Buscar template do storage
      return new Promise((resolve) => {
        chrome.storage.local.get(['quantum_templates'], async (result) => {
          const templates = result.quantum_templates || [];
          const template = templates.find(t => t.id === config.templateId);
          
          if (!template) {
            resolve({ success: false, error: 'Template não encontrado' });
            return;
          }
          
          const result2 = await this.actionSendMessage(chatId, template.content, config);
          resolve(result2);
        });
      });
    }

    /**
     * Marca chat como lido
     */
    async actionMarkAsRead(chatId) {
      return new Promise((resolve) => {
        this.sendToInject({
          action: 'MARK_AS_READ',
          chatId: chatId,
        }, (response) => {
          resolve({ success: response?.success ?? false });
        });
      });
    }

    /**
     * Marca chat como não lido
     */
    async actionMarkAsUnread(chatId) {
      return new Promise((resolve) => {
        this.sendToInject({
          action: 'MARK_AS_UNREAD',
          chatId: chatId,
        }, (response) => {
          resolve({ success: response?.success ?? false });
        });
      });
    }

    /**
     * Arquiva/desarquiva chat
     */
    async actionArchiveChat(chatId, archive) {
      return new Promise((resolve) => {
        this.sendToInject({
          action: archive ? 'ARCHIVE_CHAT' : 'UNARCHIVE_CHAT',
          chatId: chatId,
        }, (response) => {
          resolve({ success: response?.success ?? false });
        });
      });
    }

    /**
     * Fixa/desfixa chat
     */
    async actionPinChat(chatId, pin) {
      return new Promise((resolve) => {
        this.sendToInject({
          action: pin ? 'PIN_CHAT' : 'UNPIN_CHAT',
          chatId: chatId,
        }, (response) => {
          resolve({ success: response?.success ?? false });
        });
      });
    }

    /**
     * Silencia chat
     */
    async actionMuteChat(chatId, duration) {
      return new Promise((resolve) => {
        this.sendToInject({
          action: 'MUTE_CHAT',
          chatId: chatId,
          duration: duration, // segundos ou 'forever'
        }, (response) => {
          resolve({ success: response?.success ?? false });
        });
      });
    }

    /**
     * Remove silêncio do chat
     */
    async actionUnmuteChat(chatId) {
      return new Promise((resolve) => {
        this.sendToInject({
          action: 'UNMUTE_CHAT',
          chatId: chatId,
        }, (response) => {
          resolve({ success: response?.success ?? false });
        });
      });
    }

    /**
     * Adiciona etiqueta ao chat
     */
    async actionAddLabel(chatId, labelId) {
      return new Promise((resolve) => {
        this.sendToInject({
          action: 'ADD_LABEL',
          chatId: chatId,
          labelId: labelId,
        }, (response) => {
          resolve({ success: response?.success ?? false });
        });
      });
    }

    /**
     * Remove etiqueta do chat
     */
    async actionRemoveLabel(chatId, labelId) {
      return new Promise((resolve) => {
        this.sendToInject({
          action: 'REMOVE_LABEL',
          chatId: chatId,
          labelId: labelId,
        }, (response) => {
          resolve({ success: response?.success ?? false });
        });
      });
    }

    /**
     * Define estágio do contato no CRM
     */
    async actionSetStage(chatId, stage) {
      return new Promise((resolve) => {
        // Salvar no storage local do CRM
        chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
          const contacts = result.quantum_crm_contacts || {};
          const previousStage = contacts[chatId]?.stage;
          
          contacts[chatId] = contacts[chatId] || {};
          contacts[chatId].stage = stage;
          contacts[chatId].updatedAt = Date.now();
          
          chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {
            // Disparar evento de mudança de estágio
            if (previousStage !== stage) {
              this.queueEvent('STAGE_CHANGED', {
                chatId: chatId,
                previousStage: previousStage,
                newStage: stage,
              });
            }
            
            resolve({ success: true });
          });
        });
      });
    }

    /**
     * Adiciona nota ao contato
     */
    async actionAddNote(chatId, note) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
          const contacts = result.quantum_crm_contacts || {};
          
          contacts[chatId] = contacts[chatId] || {};
          contacts[chatId].notes = contacts[chatId].notes || [];
          contacts[chatId].notes.push({
            id: Date.now().toString(),
            content: note,
            createdAt: Date.now(),
          });
          
          chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {
            resolve({ success: true });
          });
        });
      });
    }

    /**
     * Chama webhook externo
     */
    async actionWebhookCall(config, context) {
      try {
        const body = config.body ? 
          JSON.parse(this.engine.interpolateVariables(JSON.stringify(config.body), context)) :
          context;
        
        const response = await fetch(config.url, {
          method: config.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.headers || {}),
          },
          body: JSON.stringify(body),
        });
        
        const responseData = await response.json().catch(() => ({}));
        
        return { 
          success: response.ok,
          statusCode: response.status,
          data: responseData,
        };
      } catch (error) {
        console.error('[FlowsRuntime] Erro no webhook:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * Gera e envia resposta com IA
     */
    async actionAIReply(chatId, config, context) {
      try {
        // Enviar para background para chamar API de IA
        return new Promise((resolve) => {
          this.sendToBackground({
            type: 'AI_GENERATE_REPLY',
            chatId: chatId,
            messageHistory: context.messageHistory || [],
            prompt: config.prompt,
            systemPrompt: config.systemPrompt,
            model: config.model,
          }, async (response) => {
            if (response?.reply) {
              const sendResult = await this.actionSendMessage(chatId, response.reply);
              resolve(sendResult);
            } else {
              resolve({ success: false, error: response?.error || 'Erro ao gerar resposta' });
            }
          });
        });
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    /**
     * Atribui chat a um usuário da equipe
     */
    async actionAssignToUser(chatId, userId) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
          const contacts = result.quantum_crm_contacts || {};
          
          contacts[chatId] = contacts[chatId] || {};
          contacts[chatId].assignedTo = userId;
          contacts[chatId].assignedAt = Date.now();
          
          chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {
            resolve({ success: true });
          });
        });
      });
    }

    /**
     * Avalia condição e retorna próximo step
     */
    async actionConditionBranch(config, context) {
      for (const branch of config.branches || []) {
        const conditionsMet = branch.conditions.every(cond =>
          this.engine.evaluateCondition(cond, context)
        );
        
        if (conditionsMet) {
          return { success: true, goto: branch.gotoStepId };
        }
      }
      
      // Default branch
      if (config.defaultStepId) {
        return { success: true, goto: config.defaultStepId };
      }
      
      return { success: true };
    }

    // ========== TIMERS E SCHEDULERS ==========

    /**
     * Inicia timer de silêncio para um chat
     */
    startSilenceTimer(chatId) {
      // Buscar flows com trigger de silêncio
      const silenceFlows = this.engine.getActiveFlows().filter(flow =>
        flow.triggers.some(t => t.type === 'silence_timeout' && t.enabled)
      );
      
      if (silenceFlows.length === 0) return;
      
      // Encontrar menor timeout configurado
      let minTimeout = Infinity;
      for (const flow of silenceFlows) {
        for (const trigger of flow.triggers) {
          if (trigger.type === 'silence_timeout') {
            const timeout = (trigger.config.minutes || 5) * 60 * 1000;
            if (timeout < minTimeout) {
              minTimeout = timeout;
            }
          }
        }
      }
      
      // Cancelar timer existente
      this.resetSilenceTimer(chatId);
      
      // Criar novo timer
      const timerId = setTimeout(() => {
        this.queueEvent('SILENCE_TIMEOUT', {
          chatId: chatId,
          silenceMinutes: minTimeout / 60000,
        });
      }, minTimeout);
      
      this.silenceTimers.set(chatId, timerId);
    }

    /**
     * Reseta timer de silêncio
     */
    resetSilenceTimer(chatId) {
      const existingTimer = this.silenceTimers.get(chatId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.silenceTimers.delete(chatId);
      }
    }

    /**
     * Verificador periódico de silêncio
     */
    startSilenceChecker() {
      // A cada mensagem recebida, resetar o timer do chat
      document.addEventListener('quantum:message:received', (e) => {
        if (e.detail?.chatId) {
          this.startSilenceTimer(e.detail.chatId);
        }
      });
    }

    /**
     * Scheduler para eventos agendados
     */
    startScheduler() {
      // Verificar a cada minuto
      setInterval(() => {
        this.queueEvent('SCHEDULE_TICK', {
          timestamp: Date.now(),
        });
      }, 60000);
    }

    /**
     * Inicia processador de fila
     */
    startQueueProcessor() {
      // Verificar fila a cada 500ms
      setInterval(() => {
        if (!this.processing && this.eventQueue.length > 0) {
          this.processQueue();
        }
      }, 500);
    }

    // ========== COMUNICAÇÃO ==========

    /**
     * Envia mensagem para inject.js
     */
    sendToInject(message, callback) {
      const callbackId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      if (callback) {
        const handler = (event) => {
          if (event.data?.source === 'QUANTUM_INJECT' && event.data?.callbackId === callbackId) {
            window.removeEventListener('message', handler);
            callback(event.data.response);
          }
        };
        window.addEventListener('message', handler);
        
        // Timeout de 30s
        setTimeout(() => {
          window.removeEventListener('message', handler);
        }, 30000);
      }
      
      window.postMessage({
        source: 'QUANTUM_RUNTIME',
        callbackId: callbackId,
        ...message,
      }, '*');
    }

    /**
     * Envia mensagem para background.js
     */
    sendToBackground(message, callback) {
      chrome.runtime.sendMessage(message, callback);
    }

    /**
     * Trata mensagem da extensão
     */
    handleExtensionMessage(message, sendResponse) {
      switch (message.type) {
        case 'RELOAD_FLOWS':
          this.engine.loadFlows().then(() => {
            sendResponse({ success: true, count: this.engine.flows.length });
          });
          break;
        
        case 'GET_RUNTIME_STATUS':
          sendResponse({
            initialized: this.initialized,
            flowsCount: this.engine?.flows?.length || 0,
            activeFlowsCount: this.engine?.getActiveFlows()?.length || 0,
            queueLength: this.eventQueue.length,
            activeExecutions: this.engine?.activeExecutions?.size || 0,
          });
          break;
        
        case 'EXECUTE_FLOW_MANUALLY':
          this.executeFlowById(message.flowId, message.chatId).then(sendResponse);
          break;
        
        case 'SET_DEBUG_MODE':
          this.debugMode = message.enabled;
          sendResponse({ success: true });
          break;
        
        default:
          sendResponse({ error: 'Tipo de mensagem desconhecido' });
      }
    }

    /**
     * Trata evento do inject.js
     */
    handleInjectEvent(data) {
      switch (data.type) {
        case 'MESSAGE_RECEIVED':
          this.queueEvent('MESSAGE_RECEIVED', data.payload);
          break;
        
        case 'MESSAGE_SENT':
          this.queueEvent('MESSAGE_SENT', data.payload);
          break;
        
        case 'MESSAGE_DELETED':
          this.queueEvent('MESSAGE_DELETED', data.payload);
          break;
        
        case 'CHAT_CHANGED':
          this.handleChatChanged(data.payload);
          break;
        
        case 'CURRENT_CHAT_ID':
          window.__QUANTUM_CURRENT_CHAT_ID__ = data.chatId;
          break;
      }
    }

    /**
     * Executa flow por ID manualmente
     */
    async executeFlowById(flowId, chatId) {
      const flow = this.engine.flows.find(f => f.id === flowId);
      if (!flow) {
        return { success: false, error: 'Flow não encontrado' };
      }
      
      const context = this.engine.buildContext({ chatId });
      await this.executeFlow(flow, context, {});
      
      return { success: true };
    }

    // ========== UTILITÁRIOS ==========

    /**
     * Interpola variáveis na configuração
     */
    interpolateConfig(config, context, matchData) {
      if (!config) return config;
      
      const fullContext = { ...context, matchData };
      
      if (typeof config === 'string') {
        return this.engine.interpolateVariables(config, fullContext);
      }
      
      if (Array.isArray(config)) {
        return config.map(item => this.interpolateConfig(item, context, matchData));
      }
      
      if (typeof config === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(config)) {
          result[key] = this.interpolateConfig(value, context, matchData);
        }
        return result;
      }
      
      return config;
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log com prefixo
     */
    log(...args) {
      if (this.debugMode) {
        console.log('[FlowsRuntime]', ...args);
      }
    }
  }

  // Criar instância global
  window.__QUANTUM_FLOWS_RUNTIME__ = new FlowsRuntime();

  // Aguardar DOM e inicializar
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.__QUANTUM_FLOWS_RUNTIME__.init();
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      window.__QUANTUM_FLOWS_RUNTIME__.init();
    });
  }

})();
