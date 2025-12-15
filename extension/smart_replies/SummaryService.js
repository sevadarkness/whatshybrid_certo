// smart_replies/SummaryService.js

import { SummaryType, SMART_REPLIES_CONFIG } from './SmartRepliesTypes.js';
import { conversationContext } from './ConversationContext.js';
import { aiService } from '../services/AIService.js';

class SummaryService {
  constructor() {
    this.summaries = new Map(); // chatId -> summaries[]
    this.loaded = false;
  }

  async init() {
    await this.loadSummaries();
    this.loaded = true;
  }

  async loadSummaries() {
    const stored = await this.getFromStorage(SMART_REPLIES_CONFIG.STORAGE_SUMMARIES);
    if (stored) {
      this.summaries = new Map(Object.entries(stored));
    }
  }

  async saveSummaries() {
    const data = Object.fromEntries(this.summaries);
    await this.setToStorage(SMART_REPLIES_CONFIG.STORAGE_SUMMARIES, data);
  }

  async generateChatSummary(chatId, type = SummaryType.CHAT_OPEN) {
    const context = await conversationContext.getContext(chatId);
    const messages = context.messages || [];

    if (messages.length < SMART_REPLIES_CONFIG.SUMMARY_MIN_MESSAGES) {
      return null;
    }

    const summaryText = await aiService.generateSummary(messages, type);
    
    const summary = {
      id: `${chatId}_${Date.now()}`,
      chatId,
      type,
      text: summaryText,
      createdAt: Date.now(),
      messageCount: messages.length
    };

    if (!this.summaries.has(chatId)) {
      this.summaries.set(chatId, []);
    }
    this.summaries.get(chatId).push(summary);

    await this.saveSummaries();

    return summary;
  }

  async generateDailySummary(chats) {
    const allMessages = [];
    
    for (const chatId of chats) {
      const context = await conversationContext.getContext(chatId);
      const messages = context.messages || [];
      allMessages.push(...messages.map(m => ({ ...m, chatId })));
    }

    if (allMessages.length === 0) return null;

    const summaryText = await aiService.generateSummary(allMessages, SummaryType.DAILY);
    
    const summary = {
      id: `daily_${Date.now()}`,
      type: SummaryType.DAILY,
      text: summaryText,
      createdAt: Date.now(),
      chatCount: chats.length,
      totalMessages: allMessages.length
    };

    if (!this.summaries.has('daily')) {
      this.summaries.set('daily', []);
    }
    this.summaries.get('daily').push(summary);

    await this.saveSummaries();

    return summary;
  }

  getSummaries(chatId, type = null) {
    const summaries = this.summaries.get(chatId) || [];
    if (!type) return summaries;
    return summaries.filter(s => s.type === type);
  }

  // ============ STORAGE HELPERS ============

  getFromStorage(key) {
    return new Promise(resolve => {
      chrome.storage.local.get([key], result => {
        resolve(result[key]);
      });
    });
  }

  setToStorage(key, value) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
}

// Singleton
export const summaryService = new SummaryService();
export default summaryService;
