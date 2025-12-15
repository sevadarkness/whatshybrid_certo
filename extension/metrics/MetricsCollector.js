// metrics/MetricsCollector.js
import metricsCache from './MetricsCache.js';
import MetricsObservers from './MetricsObservers.js';
import { MetricType, SYNC_CONFIG } from './MetricsTypes.js';

class MetricsCollector {
  constructor() {
    this.observers = null;
    this.isRunning = false;
    this.metricsBuffer = [];
    this.bufferFlushInterval = null;
    this.eventListeners = new Map();

    // Estatísticas em memória para acesso rápido
    this.liveStats = {
      sessionStart: Date.now(),
      messagesSent: 0,
      messagesReceived: 0,
      activeChats: new Set(),
      lastActivity: null
    };
  }

  // ============ INICIALIZAÇÃO ============

  async init() {
    if (this.isRunning) {
      console.warn('[MetricsCollector] Já está rodando');
      return;
    }

    try {
      // Aguardar cache estar pronto
      await metricsCache.ensureReady();

      // Inicializar observers
      this.observers = new MetricsObservers(this);
      this.observers.init();

      // Iniciar flush periódico do buffer
      this.startBufferFlush();

      // Limpar dados antigos periodicamente
      this.startCleanupJob();

      this.isRunning = true;
      console.log('[MetricsCollector] Inicializado com sucesso');

      this.emit('initialized');
    } catch (error) {
      console.error('[MetricsCollector] Erro na inicialização:', error);
      throw error;
    }
  }

  destroy() {
    if (this.observers) {
      this.observers.destroy();
    }

    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }

    // Flush final do buffer
    this.flushBuffer();

