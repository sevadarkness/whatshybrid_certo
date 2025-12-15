/**
 * crm_actions.js
 * Ações executáveis do CRM integradas ao WhatsApp Web
 */

const CRMActions = {
  /**
   * Executa uma lista de ações
   */
  async executeActions(actions, context) {
    const results = [];

    for (const action of actions) {
      if (!action.enabled) continue;

      // Aplicar delay se configurado
      if (action.delay && action.delay > 0) {
        await this.sleep(action.delay);
      }

      try {
        const result = await this.executeAction(action, context);
        results.push({ action: action, success: true, result: result });
      } catch (error) {
        console.error(`[CRMActions] Erro na ação ${action.type}:`, error);
        results.push({ action: action, success: false, error: error.message });
      }
    }

    return results;
  },

  /**
   * Executa uma ação individual
   */
  async executeAction(action, context) {
    const { chatId } = context;

    switch (action.type) {
      case 'send_message':
        return await this.sendMessage(chatId, action.config, context);

      case 'send_template':
        return await this.sendTemplate(chatId, action.config, context);

      case 'mark_as_read':
        return await this.markAsRead(chatId);

      case 'mark_as_unread':
        return await this.markAsUnread(chatId);

      case 'archive_chat':
        return await this.archiveChat(chatId, true);

      case 'unarchive_chat':
        return await this.archiveChat(chatId, false);

      case 'pin_chat':
        return await this.pinChat(chatId, true);

      case 'unpin_chat':
        return await this.pinChat(chatId, false);

      case 'mute_chat':
        return await this.muteChat(chatId, action.config?.duration);

      case 'add_label':
        return await this.addLabel(chatId, action.config?.labelId);

      case 'remove_label':
        return await this.removeLabel(chatId, action.config?.labelId);

      case 'add_note':
        return await this.addNote(chatId, action.config?.note, context);

      case 'assign_user':
        return await this.assignUser(chatId, action.config?.userId);

      case 'webhook':
        return await this.callWebhook(action.config, context);

      case 'delay':
        await this.sleep(action.config?.ms || (action.config?.seconds || 0) * 1000);
        return { success: true };

      default:
        console.warn(`[CRMActions] Ação desconhecida: ${action.type}`);
        return { success: false, error: 'Ação desconhecida' };
    }
  },

  /**
   * Envia mensagem
   */
  async sendMessage(chatId, config, context) {
    const message = this.interpolateVariables(config.message, context);

    return new Promise((resolve) => {
      const callbackId = `crm_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const handler = (event) => {
        if (event.data?.source === 'QUANTUM_INJECT' && event.data?.callbackId === callbackId) {
          window.removeEventListener('message', handler);
          resolve(event.data.response || { success: true });
        }
      };
      window.addEventListener('message', handler);

      window.postMessage({
        source: 'QUANTUM_CRM',
        callbackId: callbackId,
        action: 'SEND_MESSAGE',
        chatId: chatId,
        content: message,
        options: config.options || {},
      }, '*');

      // Timeout
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false, error: 'Timeout' });
      }, 30000);
    });
  },

  /**
   * Envia template de mensagem
   */
  async sendTemplate(chatId, config, context) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_templates'], async (result) => {
        const templates = result.quantum_templates || {};
        const template = templates[config.templateId] || CRMSchema?.DefaultTemplates?.[config.templateId];

        if (!template) {
          resolve({ success: false, error: 'Template não encontrado' });
          return;
        }

        const message = this.interpolateVariables(template.content, context);
        const sendResult = await this.sendMessage(chatId, { message }, context);
        resolve(sendResult);
      });
    });
  },

  /**
   * Marca como lido
   */
  async markAsRead(chatId) {
    return this.sendToInject('MARK_AS_READ', { chatId });
  },

  /**
   * Marca como não lido
   */
  async markAsUnread(chatId) {
    return this.sendToInject('MARK_AS_UNREAD', { chatId });
  },

  /**
   * Arquiva/desarquiva chat
   */
  async archiveChat(chatId, archive) {
    return this.sendToInject(archive ? 'ARCHIVE_CHAT' : 'UNARCHIVE_CHAT', { chatId });
  },

  /**
   * Fixa/desfixa chat
   */
  async pinChat(chatId, pin) {
    return this.sendToInject(pin ? 'PIN_CHAT' : 'UNPIN_CHAT', { chatId });
  },

  /**
   * Silencia chat
   */
  async muteChat(chatId, duration) {
    return this.sendToInject('MUTE_CHAT', { chatId, duration });
  },

  /**
   * Adiciona etiqueta
   */
  async addLabel(chatId, labelId) {
    return this.sendToInject('ADD_LABEL', { chatId, labelId });
  },

  /**
   * Remove etiqueta
   */
  async removeLabel(chatId, labelId) {
    return this.sendToInject('REMOVE_LABEL', { chatId, labelId });
  },

  /**
   * Adiciona nota ao contato
   */
  async addNote(chatId, noteContent, context) {
    const note = CRMSchema?.createNote?.(noteContent) || {
      id: Date.now().toString(),
      content: noteContent,
      createdAt: new Date().toISOString(),
    };

    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
        const contacts = result.quantum_crm_contacts || {};

        if (!contacts[chatId]) {
          contacts[chatId] = CRMSchema?.createContact?.(chatId) || { id: chatId, notes: [] };
        }

        contacts[chatId].notes = contacts[chatId].notes || [];
        contacts[chatId].notes.push(note);

        chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {
          resolve({ success: true, note: note });
        });
      });
    });
  },

  /**
   * Atribui usuário ao contato
   */
  async assignUser(chatId, userId) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
        const contacts = result.quantum_crm_contacts || {};

        if (!contacts[chatId]) {
          contacts[chatId] = CRMSchema?.createContact?.(chatId) || { id: chatId };
        }

        contacts[chatId].assignedTo = userId;
        contacts[chatId].updatedAt = new Date().toISOString();

        chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {
          resolve({ success: true });
        });
      });
    });
  },

  /**
   * Chama webhook externo
   */
  async callWebhook(config, context) {
    try {
      const body = config.body ? 
        JSON.parse(this.interpolateVariables(JSON.stringify(config.body), context)) :
        {
          event: 'stage_change',
          contact: context.contact,
          previousStage: context.previousStage,
          newStage: context.newStage,
          timestamp: new Date().toISOString(),
        };

      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.headers || {}),
        },
        body: JSON.stringify(body),
      });

      return { 
        success: response.ok, 
        statusCode: response.status,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Envia comando para inject.js
   */
  sendToInject(action, data) {
    return new Promise((resolve) => {
      const callbackId = `crm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const handler = (event) => {
        if (event.data?.source === 'QUANTUM_INJECT' && event.data?.callbackId === callbackId) {
          window.removeEventListener('message', handler);
          resolve(event.data.response || { success: true });
        }
      };
      window.addEventListener('message', handler);

      window.postMessage({
        source: 'QUANTUM_CRM',
        callbackId: callbackId,
        action: action,
        ...data,
      }, '*');

      // Timeout
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false, error: 'Timeout' });
      }, 15000);
    });
  },

  /**
   * Interpola variáveis em uma string
   */
  interpolateVariables(template, context) {
    if (!template || typeof template !== 'string') return template;

    return template.replace(/\{\{([^^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path.trim());
      return value !== undefined ? String(value) : match;
    });
  },

  /**
   * Obtém valor aninhado de um objeto
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  },

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CRMActions;
}
if (typeof window !== 'undefined') {
  window.CRMActions = CRMActions;
}
