// metrics/MetricsCache.js
import { CACHE_CONFIG, SYNC_CONFIG } from './MetricsTypes.js';

class MetricsCache {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.readyPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_CONFIG.DB_NAME, CACHE_CONFIG.DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        this.isReady = true;
        console.log('[MetricsCache] IndexedDB inicializado');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store de métricas gerais
        if (!db.objectStoreNames.contains(CACHE_CONFIG.STORES.METRICS)) {
          const metricsStore = db.createObjectStore(CACHE_CONFIG.STORES.METRICS, {
            keyPath: 'id',
            autoIncrement: true
          });
          metricsStore.createIndex('type', 'type', { unique: false });
          metricsStore.createIndex('chatId', 'chatId', { unique: false });
          metricsStore.createIndex('timestamp', 'timestamp', { unique: false });
          metricsStore.createIndex('synced', 'synced', { unique: false });
        }

        // Store de conversas
        if (!db.objectStoreNames.contains(CACHE_CONFIG.STORES.CONVERSATIONS)) {
          const convStore = db.createObjectStore(CACHE_CONFIG.STORES.CONVERSATIONS, {
            keyPath: 'chatId'
          });
          convStore.createIndex('lastActivity', 'lastActivity', { unique: false });
          convStore.createIndex('isActive', 'isActive', { unique: false });
        }

