// smart_replies/SummaryScheduler.js

import { SMART_REPLIES_CONFIG, SummaryType } from './SmartRepliesTypes.js';
import { summaryService } from './SummaryService.js';

class SummaryScheduler {
  constructor() {
    this.enabled = true;
  }

  init() {
    // A configuração real dos alarms é feita no background.js
    console.log('[SummaryScheduler] Inicializado');
  }

  async handleDailySummary() {
    if (!this.enabled) return;

    // Pedir para o background gerar o resumo diário
    chrome.runtime.sendMessage({ 
      type: 'GENERATE_DAILY_SUMMARY' 
    });
  }

  async handleChatOpen(chatId) {
    if (!this.enabled) return;

    const summary = await summaryService.generateChatSummary(chatId, SummaryType.CHAT_OPEN);
    return summary;
  }

  async handleChatClose(chatId) {
    if (!this.enabled) return;

    const summary = await summaryService.generateChatSummary(chatId, SummaryType.CHAT_CLOSE);
    return summary;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
  }
}

// Singleton
export const summaryScheduler = new SummaryScheduler();
export default summaryScheduler;
