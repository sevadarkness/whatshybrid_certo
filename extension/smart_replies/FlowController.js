// smart_replies/FlowController.js

import { FlowStatus } from './SmartRepliesTypes.js';
import { copilotEngine } from './CopilotEngine.js';
import { conversationContext } from './ConversationContext.js';
import { aiService } from '../services/AIService.js';

class FlowController {
  constructor() {
    this.flows = new Map(); // flowId -> flowDefinition
    this.activeFlows = new Map(); // chatId -> activeFlowState
    this.eventListeners = new Map();
  }

  // ============ DEFINIÇÃO DE FLUXOS ============

  registerFlow(flowDefinition) {
    const flow = {
      id: flowDefinition.id || `flow_${Date.now()}`,
      name: flowDefinition.name,
      description: flowDefinition.description,
      trigger: flowDefinition.trigger, // { type: 'keyword' | 'intent' | 'manual', value: string }
      steps: flowDefinition.steps, // Array de steps
      fallbackMessage: flowDefinition.fallbackMessage,
      timeoutMinutes: flowDefinition.timeoutMinutes || 30,
      createdAt: Date.now()
    };

    this.flows.set(flow.id, flow);
    console.log('[FlowController] Fluxo registrado:', flow.name);
    
    return flow;
  }

  unregisterFlow(flowId) {
    this.flows.delete(flowId);
    
    // Encerrar instâncias ativas deste fluxo
    for (const [chatId, state] of this.activeFlows) {
      if (state.flowId === flowId) {
        this.endFlow(chatId, 'flow_removed');
      }
    }
  }

  getFlow(flowId) {
    return this.flows.get(flowId);
  }

  getAllFlows() {
    return Array.from(this.flows.values());
  }

  // ============ EXECUÇÃO DE FLUXOS ============

