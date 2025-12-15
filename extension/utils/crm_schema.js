/**
 * crm_schema.js
 * Schema e configurações do CRM/Kanban
 */

const CRMSchema = {
  /**
   * Estágios padrão do funil
   */
  DefaultStages: [
    {
      id: 'new',
      name: 'Novo',
      color: '#6B7280',
      icon: '🆕',
      order: 0,
      actions: {
        onEnter: [],
        onExit: [],
      },
    },
    {
      id: 'lead',
      name: 'Lead',
      color: '#3B82F6',
      icon: '🎯',
      order: 1,
      actions: {
        onEnter: ['mark_as_unread'],
        onExit: [],
      },
    },
    {
      id: 'contact',
      name: 'Contato',
      color: '#8B5CF6',
      icon: '📞',
      order: 2,
      actions: {
        onEnter: ['mark_as_read'],
        onExit: [],
      },
    },
    {
      id: 'negotiation',
      name: 'Negociação',
      color: '#F59E0B',
      icon: '💼',
      order: 3,
      actions: {
        onEnter: ['pin_chat'],
        onExit: [],
      },
    },
    {
      id: 'proposal',
      name: 'Proposta',
      color: '#EC4899',
      icon: '📋',
      order: 4,
      actions: {
        onEnter: [],
        onExit: [],
      },
    },
    {
      id: 'won',
      name: 'Ganho',
      color: '#10B981',
      icon: '✅',
      order: 5,
      actions: {
        onEnter: ['send_message', 'archive_chat'],
        onExit: [],
      },
    },
    {
      id: 'lost',
      name: 'Perdido',
      color: '#EF4444',
      icon: '❌',
      order: 6,
      actions: {
        onEnter: ['archive_chat'],
        onExit: [],
      },
    },
  ],

  /**
   * Ações disponíveis para automação de estágios
   */
  StageActions: {
    SEND_MESSAGE: 'send_message',
    SEND_TEMPLATE: 'send_template',
    MARK_AS_READ: 'mark_as_read',
    MARK_AS_UNREAD: 'mark_as_unread',
    ARCHIVE_CHAT: 'archive_chat',
    UNARCHIVE_CHAT: 'unarchive_chat',
    PIN_CHAT: 'pin_chat',
    UNPIN_CHAT: 'unpin_chat',
    MUTE_CHAT: 'mute_chat',
    ADD_LABEL: 'add_label',
    REMOVE_LABEL: 'remove_label',
    ADD_NOTE: 'add_note',
    ASSIGN_USER: 'assign_user',
    WEBHOOK: 'webhook',
    DELAY: 'delay',
  },

  /**
   * Estrutura de um contato do CRM
   */
  createContact(chatId, data = {}) {
    return {
      id: chatId,
      chatId: chatId,
      phone: chatId.replace('@c.us', '').replace('@g.us', ''),
      name: data.name || data.pushname || '',
      pushname: data.pushname || '',
      profilePicUrl: data.profilePicUrl || '',
      stage: data.stage || 'new',
      previousStage: null,
      assignedTo: data.assignedTo || null,
      tags: data.tags || [],
      notes: data.notes || [],
      customFields: data.customFields || {},
      value: data.value || 0,
      currency: data.currency || 'BRL',
      source: data.source || 'whatsapp',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessageAt: data.lastMessageAt || null,
      lastContactAt: data.lastContactAt || null,
      messagesCount: data.messagesCount || 0,
      isGroup: chatId.includes('@g.us'),
      metadata: data.metadata || {},
    };
  },

  /**
   * Estrutura de uma nota
   */
  createNote(content, userId = null) {
    return {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: content,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * Estrutura de uma atividade/histórico
   */
  createActivity(type, data = {}) {
    return {
      id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type, // stage_change, note_added, message_sent, etc.
      data: data,
      timestamp: new Date().toISOString(),
      userId: data.userId || null,
    };
  },

  /**
   * Configuração de ação de estágio
   */
  createStageAction(actionType, config = {}) {
    return {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: actionType,
      enabled: true,
      config: config,
      delay: config.delay || 0, // ms
    };
  },

  /**
   * Templates de mensagens para estágios
   */
  DefaultTemplates: {
    won: {
      id: 'won_default',
      name: 'Agradecimento - Venda Fechada',
      content: 'Olá {{contact.name}}! 🎉\\n\\nMuito obrigado pela confiança! Estamos muito felizes em tê-lo como cliente.\\n\\nQualquer dúvida, estamos à disposição!',
    },
    lost: {
      id: 'lost_default', 
      name: 'Despedida - Oportunidade Perdida',
      content: 'Olá {{contact.name}},\\n\\nAgradecemos o contato! Caso mude de ideia ou precise de algo no futuro, estaremos aqui.\\n\\nAté breve!',
    },
    follow_up: {
      id: 'follow_up_default',
      name: 'Follow-up',
      content: 'Olá {{contact.name}}! 👋\\n\\nTudo bem? Passando para saber se você teve alguma dúvida sobre nossa conversa.\\n\\nPosso ajudar em algo?',
    },
  },

  /**
   * Gera ID único
   */
  generateId() {
    return 'crm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Valida contato
   */
  validateContact(contact) {
    const errors = [];

    if (!contact.id || !contact.chatId) {
      errors.push('Contato deve ter ID e chatId');
    }

    return {
      valid: errors.length === 0,
      errors: errors,
    };
  },
};

// Export para uso em diferentes contextos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CRMSchema;
}
if (typeof window !== 'undefined') {
  window.CRMSchema = CRMSchema;
}
