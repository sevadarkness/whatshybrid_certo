// lib/metricsAPI.js
// Helper para acessar métricas do dashboard/popup

class MetricsAPI {
  constructor() {
    this.tabId = null;
  }

  async getWhatsAppTab() {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    if (tabs.length > 0) {
      this.tabId = tabs[0].id;
      return this.tabId;
    }
    throw new Error('WhatsApp Web não está aberto');
  }

  async sendMessage(message) {
    if (!this.tabId) {
      await this.getWhatsAppTab();
    }

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(this.tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  // ============ MÉTODOS PÚBLICOS ============

  async getLiveStats() {
    return this.sendMessage({ type: 'GET_LIVE_STATS' });
  }

  async getDashboardData() {
    return this.sendMessage({ type: 'GET_DASHBOARD_DATA' });
  }

  async getChatStats(chatId) {
    return this.sendMessage({ type: 'GET_CHAT_STATS', chatId });
  }

  async getMetrics(options = {}) {
    return this.sendMessage({ type: 'GET_METRICS', options });
  }

  async forceSync() {
    return this.sendMessage({ type: 'FORCE_SYNC' });
  }

  async getSyncStatus() {
    return this.sendMessage({ type: 'GET_SYNC_STATUS' });
  }
}

export const metricsAPI = new MetricsAPI();
export default metricsAPI;
