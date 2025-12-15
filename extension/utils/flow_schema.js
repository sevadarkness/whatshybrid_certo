/**
 * flow_schema.js
 * Schema e utilitários para definição de flows/automações
 */

const FlowSchema = {
  /**
   * Tipos de gatilhos (triggers) suportados
   */
  TriggerTypes: {
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_SENT: 'message_sent',
    KEYWORD_MATCH: 'keyword_match',
    REGEX_MATCH: 'regex_match',
    CHAT_OPENED: 'chat_opened',
    CHAT_CHANGED: 'chat_changed',
    MEDIA_RECEIVED: 'media_received',
    SILENCE_TIMEOUT: 'silence_timeout',
    MESSAGE_DELETED: 'message_deleted',
    CONTACT_ADDED: 'contact_added',
    SCHEDULE: 'schedule',
    WEBHOOK: 'webhook',
    STAGE_CHANGED: 'stage_changed',
    FIRST_MESSAGE: 'first_message',
  },

  /**
   * Tipos de ações suportadas
   */
  ActionTypes: {
    SEND_MESSAGE: 'send_message',
    SEND_MEDIA: 'send_media',
    SEND_TEMPLATE: 'send_template',
    MARK_AS_READ: 'mark_as_read',
    MARK_AS_UNREAD: 'mark_as_unread',
    ARCHIVE_CHAT: 'archive_chat',
    UNARCHIVE_CHAT: 'unarchive_chat',
    PIN_CHAT: 'pin_chat',
    UNPIN_CHAT: 'unpin_chat',
    MUTE_CHAT: 'mute_chat',
    UNMUTE_CHAT: 'unmute_chat',
    ADD_LABEL: 'add_label',
    REMOVE_LABEL: 'remove_label',
    SET_STAGE: 'set_stage',
    ADD_NOTE: 'add_note',
    DELAY: 'delay',
    WEBHOOK_CALL: 'webhook_call',
    AI_REPLY: 'ai_reply',
    ASSIGN_TO_USER: 'assign_to_user',
    STOP_FLOW: 'stop_flow',
    GOTO_STEP: 'goto_step',
    CONDITION_BRANCH: 'condition_branch',
  },

  /**
   * Operadores de condição
   */
  ConditionOperators: {
    EQUALS: 'equals',
    NOT_EQUALS: 'not_equals',
    CONTAINS: 'contains',
    NOT_CONTAINS: 'not_contains',
    STARTS_WITH: 'starts_with',
    ENDS_WITH: 'ends_with',
    REGEX: 'regex',
    GREATER_THAN: 'greater_than',
    LESS_THAN: 'less_than',
    IS_EMPTY: 'is_empty',
    IS_NOT_EMPTY: 'is_not_empty',
    IN_LIST: 'in_list',
    NOT_IN_LIST: 'not_in_list',
  },

  /**
   * Variáveis disponíveis para interpolação
   */
  Variables: {
    CONTACT_NAME: '{{contact.name}}',
    CONTACT_PHONE: '{{contact.phone}}',
    CONTACT_PUSHNAME: '{{contact.pushname}}',
    MESSAGE_BODY: '{{message.body}}',
    MESSAGE_TYPE: '{{message.type}}',
    MESSAGE_TIMESTAMP: '{{message.timestamp}}',
    CHAT_ID: '{{chat.id}}',
    CHAT_NAME: '{{chat.name}}',
    CURRENT_DATE: '{{system.date}}',
    CURRENT_TIME: '{{system.time}}',
    CURRENT_DATETIME: '{{system.datetime}}',
    RANDOM_NUMBER: '{{system.random}}',
    CUSTOM: '{{custom.*}}',
  },

  /**
   * Cria um novo flow vazio
   */
  createEmptyFlow() {
    return {
      id: this.generateId(),
      name: 'Novo Flow',
      description: '',
      enabled: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      triggers: [],
      steps: [],
      settings: {
        maxExecutionsPerContact: 0, // 0 = ilimitado
        cooldownMinutes: 0,
        onlyDuringBusinessHours: false,
        businessHours: {
          start: '09:00',
          end: '18:00',
          days: [1, 2, 3, 4, 5], // seg-sex
          timezone: 'America/Sao_Paulo',
        },
        stopOnReply: false,
        allowConcurrent: false,
      },
      metadata: {},
    };
  },

  /**
   * Cria um trigger
   */
  createTrigger(type, config = {}) {
    return {
      id: this.generateId(),
      type: type,
      enabled: true,
      config: config,
      filters: [],
    };
  },

  /**
   * Cria um step (ação)
   */
  createStep(actionType, config = {}) {
    return {
      id: this.generateId(),
      actionType: actionType,
      name: '',
      config: config,
      conditions: [],
      onSuccess: null, // próximo step id
      onFailure: null, // step id em caso de falha
      retryOnFailure: false,
      maxRetries: 3,
      retryDelayMs: 1000,
    };
  },

  /**
   * Cria uma condição
   */
  createCondition(field, operator, value) {
    return {
      id: this.generateId(),
      field: field,
      operator: operator,
      value: value,
      caseSensitive: false,
    };
  },

  /**
   * Gera ID único
   */
  generateId() {
    return 'flow_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Valida um flow
   */
  validateFlow(flow) {
    const errors = [];

    if (!flow.id) errors.push('Flow deve ter um ID');
    if (!flow.name || flow.name.trim() === '') errors.push('Flow deve ter um nome');
    if (!flow.triggers || flow.triggers.length === 0) {
      errors.push('Flow deve ter pelo menos um gatilho');
    }
    if (!flow.steps || flow.steps.length === 0) {
      errors.push('Flow deve ter pelo menos uma ação');
    }

    // Validar triggers
    flow.triggers?.forEach((trigger, i) => {
      if (!Object.values(this.TriggerTypes).includes(trigger.type)) {
        errors.push(`Trigger ${i + 1}: tipo inválido "${trigger.type}"`);
      }
    });

    // Validar steps
    flow.steps?.forEach((step, i) => {
      if (!Object.values(this.ActionTypes).includes(step.actionType)) {
        errors.push(`Step ${i + 1}: tipo de ação inválido "${step.actionType}"`);
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors,
    };
  },
};

// Export para uso em diferentes contextos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlowSchema;
}
if (typeof window !== 'undefined') {
  window.FlowSchema = FlowSchema;
}
