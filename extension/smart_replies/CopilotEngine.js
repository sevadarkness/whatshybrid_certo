// smart_replies/CopilotEngine.js

import { CopilotMode, SMART_REPLIES_CONFIG } from './SmartRepliesTypes.js';
import { personaManager } from './PersonaManager.js';
import { conversationContext } from './ConversationContext.js';
import { aiService } from '../services/AIService.js';

class CopilotEngine {
  constructor() {
    this.mode = CopilotMode.SUGGEST;
    this.isActive = false;
    this.currentChatId = null;
    this.suggestions = [];
    this.eventListeners = new Map();
    this.autoResponseQueue = new Map(); // chatId -> timeout
    this.responseCount = new Map(); // chatId -> count
  }

  // ============ INICIALIZAÇÃO ============

  async init() {
    await personaManager.init();
    this.loadSettings();
    console.log('[CopilotEngine] Inicializado no modo:', this.mode);
  }

  loadSettings() {
    const stored = localStorage.getItem('copilot_mode');
    if (stored && Object.values(CopilotMode).includes(stored)) {
      this.mode = stored;
    }
  }

  saveSettings() {
    localStorage.setItem('copilot_mode', this.mode);
  }

  // ============ CONTROLE DE MODO ============

  setMode(mode) {
    if (!Object.values(CopilotMode).includes(mode)) {
      throw new Error(`Modo inválido: ${mode}`);
    }
    
    this.mode = mode;
    this.saveSettings();
    this.emit('modeChanged', mode);
    
    console.log('[CopilotEngine] Modo alterado para:', mode);
    
    // Se desativou, limpar queue
    if (mode === CopilotMode.OFF) {
      this.clearAutoResponseQueue();
    }
  }

  getMode() {
    return this.mode;
  }

  isAutoMode() {
    return this.mode === CopilotMode.FULL_AUTO || this.mode === CopilotMode.SEMI_AUTO;
  }

  // ============ PROCESSAMENTO DE MENSAGENS ============

  async onNewMessage(chatId, message, isIncoming) {
    if (this.mode === CopilotMode.OFF) return;
    if (!isIncoming) return; // Só processa mensagens recebidas
    
    this.currentChatId = chatId;
    
    // Adicionar ao contexto
    conversationContext.addMessageToHistory(chatId, {
      role: 'user',
      content: message.text,
      timestamp: Date.now()
    });

    // Gerar sugestões
    await this.generateSuggestions(chatId);

    // Se modo automático, agendar resposta
    if (this.isAutoMode()) {
      this.scheduleAutoResponse(chatId);
    }
  }

  async generateSuggestions(chatId) {
    try {
      this.emit('loading', true);
      
      const context = await conversationContext.getContext(chatId);
      const persona = personaManager.getPersonaForChat(chatId);
      
      const suggestions = await aiService.generateSuggestions(context, persona, 3);
      
      this.suggestions = suggestions;
      this.emit('suggestionsReady', suggestions);
      
      return suggestions;
    } catch (error) {
      console.error('[CopilotEngine] Erro ao gerar sugestões:', error);
      this.emit('error', error);
      return [];
    } finally {
      this.emit('loading', false);
    }
  }

  async generateReply(chatId) {
    try {
      this.emit('loading', true);
      
      const context = await conversationContext.getContext(chatId);
      const persona = personaManager.getPersonaForChat(chatId);
      
      const result = await aiService.generateReply(context, persona);
      
      return result.content;
    } catch (error) {
      console.error('[CopilotEngine] Erro ao gerar resposta:', error);
      this.emit('error', error);
      return null;
    } finally {
      this.emit('loading', false);
    }
  }

  // ============ AUTO-RESPOSTA ============

