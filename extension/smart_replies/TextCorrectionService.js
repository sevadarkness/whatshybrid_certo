// smart_replies/TextCorrectionService.js

import { CorrectionType, SMART_REPLIES_CONFIG } from './SmartRepliesTypes.js';
import { aiService } from '../services/AIService.js';

class TextCorrectionService {
  constructor() {
    this.enabled = true;
  }

  async correct(text, type = CorrectionType.FULL) {
    if (!this.enabled) {
      return { original: text, corrected: text, hasChanges: false };
    }

    if (!text || text.length < SMART_REPLIES_CONFIG.CORRECTION_MIN_LENGTH) {
      return { original: text, corrected: text, hasChanges: false };
    }

    try {
      return await aiService.correctText(text, type);
    } catch (error) {
      console.error('[TextCorrection] Erro ao corrigir texto:', error);
      return { original: text, corrected: text, hasChanges: false };
    }
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
  }
}

// Singleton
export const textCorrectionService = new TextCorrectionService();
export default textCorrectionService;
