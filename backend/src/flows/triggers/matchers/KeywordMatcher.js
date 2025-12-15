const TriggerMatcher = require('../TriggerMatcher');
const { TRIGGER_TYPES } = require('../../constants/flowConstants');

class KeywordMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.KEYWORD_MATCH);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const { message, contact } = event;

    if (!message || !contact) return { matched: false, reason: 'missing_message_or_contact' };
    if (message.fromMe) return { matched: false, reason: 'message_from_me' };
    if (message.type !== 'text' || !message.text) return { matched: false, reason: 'not_text_message' };

    if (!this.checkStageFilter(contact, cfg.fromStages)) return { matched: false, reason: 'stage_not_allowed' };
    if (!this.checkTagFilter(contact, cfg.fromTags, 'any')) return { matched: false, reason: 'missing_required_tags' };

    const keywords = cfg.keywords || [];
    const matchMode = cfg.matchMode || 'contains';
    const caseSensitive = Boolean(cfg.caseSensitive);

    const text = caseSensitive ? message.text : message.text.toLowerCase();

    for (const kw of keywords) {
      const k = caseSensitive ? kw : String(kw).toLowerCase();
      const info = this.matchKeyword(text, k, matchMode);
      if (info.success) {
        return { matched: true, data: { matchedKeyword: kw, matchMode, matchDetails: info, messageText: message.text, contactId: contact.id } };
      }
    }

    return { matched: false, reason: 'no_keyword_match' };
  }

  matchKeyword(text, keyword, mode) {
    const t = String(text || '');
    const k = String(keyword || '');

    switch (mode) {
      case 'exact':
        return { success: t.trim() === k.trim(), type: 'exact' };
      case 'contains': {
        const pos = t.indexOf(k);
        return { success: pos !== -1, type: 'contains', position: pos };
      }
      case 'starts_with':
        return { success: t.trim().startsWith(k), type: 'starts_with' };
      case 'ends_with':
        return { success: t.trim().endsWith(k), type: 'ends_with' };
      case 'word': {
        const re = new RegExp(`\\b${this.escapeRegex(k)}\\b`, 'i');
        return { success: re.test(t), type: 'word' };
      }
      case 'regex':
        try {
          const re = new RegExp(k, 'i');
          const m = t.match(re);
          return { success: Boolean(m), type: 'regex', match: m ? m[0] : null };
        } catch (e) {
          return { success: false, type: 'regex', error: e.message };
        }
      default:
        return { success: t.includes(k), type: 'default' };
    }
  }

  escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  extractTriggerData(event, matchResult) {
    return {
      type: this.triggerType,
      matchedKeyword: matchResult.data.matchedKeyword,
      matchMode: matchResult.data.matchMode,
      matchDetails: matchResult.data.matchDetails,
      message: {
        id: event.message.id,
        text: event.message.text,
        type: event.message.type,
        timestamp: event.message.timestamp,
      },
      contact: {
        id: event.contact.id,
        phone: event.contact.phone,
        name: event.contact.name,
        stage: event.contact.stage,
        tags: event.contact.tags,
      },
      matchedAt: new Date(),
    };
  }
}

module.exports = KeywordMatcher;