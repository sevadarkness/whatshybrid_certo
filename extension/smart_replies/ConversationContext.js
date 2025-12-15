// smart_replies/ConversationContext.js

import { SMART_REPLIES_CONFIG, SELECTORS } from './SmartRepliesTypes.js';

class ConversationContext {
  constructor() {
    this.contextCache = new Map(); // chatId -> context
    this.messageHistory = new Map(); // chatId -> messages[]
  }

  // ============ COLETA DE CONTEXTO ============

  async getContext(chatId) {
    // Verificar cache
    const cached = this.contextCache.get(chatId);
    if (cached && Date.now() - cached.timestamp < 30000) { // 30s cache
      return cached.data;
    }

    const context = await this.buildContext(chatId);
    this.contextCache.set(chatId, {
      data: context,
      timestamp: Date.now()
    });

    return context;
  }

  async buildContext(chatId) {
    const messages = await this.extractMessages();
    const customerInfo = this.extractCustomerInfo();
    const conversationMeta = this.extractConversationMeta(messages);

    return {
      chatId,
      customerName: customerInfo.name,
      customerPhone: customerInfo.phone,
      messages: this.formatMessagesForAI(messages),
      messageCount: messages.length,
      lastCustomerMessage: this.getLastCustomerMessage(messages),
      lastAgentMessage: this.getLastAgentMessage(messages),
      conversationStartTime: conversationMeta.startTime,
      topics: conversationMeta.topics,
      sentiment: conversationMeta.sentiment,
      isFirstContact: conversationMeta.isFirstContact,
      unansweredCount: conversationMeta.unansweredCount
    };
  }

  extractMessages() {
    const messages = [];
    const messageElements = document.querySelectorAll(`${SELECTORS.MESSAGE_IN}, ${SELECTORS.MESSAGE_OUT}`);
    
    // Pegar últimas N mensagens
    const recentMessages = Array.from(messageElements).slice(-SMART_REPLIES_CONFIG.MAX_CONTEXT_MESSAGES);

    recentMessages.forEach((el, index) => {
      const isOutgoing = el.classList.contains('message-out');
      const textEl = el.querySelector(SELECTORS.MESSAGE_TEXT);
      const text = textEl?.textContent?.trim() || '';
      
      if (text) {
        messages.push({
          id: index,
          role: isOutgoing ? 'assistant' : 'user',
          content: text,
          timestamp: this.extractTimestamp(el),
          type: this.detectMessageType(el)
        });
      }
    });

    return messages;
  }

  extractCustomerInfo() {
    const header = document.querySelector(SELECTORS.CHAT_HEADER);
    const nameEl = header?.querySelector(SELECTORS.CHAT_NAME);
    const name = nameEl?.textContent?.trim() || 'Cliente';
    
    // Tentar extrair número de telefone
    const phoneMatch = name.match(/\+?[\d\s-]{10,}/);
    const phone = phoneMatch ? phoneMatch[0].replace(/\s/g, '') : null;

    return {
      name: phoneMatch ? 'Cliente' : name,
      phone
    };
  }

  extractConversationMeta(messages) {
    const customerMessages = messages.filter(m => m.role === 'user');
    const agentMessages = messages.filter(m => m.role === 'assistant');
    
    // Detectar tópicos (simplificado - pode ser melhorado com NLP)
    const allText = messages.map(m => m.content).join(' ').toLowerCase();
    const topics = this.detectTopics(allText);
    
    // Detectar sentimento (simplificado)
    const sentiment = this.detectSentiment(customerMessages.map(m => m.content).join(' '));
    
    // Contar mensagens não respondidas
    let unansweredCount = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        unansweredCount++;
      } else {
        break;
      }
    }

    return {
      startTime: messages[0]?.timestamp || Date.now(),
      topics,
      sentiment,
      isFirstContact: messages.length <= 2,
      unansweredCount
    };
  }

  detectTopics(text) {
    const topicKeywords = {
      'preço': ['preço', 'valor', 'quanto custa', 'orçamento', 'promoção', 'desconto'],
      'produto': ['produto', 'modelo', 'versão', 'estoque', 'disponível'],
      'entrega': ['entrega', 'frete', 'prazo', 'envio', 'chegou', 'rastreio'],
      'pagamento': ['pagamento', 'pagar', 'cartão', 'pix', 'boleto', 'parcelar'],
      'suporte': ['problema', 'erro', 'não funciona', 'ajuda', 'dúvida', 'defeito'],
      'reclamação': ['reclamação', 'insatisfeito', 'péssimo', 'horrível', 'absurdo'],
      'devolução': ['devolver', 'devolução', 'troca', 'reembolso', 'arrependimento']
    };

    const detectedTopics = [];
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        detectedTopics.push(topic);
      }
    }

    return detectedTopics;
  }

  detectSentiment(text) {
    const lowerText = text.toLowerCase();
    
    const positiveWords = ['obrigado', 'ótimo', 'excelente', 'perfeito', 'adorei', 'maravilhoso', 'parabéns'];
    const negativeWords = ['ruim', 'péssimo', 'horrível', 'problema', 'irritado', 'absurdo', 'decepcionado'];
    const urgentWords = ['urgente', 'rápido', 'agora', 'imediato', 'socorro'];

    let score = 0;
    positiveWords.forEach(w => { if (lowerText.includes(w)) score++; });
    negativeWords.forEach(w => { if (lowerText.includes(w)) score--; });
    
    const isUrgent = urgentWords.some(w => lowerText.includes(w));

    return {
      score,
      label: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral',
      isUrgent
    };
  }

  // ============ FORMATAÇÃO PARA IA ============

  formatMessagesForAI(messages) {
    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  getLastCustomerMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i];
      }
    }
    return null;
  }

  getLastAgentMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i];
      }
    }
    return null;
  }

  // ============ HELPERS ============

  extractTimestamp(element) {
    const timeEl = element.querySelector('[data-testid="msg-time"]');
    if (!timeEl) return Date.now();
    
    const timeText = timeEl.textContent;
    const [hours, minutes] = timeText.split(':').map(Number);
    
    const date = new Date();
    if (!isNaN(hours) && !isNaN(minutes)) {
      date.setHours(hours, minutes, 0, 0);
    }
    
    return date.getTime();
  }

  detectMessageType(element) {
    if (element.querySelector('[data-testid="audio-play"]')) return 'audio';
    if (element.querySelector('[data-testid="media-url-provider"] video')) return 'video';
    if (element.querySelector('[data-testid="media-url-provider"] img')) return 'image';
    if (element.querySelector('[data-testid="document-thumb"]')) return 'document';
    return 'text';
  }

  // ============ CACHE MANAGEMENT ============

  clearCache(chatId = null) {
    if (chatId) {
      this.contextCache.delete(chatId);
      this.messageHistory.delete(chatId);
    } else {
      this.contextCache.clear();
      this.messageHistory.clear();
    }
  }

  addMessageToHistory(chatId, message) {
    if (!this.messageHistory.has(chatId)) {
      this.messageHistory.set(chatId, []);
    }
    
    const history = this.messageHistory.get(chatId);
    history.push(message);
    
    // Limitar tamanho
    if (history.length > SMART_REPLIES_CONFIG.MAX_CONTEXT_MESSAGES * 2) {
      history.shift();
    }
    
    // Invalidar cache de contexto
    this.contextCache.delete(chatId);
  }
}

// Singleton
export const conversationContext = new ConversationContext();
export default conversationContext;
