const TriggerMatcher = require('../TriggerMatcher');
const { TRIGGER_TYPES } = require('../../constants/flowConstants');

class MessageReceivedMatcher extends TriggerMatcher {
  constructor() {
    super(TRIGGER_TYPES.MESSAGE_RECEIVED);
  }

  async match(event, triggerConfig) {
    const cfg = triggerConfig.config || {};
    const { message, contact } = event;

    if (!message || !contact) return { matched: false, reason: 'missing_message_or_contact' };

    if (message.fromMe) return { matched: false, reason: 'message_from_me' };

    if (cfg.messageTypes?.length && !cfg.messageTypes.includes(message.type)) {
      return { matched: false, reason: 'message_type_not_allowed', messageType: message.type };
    }

    if (cfg.fromAnyContact === false && cfg.fromContactIds?.length) {
      if (!cfg.fromContactIds.includes(String(contact.id))) return { matched: false, reason: 'contact_not_in_list' };
    }

    if (!this.checkStageFilter(contact, cfg.fromStages)) return { matched: false, reason: 'stage_not_allowed' };
    if (!this.checkTagFilter(contact, cfg.fromTags, 'any')) return { matched: false, reason: 'missing_required_tags' };
    if (!this.checkExcludeTagFilter(contact, cfg.excludeTags)) return { matched: false, reason: 'has_excluded_tags' };

    return { matched: true, data: { contactId: contact.id, messageId: message.id, messageType: message.type } };
  }

  extractTriggerData(event, matchResult) {
    return {
      type: this.triggerType,
      message: {
        id: event.message.id,
        text: event.message.text,
        type: event.message.type,
        timestamp: event.message.timestamp,
        fromMe: event.message.fromMe,
        mediaUrl: event.message.mediaUrl,
      },
      contact: {
        id: event.contact.id,
        phone: event.contact.phone,
        name: event.contact.name,
        stage: event.contact.stage,
        tags: event.contact.tags,
      },
      matchResult,
      matchedAt: new Date(),
    };
  }
}

module.exports = MessageReceivedMatcher;