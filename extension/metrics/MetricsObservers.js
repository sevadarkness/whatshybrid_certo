// metrics/MetricsObservers.js
import { SELECTORS, MetricType, MediaType, MessageDirection } from './MetricsTypes.js';

class MetricsObservers {
  constructor(collector) {
    this.collector = collector;
    this.observers = new Map();
    this.processedMessages = new Set();
    this.currentChatId = null;
    this.lastMessageTimestamps = new Map(); // chatId -> { incoming: timestamp, outgoing: timestamp }
  }

  // ============ INICIALIZAÇÃO ============

  init() {
    this.observeChatList();
    this.observeConversationPanel();
    this.observeMessageList();
    this.observeTypingIndicator();
    this.observeOnlineStatus();

    // Observar mudança de chat ativo
    this.observeChatChange();

    console.log('[MetricsObservers] Todos os observers inicializados');
  }

  destroy() {
    this.observers.forEach((observer, key) => {
      observer.disconnect();
      console.log(`[MetricsObservers] Observer ${key} desconectado`);
    });
    this.observers.clear();
    this.processedMessages.clear();
  }

  // ============ OBSERVER: LISTA DE CHATS ============

  observeChatList() {
    const chatList = document.querySelector(SELECTORS.CHAT_LIST);
    if (!chatList) {
      console.warn('[MetricsObservers] Chat list não encontrada, tentando novamente...');
      setTimeout(() => this.observeChatList(), 2000);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Detectar novos chats / mudanças de unread
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processUnreadBadge(node);
          }
        });
      });
    });

    observer.observe(chatList, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-testid']
    });

    this.observers.set('chatList', observer);
    console.log('[MetricsObservers] Observer de chat list ativo');
  }

  processUnreadBadge(node) {
    const badge = node.querySelector?.(SELECTORS.UNREAD_BADGE) || 
                  (node.matches?.(SELECTORS.UNREAD_BADGE) ? node : null);

    if (badge) {
      const count = parseInt(badge.textContent) || 0;
      const chatItem = badge.closest('[data-testid="cell-frame-container"]');
      const chatId = this.extractChatIdFromElement(chatItem);

      if (chatId && count > 0) {
        this.collector.trackMetric({
          type: MetricType.MESSAGE_RECEIVED,
          chatId,
          unreadCount: count,
          source: 'badge'
        });
      }
    }
  }

  // ============ OBSERVER: PAINEL DE CONVERSA ============

  observeConversationPanel() {
    const mainPanel = document.querySelector(SELECTORS.CONVERSATION_PANEL);
    if (!mainPanel) {
      setTimeout(() => this.observeConversationPanel(), 2000);
      return;
    }

    const observer = new MutationObserver(() => {
      this.detectChatChange();
    });

    observer.observe(mainPanel, {
      childList: true,
      subtree: false
    });

    this.observers.set('conversationPanel', observer);
  }

  observeChatChange() {
    // Polling para mudança de chat (mais confiável)
    setInterval(() => {
      this.detectChatChange();
    }, 1000);
  }

  detectChatChange() {
    const header = document.querySelector(SELECTORS.CHAT_HEADER);
    if (!header) return;

    const chatId = this.extractCurrentChatId();

    if (chatId && chatId !== this.currentChatId) {
      const previousChatId = this.currentChatId;
      this.currentChatId = chatId;

      // Emitir evento de mudança
      if (previousChatId) {
        this.collector.trackMetric({
          type: MetricType.CONVERSATION_ENDED,
          chatId: previousChatId
        });
      }

      this.collector.trackMetric({
        type: MetricType.CONVERSATION_STARTED,
        chatId: chatId
      });

      // Re-observar mensagens do novo chat
      this.observeMessageList();
    }
  }

  // ============ OBSERVER: LISTA DE MENSAGENS ============

  observeMessageList() {
    // Desconectar observer anterior
    if (this.observers.has('messageList')) {
      this.observers.get('messageList').disconnect();
    }

    const messageContainer = document.querySelector(SELECTORS.MESSAGE_LIST) ||
                             document.querySelector('[role="application"]');

    if (!messageContainer) {
      setTimeout(() => this.observeMessageList(), 2000);
      return;
    }

    // Processar mensagens existentes
    this.processExistingMessages(messageContainer);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processMessageNode(node);
          }
        });

        // Detectar mensagens removidas (apagadas)
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processRemovedNode(node);
          }
        });

        // Detectar mudanças de atributos (edição, status)
        if (mutation.type === 'attributes') {
          this.processAttributeChange(mutation.target);
        }
      });
    });

    observer.observe(messageContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-testid', 'class']
    });

    this.observers.set('messageList', observer);
    console.log('[MetricsObservers] Observer de mensagens ativo');
  }

  processExistingMessages(container) {
    const messages = container.querySelectorAll(`${SELECTORS.MESSAGE_IN}, ${SELECTORS.MESSAGE_OUT}`);
    messages.forEach((msg) => {
      this.processMessageNode(msg, false); // false = não é nova
    });
  }

  processMessageNode(node, isNew = true) {
    // Encontrar elemento de mensagem
    const messageEl = node.closest?.(SELECTORS.MESSAGE_IN) || 
                      node.closest?.(SELECTORS.MESSAGE_OUT) ||
                      node.querySelector?.(SELECTORS.MESSAGE_IN) ||
                      node.querySelector?.(SELECTORS.MESSAGE_OUT);

    if (!messageEl) return;

    const messageId = this.extractMessageId(messageEl);
    if (!messageId || this.processedMessages.has(messageId)) return;

    this.processedMessages.add(messageId);

    const isOutgoing = messageEl.classList.contains('message-out');
    const direction = isOutgoing ? MessageDirection.OUTGOING : MessageDirection.INCOMING;
    const chatId = this.currentChatId;
    const timestamp = this.extractMessageTimestamp(messageEl);

    // Detectar tipo de mídia
    const mediaType = this.detectMediaType(messageEl);

    // Detectar se é mensagem apagada
    const isDeleted = !!messageEl.querySelector(SELECTORS.MESSAGE_DELETED);

    // Detectar se é mensagem editada
    const isEdited = !!messageEl.querySelector(SELECTORS.MESSAGE_EDITED);

    // Criar métrica base
    const metric = {
      type: isOutgoing ? MetricType.MESSAGE_SENT : MetricType.MESSAGE_RECEIVED,
      chatId,
      messageId,
      direction,
      timestamp,
      isNew,
      mediaType,
      isDeleted,
      isEdited,
      textLength: this.extractTextLength(messageEl)
    };

    // Rastrear métrica principal
    if (isNew) {
      this.collector.trackMetric(metric);

      // Rastrear mídia separadamente
      if (mediaType) {
        this.collector.trackMetric({
          type: `media_${mediaType}`,
          chatId,
          messageId,
          direction,
          timestamp
        });
      }

      // Calcular tempo de resposta
      this.calculateResponseTime(chatId, direction, timestamp);
    }

    // Rastrear edição
    if (isEdited) {
      this.collector.trackMetric({
        type: MetricType.MESSAGE_EDITED,
        chatId,
        messageId,
        timestamp
      });
    }
  }

  processRemovedNode(node) {
    const messageEl = node.closest?.('.message-in, .message-out') ||
                      node.querySelector?.('.message-in, .message-out');

    if (messageEl) {
      const messageId = this.extractMessageId(messageEl);
      if (messageId) {
        this.collector.trackMetric({
          type: MetricType.MESSAGE_DELETED,
          chatId: this.currentChatId,
          messageId,
          timestamp: Date.now()
        });
      }
    }
  }

  processAttributeChange(target) {
    // Detectar quando mensagem é marcada como editada
    if (target.matches?.(SELECTORS.MESSAGE_EDITED)) {
      const messageEl = target.closest('.message-in, .message-out');
      if (messageEl) {
        const messageId = this.extractMessageId(messageEl);
        this.collector.trackMetric({
          type: MetricType.MESSAGE_EDITED,
          chatId: this.currentChatId,
          messageId,
          timestamp: Date.now()
        });
      }
    }
  }

  // ============ OBSERVER: TYPING INDICATOR ============

  observeTypingIndicator() {
    const checkTyping = () => {
      const typingEl = document.querySelector(SELECTORS.TYPING_INDICATOR);
      if (typingEl && this.currentChatId) {
        this.collector.trackMetric({
          type: MetricType.TYPING_DETECTED,
          chatId: this.currentChatId,
          timestamp: Date.now()
        });
      }
    };

    // Polling para typing (é mais confiável)
    setInterval(checkTyping, 2000);
  }

  // ============ OBSERVER: ONLINE STATUS ============

  observeOnlineStatus() {
    const checkOnline = () => {
      const onlineEl = document.querySelector(SELECTORS.ONLINE_INDICATOR);
      if (onlineEl && this.currentChatId) {
        this.collector.trackMetric({
          type: MetricType.ONLINE_STATUS,
          chatId: this.currentChatId,
          isOnline: true,
          timestamp: Date.now()
        });
      }
    };

    setInterval(checkOnline, 5000);
  }

  // ============ HELPERS ============

  extractMessageId(element) {
    // Tentar extrair do data-id
    const row = element.closest('[data-id]');
    if (row) {
      return row.getAttribute('data-id');
    }

    // Fallback: criar ID baseado em conteúdo
    const text = element.querySelector(SELECTORS.MESSAGE_TEXT)?.textContent || '';
    const time = element.querySelector(SELECTORS.MESSAGE_TIME)?.textContent || '';
    return `${this.currentChatId}_${text.slice(0, 20)}_${time}`.replace(/\s/g, '_');
  }

  extractMessageTimestamp(element) {
    const timeEl = element.querySelector(SELECTORS.MESSAGE_TIME);
    if (!timeEl) return Date.now();

    const timeText = timeEl.textContent; // Ex: "14:30"
    const today = new Date();
    const [hours, minutes] = timeText.split(':').map(Number);

    if (!isNaN(hours) && !isNaN(minutes)) {
      today.setHours(hours, minutes, 0, 0);
      return today.getTime();
    }

    return Date.now();
  }

  extractTextLength(element) {
    const textEl = element.querySelector(SELECTORS.MESSAGE_TEXT);
    return textEl?.textContent?.length || 0;
  }

  extractCurrentChatId() {
    // Método 1: Via header
    const header = document.querySelector(SELECTORS.CHAT_HEADER);
    if (header) {
      const nameEl = header.querySelector(SELECTORS.CHAT_NAME);
      if (nameEl) {
        // Extrair número de telefone do título ou usar nome como ID
        const title = nameEl.getAttribute('title') || nameEl.textContent;
        return this.normalizePhoneNumber(title);
      }
    }

    // Método 2: Via URL (se disponível)
    const match = window.location.href.match(/\/chat\/(\d+)/);
    if (match) return match[1];

    return null;
  }

  extractChatIdFromElement(element) {
    if (!element) return null;

    const nameEl = element.querySelector('[data-testid="cell-frame-title"] span');
    if (nameEl) {
      return this.normalizePhoneNumber(nameEl.textContent);
    }

    return null;
  }

  normalizePhoneNumber(text) {
    if (!text) return null;
    // Extrair apenas números
    const numbers = text.replace(/\D/g, '');
    return numbers.length >= 8 ? numbers : text.replace(/\s/g, '_');
  }

  detectMediaType(element) {
    if (element.querySelector(SELECTORS.MEDIA_PTT)) return MediaType.PTT;
    if (element.querySelector(SELECTORS.MEDIA_AUDIO)) return MediaType.AUDIO;
    if (element.querySelector(SELECTORS.MEDIA_VIDEO)) return MediaType.VIDEO;
    if (element.querySelector(SELECTORS.MEDIA_STICKER)) return MediaType.STICKER;
    if (element.querySelector(SELECTORS.MEDIA_DOCUMENT)) return MediaType.DOCUMENT;
    if (element.querySelector(SELECTORS.MEDIA_IMAGE)) return MediaType.IMAGE;
    return null;
  }

  calculateResponseTime(chatId, direction, timestamp) {
    if (!this.lastMessageTimestamps.has(chatId)) {
      this.lastMessageTimestamps.set(chatId, {});
    }

    const chatTimestamps = this.lastMessageTimestamps.get(chatId);
    const oppositeDirection = direction === MessageDirection.INCOMING ? 'outgoing' : 'incoming';

    // Se temos timestamp da última mensagem na direção oposta
    if (chatTimestamps[oppositeDirection]) {
      const responseTime = timestamp - chatTimestamps[oppositeDirection];

      // Só considerar se for um tempo razoável (entre 1s e 24h)
      if (responseTime > 1000 && responseTime < 86400000) {
        const responseDirection = direction === MessageDirection.OUTGOING ? 
          'to_customer' : 'from_customer';

        this.collector.trackResponseTime(chatId, responseTime, responseDirection);
      }
    }

    // Atualizar timestamp
    chatTimestamps[direction === MessageDirection.INCOMING ? 'incoming' : 'outgoing'] = timestamp;
  }
}

export default MetricsObservers;
