// metrics/MetricsSync.js
import metricsCache from './MetricsCache.js';
import { SYNC_CONFIG } from './MetricsTypes.js';

class MetricsSync {
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint || '/api/metrics';
    this.apiKey = options.apiKey || null;
    this.syncInterval = null;
    this.isRunning = false;
    this.isSyncing = false;
    this.retryCount = 0;
    this.lastSyncTime = null;
    this.onSyncCallback = null;
    this.onErrorCallback = null;
  }

  // ============ CONFIGURAÇÃO ============

  configure(options) {
    if (options.apiEndpoint) this.apiEndpoint = options.apiEndpoint;
    if (options.apiKey) this.apiKey = options.apiKey;
    if (options.onSync) this.onSyncCallback = options.onSync;
    if (options.onError) this.onErrorCallback = options.onError;
  }

  // ============ INICIALIZAÇÃO ============

  start(intervalMs = SYNC_CONFIG.SYNC_INTERVAL_MS) {
    if (this.isRunning) {
      console.warn('[MetricsSync] Já está rodando');
      return;
    }

    this.isRunning = true;

    // Sync inicial
    this.sync();

    // Sync periódico
    this.syncInterval = setInterval(() => {
      this.sync();
    }, intervalMs);

    console.log(`[MetricsSync] Iniciado com intervalo de ${intervalMs}ms`);
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log('[MetricsSync] Parado');
  }

  // ============ SYNC ============

  async sync() {
    if (this.isSyncing) {
      console.log('[MetricsSync] Sync já em andamento, pulando...');
      return;
    }

    this.isSyncing = true;

    try {
      // Buscar métricas não sincronizadas
      const unsyncedMetrics = await metricsCache.getUnsyncedMetrics(SYNC_CONFIG.BATCH_SIZE);

      if (unsyncedMetrics.length === 0) {
        console.log('[MetricsSync] Nenhuma métrica pendente');
        this.isSyncing = false;
        return;
      }

      console.log(`[MetricsSync] Sincronizando ${unsyncedMetrics.length} métricas...`);

      // Preparar payload
      const payload = this.preparePayload(unsyncedMetrics);

      // Enviar para backend
      const response = await this.sendToBackend(payload);

      if (response.success) {
        // Marcar como sincronizadas
        const ids = unsyncedMetrics.map(m => m.id);
        await metricsCache.markAsSynced(ids);

        this.lastSyncTime = Date.now();
        this.retryCount = 0;

        console.log(`[MetricsSync] ${unsyncedMetrics.length} métricas sincronizadas`);

        if (this.onSyncCallback) {
          this.onSyncCallback({
            count: unsyncedMetrics.length,
            timestamp: this.lastSyncTime
          });
        }

        // Se ainda há mais métricas, continuar sincronizando
        const remaining = await metricsCache.getUnsyncedMetrics(1);
        if (remaining.length > 0) {
          setTimeout(() => this.sync(), 1000);
        }
      } else {
        throw new Error(response.error || 'Sync failed');
      }
    } catch (error) {
      console.error('[MetricsSync] Erro no sync:', error);
      this.handleSyncError(error);
    } finally {
      this.isSyncing = false;
    }
  }

  // ============ PAYLOAD ============

  preparePayload(metrics) {
    // Agregar métricas por tipo para reduzir payload
    const aggregated = {
      timestamp: Date.now(),
      sessionId: this.getSessionId(),
      metrics: metrics.map(m => ({
        id: m.id,
        type: m.type,
        chatId: m.chatId,
        messageId: m.messageId,
        direction: m.direction,
        timestamp: m.timestamp,
        mediaType: m.mediaType,
        textLength: m.textLength,
        metadata: m.metadata
      })),
      summary: this.calculateSummary(metrics)
    };

    return aggregated;
  }

  calculateSummary(metrics) {
    const summary = {
      total: metrics.length,
      byType: {},
      byChat: {},
      timeRange: {
        start: Math.min(...metrics.map(m => m.timestamp)),
        end: Math.max(...metrics.map(m => m.timestamp))
      }
    };

    metrics.forEach(m => {
      // Por tipo
      if (!summary.byType[m.type]) {
        summary.byType[m.type] = 0;
      }
      summary.byType[m.type]++;

      // Por chat
      if (m.chatId) {
        if (!summary.byChat[m.chatId]) {
          summary.byChat[m.chatId] = 0;
        }
        summary.byChat[m.chatId]++;
      }
    });

    return summary;
  }

  // ============ HTTP ============

  async sendToBackend(payload) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return response.json();
  }

  // ============ ERROR HANDLING ============

  handleSyncError(error) {
    this.retryCount++;

    if (this.onErrorCallback) {
      this.onErrorCallback({
        error,
        retryCount: this.retryCount,
        willRetry: this.retryCount < SYNC_CONFIG.RETRY_ATTEMPTS
      });
    }

    if (this.retryCount < SYNC_CONFIG.RETRY_ATTEMPTS) {
      const delay = SYNC_CONFIG.RETRY_DELAY_MS * this.retryCount;
      console.log(`[MetricsSync] Tentando novamente em ${delay}ms...`);
      setTimeout(() => this.sync(), delay);
    } else {
      console.error('[MetricsSync] Máximo de tentativas atingido');
    }
  }

  // ============ STATUS ============

  getStatus() {
    return {
      isRunning: this.isRunning,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      retryCount: this.retryCount,
      endpoint: this.apiEndpoint
    };
  }

  // ============ HELPERS ============

  getSessionId() {
    if (!this._sessionId) {
      this._sessionId = localStorage.getItem('metrics_session_id');
      if (!this._sessionId) {
        this._sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('metrics_session_id', this._sessionId);
      }
    }
    return this._sessionId;
  }

  // ============ SYNC MANUAL ============

  async forceSync() {
    this.retryCount = 0;
    await this.sync();
  }

  async syncAll() {
    // Sincronizar tudo em lotes
    let hasMore = true;
    let totalSynced = 0;

    while (hasMore) {
      const unsyncedMetrics = await metricsCache.getUnsyncedMetrics(SYNC_CONFIG.BATCH_SIZE);

      if (unsyncedMetrics.length === 0) {
        hasMore = false;
        break;
      }

      const payload = this.preparePayload(unsyncedMetrics);
      const response = await this.sendToBackend(payload);

      if (response.success) {
        const ids = unsyncedMetrics.map(m => m.id);
        await metricsCache.markAsSynced(ids);
        totalSynced += unsyncedMetrics.length;
      } else {
        throw new Error('Sync failed');
      }

      // Pequena pausa entre batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[MetricsSync] Total sincronizado: ${totalSynced}`);
    return totalSynced;
  }
}

// Singleton
export const metricsSync = new MetricsSync();
export default metricsSync;