        // Store de itens pendentes de sync
        if (!db.objectStoreNames.contains(CACHE_CONFIG.STORES.PENDING_SYNC)) {
          const pendingStore = db.createObjectStore(CACHE_CONFIG.STORES.PENDING_SYNC, {
            keyPath: 'id',
            autoIncrement: true
          });
          pendingStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Store de tempos de resposta
        if (!db.objectStoreNames.contains(CACHE_CONFIG.STORES.RESPONSE_TIMES)) {
          const rtStore = db.createObjectStore(CACHE_CONFIG.STORES.RESPONSE_TIMES, {
            keyPath: 'id',
            autoIncrement: true
          });
          rtStore.createIndex('chatId', 'chatId', { unique: false });
          rtStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async ensureReady() {
    if (!this.isReady) {
      await this.readyPromise;
    }
  }

  // ============ MÉTRICAS GERAIS ============

  async addMetric(metric) {
    await this.ensureReady();

    const record = {
      ...metric,
      timestamp: metric.timestamp || Date.now(),
      synced: false,
      createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.METRICS, 'readwrite');
      const store = tx.objectStore(CACHE_CONFIG.STORES.METRICS);
      const request = store.add(record);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async addMetricsBatch(metrics) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.METRICS, 'readwrite');
      const store = tx.objectStore(CACHE_CONFIG.STORES.METRICS);

      let addedCount = 0;

      metrics.forEach(metric => {
        const record = {
          ...metric,
          timestamp: metric.timestamp || Date.now(),
          synced: false,
          createdAt: Date.now()
        };

        const request = store.add(record);
        request.onsuccess = () => addedCount++;
      });

      tx.oncomplete = () => resolve(addedCount);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getUnsyncedMetrics(limit = SYNC_CONFIG.BATCH_SIZE) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.METRICS, 'readonly');
      const store = tx.objectStore(CACHE_CONFIG.STORES.METRICS);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false), limit);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markAsSynced(ids) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.METRICS, 'readwrite');
      const store = tx.objectStore(CACHE_CONFIG.STORES.METRICS);

      ids.forEach(id => {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const record = getRequest.result;
          if (record) {
            record.synced = true;
            record.syncedAt = Date.now();
            store.put(record);
          }
        };
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getMetricsByChat(chatId, startTime = 0, endTime = Date.now()) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.METRICS, 'readonly');
      const store = tx.objectStore(CACHE_CONFIG.STORES.METRICS);
      const index = store.index('chatId');
      const request = index.getAll(IDBKeyRange.only(chatId));

      request.onsuccess = () => {
        const filtered = request.result.filter(m => 
          m.timestamp >= startTime && m.timestamp <= endTime
        );
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getMetricsByType(type, startTime = 0, endTime = Date.now()) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.METRICS, 'readonly');
      const store = tx.objectStore(CACHE_CONFIG.STORES.METRICS);
      const index = store.index('type');
      const request = index.getAll(IDBKeyRange.only(type));

      request.onsuccess = () => {
        const filtered = request.result.filter(m => 
          m.timestamp >= startTime && m.timestamp <= endTime
        );
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ============ CONVERSAS ============

  async updateConversation(chatId, data) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.CONVERSATIONS, 'readwrite');
      const store = tx.objectStore(CACHE_CONFIG.STORES.CONVERSATIONS);

      const getRequest = store.get(chatId);
      getRequest.onsuccess = () => {
        const existing = getRequest.result || { 
          chatId,
          createdAt: Date.now(),
          messageCount: { sent: 0, received: 0 },
          mediaCount: { audio: 0, video: 0, image: 0, document: 0 },
          deletedCount: 0,
          editedCount: 0,
          totalResponseTime: 0,
          responseCount: 0
        };

        const updated = {
          ...existing,
          ...data,
          lastActivity: Date.now(),
          updatedAt: Date.now()
        };

        store.put(updated);
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getConversation(chatId) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.CONVERSATIONS, 'readonly');
      const store = tx.objectStore(CACHE_CONFIG.STORES.CONVERSATIONS);
      const request = store.get(chatId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllConversations() {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.CONVERSATIONS, 'readonly');
      const store = tx.objectStore(CACHE_CONFIG.STORES.CONVERSATIONS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ============ TEMPOS DE RESPOSTA ============

  async addResponseTime(chatId, responseTimeMs, direction) {
    await this.ensureReady();

    const record = {
      chatId,
      responseTimeMs,
      direction, // 'to_customer' ou 'from_customer'
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.RESPONSE_TIMES, 'readwrite');
      const store = tx.objectStore(CACHE_CONFIG.STORES.RESPONSE_TIMES);
      const request = store.add(record);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAverageResponseTime(chatId = null, direction = null) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.RESPONSE_TIMES, 'readonly');
      const store = tx.objectStore(CACHE_CONFIG.STORES.RESPONSE_TIMES);

      let request;
      if (chatId) {
        const index = store.index('chatId');
        request = index.getAll(IDBKeyRange.only(chatId));
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        let records = request.result;

        if (direction) {
          records = records.filter(r => r.direction === direction);
        }

        if (records.length === 0) {
          resolve({ average: 0, count: 0, min: 0, max: 0 });
          return;
        }

        const times = records.map(r => r.responseTimeMs);
        const sum = times.reduce((a, b) => a + b, 0);

        resolve({
          average: Math.round(sum / times.length),
          count: times.length,
          min: Math.min(...times),
          max: Math.max(...times),
          median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)]
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ============ LIMPEZA ============

  async cleanOldData(maxAgeHours = SYNC_CONFIG.MAX_CACHE_AGE_HOURS) {
    await this.ensureReady();

    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);

    const stores = [
      CACHE_CONFIG.STORES.METRICS,
      CACHE_CONFIG.STORES.RESPONSE_TIMES
    ];

    for (const storeName of stores) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const index = store.index('timestamp');
        const range = IDBKeyRange.upperBound(cutoffTime);

        index.openCursor(range).onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            // Só deleta se já foi sincronizado
            if (cursor.value.synced !== false) {
              cursor.delete();
            }
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    console.log('[MetricsCache] Dados antigos limpos');
  }

  // ============ ESTATÍSTICAS AGREGADAS ============

  async getAggregatedStats(startTime = 0, endTime = Date.now()) {
    await this.ensureReady();

    const metrics = await new Promise((resolve, reject) => {
      const tx = this.db.transaction(CACHE_CONFIG.STORES.METRICS, 'readonly');
      const store = tx.objectStore(CACHE_CONFIG.STORES.METRICS);
      const request = store.getAll();

      request.onsuccess = () => {
        const filtered = request.result.filter(m => 
          m.timestamp >= startTime && m.timestamp <= endTime
        );
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });

    const stats = {
      period: { start: startTime, end: endTime },
      messages: {
        sent: 0,
        received: 0,
        deleted: 0,
        edited: 0
      },
      media: {
        audio: 0,
        video: 0,
        image: 0,
        document: 0,
        sticker: 0,
        ptt: 0
      },
      conversations: {
        active: new Set(),
        total: 0
      },
      timeline: {}
    };

    metrics.forEach(m => {
      // Contagem de mensagens
      if (m.type === 'message_sent') stats.messages.sent++;
      if (m.type === 'message_received') stats.messages.received++;
      if (m.type === 'message_deleted') stats.messages.deleted++;
      if (m.type === 'message_edited') stats.messages.edited++;

      // Contagem de mídia
      if (m.type === 'media_audio') stats.media.audio++;
      if (m.type === 'media_video') stats.media.video++;
      if (m.type === 'media_image') stats.media.image++;
      if (m.type === 'media_document') stats.media.document++;
      if (m.type === 'media_sticker') stats.media.sticker++;
      if (m.mediaType === 'ptt') stats.media.ptt++;

      // Conversas únicas
      if (m.chatId) stats.conversations.active.add(m.chatId);

      // Timeline (por hora)
      const hourKey = new Date(m.timestamp).toISOString().slice(0, 13);
      if (!stats.timeline[hourKey]) {
        stats.timeline[hourKey] = { sent: 0, received: 0 };
      }
      if (m.type === 'message_sent') stats.timeline[hourKey].sent++;
      if (m.type === 'message_received') stats.timeline[hourKey].received++;
    });

    stats.conversations.total = stats.conversations.active.size;
    stats.conversations.active = Array.from(stats.conversations.active);

    return stats;
  }
}

// Singleton
export const metricsCache = new MetricsCache();
export default metricsCache;
