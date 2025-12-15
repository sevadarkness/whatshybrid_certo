/**
 * flows_engine.js
 * Motor de avaliação e execução de flows
 * Este arquivo contém a lógica pura (sem DOM) para avaliar condições e decidir ações
 */

class FlowsEngine {
  constructor() {
    this.flows = [];
    this.executionHistory = new Map(); // chatId -> { flowId -> lastExecution }
    this.activeExecutions = new Map(); // executionId -> executionState
    this.variables = new Map(); // variáveis customizadas por chat
    this.silenceTimers = new Map(); // chatId -> timerId
  }

  /**
   * Carrega flows do storage
   */
  async loadFlows() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_flows'], (result) => {
        this.flows = result.quantum_flows || [];
        console.log(`[FlowsEngine] ${this.flows.length} flows carregados`);
        resolve(this.flows);
      });
    });
  }

  /**
   * Salva flows no storage
   */
  async saveFlows() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ quantum_flows: this.flows }, resolve);
    });
  }

  /**
   * Retorna apenas flows ativos
   */
  getActiveFlows() {
    return this.flows.filter(f => f.enabled);
  }

  /**
   * Processa um evento e retorna flows que devem ser executados
   */
  async processEvent(event) {
    const { type, data } = event;
    const matchedFlows = [];

    for (const flow of this.getActiveFlows()) {
      for (const trigger of flow.triggers) {
        if (!trigger.enabled) continue;

        const match = await this.evaluateTrigger(trigger, type, data);
        if (match.matched) {
          // Verificar cooldown e limites
          if (this.canExecuteFlow(flow, data.chatId)) {
            matchedFlows.push({
              flow: flow,
              trigger: trigger,
              matchData: match.data,
              context: this.buildContext(data),
            });
          }
        }
      }
    }

    return matchedFlows;
  }

  /**
   * Avalia se um trigger corresponde ao evento
   */
  async evaluateTrigger(trigger, eventType, eventData) {
    const result = { matched: false, data: {} };

    switch (trigger.type) {
      case 'message_received':
        if (eventType === 'MESSAGE_RECEIVED' && !eventData.fromMe) {
          result.matched = this.evaluateFilters(trigger.filters, eventData);
        }
        break;

      case 'message_sent':
        if (eventType === 'MESSAGE_SENT' && eventData.fromMe) {
          result.matched = this.evaluateFilters(trigger.filters, eventData);
        }
        break;

      case 'keyword_match':
        if (eventType === 'MESSAGE_RECEIVED' && eventData.body) {
          const keywords = trigger.config.keywords || [];
          const body = trigger.config.caseSensitive 
            ? eventData.body 
            : eventData.body.toLowerCase();
          
          for (const keyword of keywords) {
            const kw = trigger.config.caseSensitive ? keyword : keyword.toLowerCase();
            const matchMode = trigger.config.matchMode || 'contains';
            
            let matched = false;
            switch (matchMode) {
              case 'exact':
                matched = body === kw;
                break;
              case 'contains':
                matched = body.includes(kw);
                break;
              case 'starts_with':
                matched = body.startsWith(kw);
                break;
              case 'ends_with':
                matched = body.endsWith(kw);
                break;
              case 'word':
                {
                  const regex = new RegExp(`\\b${this.escapeRegex(kw)}\\b`, 'i');
                  matched = regex.test(eventData.body);
                }
                break;
            }
            
            if (matched) {
              result.matched = true;
              result.data.matchedKeyword = keyword;
              break;
            }
          }
        }
        break;

      case 'regex_match':
        if (eventType === 'MESSAGE_RECEIVED' && eventData.body) {
          try {
            const flags = trigger.config.flags || 'i';
            const regex = new RegExp(trigger.config.pattern, flags);
            const match = eventData.body.match(regex);
            if (match) {
              result.matched = true;
              result.data.regexMatch = match;
              result.data.groups = match.groups || {};
            }
          } catch (e) {
            console.error('[FlowsEngine] Regex inválido:', trigger.config.pattern);
          }
        }
        break;

      case 'chat_opened':
      case 'chat_changed':
        if (eventType === 'CHAT_CHANGED') {
          result.matched = this.evaluateFilters(trigger.filters, eventData);
        }
        break;

      case 'media_received':
        if (eventType === 'MESSAGE_RECEIVED' && eventData.hasMedia) {
          const allowedTypes = trigger.config.mediaTypes || ['image', 'video', 'audio', 'document'];
          if (allowedTypes.includes(eventData.mediaType)) {
            result.matched = this.evaluateFilters(trigger.filters, eventData);
            result.data.mediaType = eventData.mediaType;
          }
        }
        break;

      case 'silence_timeout':
        if (eventType === 'SILENCE_TIMEOUT') {
          result.matched = true;
        }
        break;

      case 'message_deleted':
        if (eventType === 'MESSAGE_DELETED') {
          result.matched = this.evaluateFilters(trigger.filters, eventData);
        }
        break;

      case 'first_message':
        if (eventType === 'MESSAGE_RECEIVED' && eventData.isFirstMessage) {
          result.matched = this.evaluateFilters(trigger.filters, eventData);
        }
        break;

      case 'stage_changed':
        if (eventType === 'STAGE_CHANGED') {
          const targetStages = trigger.config.stages || [];
          if (targetStages.length === 0 || targetStages.includes(eventData.newStage)) {
            result.matched = true;
            result.data.previousStage = eventData.previousStage;
            result.data.newStage = eventData.newStage;
          }
        }
        break;

      case 'contact_added':
        if (eventType === 'CONTACT_ADDED') {
          result.matched = this.evaluateFilters(trigger.filters, eventData);
        }
        break;

      case 'webhook':
        if (eventType === 'WEBHOOK_RECEIVED') {
          if (trigger.config.webhookId === eventData.webhookId) {
            result.matched = true;
            result.data.payload = eventData.payload;
          }
        }
        break;

      case 'schedule':
        if (eventType === 'SCHEDULE_TICK') {
          // Verificar se está no horário configurado
          result.matched = this.checkSchedule(trigger.config.schedule);
        }
        break;
    }

    return result;
  }

  /**
   * Avalia filtros adicionais do trigger
   */
  evaluateFilters(filters, data) {
    if (!filters || filters.length === 0) return true;

    for (const filter of filters) {
      if (!this.evaluateCondition(filter, data)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Avalia uma condição individual
   */
  evaluateCondition(condition, data) {
    const { field, operator, value, caseSensitive } = condition;
    
    // Obter valor do campo no data
    let fieldValue = this.getNestedValue(data, field);
    let compareValue = value;

    // Normalizar para comparação case-insensitive
    if (!caseSensitive && typeof fieldValue === 'string') {
      fieldValue = fieldValue.toLowerCase();
    }
    if (!caseSensitive && typeof compareValue === 'string') {
      compareValue = compareValue.toLowerCase();
    }

    switch (operator) {
      case 'equals':
        return fieldValue === compareValue;
      
      case 'not_equals':
        return fieldValue !== compareValue;
      
      case 'contains':
        return String(fieldValue).includes(String(compareValue));
      
      case 'not_contains':
        return !String(fieldValue).includes(String(compareValue));
      
      case 'starts_with':
        return String(fieldValue).startsWith(String(compareValue));
      
      case 'ends_with':
        return String(fieldValue).endsWith(String(compareValue));
      
      case 'regex':
        try {
          const regex = new RegExp(compareValue, caseSensitive ? '' : 'i');
          return regex.test(String(fieldValue));
        } catch {
          return false;
        }
      
      case 'greater_than':
        return Number(fieldValue) > Number(compareValue);
      
      case 'less_than':
        return Number(fieldValue) < Number(compareValue);
      
      case 'is_empty':
        return !fieldValue || fieldValue === '' || 
               (Array.isArray(fieldValue) && fieldValue.length === 0);
      
      case 'is_not_empty':
        return fieldValue && fieldValue !== '' && 
               (!Array.isArray(fieldValue) || fieldValue.length > 0);
      
      case 'in_list':
        {
          const list = Array.isArray(compareValue) ? compareValue : String(compareValue).split(',').map(s => s.trim());
          return list.includes(String(fieldValue));
        }
      
      case 'not_in_list':
        {
          const notList = Array.isArray(compareValue) ? compareValue : String(compareValue).split(',').map(s => s.trim());
          return !notList.includes(String(fieldValue));
        }
      
      default:
        console.warn(`[FlowsEngine] Operador desconhecido: ${operator}`);
        return false;
    }
  }

  /**
   * Verifica se pode executar o flow (cooldown, limites)
   */
  canExecuteFlow(flow, chatId) {
    const key = `${chatId}_${flow.id}`;
    const history = this.executionHistory.get(key);
    
    if (!history) return true;

    // Verificar cooldown
    if (flow.settings && flow.settings.cooldownMinutes > 0) {
      const cooldownMs = flow.settings.cooldownMinutes * 60 * 1000;
      const timeSinceLastExecution = Date.now() - history.lastExecution;
      if (timeSinceLastExecution < cooldownMs) {
        console.log(`[FlowsEngine] Flow "${flow.name}" em cooldown para chat ${chatId}`);
        return false;
      }
    }

    // Verificar limite de execuções
    if (flow.settings && flow.settings.maxExecutionsPerContact > 0) {
      if (history.executionCount >= flow.settings.maxExecutionsPerContact) {
        console.log(`[FlowsEngine] Flow "${flow.name}" atingiu limite para chat ${chatId}`);
        return false;
      }
    }

    // Verificar horário comercial
    if (flow.settings && flow.settings.onlyDuringBusinessHours) {
      if (!this.isWithinBusinessHours(flow.settings.businessHours)) {
        console.log(`[FlowsEngine] Flow "${flow.name}" fora do horário comercial`);
        return false;
      }
    }

    // Verificar execução concorrente
    if (flow.settings && !flow.settings.allowConcurrent) {
      for (const [, state] of this.activeExecutions) {
        if (state.flowId === flow.id && state.chatId === chatId && state.status === 'running') {
          console.log(`[FlowsEngine] Flow "${flow.name}" já em execução para chat ${chatId}`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Verifica se está dentro do horário comercial
   */
  isWithinBusinessHours(businessHours) {
    if (!businessHours) return true;
    const now = new Date();
    const day = now.getDay(); // 0 = domingo
    
    if (businessHours.days && !businessHours.days.includes(day)) return false;

    const [startHour, startMin] = (businessHours.start || '00:00').split(':').map(Number);
    const [endHour, endMin] = (businessHours.end || '23:59').split(':').map(Number);
    
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Constrói contexto para interpolação de variáveis
   */
  buildContext(eventData) {
    const now = new Date();
    
    return {
      contact: {
        name: eventData.contactName || eventData.pushname || 'Contato',
        phone: eventData.chatId?.replace('@c.us', '') || '',
        pushname: eventData.pushname || '',
        id: eventData.chatId || '',
      },
      message: {
        body: eventData.body || '',
        type: eventData.type || 'chat',
        timestamp: eventData.timestamp || Date.now(),
        id: eventData.messageId || '',
        hasMedia: eventData.hasMedia || false,
        mediaType: eventData.mediaType || null,
      },
      chat: {
        id: eventData.chatId || '',
        name: eventData.chatName || eventData.contactName || '',
        isGroup: eventData.isGroup || false,
      },
      system: {
        date: now.toLocaleDateString('pt-BR'),
        time: now.toLocaleTimeString('pt-BR'),
        datetime: now.toLocaleString('pt-BR'),
        timestamp: Date.now(),
        random: Math.floor(Math.random() * 1000),
        dayOfWeek: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][now.getDay()],
      },
      custom: this.variables.get(eventData.chatId) || {},
      event: eventData,
    };
  }

  /**
   * Interpola variáveis em uma string
   */
  interpolateVariables(template, context) {
    if (!template || typeof template !== 'string') return template;

    return template.replace(/\{\{([^^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path.trim());
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Obtém valor aninhado de um objeto
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Registra execução do flow
   */
  recordExecution(flowId, chatId) {
    const key = `${chatId}_${flowId}`;
    const history = this.executionHistory.get(key) || { executionCount: 0 };
    
    history.lastExecution = Date.now();
    history.executionCount++;
    
    this.executionHistory.set(key, history);

    // Persistir no storage
    this.saveExecutionHistory();
  }

  /**
   * Salva histórico de execuções
   */
  async saveExecutionHistory() {
    const historyObj = Object.fromEntries(this.executionHistory);
    return new Promise((resolve) => {
      chrome.storage.local.set({ quantum_flow_history: historyObj }, resolve);
    });
  }

  /**
   * Carrega histórico de execuções
   */
  async loadExecutionHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_flow_history'], (result) => {
        if (result.quantum_flow_history) {
          this.executionHistory = new Map(Object.entries(result.quantum_flow_history));
        }
        resolve();
      });
    });
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Verifica se está no horário agendado
   */
  checkSchedule(schedule) {
    if (!schedule) return false;
    
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Verificar dia da semana
    if (schedule.days && !schedule.days.includes(currentDay)) {
      return false;
    }

    // Verificar hora específica
    if (schedule.time) {
      const [hour, minute] = schedule.time.split(':').map(Number);
      // Tolerância de 1 minuto
      if (currentHour !== hour || Math.abs(currentMinute - minute) > 1) {
        return false;
      }
    }

    // Verificar intervalo
    if (schedule.interval) {
      const lastCheck = schedule._lastCheck || 0;
      const intervalMs = schedule.interval * 60 * 1000;
      if (Date.now() - lastCheck < intervalMs) {
        return false;
      }
      schedule._lastCheck = Date.now();
    }

    return true;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlowsEngine;
}
if (typeof window !== 'undefined') {
  window.FlowsEngine = FlowsEngine;
}