    this.isRunning = false;
    console.log('[MetricsCollector] Destruído');
  }

  // ============ TRACKING ============

  trackMetric(metric) {
    const enrichedMetric = {
      ...metric,
      timestamp: metric.timestamp || Date.now(),
      sessionId: this.getSessionId()
    };

    // Adicionar ao buffer
    this.metricsBuffer.push(enrichedMetric);

    // Atualizar stats em memória
    this.updateLiveStats(enrichedMetric);

    // Emitir evento
    this.emit('metric', enrichedMetric);

    // Flush imediato se buffer estiver grande
    if (this.metricsBuffer.length >= 20) {
      this.flushBuffer();
    }

    return enrichedMetric;
  }

  trackResponseTime(chatId, responseTimeMs, direction) {
    metricsCache.addResponseTime(chatId, responseTimeMs, direction);

    this.emit('responseTime', { chatId, responseTimeMs, direction });

    // Atualizar conversa
    this.updateConversationStats(chatId, { responseTime: responseTimeMs });
  }

  async trackConversationStart(chatId, metadata = {}) {
    await metricsCache.updateConversation(chatId, {
      startedAt: Date.now(),
      isActive: true,
      ...metadata
    });

    this.trackMetric({
      type: MetricType.CONVERSATION_STARTED,
      chatId,
      metadata
    });
  }

  async trackConversationEnd(chatId) {
    const conversation = await metricsCache.getConversation(chatId);
    const duration = conversation ? Date.now() - conversation.startedAt : 0;

    await metricsCache.updateConversation(chatId, {
      endedAt: Date.now(),
      duration,
      isActive: false
    });

    this.trackMetric({
      type: MetricType.CONVERSATION_ENDED,
      chatId,
      duration
    });
  }

  // ============ BUFFER MANAGEMENT ============

  startBufferFlush() {
    this.bufferFlushInterval = setInterval(() => {
      this.flushBuffer();
    }, 5000); // Flush a cada 5 segundos
  }

  async flushBuffer() {
    if (this.metricsBuffer.length === 0) return;

    const metricsToSave = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      await metricsCache.addMetricsBatch(metricsToSave);
      console.log(`[MetricsCollector] ${metricsToSave.length} métricas salvas no cache`);
    } catch (error) {
      console.error('[MetricsCollector] Erro ao salvar métricas:', error);
      // Retornar ao buffer em caso de erro
      this.metricsBuffer = [...metricsToSave, ...this.metricsBuffer];
    }
  }

  // ============ LIVE STATS ============

  updateLiveStats(metric) {
    this.liveStats.lastActivity = Date.now();

    switch (metric.type) {
      case MetricType.MESSAGE_SENT:
        this.liveStats.messagesSent++;
        break;
      case MetricType.MESSAGE_RECEIVED:
        this.liveStats.messagesReceived++;
        break;
    }

    if (metric.chatId) {
      this.liveStats.activeChats.add(metric.chatId);
    }
  }

  getLiveStats() {
    return {
      ...this.liveStats,
      activeChats: Array.from(this.liveStats.activeChats),
      sessionDuration: Date.now() - this.liveStats.sessionStart,
      bufferSize: this.metricsBuffer.length
    };
  }

  // ============ CONVERSATION STATS ============

  async updateConversationStats(chatId, updates) {
    const current = await metricsCache.getConversation(chatId) || {};

    const newData = {};

    if (updates.messagesSent) {
      newData.messageCount = {
        ...current.messageCount,
        sent: (current.messageCount?.sent || 0) + 1
      };
    }

    if (updates.messagesReceived) {
      newData.messageCount = {
        ...current.messageCount,
        received: (current.messageCount?.received || 0) + 1
      };
    }

    if (updates.mediaType) {
      newData.mediaCount = {
        ...current.mediaCount,
        [updates.mediaType]: (current.mediaCount?.[updates.mediaType] || 0) + 1
      };
    }

    if (updates.responseTime) {
      newData.totalResponseTime = (current.totalResponseTime || 0) + updates.responseTime;
      newData.responseCount = (current.responseCount || 0) + 1;
    }

    if (Object.keys(newData).length > 0) {
      await metricsCache.updateConversation(chatId, newData);
    }
  }

  // ============ QUERIES ============

  async getMetrics(options = {}) {
    const {
      chatId,
      type,
      startTime = Date.now() - 86400000, // Último dia por padrão
      endTime = Date.now()
    } = options;

    if (chatId) {
      return metricsCache.getMetricsByChat(chatId, startTime, endTime);
    }

    if (type) {
      return metricsCache.getMetricsByType(type, startTime, endTime);
    }

    return metricsCache.getAggregatedStats(startTime, endTime);
  }

  async getConversationStats(chatId) {
    const conversation = await metricsCache.getConversation(chatId);
    const responseStats = await metricsCache.getAverageResponseTime(chatId);

    return {
      ...conversation,
      responseTimeStats: responseStats
    };
  }

  async getDashboardData() {
    const now = Date.now();
    const dayAgo = now - 86400000;
    const weekAgo = now - 604800000;

    const [todayStats, weekStats, responseStats, conversations] = await Promise.all([
      metricsCache.getAggregatedStats(dayAgo, now),
      metricsCache.getAggregatedStats(weekAgo, now),
      metricsCache.getAverageResponseTime(),
      metricsCache.getAllConversations()
    ]);

    return {
      today: todayStats,
      week: weekStats,
      responseTime: responseStats,
      conversations: conversations.length,
      live: this.getLiveStats()
    };
  }

  // ============ CLEANUP ============

  startCleanupJob() {
    // Limpar dados antigos a cada hora
    setInterval(() => {
      metricsCache.cleanOldData();
    }, 3600000);
  }

  // ============ EVENTS ============

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
          console.error(`[MetricsCollector] Erro no listener ${event}:`, error);
        }
      });
    }
  }

  // ============ HELPERS ============

  getSessionId() {
    if (!this._sessionId) {
      this._sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return this._sessionId;
  }
}

// Singleton
export const metricsCollector = new MetricsCollector();
export default metricsCollector;