  scheduleAutoResponse(chatId) {
    // Cancelar resposta anterior se existir
    if (this.autoResponseQueue.has(chatId)) {
      clearTimeout(this.autoResponseQueue.get(chatId));
    }

    // Verificar limite de respostas
    const count = this.responseCount.get(chatId) || 0;
    if (count >= SMART_REPLIES_CONFIG.MAX_AUTO_RESPONSES_PER_CHAT) {
      console.log('[CopilotEngine] Limite de auto-respostas atingido para', chatId);
      this.emit('limitReached', chatId);
      return;
    }

    const timeout = setTimeout(async () => {
      await this.executeAutoResponse(chatId);
    }, SMART_REPLIES_CONFIG.AUTO_RESPONSE_DELAY_MS);

    this.autoResponseQueue.set(chatId, timeout);
    this.emit('autoResponseScheduled', { chatId, delay: SMART_REPLIES_CONFIG.AUTO_RESPONSE_DELAY_MS });
  }

  async executeAutoResponse(chatId) {
    this.autoResponseQueue.delete(chatId);

    // Gerar resposta
    const reply = await this.generateReply(chatId);
    if (!reply) return;

    if (this.mode === CopilotMode.SEMI_AUTO) {
      // Aguardar confirmação
      this.emit('confirmationRequired', { chatId, reply });
    } else if (this.mode === CopilotMode.FULL_AUTO) {
      // Enviar diretamente
      await this.sendMessage(chatId, reply);
      
      // Incrementar contador
      const count = (this.responseCount.get(chatId) || 0) + 1;
      this.responseCount.set(chatId, count);
    }
  }

  async confirmAndSend(chatId, reply) {
    await this.sendMessage(chatId, reply);
    
    const count = (this.responseCount.get(chatId) || 0) + 1;
    this.responseCount.set(chatId, count);
  }

  cancelAutoResponse(chatId) {
    if (this.autoResponseQueue.has(chatId)) {
      clearTimeout(this.autoResponseQueue.get(chatId));
      this.autoResponseQueue.delete(chatId);
      this.emit('autoResponseCancelled', chatId);
    }
  }

  clearAutoResponseQueue() {
    for (const [chatId, timeout] of this.autoResponseQueue) {
      clearTimeout(timeout);
    }
    this.autoResponseQueue.clear();
  }

  // ============ ENVIO DE MENSAGENS ============

  async sendMessage(chatId, text, options = {}) {
    try {
      // Simular digitação
      if (options.simulateTyping !== false) {
        await this.simulateTyping(text.length);
      }

      // Enviar via DOM
      await this.injectAndSend(text);
      
      // Adicionar ao contexto
      conversationContext.addMessageToHistory(chatId, {
        role: 'assistant',
        content: text,
        timestamp: Date.now()
      });

      this.emit('messageSent', { chatId, text });
      
      return true;
    } catch (error) {
      console.error('[CopilotEngine] Erro ao enviar mensagem:', error);
      this.emit('error', error);
      return false;
    }
  }

  async simulateTyping(textLength) {
    const typingTime = Math.min(
      textLength * SMART_REPLIES_CONFIG.AUTO_RESPONSE_TYPING_SPEED,
      5000 // máximo 5 segundos
    );
    
    this.emit('typing', true);
    await new Promise(resolve => setTimeout(resolve, typingTime));
    this.emit('typing', false);
  }

  async injectAndSend(text) {
    // Encontrar input
    const input = document.querySelector('[data-testid="conversation-compose-box-input"]');
    if (!input) {
      throw new Error('Input de mensagem não encontrado');
    }

    // Focar e inserir texto
    input.focus();
    
    // Usar execCommand para compatibilidade
    document.execCommand('insertText', false, text);
    
    // Aguardar um pouco para o React processar
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clicar no botão de enviar
    const sendButton = document.querySelector('[data-testid="send"]');
    if (sendButton) {
      sendButton.click();
    } else {
      // Fallback: pressionar Enter
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      }));
    }
  }

  // ============ EVENTOS ============

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[CopilotEngine] Erro no listener ${event}:`, error);
        }
      });
    }
  }

  // ============ UTILITÁRIOS ============

  getSuggestions() {
    return this.suggestions;
  }

  resetChatCounter(chatId) {
    this.responseCount.delete(chatId);
  }

  getStats() {
    return {
      mode: this.mode,
      currentChatId: this.currentChatId,
      pendingAutoResponses: this.autoResponseQueue.size,
      responseCounts: Object.fromEntries(this.responseCount)
    };
  }
}

// Singleton
export const copilotEngine = new CopilotEngine();
export default copilotEngine;
