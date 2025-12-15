// content_metrics.js
// Este arquivo deve ser adicionado ao manifest.json como content script

import { metricsCollector } from './metrics/MetricsCollector.js';
import { metricsSync } from './metrics/MetricsSync.js';

class MetricsContentScript {
  constructor() {
    this.isInitialized = false;
  }

  async init() {
    // Aguardar WhatsApp Web carregar
    await this.waitForWhatsApp();

    // Inicializar coletor
    await metricsCollector.init();

    // Configurar sync (se tiver backend)
    this.setupSync();

    // Configurar comunicação com background
    this.setupMessaging();

    this.isInitialized = true;
    console.log('[MetricsContentScript] Inicializado');
  }

  waitForWhatsApp() {
    return new Promise((resolve) => {
      const check = () => {
        const app = document.querySelector('#app');
        const mainPanel = document.querySelector('#pane-side');

        if (app && mainPanel) {
          resolve();
        } else {
          setTimeout(check, 1000);
        }
      };
      check();
    });
  }

  setupSync() {
    // Configurar com sua API
    metricsSync.configure({
      apiEndpoint: 'https://sua-api.com/api/metrics/ingest',
      apiKey: localStorage.getItem('api_key'),
      onSync: (result) => {
        console.log('[Sync] Sucesso:', result);
        // Notificar background
        chrome.runtime.sendMessage({
          type: 'METRICS_SYNCED',
          data: result
        });
      },
      onError: (error) => {
        console.error('[Sync] Erro:', error);
        chrome.runtime.sendMessage({
          type: 'METRICS_SYNC_ERROR',
          data: error
        });
      }
    });

    // Iniciar sync automático (30 segundos)
    metricsSync.start(30000);
  }

  setupMessaging() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
      return true; // Manter canal aberto para resposta async
    });
  }

  async handleMessage(message, sendResponse) {
    switch (message.type) {
      case 'GET_LIVE_STATS':
        sendResponse(metricsCollector.getLiveStats());
        break;

      case 'GET_DASHBOARD_DATA':
        const dashboard = await metricsCollector.getDashboardData();
        sendResponse(dashboard);
        break;

      case 'GET_CHAT_STATS':
        const chatStats = await metricsCollector.getConversationStats(message.chatId);
        sendResponse(chatStats);
        break;

      case 'GET_METRICS':
        const metrics = await metricsCollector.getMetrics(message.options);
        sendResponse(metrics);
        break;

      case 'FORCE_SYNC':
        await metricsSync.forceSync();
        sendResponse({ success: true });
        break;

      case 'GET_SYNC_STATUS':
        sendResponse(metricsSync.getStatus());
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new MetricsContentScript().init();
  });
} else {
  new MetricsContentScript().init();
}