  async startFlow(chatId, flowId, initialData = {}) {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Fluxo ${flowId} não encontrado`);
    }

    // Verificar se já há um fluxo ativo
    if (this.activeFlows.has(chatId)) {
      const current = this.activeFlows.get(chatId);
      if (current.status === FlowStatus.ACTIVE) {
        throw new Error(`Já existe um fluxo ativo para este chat: ${current.flowId}`);
      }
    }

    const state = {
      flowId,
      flowName: flow.name,
      chatId,
      status: FlowStatus.ACTIVE,
      currentStepIndex: 0,
      data: { ...initialData },
      history: [],
      startedAt: Date.now(),
      lastActivityAt: Date.now()
    };

    this.activeFlows.set(chatId, state);
    this.emit('flowStarted', { chatId, flowId, flowName: flow.name });

    // Executar primeiro step
    await this.executeCurrentStep(chatId);

    return state;
  }

  async executeCurrentStep(chatId) {
    const state = this.activeFlows.get(chatId);
    if (!state || state.status !== FlowStatus.ACTIVE) return;

    const flow = this.flows.get(state.flowId);
    const step = flow.steps[state.currentStepIndex];

    if (!step) {
      // Fluxo concluído
      await this.completeFlow(chatId);
      return;
    }

    state.lastActivityAt = Date.now();

    try {
      switch (step.type) {
        case 'message':
          await this.executeMessageStep(chatId, step, state);
          break;
        
        case 'question':
          await this.executeQuestionStep(chatId, step, state);
          break;
        
        case 'condition':
          await this.executeConditionStep(chatId, step, state);
          break;
        
        case 'action':
          await this.executeActionStep(chatId, step, state);
          break;
        
        case 'ai_response':
          await this.executeAIResponseStep(chatId, step, state);
          break;
        
        case 'handoff':
          await this.executeHandoffStep(chatId, step, state);
          break;
        
        case 'delay':
          await this.executeDelayStep(chatId, step, state);
          break;

        default:
          console.warn(`[FlowController] Tipo de step desconhecido: ${step.type}`);
          this.advanceStep(chatId);
      }
    } catch (error) {
      console.error('[FlowController] Erro ao executar step:', error);
      this.emit('stepError', { chatId, step, error });
      
      // Enviar mensagem de fallback
      if (flow.fallbackMessage) {
        await copilotEngine.sendMessage(chatId, flow.fallbackMessage);
      }
    }
  }

  // ============ TIPOS DE STEPS ============

  async executeMessageStep(chatId, step, state) {
    let message = step.message;
    
    // Substituir variáveis
    message = this.replaceVariables(message, state.data);
    
    await copilotEngine.sendMessage(chatId, message);
    
    state.history.push({
      stepIndex: state.currentStepIndex,
      type: 'message',
      message,
      timestamp: Date.now()
    });

    // Avançar automaticamente
    this.advanceStep(chatId);
  }

  async executeQuestionStep(chatId, step, state) {
    let question = step.question;
    question = this.replaceVariables(question, state.data);
    
    await copilotEngine.sendMessage(chatId, question);
    
    // Mudar status para aguardando input
    state.status = FlowStatus.WAITING_INPUT;
    state.waitingFor = {
      variable: step.variable,
      validation: step.validation,
      options: step.options
    };

    state.history.push({
      stepIndex: state.currentStepIndex,
      type: 'question',
      question,
      timestamp: Date.now()
    });

    this.emit('waitingForInput', { chatId, step });
  }

  async executeConditionStep(chatId, step, state) {
    const { variable, operator, value, trueStep, falseStep } = step;
    const actualValue = state.data[variable];
    
    let result = false;
    switch (operator) {
      case 'equals':
        result = actualValue === value;
        break;
      case 'contains':
        result = String(actualValue).toLowerCase().includes(String(value).toLowerCase());
        break;
      case 'greater':
        result = Number(actualValue) > Number(value);
        break;
      case 'less':
        result = Number(actualValue) < Number(value);
        break;
      case 'exists':
        result = actualValue !== undefined && actualValue !== null;
        break;
    }

    state.history.push({
      stepIndex: state.currentStepIndex,
      type: 'condition',
      variable,
      operator,
      value,
      actualValue,
      result,
      timestamp: Date.now()
    });

    // Ir para o step apropriado
    if (result && trueStep !== undefined) {
      state.currentStepIndex = trueStep;
    } else if (!result && falseStep !== undefined) {
      state.currentStepIndex = falseStep;
    } else {
      state.currentStepIndex++;
    }

    await this.executeCurrentStep(chatId);
  }

  async executeActionStep(chatId, step, state) {
    const { action, params } = step;
    
    try {
      // Executar ação customizada
      if (step.handler && typeof step.handler === 'function') {
        const result = await step.handler(state.data, params);
        if (result) {
          Object.assign(state.data, result);
        }
      }

      // Ações built-in
      switch (action) {
        case 'save_data':
          // Salvar dados no storage
          await this.saveFlowData(chatId, state.data);
          break;
        
        case 'api_call':
          const apiResult = await this.makeAPICall(params, state.data);
          if (params.saveAs) {
            state.data[params.saveAs] = apiResult;
          }
          break;
        
        case 'set_variable':
          state.data[params.variable] = this.replaceVariables(params.value, state.data);
          break;
      }

      state.history.push({
        stepIndex: state.currentStepIndex,
        type: 'action',
        action,
        timestamp: Date.now()
      });

      this.advanceStep(chatId);
    } catch (error) {
      console.error('[FlowController] Erro na ação:', error);
      throw error;
    }
  }

  async executeAIResponseStep(chatId, step, state) {
    const context = await conversationContext.getContext(chatId);
    
    // Adicionar dados do fluxo ao contexto
    const enrichedContext = {
      ...context,
      flowData: state.data,
      instruction: step.instruction
    };

    const systemPrompt = step.systemPrompt || 
      `Você está em um fluxo de atendimento. Use os dados coletados para responder.
      Dados do fluxo: ${JSON.stringify(state.data)}
      Instrução: ${step.instruction || 'Responda de forma natural'}`;

    const result = await aiService.chat(
      enrichedContext.messages,
      { systemPrompt, temperature: 0.7, maxTokens: 300 }
    );

    await copilotEngine.sendMessage(chatId, result.content);

    state.history.push({
      stepIndex: state.currentStepIndex,
      type: 'ai_response',
      response: result.content,
      timestamp: Date.now()
    });

    this.advanceStep(chatId);
  }

  async executeHandoffStep(chatId, step, state) {
    state.status = FlowStatus.HANDED_OFF;
    
    const message = step.message || 'Vou transferir você para um atendente humano. Aguarde um momento.';
    await copilotEngine.sendMessage(chatId, message);

    state.history.push({
      stepIndex: state.currentStepIndex,
      type: 'handoff',
      reason: step.reason,
      timestamp: Date.now()
    });

    this.emit('handoff', { 
      chatId, 
      flowId: state.flowId, 
      reason: step.reason,
      data: state.data 
    });
  }

  async executeDelayStep(chatId, step, state) {
    const delayMs = (step.seconds || 1) * 1000;
    
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    this.advanceStep(chatId);
  }

  // ============ PROCESSAMENTO DE INPUT ============

  async processUserInput(chatId, message) {
    const state = this.activeFlows.get(chatId);
    if (!state) return false;
    
    // Verificar timeout
    if (this.isFlowTimedOut(state)) {
      await this.endFlow(chatId, 'timeout');
      return false;
    }

    if (state.status !== FlowStatus.WAITING_INPUT) {
      return false;
    }

    const { variable, validation, options } = state.waitingFor;
    let value = message.trim();
    let isValid = true;

    // Validação
    if (validation) {
      isValid = this.validateInput(value, validation);
    }

    // Se tem opções, verificar se é uma das opções
    if (options && options.length > 0) {
      const matchedOption = options.find(opt => 
        opt.toLowerCase() === value.toLowerCase() ||
        (opt.match(/^\d+$/) && options[parseInt(opt) - 1])
      );
      
      if (matchedOption) {
        value = matchedOption;
      } else {
        isValid = false;
      }
    }

    if (!isValid) {
      const flow = this.flows.get(state.flowId);
      const step = flow.steps[state.currentStepIndex];
      const errorMessage = step.errorMessage || 'Resposta inválida. Por favor, tente novamente.';
      await copilotEngine.sendMessage(chatId, errorMessage);
      return true;
    }

    // Salvar valor
    state.data[variable] = value;
    state.status = FlowStatus.ACTIVE;
    state.lastActivityAt = Date.now();

    state.history.push({
      stepIndex: state.currentStepIndex,
      type: 'user_input',
      variable,
      value,
      timestamp: Date.now()
    });

    // Avançar para próximo step
    this.advanceStep(chatId);

    return true;
  }

  validateInput(value, validation) {
    switch (validation.type) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      
      case 'phone':
        return /^[\d\s\-\+]{8,}$/.test(value);
      
      case 'number':
        return !isNaN(Number(value));
      
      case 'cpf':
        return /^\d{3}\.?\d{3}\.?\d{3}\-?\d{2}$/.test(value);
      
      case 'regex':
        return new RegExp(validation.pattern).test(value);
      
      case 'minLength':
        return value.length >= validation.value;
      
      case 'maxLength':
        return value.length <= validation.value;
      
      default:
        return true;
    }
  }

  // ============ CONTROLE DE FLUXO ============

  advanceStep(chatId) {
    const state = this.activeFlows.get(chatId);
    if (!state) return;

    state.currentStepIndex++;
    state.lastActivityAt = Date.now();

    // Executar próximo step
    this.executeCurrentStep(chatId);
  }

  async completeFlow(chatId) {
    const state = this.activeFlows.get(chatId);
    if (!state) return;

    state.status = FlowStatus.COMPLETED;
    state.completedAt = Date.now();

    // Salvar dados finais
    await this.saveFlowData(chatId, state.data);

    this.emit('flowCompleted', {
      chatId,
      flowId: state.flowId,
      data: state.data,
      history: state.history,
      duration: state.completedAt - state.startedAt
    });

    // Limpar após um tempo
    setTimeout(() => {
      this.activeFlows.delete(chatId);
    }, 60000);
  }

  async endFlow(chatId, reason = 'manual') {
    const state = this.activeFlows.get(chatId);
    if (!state) return;

    state.status = FlowStatus.COMPLETED;
    state.endedAt = Date.now();
    state.endReason = reason;

    this.emit('flowEnded', {
      chatId,
      flowId: state.flowId,
      reason,
      data: state.data
    });

    this.activeFlows.delete(chatId);
  }

  pauseFlow(chatId) {
    const state = this.activeFlows.get(chatId);
    if (state && state.status === FlowStatus.ACTIVE) {
      state.status = FlowStatus.PAUSED;
      this.emit('flowPaused', { chatId, flowId: state.flowId });
    }
  }

  resumeFlow(chatId) {
    const state = this.activeFlows.get(chatId);
    if (state && state.status === FlowStatus.PAUSED) {
      state.status = FlowStatus.ACTIVE;
      state.lastActivityAt = Date.now();
      this.emit('flowResumed', { chatId, flowId: state.flowId });
      this.executeCurrentStep(chatId);
    }
  }

  // ============ TRIGGERS ============

  async checkTriggers(chatId, message) {
    // Verificar se já há fluxo ativo
    if (this.activeFlows.has(chatId)) {
      const state = this.activeFlows.get(chatId);
      if (state.status === FlowStatus.ACTIVE || state.status === FlowStatus.WAITING_INPUT) {
        return this.processUserInput(chatId, message);
      }
    }

    // Verificar triggers de todos os fluxos
    for (const [flowId, flow] of this.flows) {
      if (this.matchesTrigger(flow.trigger, message)) {
        await this.startFlow(chatId, flowId);
        return true;
      }
    }

    return false;
  }

  matchesTrigger(trigger, message) {
    if (!trigger) return false;

    const lowerMessage = message.toLowerCase();

    switch (trigger.type) {
      case 'keyword':
        const keywords = Array.isArray(trigger.value) ? trigger.value : [trigger.value];
        return keywords.some(kw => lowerMessage.includes(kw.toLowerCase()));
      
      case 'startsWith':
        return lowerMessage.startsWith(trigger.value.toLowerCase());
      
      case 'exact':
        return lowerMessage === trigger.value.toLowerCase();
      
      case 'regex':
        return new RegExp(trigger.value, 'i').test(message);
      
      default:
        return false;
    }
  }

  // ============ HELPERS ============

  replaceVariables(text, data) {
    return text.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return data[variable] !== undefined ? data[variable] : match;
    });
  }

  isFlowTimedOut(state) {
    const flow = this.flows.get(state.flowId);
    const timeoutMs = (flow.timeoutMinutes || 30) * 60 * 1000;
    return Date.now() - state.lastActivityAt > timeoutMs;
  }

  async saveFlowData(chatId, data) {
    const key = `flow_data_${chatId}`;
    await new Promise(resolve => {
      chrome.storage.local.set({ [key]: data }, resolve);
    });
  }

  async makeAPICall(params, data) {
    const url = this.replaceVariables(params.url, data);
    const response = await fetch(url, {
      method: params.method || 'GET',
      headers: params.headers || {},
      body: params.body ? JSON.stringify(
        typeof params.body === 'string' 
          ? JSON.parse(this.replaceVariables(params.body, data))
          : params.body
      ) : undefined
    });
    return response.json();
  }

  getActiveFlow(chatId) {
    return this.activeFlows.get(chatId);
  }

  // ============ EVENTOS ============

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(cb => cb(data));
    }
  }
}

// Singleton
export const flowController = new FlowController();
export default flowController;
